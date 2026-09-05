import { Plan, PlanCostRow, PlanState, PlanTotals, PlanType, Transaction } from '@/types';
import {
  addTransaction,
  effectivePlanFields,
  financeDb,
  getPlanOccurrenceOverride,
  todayIso,
  updatePlan,
} from '@/lib/db';
import { getActiveLanguage } from '@/i18n/runtime';

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
export function nextOccurrence(plan: Plan, from: string): string | null {
  const date = parseIso(from);

  // «Повторять каждый N день/неделя/месяц/год» from the expense form wins over
  // the preset kinds — it is the rule the user actually typed.
  if (plan.intervalUnit && plan.intervalCount) {
    const count = Math.max(1, plan.intervalCount);
    if (plan.intervalUnit === 'DAY') date.setDate(date.getDate() + count);
    else if (plan.intervalUnit === 'WEEK') date.setDate(date.getDate() + count * 7);
    else if (plan.intervalUnit === 'YEAR') date.setFullYear(date.getFullYear() + count);
    else {
      const day = date.getDate();
      date.setDate(1);
      date.setMonth(date.getMonth() + count);
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      date.setDate(Math.min(day, lastDay));
    }

    const next = toIso(date);
    if (plan.endDate && next > plan.endDate) return null;
    return next;
  }

  switch (plan.recurrence) {
    case 'ONCE':
      return null;
    case 'WEEKLY':
      date.setDate(date.getDate() + 7);
      break;
    case 'MONTHLY':
    case 'QUARTERLY':
    case 'SEMIANNUAL': {
      const monthStep = plan.recurrence === 'MONTHLY' ? 1 : plan.recurrence === 'QUARTERLY' ? 3 : 6;
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
      date.setDate(date.getDate() + Math.max(1, plan.intervalDays || 30));
      break;
  }

  const next = toIso(date);
  if (plan.endDate && next > plan.endDate) return null;
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

export function describeRecurrence(plan: Plan): string {
  const language = getActiveLanguage();
  const labels = RECURRENCE_LABELS[language] || RECURRENCE_LABELS.ru;

  if (plan.intervalUnit && plan.intervalCount) {
    const count = plan.intervalCount;
    const forms = (INTERVAL_FORMS[language] || INTERVAL_FORMS.ru)[plan.intervalUnit];
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

  switch (plan.recurrence) {
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
      return `${labels.EVERY} ${plan.intervalDays || 30} ${labels.DAYS_SHORT}`;
    default:
      return '';
  }
}

export function planState(plan: Plan, today = todayIso()): PlanState {
  const daysUntilDue = daysBetween(today, plan.nextDueDate || today);
  return {
    plan,
    daysUntilDue,
    isOverdue: daysUntilDue < 0,
    isDueToday: daysUntilDue === 0,
    isWithinReminderWindow: daysUntilDue >= 0 && daysUntilDue <= (plan.remindDaysBefore ?? 0),
  };
}

/**
 * Books the recurring plan as a real transaction and moves the schedule to the
 * next occurrence (cancelling one-off plans once they fire).
 */
export async function materializeRecurringPlan(
  plan: Plan,
  overrides: Partial<Transaction> = {}
): Promise<Transaction> {
  const dueDate = plan.nextDueDate || todayIso();

  // A "только эту операцию" edit on a not-yet-fired date lives here, not on
  // the plan — merge it over the plan's own fields, then it's spent: once
  // this materialises into a real Transaction, that transaction is what
  // future edits touch.
  const override = await getPlanOccurrenceOverride(plan.id, dueDate);
  const fields = effectivePlanFields(plan, override);
  const transaction = await addTransaction({
    kind: plan.kind,
    amount: override?.amount ?? plan.amount,
    currency: plan.currency,
    categoryId: fields.categoryId,
    subcategoryId: fields.subcategoryId,
    accountId: fields.accountId,
    merchant: fields.merchant,
    date: dueDate,
    note: override?.note || plan.note || plan.title,
    planId: plan.id,
    source: 'PLANNED',
    ...overrides,
  } as any);
  if (override) await financeDb.planOccurrenceOverrides.delete(override.id);

  const next = nextOccurrence(plan, dueDate);
  await updatePlan(plan.id, {
    lastRunDate: dueDate,
    nextDueDate: next || dueDate,
    status: next !== null ? 'ACTIVE' : 'COMPLETED',
  });

  return transaction;
}

/**
 * Runs on app start: fires every due auto-create plan that has not been
 * booked yet. Plans requiring confirmation are returned for the UI to prompt.
 */
export async function processDueRecurringPlans(
  autoCreateDefault: boolean
): Promise<{ created: Transaction[]; awaitingConfirmation: Plan[] }> {
  const today = todayIso();
  const plans = await financeDb.plans.where('scheduleType').equals('RECURRING').toArray();
  const created: Transaction[] = [];
  const awaitingConfirmation: Plan[] = [];

  for (const plan of plans) {
    if (plan.status !== 'ACTIVE') continue;
    if (!plan.nextDueDate || plan.nextDueDate > today) continue;

    // Guard against a double-booking when the app is opened twice the same day.
    const already = await financeDb.transactions.where('planId').equals(plan.id).toArray();
    if (already.some((t) => t.date === plan.nextDueDate)) continue;

    if (plan.autoCreate || autoCreateDefault) {
      created.push(await materializeRecurringPlan(plan));
    } else {
      awaitingConfirmation.push(plan);
    }
  }

  return { created, awaitingConfirmation };
}

/** Average days per month, used to normalise week- and day-based intervals. */
const DAYS_PER_MONTH = 365.25 / 12;

/**
 * How much a recurring plan costs per month on average. A yearly subscription
 * is a twelfth of its price each month, a quarterly one a third — that is what
 * makes plans on different billing periods comparable in one total.
 */
export function monthlyEquivalent(plan: Plan): number {
  const amount = plan.amount;

  if (plan.intervalUnit && plan.intervalCount) {
    const count = Math.max(1, plan.intervalCount);
    switch (plan.intervalUnit) {
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

  switch (plan.recurrence) {
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
      return (amount * DAYS_PER_MONTH) / Math.max(1, plan.intervalDays || 30);
    case 'ONCE':
    default:
      // A one-off has no recurring cost — it must not inflate the monthly total.
      return 0;
  }
}

/**
 * Rolls active recurring plans of one type into monthly and yearly
 * commitments, converted to the profile's base currency via the rate stored
 * on the plan.
 */
export function recurringTotals(
  plans: Plan[],
  planType: PlanType,
  toBase: (amount: number, currency: Plan['currency']) => number
): PlanTotals {
  const rows: PlanCostRow[] = plans
    .filter(
      (p) =>
        p.scheduleType === 'RECURRING' &&
        p.planType === planType &&
        p.status === 'ACTIVE' &&
        p.recurrence !== 'ONCE'
    )
    .map((plan) => {
      const monthlyBase = toBase(monthlyEquivalent(plan), plan.currency);
      return {
        plan,
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
