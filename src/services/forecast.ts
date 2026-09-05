import { tr } from '@/i18n/t';
import {
  CashFlowForecast,
  CurrencyCode,
  FinanceAccount,
  ForecastEvent,
  ForecastPoint,
  Plan,
  PlanKind,
  PlanOccurrence,
  PlanOccurrenceOverride,
  Transaction,
} from '@/types';
import { computeAccountBalance } from '@/lib/db';
import { nextOccurrence } from './planned';

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

/**
 * Every date a plan fires between `from` and `to`. A one-off contributes its
 * single date; recurring plans are walked forward through the same engine the
 * scheduler uses, so the forecast can never disagree with what will be booked.
 */
export function occurrencesBetween(plan: Plan, from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = plan.nextDueDate;
  if (!cursor) return dates;
  // A generous ceiling: weekly plans over a 90-day horizon need ~13 steps.
  let guard = 0;

  while (cursor <= to && guard < 400) {
    if (cursor >= from) dates.push(cursor);
    if (plan.recurrence === 'ONCE') break;
    const next = nextOccurrence(plan, cursor);
    if (!next || next <= cursor) break;
    cursor = next;
    guard += 1;
  }

  return dates;
}

/**
 * Projects the running balance day by day: today's real balance plus every
 * scheduled income and payment ahead. Answers "хватит ли до зарплаты" and
 * surfaces the first day the balance would go negative.
 */
export function forecastCashFlow(input: {
  accounts: FinanceAccount[];
  transactions: Transaction[];
  plans: Plan[];
  /** Scheduled fixed-schedule occurrences that have not been paid yet. */
  occurrences?: PlanOccurrence[];
  /** «Только эту операцию» edits on not-yet-fired RECURRING dates. */
  overrides?: PlanOccurrenceOverride[];
  days: number;
  today: string;
  toBase: (amount: number, currency: CurrencyCode) => number;
}): CashFlowForecast {
  const { accounts, transactions, plans, days, today, toBase } = input;
  const occurrences = input.occurrences || [];
  const overrideByKey = new Map(
    (input.overrides || []).map((override) => [`${override.planId}__${override.dueDate}`, override])
  );
  const horizon = addDays(today, days);

  const startBalance = accounts
    .filter((account) => !account.isArchived)
    .reduce(
      (sum, account) => sum + toBase(computeAccountBalance(account, transactions), account.currency),
      0
    );

  const eventsByDate = new Map<string, ForecastEvent[]>();
  let totalIncome = 0;
  let totalExpense = 0;

  for (const plan of plans) {
    if (plan.scheduleType !== 'RECURRING' || plan.status !== 'ACTIVE') continue;

    for (const date of occurrencesBetween(plan, addDays(today, 1), horizon)) {
      const override = overrideByKey.get(`${plan.id}__${date}`);
      const base = toBase(override?.amount ?? plan.amount, plan.currency);
      const signed = plan.kind === 'INCOME' ? base : -base;

      if (signed >= 0) totalIncome += signed;
      else totalExpense += -signed;

      const list = eventsByDate.get(date) || [];
      list.push({
        date,
        title: override?.note || plan.title,
        amount: Math.round(signed * 100) / 100,
        planKind: plan.planType as PlanKind,
        categoryId: override?.categoryId || plan.categoryId,
      });
      eventsByDate.set(date, list);
    }
  }

  // An instalment purchase is not an expense on the day it is made, but every
  // scheduled payment still drains the balance ahead — that is the whole point
  // of showing it in a forecast.
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  for (const occurrence of occurrences) {
    if (occurrence.isPaid) continue;
    if (occurrence.dueDate <= today || occurrence.dueDate > horizon) continue;

    const plan = planById.get(occurrence.planId);
    const base = toBase(occurrence.amount, occurrence.currency);
    totalExpense += base;

    const list = eventsByDate.get(occurrence.dueDate) || [];
    list.push({
      date: occurrence.dueDate,
      title: plan ? `${plan.title} · ${occurrence.index}` : tr('fc.installmentPayment'),
      amount: -Math.round(base * 100) / 100,
      planKind: 'PAYMENT',
      categoryId: plan?.categoryId || '',
    });
    eventsByDate.set(occurrence.dueDate, list);
  }

  const points: ForecastPoint[] = [];
  let balance = startBalance;
  let minimum = { date: today, balance: startBalance };
  let shortfallDate: string | undefined;

  for (let offset = 0; offset <= days; offset++) {
    const date = addDays(today, offset);
    const events = eventsByDate.get(date) || [];
    balance += events.reduce((sum, event) => sum + event.amount, 0);
    balance = Math.round(balance * 100) / 100;

    if (balance < minimum.balance) minimum = { date, balance };
    if (balance < 0 && !shortfallDate) shortfallDate = date;

    points.push({ date, balance, events });
  }

  return {
    startBalance: Math.round(startBalance * 100) / 100,
    points,
    minimum,
    shortfallDate,
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpense: Math.round(totalExpense * 100) / 100,
  };
}

export interface CalendarDay {
  date: string;
  day: number;
  events: ForecastEvent[];
  total: number;
  isPast: boolean;
  isToday: boolean;
}

/**
 * Due dates of the month laid out day by day, so a cluster of charges landing in
 * the same week is visible before it becomes a cash gap.
 */
export function paymentCalendar(input: {
  month: string;
  plans: Plan[];
  transactions: Transaction[];
  today: string;
  toBase: (amount: number, currency: CurrencyCode) => number;
}): CalendarDay[] {
  const { month, plans, today, toBase } = input;
  const [year, mon] = month.split('-').map(Number);
  const total = new Date(year, mon, 0).getDate();
  const from = `${month}-01`;
  const to = `${month}-${String(total).padStart(2, '0')}`;

  const byDate = new Map<string, ForecastEvent[]>();

  for (const plan of plans) {
    if (plan.scheduleType !== 'RECURRING' || plan.status !== 'ACTIVE' || plan.kind !== 'EXPENSE') {
      continue;
    }

    for (const date of occurrencesBetween(plan, from, to)) {
      const list = byDate.get(date) || [];
      list.push({
        date,
        title: plan.title,
        amount: -toBase(plan.amount, plan.currency),
        planKind: plan.planType as PlanKind,
        categoryId: plan.categoryId,
      });
      byDate.set(date, list);
    }
  }

  const days: CalendarDay[] = [];
  for (let day = 1; day <= total; day++) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    const events = byDate.get(date) || [];
    days.push({
      date,
      day,
      events,
      total: Math.round(events.reduce((sum, e) => sum + Math.abs(e.amount), 0) * 100) / 100,
      isPast: date < today,
      isToday: date === today,
    });
  }

  return days;
}
