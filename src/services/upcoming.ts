import {
  BearerCheque,
  CurrencyCode,
  FinanceCategory,
  Obligation,
  ObligationSettlement,
  Plan,
  PlanOccurrence,
  PlanOccurrenceOverride,
  PlanType,
  Transaction,
  TransactionKind,
} from '@/types';
import { effectivePlanFields, todayIso } from '@/lib/db';
import { tr } from '@/i18n/t';
import { categoryNameById } from '@/i18n/categories';
import { getActiveLanguage } from '@/i18n/runtime';
import { obligationsWithBalance } from './analytics';
import { occurrencesBetween } from './forecast';

export interface UpcomingEvent {
  id: string;
  date: string;
  title: string;
  /** Always positive — `kind` gives the direction. */
  amount: number;
  kind: TransactionKind;
  source: PlanType | 'BEARER_CHEQUE' | 'TRANSACTION';
  isOverdue: boolean;
  /** A RECURRING plan whose date has arrived but which hasn't auto-booked. */
  needsConfirmation: boolean;
  /** Present for RECURRING-sourced events — lets a click open that plan for editing. */
  planId?: string;
  categoryId?: string;
  subcategoryId?: string;
  accountId?: string;
  authorId?: string;
}

/**
 * Every known future money movement — both kinds, fixed-schedule obligations
 * and recurring plans alike — in one flat list. «Обязательства» and «Планы»
 * both read from here so a credit or an instalment reads the same amount and
 * date in either place. Most income comes from RECURRING plans (FIXED_
 * SCHEDULE/obligation/cheque instruments are expense-only by design), but a
 * plain transaction the user post-dated by hand — entered through the
 * ordinary form, not a plan — is just as much a future movement and must
 * not vanish for not being plan-shaped.
 */
export function upcomingEvents(input: {
  plans: Plan[];
  occurrences: PlanOccurrence[];
  obligations?: Obligation[];
  settlements?: ObligationSettlement[];
  bearerCheques?: BearerCheque[];
  transactions?: Transaction[];
  categories?: FinanceCategory[];
  /** «Только эту операцию» edits on not-yet-fired RECURRING dates. */
  overrides?: PlanOccurrenceOverride[];
  months: number;
  today?: string;
  toBase: (amount: number, currency: CurrencyCode) => number;
}): UpcomingEvent[] {
  const today = input.today || todayIso();
  // Built from y/m/d parts and read back the same way — new Date(todayStr)
  // parses as UTC midnight, and toISOString() converts back to UTC, so
  // round-tripping through it can silently land on the wrong day for a
  // user ahead of UTC.
  const [y, m, d] = today.split('-').map(Number);
  const horizonDate = new Date(y, m - 1 + input.months, d);
  const horizon = `${horizonDate.getFullYear()}-${String(horizonDate.getMonth() + 1).padStart(2, '0')}-${String(
    horizonDate.getDate()
  ).padStart(2, '0')}`;

  const items: UpcomingEvent[] = [];
  const planById = new Map(input.plans.map((plan) => [plan.id, plan]));
  const overrideByKey = new Map(
    (input.overrides || []).map((override) => [`${override.planId}__${override.dueDate}`, override])
  );

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
      planId: plan.id,
      categoryId: plan.categoryId,
      subcategoryId: plan.subcategoryId,
      accountId: plan.accountId,
      authorId: plan.authorId,
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
      authorId: row.obligation.authorId,
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
      categoryId: cheque.categoryId,
      accountId: cheque.accountId,
      authorId: cheque.authorId,
    });
  }

  for (const plan of input.plans) {
    if (plan.scheduleType !== 'RECURRING' || plan.status !== 'ACTIVE') continue;
    for (const date of occurrencesBetween(plan, today, horizon)) {
      const override = overrideByKey.get(`${plan.id}__${date}`);
      const fields = effectivePlanFields(plan, override);
      items.push({
        id: `${plan.id}-${date}`,
        date,
        title: override?.note || plan.title,
        amount: input.toBase(override?.amount ?? plan.amount, plan.currency),
        kind: plan.kind,
        source: plan.planType,
        isOverdue: date < today,
        needsConfirmation: date <= today && !plan.autoCreate,
        planId: plan.id,
        categoryId: fields.categoryId,
        subcategoryId: fields.subcategoryId,
        accountId: fields.accountId,
        authorId: plan.authorId,
      });
    }
  }

  // A transaction with `planId` is a realized plan payment — already
  // represented above via its occurrence/plan. A bare one dated after today
  // is money the user recorded ahead of time by hand, outside any plan.
  for (const transaction of input.transactions || []) {
    if (transaction.planId) continue;
    if (transaction.date <= today || transaction.date > horizon) continue;
    items.push({
      id: transaction.id,
      date: transaction.date,
      title:
        transaction.merchant ||
        transaction.note ||
        categoryNameById(transaction.categoryId, input.categories || [], getActiveLanguage()) ||
        tr('form.operation'),
      // Already converted at the rate that was actually saved with it —
      // reconverting via toBase would silently use today's rate instead.
      amount: transaction.baseAmount,
      kind: transaction.kind,
      source: 'TRANSACTION',
      isOverdue: false,
      needsConfirmation: false,
      categoryId: transaction.categoryId,
      subcategoryId: transaction.subcategoryId,
      accountId: transaction.accountId,
      authorId: transaction.authorId,
    });
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
