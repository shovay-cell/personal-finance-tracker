import {
  BearerCheque,
  CurrencyCode,
  Obligation,
  ObligationSettlement,
  Plan,
  PlanOccurrence,
  PlanType,
  TransactionKind,
} from '@/types';
import { todayIso } from '@/lib/db';
import { tr } from '@/i18n/t';
import { obligationsWithBalance } from './analytics';
import { occurrencesBetween } from './forecast';

export interface UpcomingEvent {
  id: string;
  date: string;
  title: string;
  /** Always positive — `kind` gives the direction. */
  amount: number;
  kind: TransactionKind;
  source: PlanType | 'BEARER_CHEQUE';
  isOverdue: boolean;
  /** A RECURRING plan whose date has arrived but which hasn't auto-booked. */
  needsConfirmation: boolean;
  /** Present for RECURRING-sourced events — lets a click open that plan for editing. */
  planId?: string;
  categoryId?: string;
}

/**
 * Every known future money movement — both kinds, fixed-schedule obligations
 * and recurring plans alike — in one flat list. «Обязательства» and «Планы»
 * both read from here so a credit or an instalment reads the same amount and
 * date in either place; income only ever comes from RECURRING plans, since
 * FIXED_SCHEDULE/obligation/cheque instruments are expense-only by design.
 */
export function upcomingEvents(input: {
  plans: Plan[];
  occurrences: PlanOccurrence[];
  obligations?: Obligation[];
  settlements?: ObligationSettlement[];
  bearerCheques?: BearerCheque[];
  months: number;
  today?: string;
  toBase: (amount: number, currency: CurrencyCode) => number;
}): UpcomingEvent[] {
  const today = input.today || todayIso();
  const horizonDate = new Date(today);
  horizonDate.setMonth(horizonDate.getMonth() + input.months);
  const horizon = horizonDate.toISOString().slice(0, 10);

  const items: UpcomingEvent[] = [];
  const planById = new Map(input.plans.map((plan) => [plan.id, plan]));

  for (const occurrence of input.occurrences) {
    if (occurrence.isPaid || occurrence.dueDate > horizon) continue;
    const plan = planById.get(occurrence.planId);
    if (!plan) continue;
    const totalForPlan = input.occurrences.filter((o) => o.planId === plan.id).length;
    items.push({
      id: occurrence.id,
      date: occurrence.dueDate,
      title: `${plan.title} · ${occurrence.index}/${totalForPlan}`,
      amount: input.toBase(occurrence.amount, occurrence.currency),
      kind: plan.kind,
      source: plan.planType,
      isOverdue: occurrence.dueDate < today,
      needsConfirmation: false,
      categoryId: plan.categoryId,
    });
  }

  for (const row of obligationsWithBalance(input.obligations || [], input.settlements || [])) {
    if (row.status === 'SETTLED' || !row.obligation.dueDate || row.obligation.dueDate > horizon) continue;
    items.push({
      id: row.obligation.id,
      date: row.obligation.dueDate,
      title: row.obligation.payeeLabel || tr('rp.bearerCheque'),
      amount: input.toBase(row.outstandingAmount, row.obligation.currency),
      kind: 'EXPENSE',
      source: 'CHEQUE',
      isOverdue: row.status === 'OVERDUE',
      needsConfirmation: false,
    });
  }

  for (const cheque of input.bearerCheques || []) {
    if (cheque.status !== 'ISSUED' || cheque.dueDate > horizon) continue;
    items.push({
      id: cheque.id,
      date: cheque.dueDate,
      title: cheque.payee,
      amount: input.toBase(cheque.amount, cheque.currency),
      kind: 'EXPENSE',
      source: 'BEARER_CHEQUE',
      isOverdue: cheque.dueDate < today,
      needsConfirmation: false,
    });
  }

  for (const plan of input.plans) {
    if (plan.scheduleType !== 'RECURRING' || plan.status !== 'ACTIVE') continue;
    for (const date of occurrencesBetween(plan, today, horizon)) {
      items.push({
        id: `${plan.id}-${date}`,
        date,
        title: plan.title,
        amount: input.toBase(plan.amount, plan.currency),
        kind: plan.kind,
        source: plan.planType,
        isOverdue: date < today,
        needsConfirmation: date <= today && !plan.autoCreate,
        planId: plan.id,
        categoryId: plan.categoryId,
      });
    }
  }

  return items.sort((a, b) => a.date.localeCompare(b.date));
}

export interface UpcomingDay {
  date: string;
  items: UpcomingEvent[];
  total: number;
}

/** `items`, already sorted by date, grouped into one bucket per calendar day. */
export function groupByDay(items: UpcomingEvent[]): UpcomingDay[] {
  const byDate = new Map<string, UpcomingEvent[]>();
  for (const item of items) {
    byDate.set(item.date, [...(byDate.get(item.date) || []), item]);
  }
  return Array.from(byDate.entries())
    .map(([date, dayItems]) => ({
      date,
      items: dayItems,
      total: Math.round(dayItems.reduce((sum, i) => sum + i.amount, 0) * 100) / 100,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
