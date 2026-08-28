import {
  CurrencyCode,
  DebtInstallment,
  DebtPlan,
  DebtWithSchedule,
  Obligation,
  ObligationSettlement,
  PlannedPayment,
  UpcomingItem,
  UpcomingMonth,
  VatSummary,
} from '@/types';
import { describeDebt, todayIso } from '@/lib/db';
import { obligationsWithBalance } from './analytics';
import { occurrencesBetween } from './forecast';

export interface DebtsOverview {
  vat: number;
  cheques: number;
  installments: number;
  taxes: number;
  loans: number;
  total: number;
}

/** Everything the profile owes, grouped the way the section presents it. */
export function debtsOverview(input: {
  vatSummary?: VatSummary;
  obligations: Obligation[];
  settlements: ObligationSettlement[];
  debts: DebtPlan[];
  installments: DebtInstallment[];
  toBase: (amount: number, currency: CurrencyCode) => number;
}): DebtsOverview {
  const { vatSummary, obligations, settlements, debts, installments, toBase } = input;

  const issuedCheques = obligationsWithBalance(obligations, settlements)
    .filter((row) => row.status !== 'SETTLED')
    .reduce((sum, row) => sum + toBase(row.outstandingAmount, row.obligation.currency), 0);

  const byKind = (kind: DebtPlan['kind']) =>
    debts
      .filter((debt) => debt.kind === kind)
      .reduce((sum, debt) => {
        const described = describeDebt(debt, installments);
        return sum + toBase(described.outstandingAmount, debt.currency);
      }, 0);

  const round = (value: number) => Math.round(value * 100) / 100;

  const overview: DebtsOverview = {
    vat: round(vatSummary?.outstanding || 0),
    // Cheques the user has to pay, plus what is still open on cheques they issued.
    cheques: round(issuedCheques + byKind('CHEQUE')),
    installments: round(byKind('INSTALLMENT')),
    taxes: round(byKind('TAX')),
    loans: round(byKind('LOAN')),
    total: 0,
  };

  overview.total = round(
    overview.vat + overview.cheques + overview.installments + overview.taxes + overview.loans
  );
  return overview;
}

export function describeAllDebts(
  debts: DebtPlan[],
  installments: DebtInstallment[],
  today = todayIso()
): DebtWithSchedule[] {
  return debts
    .map((debt) => describeDebt(debt, installments, today))
    .sort((a, b) => {
      // Overdue first, then by the nearest payment date.
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
      const aDate = a.nextInstallment?.dueDate || '9999-12-31';
      const bDate = b.nextInstallment?.dueDate || '9999-12-31';
      return aDate.localeCompare(bDate);
    });
}

/**
 * Upcoming payments grouped by calendar month: instalments, cheques with a due
 * date and recurring plans, so «что списывается дальше» is one list rather than
 * four screens.
 */
export function upcomingByMonth(input: {
  debts: DebtPlan[];
  installments: DebtInstallment[];
  obligations: Obligation[];
  settlements: ObligationSettlement[];
  plannedPayments: PlannedPayment[];
  months: number;
  today?: string;
  toBase: (amount: number, currency: CurrencyCode) => number;
}): UpcomingMonth[] {
  const today = input.today || todayIso();
  const horizonDate = new Date(today);
  horizonDate.setMonth(horizonDate.getMonth() + input.months);
  const horizon = horizonDate.toISOString().slice(0, 10);

  const items: UpcomingItem[] = [];

  const debtById = new Map(input.debts.map((debt) => [debt.id, debt]));
  for (const installment of input.installments) {
    if (installment.isPaid || installment.dueDate > horizon) continue;
    const debt = debtById.get(installment.debtId);
    if (!debt) continue;

    items.push({
      id: installment.id,
      date: installment.dueDate,
      title: `${debt.title} · ${installment.index}/${
        input.installments.filter((i) => i.debtId === debt.id).length
      }`,
      amount: input.toBase(installment.amount, installment.currency),
      source: debt.kind,
      isOverdue: installment.dueDate < today,
    });
  }

  for (const row of obligationsWithBalance(input.obligations, input.settlements)) {
    if (row.status === 'SETTLED' || !row.obligation.dueDate) continue;
    if (row.obligation.dueDate > horizon) continue;

    items.push({
      id: row.obligation.id,
      date: row.obligation.dueDate,
      title: row.obligation.payeeLabel || 'Чек на предъявителя',
      amount: input.toBase(row.outstandingAmount, row.obligation.currency),
      source: 'CHEQUE',
      isOverdue: row.status === 'OVERDUE',
    });
  }

  for (const payment of input.plannedPayments) {
    if (!payment.isActive || payment.kind !== 'EXPENSE') continue;
    for (const date of occurrencesBetween(payment, today, horizon)) {
      items.push({
        id: `${payment.id}-${date}`,
        date,
        title: payment.title,
        amount: input.toBase(payment.amount, payment.currency),
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

/** Unpaid instalments still due inside the given month, in base currency. */
export function installmentsDueInMonth(
  installments: DebtInstallment[],
  month: string,
  toBase: (amount: number, currency: CurrencyCode) => number,
  today = todayIso()
): number {
  const total = installments
    .filter((i) => !i.isPaid && i.dueDate.slice(0, 7) === month && i.dueDate >= today)
    .reduce((sum, i) => sum + toBase(i.amount, i.currency), 0);
  return Math.round(total * 100) / 100;
}
