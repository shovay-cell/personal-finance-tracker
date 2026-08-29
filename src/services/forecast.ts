import { tr } from '@/i18n/t';
import {
  CashFlowForecast,
  CurrencyCode,
  DebtInstallment,
  DebtPlan,
  FinanceAccount,
  ForecastEvent,
  ForecastPoint,
  PlannedPayment,
  Transaction,
} from '@/types';
import { computeAccountBalance } from '@/lib/db';
import { nextOccurrence, planKindOf } from './planned';

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
export function occurrencesBetween(
  payment: PlannedPayment,
  from: string,
  to: string
): string[] {
  const dates: string[] = [];
  let cursor = payment.nextDueDate;
  // A generous ceiling: weekly plans over a 90-day horizon need ~13 steps.
  let guard = 0;

  while (cursor <= to && guard < 400) {
    if (cursor >= from) dates.push(cursor);
    if (payment.recurrence === 'ONCE') break;
    const next = nextOccurrence(payment, cursor);
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
  plannedPayments: PlannedPayment[];
  /** Scheduled instalment payments that have not been paid yet. */
  debts?: DebtPlan[];
  installments?: DebtInstallment[];
  days: number;
  today: string;
  toBase: (amount: number, currency: CurrencyCode) => number;
}): CashFlowForecast {
  const { accounts, transactions, plannedPayments, days, today, toBase } = input;
  const debts = input.debts || [];
  const installments = input.installments || [];
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

  for (const payment of plannedPayments) {
    if (!payment.isActive) continue;

    for (const date of occurrencesBetween(payment, addDays(today, 1), horizon)) {
      const base = toBase(payment.amount, payment.currency);
      const signed = payment.kind === 'INCOME' ? base : -base;

      if (signed >= 0) totalIncome += signed;
      else totalExpense += -signed;

      const list = eventsByDate.get(date) || [];
      list.push({
        date,
        title: payment.title,
        amount: Math.round(signed * 100) / 100,
        planKind: planKindOf(payment),
        categoryId: payment.categoryId,
      });
      eventsByDate.set(date, list);
    }
  }

  // An instalment purchase is not an expense on the day it is made, but every
  // scheduled payment still drains the balance ahead — that is the whole point
  // of showing it in a forecast.
  const debtById = new Map(debts.map((debt) => [debt.id, debt]));
  for (const installment of installments) {
    if (installment.isPaid) continue;
    if (installment.dueDate <= today || installment.dueDate > horizon) continue;

    const debt = debtById.get(installment.debtId);
    const base = toBase(installment.amount, installment.currency);
    totalExpense += base;

    const list = eventsByDate.get(installment.dueDate) || [];
    list.push({
      date: installment.dueDate,
      title: debt ? `${debt.title} · ${installment.index}` : tr('fc.installmentPayment'),
      amount: -Math.round(base * 100) / 100,
      planKind: 'PAYMENT',
      categoryId: debt?.categoryId || '',
    });
    eventsByDate.set(installment.dueDate, list);
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
  plannedPayments: PlannedPayment[];
  transactions: Transaction[];
  today: string;
  toBase: (amount: number, currency: CurrencyCode) => number;
}): CalendarDay[] {
  const { month, plannedPayments, today, toBase } = input;
  const [year, mon] = month.split('-').map(Number);
  const total = new Date(year, mon, 0).getDate();
  const from = `${month}-01`;
  const to = `${month}-${String(total).padStart(2, '0')}`;

  const byDate = new Map<string, ForecastEvent[]>();

  for (const payment of plannedPayments) {
    if (!payment.isActive || payment.kind !== 'EXPENSE') continue;

    for (const date of occurrencesBetween(payment, from, to)) {
      const list = byDate.get(date) || [];
      list.push({
        date,
        title: payment.title,
        amount: -toBase(payment.amount, payment.currency),
        planKind: planKindOf(payment),
        categoryId: payment.categoryId,
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
