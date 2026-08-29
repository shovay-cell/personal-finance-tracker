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
import { getActiveLanguage } from '@/i18n/runtime';

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

  // «Повторять каждый N день/неделя/месяц/год» from the expense form wins over
  // the preset kinds — it is the rule the user actually typed.
  if (payment.intervalUnit && payment.intervalCount) {
    const count = Math.max(1, payment.intervalCount);
    if (payment.intervalUnit === 'DAY') date.setDate(date.getDate() + count);
    else if (payment.intervalUnit === 'WEEK') date.setDate(date.getDate() + count * 7);
    else if (payment.intervalUnit === 'YEAR') date.setFullYear(date.getFullYear() + count);
    else {
      const day = date.getDate();
      date.setDate(1);
      date.setMonth(date.getMonth() + count);
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      date.setDate(Math.min(day, lastDay));
    }

    const next = toIso(date);
    if (payment.endDate && next > payment.endDate) return null;
    return next;
  }

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

/**
 * Wording of a repeat rule. Russian and Ukrainian need three plural forms, so
 * every language carries its own table rather than a single template.
 */
const INTERVAL_FORMS: Record<string, Record<string, string[]>> = {
  ru: {
    DAY: ['день', 'дня', 'дней'],
    WEEK: ['неделю', 'недели', 'недель'],
    MONTH: ['месяц', 'месяца', 'месяцев'],
    YEAR: ['год', 'года', 'лет'],
  },
  uk: {
    DAY: ['день', 'дні', 'днів'],
    WEEK: ['тиждень', 'тижні', 'тижнів'],
    MONTH: ['місяць', 'місяці', 'місяців'],
    YEAR: ['рік', 'роки', 'років'],
  },
  en: {
    DAY: ['day', 'days', 'days'],
    WEEK: ['week', 'weeks', 'weeks'],
    MONTH: ['month', 'months', 'months'],
    YEAR: ['year', 'years', 'years'],
  },
  he: {
    DAY: ['יום', 'ימים', 'ימים'],
    WEEK: ['שבוע', 'שבועות', 'שבועות'],
    MONTH: ['חודש', 'חודשים', 'חודשים'],
    YEAR: ['שנה', 'שנים', 'שנים'],
  },
};

const RECURRENCE_LABELS: Record<string, Record<string, string>> = {
  ru: {
    ONCE: 'Разовый платёж',
    WEEKLY: 'Каждую неделю',
    MONTHLY: 'Каждый месяц',
    QUARTERLY: 'Раз в квартал',
    SEMIANNUAL: 'Раз в полгода',
    YEARLY: 'Раз в год',
    EVERY: 'Каждые',
    DAYS_SHORT: 'дн.',
  },
  uk: {
    ONCE: 'Разовий платіж',
    WEEKLY: 'Щотижня',
    MONTHLY: 'Щомісяця',
    QUARTERLY: 'Раз на квартал',
    SEMIANNUAL: 'Раз на півроку',
    YEARLY: 'Раз на рік',
    EVERY: 'Кожні',
    DAYS_SHORT: 'дн.',
  },
  en: {
    ONCE: 'One-off payment',
    WEEKLY: 'Every week',
    MONTHLY: 'Every month',
    QUARTERLY: 'Every quarter',
    SEMIANNUAL: 'Twice a year',
    YEARLY: 'Once a year',
    EVERY: 'Every',
    DAYS_SHORT: 'days',
  },
  he: {
    ONCE: 'תשלום חד‑פעמי',
    WEEKLY: 'כל שבוע',
    MONTHLY: 'כל חודש',
    QUARTERLY: 'כל רבעון',
    SEMIANNUAL: 'פעמיים בשנה',
    YEARLY: 'פעם בשנה',
    EVERY: 'כל',
    DAYS_SHORT: 'ימים',
  },
};

function pluralForm(count: number, forms: string[], language: string): string {
  if (language === 'ru' || language === 'uk') {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return forms[0];
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
    return forms[2];
  }
  return count === 1 ? forms[0] : forms[1];
}

export function describeRecurrence(payment: PlannedPayment): string {
  const language = getActiveLanguage();
  const labels = RECURRENCE_LABELS[language] || RECURRENCE_LABELS.ru;

  if (payment.intervalUnit && payment.intervalCount) {
    const count = payment.intervalCount;
    const forms = (INTERVAL_FORMS[language] || INTERVAL_FORMS.ru)[payment.intervalUnit];
    const word = pluralForm(count, forms, language);
    if (count === 1) {
      // Russian and Ukrainian inflect the article-like word with the noun; the
      // other two read naturally with the same «every» as the plural branch.
      if (language === 'ru') return `Каждый ${word}`;
      if (language === 'uk') return `Кожен ${word}`;
      return `${labels.EVERY} ${word}`;
    }
    return `${labels.EVERY} ${count} ${word}`;
  }

  switch (payment.recurrence) {
    case 'ONCE':
      return labels.ONCE;
    case 'WEEKLY':
      return labels.WEEKLY;
    case 'MONTHLY':
      return labels.MONTHLY;
    case 'QUARTERLY':
      return labels.QUARTERLY;
    case 'SEMIANNUAL':
      return labels.SEMIANNUAL;
    case 'YEARLY':
      return labels.YEARLY;
    case 'CUSTOM_DAYS':
      return `${labels.EVERY} ${payment.intervalDays || 30} ${labels.DAYS_SHORT}`;
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

  if (payment.intervalUnit && payment.intervalCount) {
    const count = Math.max(1, payment.intervalCount);
    switch (payment.intervalUnit) {
      case 'DAY':
        return (amount * DAYS_PER_MONTH) / count;
      case 'WEEK':
        return (amount * 52) / 12 / count;
      case 'MONTH':
        return amount / count;
      case 'YEAR':
        return amount / (12 * count);
    }
  }

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
