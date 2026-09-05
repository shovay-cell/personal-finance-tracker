import { tr } from '@/i18n/t';
import {
  BearerCheque,
  CurrencyCode,
  Obligation,
  ObligationSettlement,
  Plan,
  PlanOccurrence,
  PlanOccurrenceOverride,
  PlanWithSchedule,
  UpcomingItem,
  UpcomingMonth,
  VatSummary,
} from '@/types';
import { describePlan, todayIso } from '@/lib/db';
import { obligationsWithBalance } from './analytics';
import { occurrencesBetween } from './forecast';

export interface DebtsOverview {
  vat: number;
  cheques: number;
  installments: number;
  taxes: number;
  loans: number;
  other: number;
  total: number;
}

/** Everything the profile owes, grouped the way the section presents it. */
export function debtsOverview(input: {
  vatSummary?: VatSummary;
  obligations: Obligation[];
  settlements: ObligationSettlement[];
  plans: Plan[];
  occurrences: PlanOccurrence[];
  bearerCheques?: BearerCheque[];
  toBase: (amount: number, currency: CurrencyCode) => number;
}): DebtsOverview {
  const { vatSummary, obligations, settlements, plans, occurrences, bearerCheques = [], toBase } =
    input;

  const issuedCheques = obligationsWithBalance(obligations, settlements)
    .filter((row) => row.status !== 'SETTLED')
    .reduce((sum, row) => sum + toBase(row.outstandingAmount, row.obligation.currency), 0);

  const pendingCheques = bearerCheques
    .filter((cheque) => cheque.status === 'ISSUED')
    .reduce((sum, cheque) => sum + toBase(cheque.amount, cheque.currency), 0);

  const byType = (planType: Plan['planType']) =>
    plans
      .filter((plan) => plan.scheduleType === 'FIXED_SCHEDULE' && plan.planType === planType)
      .reduce((sum, plan) => {
        const described = describePlan(plan, occurrences);
        return sum + toBase(described.outstandingAmount, plan.currency);
      }, 0);

  const round = (value: number) => Math.round(value * 100) / 100;

  const overview: DebtsOverview = {
    vat: round(vatSummary?.outstanding || 0),
    // Cheques the user has to pay, cheques they issued, plus their own bearer cheques.
    cheques: round(issuedCheques + byType('CHEQUE') + pendingCheques),
    installments: round(byType('INSTALLMENT')),
    taxes: round(byType('TAX')),
    loans: round(byType('LOAN')),
    other: round(byType('OTHER')),
    total: 0,
  };

  overview.total = round(
    overview.vat +
      overview.cheques +
      overview.installments +
      overview.taxes +
      overview.loans +
      overview.other
  );
  return overview;
}

export function describeAllFixedSchedulePlans(
  plans: Plan[],
  occurrences: PlanOccurrence[],
  today = todayIso()
): PlanWithSchedule[] {
  return plans
    .filter((plan) => plan.scheduleType === 'FIXED_SCHEDULE')
    .map((plan) => describePlan(plan, occurrences, today))
    .sort((a, b) => {
      // Overdue first, then by the nearest payment date.
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
      const aDate = a.nextOccurrence?.dueDate || '9999-12-31';
      const bDate = b.nextOccurrence?.dueDate || '9999-12-31';
      return aDate.localeCompare(bDate);
    });
}

/**
 * Upcoming payments grouped by calendar month: fixed-schedule occurrences,
 * cheques with a due date and recurring plans, so «что списывается дальше» is
 * one list rather than four screens.
 */
export function upcomingByMonth(input: {
  plans: Plan[];
  occurrences: PlanOccurrence[];
  obligations: Obligation[];
  settlements: ObligationSettlement[];
  bearerCheques?: BearerCheque[];
  /** «Только эту операцию» edits on not-yet-fired RECURRING dates. */
  overrides?: PlanOccurrenceOverride[];
  months: number;
  today?: string;
  toBase: (amount: number, currency: CurrencyCode) => number;
}): UpcomingMonth[] {
  const today = input.today || todayIso();
  const horizonDate = new Date(today);
  horizonDate.setMonth(horizonDate.getMonth() + input.months);
  const horizon = horizonDate.toISOString().slice(0, 10);

  const items: UpcomingItem[] = [];
  const overrideByKey = new Map(
    (input.overrides || []).map((override) => [`${override.planId}__${override.dueDate}`, override])
  );

  const planById = new Map(input.plans.map((plan) => [plan.id, plan]));
  for (const occurrence of input.occurrences) {
    if (occurrence.isPaid || occurrence.dueDate > horizon) continue;
    const plan = planById.get(occurrence.planId);
    if (!plan) continue;

    items.push({
      id: occurrence.id,
      date: occurrence.dueDate,
      title: `${plan.title} · ${occurrence.index}/${
        input.occurrences.filter((o) => o.planId === plan.id).length
      }`,
      amount: input.toBase(occurrence.amount, occurrence.currency),
      source: plan.planType as UpcomingItem['source'],
      isOverdue: occurrence.dueDate < today,
    });
  }

  for (const row of obligationsWithBalance(input.obligations, input.settlements)) {
    if (row.status === 'SETTLED' || !row.obligation.dueDate) continue;
    if (row.obligation.dueDate > horizon) continue;

    items.push({
      id: row.obligation.id,
      date: row.obligation.dueDate,
      title: row.obligation.payeeLabel || tr('rp.bearerCheque'),
      amount: input.toBase(row.outstandingAmount, row.obligation.currency),
      source: 'CHEQUE',
      isOverdue: row.status === 'OVERDUE',
    });
  }

  for (const cheque of input.bearerCheques || []) {
    if (cheque.status !== 'ISSUED' || cheque.dueDate > horizon) continue;

    items.push({
      id: cheque.id,
      date: cheque.dueDate,
      title: cheque.payee,
      amount: input.toBase(cheque.amount, cheque.currency),
      source: 'BEARER_CHEQUE',
      isOverdue: cheque.dueDate < today,
    });
  }

  for (const plan of input.plans) {
    if (plan.scheduleType !== 'RECURRING' || plan.status !== 'ACTIVE' || plan.kind !== 'EXPENSE') {
      continue;
    }
    for (const date of occurrencesBetween(plan, today, horizon)) {
      const override = overrideByKey.get(`${plan.id}__${date}`);
      items.push({
        id: `${plan.id}-${date}`,
        date,
        title: override?.note || plan.title,
        amount: input.toBase(override?.amount ?? plan.amount, plan.currency),
        source: 'PLANNED',
        isOverdue: date < today,
      });
    }
  }

  const byMonth = new Map<string, UpcomingItem[]>();
  for (const item of items.sort((a, b) => a.date.localeCompare(b.date))) {
    const month = item.date.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) || []), item]);
  }

  return Array.from(byMonth.entries())
    .map(([month, monthItems]) => ({
      month,
      items: monthItems,
      total: Math.round(monthItems.reduce((sum, i) => sum + i.amount, 0) * 100) / 100,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/** Unpaid fixed-schedule occurrences still due inside the given month, in base currency. */
export function occurrencesDueInMonth(
  occurrences: PlanOccurrence[],
  month: string,
  toBase: (amount: number, currency: CurrencyCode) => number,
  today = todayIso()
): number {
  const total = occurrences
    .filter((o) => !o.isPaid && o.dueDate.slice(0, 7) === month && o.dueDate >= today)
    .reduce((sum, o) => sum + toBase(o.amount, o.currency), 0);
  return Math.round(total * 100) / 100;
}

/** Uncleared bearer cheques due inside the given month, in base currency —
 *  the money is already spoken for even though it has not left the account yet. */
export function bearerChequesDueInMonth(
  bearerCheques: BearerCheque[],
  month: string,
  toBase: (amount: number, currency: CurrencyCode) => number,
  today = todayIso()
): number {
  const total = bearerCheques
    .filter((c) => c.status === 'ISSUED' && c.dueDate.slice(0, 7) === month && c.dueDate >= today)
    .reduce((sum, c) => sum + toBase(c.amount, c.currency), 0);
  return Math.round(total * 100) / 100;
}
