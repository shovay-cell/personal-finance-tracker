import {
  Budget,
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
    if (options.categoryId && t.categoryId !== options.categoryId && t.subcategoryId !== options.categoryId)
      return false;
    if (search) {
      const haystack = `${t.note || ''} ${t.merchant || ''} ${t.amount}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

export function sumBase(transactions: Transaction[]): number {
  return Math.round(transactions.reduce((sum, t) => sum + t.baseAmount, 0) * 100) / 100;
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
    const category = byId.get(t.categoryId);
    const rootId = category?.parentId || t.categoryId;
    const entry = totals.get(rootId) || { total: 0, count: 0 };
    entry.total += t.baseAmount;
    entry.count += 1;
    totals.set(rootId, entry);
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
      const relevant = monthExpenses.filter((t) => {
        if (budget.memberId && t.authorId !== budget.memberId) return false;
        if (!budget.categoryId) return true;
        const category = byId.get(t.categoryId);
        const rootId = category?.parentId || t.categoryId;
        return rootId === budget.categoryId || t.categoryId === budget.categoryId;
      });

      const spent = sumBase(relevant);
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
