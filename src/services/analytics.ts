import {
  Budget,
  PlannedPayment,
  SafeToSpend,
  PacingComparison,
  PacingPoint,
  BudgetProgress,
  CategoryBreakdownRow,
  CurrencyCode,
  FinanceCategory,
  FinanceSettings,
  MonthlyPoint,
  Obligation,
  ObligationSettlement,
  ObligationWithBalance,
  Transaction,
  TransactionKind,
} from '@/types';
import { CURRENCIES } from '@/constants/categories';
import { computeObligationStatus, todayIso } from '@/lib/db';
import { monthlyEquivalent, planKindOf } from './planned';

export type PeriodPreset = 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR' | 'CUSTOM';

export interface DateRange {
  from: string; // YYYY-MM-DD inclusive
  to: string; // YYYY-MM-DD inclusive
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function rangeForPreset(preset: PeriodPreset, anchor = new Date()): DateRange {
  const to = iso(anchor);

  if (preset === 'WEEK') {
    const from = new Date(anchor);
    // ISO week: Monday as the first day
    const weekday = (from.getDay() + 6) % 7;
    from.setDate(from.getDate() - weekday);
    return { from: iso(from), to };
  }

  if (preset === 'MONTH') {
    return { from: iso(new Date(anchor.getFullYear(), anchor.getMonth(), 1)), to };
  }

  if (preset === 'QUARTER') {
    const quarterStartMonth = Math.floor(anchor.getMonth() / 3) * 3;
    return { from: iso(new Date(anchor.getFullYear(), quarterStartMonth, 1)), to };
  }

  if (preset === 'YEAR') {
    return { from: iso(new Date(anchor.getFullYear(), 0, 1)), to };
  }

  return { from: iso(new Date(anchor.getFullYear(), anchor.getMonth(), 1)), to };
}

export function monthRange(month: string): DateRange {
  const [year, mon] = month.split('-').map(Number);
  const from = new Date(year, mon - 1, 1);
  const to = new Date(year, mon, 0);
  return { from: iso(from), to: iso(to) };
}

export function isWithin(dateStr: string, range: DateRange): boolean {
  return dateStr >= range.from && dateStr <= range.to;
}

export function filterTransactions(
  transactions: Transaction[],
  options: {
    range?: DateRange;
    kind?: TransactionKind;
    memberId?: string;
    accountId?: string;
    categoryId?: string;
    search?: string;
  }
): Transaction[] {
  const search = options.search?.trim().toLowerCase();

  return transactions.filter((t) => {
    if (options.range && !isWithin(t.date, options.range)) return false;
    if (options.kind && t.kind !== options.kind) return false;
    if (options.memberId && t.authorId !== options.memberId) return false;
    if (options.accountId && t.accountId !== options.accountId) return false;
    if (
      options.categoryId &&
      !transactionParts(t).some(
        (part) =>
          part.categoryId === options.categoryId || part.subcategoryId === options.categoryId
      )
    )
      return false;
    if (search) {
      const haystack = `${t.note || ''} ${t.merchant || ''} ${t.amount}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

export interface TransactionPart {
  categoryId: string;
  subcategoryId?: string;
  amount: number;
  baseAmount: number;
}

/**
 * A transaction as the reports see it: a split receipt contributes one part per
 * slice, everything else contributes a single part. Keeps every aggregation from
 * having to know whether splits exist.
 */
export function transactionParts(transaction: Transaction): TransactionPart[] {
  const splits = transaction.splits;
  if (!splits || splits.length === 0) {
    return [
      {
        categoryId: transaction.categoryId,
        subcategoryId: transaction.subcategoryId,
        amount: transaction.amount,
        baseAmount: transaction.baseAmount,
      },
    ];
  }

  const splitTotal = splits.reduce((sum, part) => sum + part.amount, 0) || 1;
  return splits.map((part) => ({
    categoryId: part.categoryId,
    subcategoryId: part.subcategoryId,
    amount: part.amount,
    // Base amounts follow the same proportion, so rounding never invents money.
    baseAmount: Math.round(((part.amount / splitTotal) * transaction.baseAmount) * 100) / 100,
  }));
}

export function sumBase(transactions: Transaction[]): number {
  return Math.round(transactions.reduce((sum, t) => sum + t.baseAmount, 0) * 100) / 100;
}

/**
 * Income with its separated VAT taken out: what is actually the user's to spend.
 * The VAT share is applied to the base amount so mixed currencies stay correct.
 */
export function sumNetBase(transactions: Transaction[]): number {
  const total = transactions.reduce((sum, t) => {
    const vatShare = t.amount > 0 ? (t.vatAmount || 0) / t.amount : 0;
    return sum + t.baseAmount * (1 - vatShare);
  }, 0);
  return Math.round(total * 100) / 100;
}

/**
 * Per-category totals in base currency. Subcategory spending rolls up into its
 * parent so a pie chart never double-counts.
 */
export function categoryBreakdown(
  transactions: Transaction[],
  categories: FinanceCategory[],
  kind: TransactionKind
): CategoryBreakdownRow[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string, { total: number; count: number }>();

  for (const t of transactions) {
    if (t.kind !== kind) continue;
    for (const part of transactionParts(t)) {
      const category = byId.get(part.categoryId);
      const rootId = category?.parentId || part.categoryId;
      const entry = totals.get(rootId) || { total: 0, count: 0 };
      entry.total += part.baseAmount;
      entry.count += 1;
      totals.set(rootId, entry);
    }
  }

  const grandTotal = Array.from(totals.values()).reduce((s, e) => s + e.total, 0);

  return Array.from(totals.entries())
    .map(([categoryId, entry]) => {
      const category = byId.get(categoryId);
      return {
        categoryId,
        categoryName: category?.name || 'Без категории',
        colorHex: category?.colorHex || '#64748B',
        iconName: category?.iconName || 'CircleDashed',
        total: Math.round(entry.total * 100) / 100,
        share: grandTotal > 0 ? entry.total / grandTotal : 0,
        transactionCount: entry.count,
      };
    })
    .sort((a, b) => b.total - a.total);
}

/** Expense/income totals per calendar month, oldest first. */
export function monthlyDynamics(transactions: Transaction[], monthsBack = 6): MonthlyPoint[] {
  const now = new Date();
  const points: MonthlyPoint[] = [];

  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const inMonth = transactions.filter((t) => t.date.slice(0, 7) === month);
    points.push({
      month,
      expense: sumBase(inMonth.filter((t) => t.kind === 'EXPENSE')),
      income: sumBase(inMonth.filter((t) => t.kind === 'INCOME')),
    });
  }

  return points;
}

export function budgetProgress(
  budgets: Budget[],
  transactions: Transaction[],
  categories: FinanceCategory[],
  month: string
): BudgetProgress[] {
  const range = monthRange(month);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const monthExpenses = transactions.filter((t) => t.kind === 'EXPENSE' && isWithin(t.date, range));

  return budgets
    .filter((b) => b.month === month)
    .map((budget) => {
      let spent = 0;
      for (const t of monthExpenses) {
        if (budget.memberId && t.authorId !== budget.memberId) continue;

        for (const part of transactionParts(t)) {
          if (!budget.categoryId) {
            spent += part.baseAmount;
            continue;
          }
          const category = byId.get(part.categoryId);
          const rootId = category?.parentId || part.categoryId;
          if (rootId === budget.categoryId || part.categoryId === budget.categoryId) {
            spent += part.baseAmount;
          }
        }
      }
      spent = Math.round(spent * 100) / 100;
      const effectiveLimit =
        Math.round((budget.limitAmount + (budget.rolloverEnabled ? budget.carriedOver : 0)) * 100) /
        100;
      const percent = effectiveLimit > 0 ? (spent / effectiveLimit) * 100 : 0;

      return {
        budget,
        categoryName: budget.categoryId
          ? byId.get(budget.categoryId)?.name || 'Категория'
          : 'Общий бюджет месяца',
        spent,
        effectiveLimit,
        percent: Math.round(percent * 10) / 10,
        level: percent >= 100 ? 'EXCEEDED' : percent >= 80 ? 'WARNING' : 'OK',
        remaining: Math.round((effectiveLimit - spent) * 100) / 100,
      } as BudgetProgress;
    })
    .sort((a, b) => b.percent - a.percent);
}

/**
 * Unspent remainder of `month`, ready to be carried into the next month's
 * budget row when rollover is enabled.
 */
export function computeRollover(progress: BudgetProgress): number {
  return Math.max(0, Math.round((progress.effectiveLimit - progress.spent) * 100) / 100);
}

export function obligationsWithBalance(
  obligations: Obligation[],
  settlements: ObligationSettlement[]
): ObligationWithBalance[] {
  const today = todayIso();

  return obligations
    .map((obligation) => {
      const own = settlements.filter((s) => s.obligationId === obligation.id);
      const settledAmount = Math.round(own.reduce((sum, s) => sum + s.amount, 0) * 100) / 100;
      return {
        obligation,
        settlements: own.sort((a, b) => b.date.localeCompare(a.date)),
        settledAmount,
        outstandingAmount: Math.round((obligation.amount - settledAmount) * 100) / 100,
        status: computeObligationStatus(obligation, settledAmount, today),
      };
    })
    .sort((a, b) => {
      const rank = (s: string) => (s === 'OVERDUE' ? 0 : s === 'PARTIALLY_SETTLED' ? 1 : s === 'ISSUED' ? 2 : 3);
      const byStatus = rank(a.status) - rank(b.status);
      return byStatus !== 0 ? byStatus : b.obligation.issueDate.localeCompare(a.obligation.issueDate);
    });
}

export function formatMoney(
  amount: number,
  currency: CurrencyCode = 'ILS',
  options: { compact?: boolean } = {}
): string {
  const symbol = CURRENCIES[currency]?.symbol || '';
  const abs = Math.abs(amount);

  if (options.compact && abs >= 10000) {
    return `${amount < 0 ? '-' : ''}${(abs / 1000).toFixed(abs >= 100000 ? 0 : 1)}k ${symbol}`;
  }

  const formatted = abs.toLocaleString('ru-RU', {
    minimumFractionDigits: Number.isInteger(abs) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${amount < 0 ? '-' : ''}${formatted} ${symbol}`;
}

export function formatDateHuman(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const months = [
    'янв', 'фев', 'мар', 'апр', 'мая', 'июн',
    'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
  ];
  const today = todayIso();
  if (dateStr === today) return 'Сегодня';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateStr === yesterday.toISOString().slice(0, 10)) return 'Вчера';
  return `${d} ${months[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ''}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const names = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
  ];
  return `${names[m - 1]} ${y}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function baseCurrencyOf(settings: FinanceSettings | null | undefined): CurrencyCode {
  return settings?.baseCurrency || 'ILS';
}


// ------------------------------------------------- «Доступно до конца месяца»

function daysInMonth(month: string): number {
  const [year, mon] = month.split('-').map(Number);
  return new Date(year, mon, 0).getDate();
}

/**
 * Safe-to-Spend: what is left for discretionary spending once the money already
 * spent and the recurring payments still due this month are set aside, divided
 * by the days remaining. Starts from the monthly budget; without one it falls
 * back to the income actually booked this month.
 */
export function safeToSpend(input: {
  month: string;
  today?: string;
  transactions: Transaction[];
  budgets: Budget[];
  plannedPayments: PlannedPayment[];
  toBase: (amount: number, currency: CurrencyCode) => number;
}): SafeToSpend {
  const { month, transactions, budgets, plannedPayments, toBase } = input;
  const today = input.today || todayIso();
  const range = monthRange(month);
  const inMonth = transactions.filter((t) => isWithin(t.date, range));

  const spent = sumBase(inMonth.filter((t) => t.kind === 'EXPENSE'));
  // Money set aside as VAT belongs to the tax authority — never to the plan.
  const income = sumNetBase(inMonth.filter((t) => t.kind === 'INCOME'));

  const totalBudget = budgets.find((b) => b.month === month && !b.categoryId && !b.memberId);
  const planned = totalBudget
    ? totalBudget.limitAmount + (totalBudget.rolloverEnabled ? totalBudget.carriedOver : 0)
    : income;
  const basis: SafeToSpend['basis'] = totalBudget ? 'BUDGET' : income > 0 ? 'INCOME' : 'NONE';

  // Recurring commitments whose due date still lies ahead inside this month, and
  // which have not been booked yet — those already paid are inside `spent`.
  const upcomingCommitted = plannedPayments.reduce((sum, payment) => {
    if (!payment.isActive || payment.kind !== 'EXPENSE') return sum;
    if (payment.nextDueDate < today || payment.nextDueDate > range.to) return sum;
    const alreadyBooked = inMonth.some(
      (t) => t.plannedPaymentId === payment.id && t.date === payment.nextDueDate
    );
    return alreadyBooked ? sum : sum + toBase(payment.amount, payment.currency);
  }, 0);

  const total = daysInMonth(month);
  const currentDay = today.slice(0, 7) === month ? Number(today.slice(8, 10)) : total;
  // The current day still counts: money can be spent today.
  const daysLeft = Math.max(1, total - currentDay + 1);

  const available = Math.round((planned - spent - upcomingCommitted) * 100) / 100;

  return {
    planned: Math.round(planned * 100) / 100,
    spent,
    upcomingCommitted: Math.round(upcomingCommitted * 100) / 100,
    available,
    daysLeft,
    perDay: Math.round((available / daysLeft) * 100) / 100,
    basis,
  };
}

// ------------------------------------------------------------------ pacing

/**
 * Cumulative spending this month against the previous one, compared at the same
 * day of the month — the honest way to answer "трачу быстрее или медленнее".
 */
export function pacingComparison(
  transactions: Transaction[],
  month: string,
  today = todayIso()
): PacingComparison {
  const previousMonth = shiftMonth(month, -1);
  const dayOfMonth =
    today.slice(0, 7) === month ? Number(today.slice(8, 10)) : daysInMonth(month);

  const cumulative = (targetMonth: string): number[] => {
    const days = daysInMonth(targetMonth);
    const perDay = new Array(days + 1).fill(0);

    for (const t of transactions) {
      if (t.kind !== 'EXPENSE' || t.date.slice(0, 7) !== targetMonth) continue;
      const day = Number(t.date.slice(8, 10));
      if (day >= 1 && day <= days) perDay[day] += t.baseAmount;
    }

    const out: number[] = [];
    let running = 0;
    for (let day = 1; day <= days; day++) {
      running += perDay[day];
      out.push(Math.round(running * 100) / 100);
    }
    return out;
  };

  const currentSeries = cumulative(month);
  const previousSeries = cumulative(previousMonth);

  const points: PacingPoint[] = [];
  const span = Math.max(currentSeries.length, previousSeries.length);
  for (let day = 1; day <= span; day++) {
    points.push({
      day,
      // Future days of the running month stay empty instead of drawing a flat line.
      current: day <= dayOfMonth ? currentSeries[day - 1] ?? 0 : undefined,
      previous: previousSeries[day - 1] ?? previousSeries[previousSeries.length - 1] ?? 0,
    });
  }

  const currentTotal = currentSeries[Math.min(dayOfMonth, currentSeries.length) - 1] ?? 0;
  const previousTotal = previousSeries[Math.min(dayOfMonth, previousSeries.length) - 1] ?? 0;

  return {
    currentTotal,
    previousTotal,
    deltaShare: previousTotal > 0 ? (currentTotal - previousTotal) / previousTotal : 0,
    dayOfMonth,
    points,
    previousMonthTotal: previousSeries[previousSeries.length - 1] ?? 0,
  };
}

/** Total recurring monthly commitment across payments, subscriptions and investments. */
export function monthlyCommitments(
  plannedPayments: PlannedPayment[],
  toBase: (amount: number, currency: CurrencyCode) => number
): number {
  const total = plannedPayments
    .filter((p) => p.isActive && p.kind === 'EXPENSE' && p.recurrence !== 'ONCE')
    .reduce((sum, p) => sum + toBase(monthlyEquivalent(p), p.currency), 0);
  return Math.round(total * 100) / 100;
}

export { planKindOf };


/** Russian plural agreement: 1 операция, 2 операции, 5 операций. */
export function pluralRu(count: number, one: string, few: string, many: string): string {
  const mod10 = Math.abs(count) % 10;
  const mod100 = Math.abs(count) % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
