import {
  PlanKind,
  PlannedPayment,
  RecurringCostRow,
  RecurringTotals,
  Transaction,
} from '@/types';
import {
  addTransaction,
  financeDb,
  todayIso,
  updatePlannedPayment,
} from '@/lib/db';

export interface PlannedPaymentState {
  payment: PlannedPayment;
  daysUntilDue: number; // negative when overdue
  isOverdue: boolean;
  isDueToday: boolean;
  isWithinReminderWindow: boolean;
}

function parseIso(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

export function daysBetween(fromIso: string, toIsoStr: string): number {
  const ms = parseIso(toIsoStr).getTime() - parseIso(fromIso).getTime();
  return Math.round(ms / 86400000);
}

/**
 * Next occurrence after `from`. MONTHLY keeps the day-of-month and clamps to the
 * last day of shorter months, so a payment due on the 31st still lands in February.
 */
export function nextOccurrence(payment: PlannedPayment, from: string): string | null {
  const date = parseIso(from);

  switch (payment.recurrence) {
    case 'ONCE':
      return null;
    case 'WEEKLY':
      date.setDate(date.getDate() + 7);
      break;
    case 'MONTHLY':
    case 'QUARTERLY':
    case 'SEMIANNUAL': {
      const monthStep = payment.recurrence === 'MONTHLY' ? 1 : payment.recurrence === 'QUARTERLY' ? 3 : 6;
      const day = date.getDate();
      date.setDate(1);
      date.setMonth(date.getMonth() + monthStep);
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      date.setDate(Math.min(day, lastDay));
      break;
    }
    case 'YEARLY':
      date.setFullYear(date.getFullYear() + 1);
      break;
    case 'CUSTOM_DAYS':
      date.setDate(date.getDate() + Math.max(1, payment.intervalDays || 30));
      break;
  }

  const next = toIso(date);
  if (payment.endDate && next > payment.endDate) return null;
  return next;
}

export function describeRecurrence(payment: PlannedPayment): string {
  switch (payment.recurrence) {
    case 'ONCE':
      return 'Разовый платёж';
    case 'WEEKLY':
      return 'Каждую неделю';
    case 'MONTHLY':
      return 'Каждый месяц';
    case 'QUARTERLY':
      return 'Раз в квартал';
    case 'SEMIANNUAL':
      return 'Раз в полгода';
    case 'YEARLY':
      return 'Раз в год';
    case 'CUSTOM_DAYS':
      return `Каждые ${payment.intervalDays || 30} дн.`;
    default:
      return '';
  }
}

export function plannedPaymentState(payment: PlannedPayment, today = todayIso()): PlannedPaymentState {
  const daysUntilDue = daysBetween(today, payment.nextDueDate);
  return {
    payment,
    daysUntilDue,
    isOverdue: daysUntilDue < 0,
    isDueToday: daysUntilDue === 0,
    isWithinReminderWindow: daysUntilDue >= 0 && daysUntilDue <= payment.remindDaysBefore,
  };
}

/**
 * Books the planned payment as a real transaction and moves the schedule to the
 * next occurrence (deactivating one-off payments once they fire).
 */
export async function materializePlannedPayment(
  payment: PlannedPayment,
  overrides: Partial<Transaction> = {}
): Promise<Transaction> {
  const transaction = await addTransaction({
    kind: payment.kind,
    amount: payment.amount,
    currency: payment.currency,
    categoryId: payment.categoryId,
    accountId: payment.accountId,
    date: payment.nextDueDate,
    note: payment.note || payment.title,
    plannedPaymentId: payment.id,
    source: 'PLANNED',
    ...overrides,
  } as any);

  const next = nextOccurrence(payment, payment.nextDueDate);
  await updatePlannedPayment(payment.id, {
    lastRunDate: payment.nextDueDate,
    nextDueDate: next || payment.nextDueDate,
    isActive: next !== null,
  });

  return transaction;
}

/**
 * Runs on app start: fires every due auto-create payment that has not been
 * booked yet. Payments requiring confirmation are returned for the UI to prompt.
 */
export async function processDuePlannedPayments(
  autoCreateDefault: boolean
): Promise<{ created: Transaction[]; awaitingConfirmation: PlannedPayment[] }> {
  const today = todayIso();
  const payments = await financeDb.plannedPayments.toArray();
  const created: Transaction[] = [];
  const awaitingConfirmation: PlannedPayment[] = [];

  for (const payment of payments) {
    if (!payment.isActive) continue;
    if (payment.nextDueDate > today) continue;

    // Guard against a double-booking when the app is opened twice the same day.
    const already = await financeDb.transactions
      .where('plannedPaymentId')
      .equals(payment.id)
      .toArray();
    if (already.some((t) => t.date === payment.nextDueDate)) continue;

    if (payment.autoCreate || autoCreateDefault) {
      created.push(await materializePlannedPayment(payment));
    } else {
      awaitingConfirmation.push(payment);
    }
  }

  return { created, awaitingConfirmation };
}


/** Average days per month, used to normalise week- and day-based intervals. */
const DAYS_PER_MONTH = 365.25 / 12;

/**
 * How much a recurring entry costs per month on average. A yearly subscription
 * is a twelfth of its price each month, a quarterly one a third — that is what
 * makes plans on different billing periods comparable in one total.
 */
export function monthlyEquivalent(payment: PlannedPayment): number {
  const amount = payment.amount;

  switch (payment.recurrence) {
    case 'WEEKLY':
      return (amount * 52) / 12;
    case 'MONTHLY':
      return amount;
    case 'QUARTERLY':
      return amount / 3;
    case 'SEMIANNUAL':
      return amount / 6;
    case 'YEARLY':
      return amount / 12;
    case 'CUSTOM_DAYS':
      return (amount * DAYS_PER_MONTH) / Math.max(1, payment.intervalDays || 30);
    case 'ONCE':
    default:
      // A one-off has no recurring cost — it must not inflate the monthly total.
      return 0;
  }
}

export function planKindOf(payment: PlannedPayment): PlanKind {
  return payment.planKind || 'PAYMENT';
}

/**
 * Rolls active entries of one kind into monthly and yearly commitments,
 * converted to the profile's base currency via the rate stored on the plan.
 */
export function recurringTotals(
  payments: PlannedPayment[],
  planKind: PlanKind,
  toBase: (amount: number, currency: PlannedPayment['currency']) => number
): RecurringTotals {
  const rows: RecurringCostRow[] = payments
    .filter((p) => planKindOf(p) === planKind && p.isActive && p.recurrence !== 'ONCE')
    .map((payment) => {
      const monthlyBase = toBase(monthlyEquivalent(payment), payment.currency);
      return {
        payment,
        monthlyBase: Math.round(monthlyBase * 100) / 100,
        yearlyBase: Math.round(monthlyBase * 12 * 100) / 100,
      };
    })
    .sort((a, b) => b.monthlyBase - a.monthlyBase);

  const monthly = rows.reduce((sum, row) => sum + row.monthlyBase, 0);

  return {
    rows,
    monthly: Math.round(monthly * 100) / 100,
    yearly: Math.round(monthly * 12 * 100) / 100,
  };
}
