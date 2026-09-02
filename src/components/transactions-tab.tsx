'use client';

import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  Filter,
  Mic,
  Receipt,
  RotateCcw,
  ScanLine,
  Search,
  Wallet,
} from 'lucide-react';
import {
  BearerCheque,
  CurrencyCode,
  FinanceAccount,
  FinanceCategory,
  FinanceSettings,
  Obligation,
  ObligationSettlement,
  Plan,
  PlanOccurrence,
  ProfileMember,
  Transaction,
  TransactionKind,
} from '@/types';
import { computeAccountBalance, convertToBase, todayIso } from '@/lib/db';
import { ACCOUNT_KIND_LABELS, getCategoryIcon } from '@/constants/categories';
import { DateRange, formatDateHuman, formatMoney, rangeForPreset } from '@/services/analytics';
import { UpcomingEvent, upcomingEvents } from '@/services/upcoming';
import { useT } from '@/i18n/context';
import { accountKindLabel, accountName, categoryName, seededName } from '@/i18n/categories';
import { Card, EmptyState, SectionTitle, SegmentedControl, inputClass } from './ui';

type QuickChip = 'TODAY' | 'WEEK' | 'MONTH' | 'UPCOMING' | 'ALL';
type StatusFilter = 'ALL' | 'DONE' | 'PLANNED' | 'OVERDUE' | 'UNCONFIRMED';

/** One row of the unified list — either a real transaction or a plan/
 *  obligation/cheque event that hasn't happened yet. Both are shown
 *  together so the same filter covers "текущих и предстоящих" at once. */
interface UnifiedRow {
  id: string;
  date: string;
  kind: TransactionKind;
  amount: number;
  status: 'DONE' | 'PLANNED' | 'OVERDUE' | 'UNCONFIRMED';
  categoryId?: string;
  subcategoryId?: string;
  accountId?: string;
  authorId?: string;
  transaction?: Transaction;
  event?: UpcomingEvent;
}

interface TransactionsTabProps {
  transactions: Transaction[];
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  members: ProfileMember[];
  plans: Plan[];
  occurrences: PlanOccurrence[];
  obligations: Obligation[];
  settlements: ObligationSettlement[];
  bearerCheques: BearerCheque[];
  settings: FinanceSettings;
  baseCurrency: CurrencyCode;
  range: DateRange;
  onSelect: (transaction: Transaction) => void;
  onShowUpcoming?: () => void;
}

export function TransactionsTab({
  transactions,
  categories,
  accounts,
  members,
  plans,
  occurrences,
  obligations,
  settlements,
  bearerCheques,
  settings,
  baseCurrency,
  range,
  onSelect,
  onShowUpcoming,
}: TransactionsTabProps) {
  const [kind, setKind] = useState<TransactionKind>('EXPENSE');
  const [search, setSearch] = useState('');
  const [memberFilter, setMemberFilter] = useState<string>('ALL');
  const [accountFilter, setAccountFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [chip, setChip] = useState<QuickChip>('ALL');
  const { t, language } = useT();
  const today = todayIso();
  const toBase = (amount: number, currency: CurrencyCode) => convertToBase(amount, currency, settings).baseAmount;

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  // Сегодня/7 дней/Месяц are quick local overrides — they don't touch the
  // shared range the rest of the app (Отчёты) uses. «Всё» means exactly
  // that: no date bound at all, past or future — the one chip a transaction
  // can never fall out of, so anything recorded (a post-dated income
  // included) stays findable and editable here even once it isn't "this
  // month, so far" any more. An explicit date-from/date-to picked in the
  // filter panel overrides every chip — it is the "любой период" the
  // filter needs to cover.
  const effectiveRange: DateRange | undefined = useMemo(() => {
    if (dateFrom || dateTo) return { from: dateFrom || '0001-01-01', to: dateTo || '9999-12-31' };
    if (chip === 'TODAY') return { from: today, to: today };
    if (chip === 'WEEK') {
      const from = new Date(today);
      from.setDate(from.getDate() - 6);
      return { from: from.toISOString().slice(0, 10), to: today };
    }
    if (chip === 'MONTH') return rangeForPreset('MONTH');
    if (chip === 'UPCOMING') {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return { from: tomorrow.toISOString().slice(0, 10), to: rangeForPreset('MONTH').to };
    }
    if (chip === 'ALL') return undefined;
    return range;
  }, [chip, range, today, dateFrom, dateTo]);

  const planById = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans]);

  // Every planned/obligation/cheque event not yet realized — raw transactions
  // are sourced separately below, so `transactions` is deliberately omitted
  // here to avoid listing a hand-dated future income twice.
  const upcomingEventsAll = useMemo(
    () =>
      upcomingEvents({
        plans,
        occurrences,
        obligations,
        settlements,
        bearerCheques,
        categories,
        months: 12,
        today,
        toBase,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plans, occurrences, obligations, settlements, bearerCheques, categories, today, settings]
  );

  // One unified row per real transaction and per not-yet-realized plan event,
  // so "текущие и предстоящие" share the same filter and the same list.
  const allRows = useMemo(() => {
    const rows: UnifiedRow[] = [];
    for (const transaction of transactions) {
      // Already tracked as its own instalment/obligation in «Обязательства» —
      // keeping it out of these totals mirrors the old excludeDebtRepayments.
      const plan = transaction.planId ? planById.get(transaction.planId) : undefined;
      if (plan?.scheduleType === 'FIXED_SCHEDULE') continue;
      rows.push({
        id: `t-${transaction.id}`,
        date: transaction.date,
        kind: transaction.kind,
        amount: transaction.baseAmount,
        status: transaction.date > today ? 'PLANNED' : 'DONE',
        categoryId: transaction.categoryId,
        subcategoryId: transaction.subcategoryId,
        accountId: transaction.accountId,
        authorId: transaction.authorId,
        transaction,
      });
    }
    for (const event of upcomingEventsAll) {
      rows.push({
        id: `e-${event.id}`,
        date: event.date,
        kind: event.kind,
        amount: event.amount,
        status: event.isOverdue ? 'OVERDUE' : event.needsConfirmation ? 'UNCONFIRMED' : 'PLANNED',
        categoryId: event.categoryId,
        subcategoryId: event.subcategoryId,
        accountId: event.accountId,
        authorId: event.authorId,
        event,
      });
    }
    return rows;
  }, [transactions, upcomingEventsAll, planById, today]);

  const rangeFiltered = useMemo(
    () => (effectiveRange ? allRows.filter((r) => r.date >= effectiveRange.from && r.date <= effectiveRange.to) : allRows),
    [allRows, effectiveRange]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rangeFiltered
      .filter((r) => {
        if (r.kind !== kind) return false;
        if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
        if (memberFilter !== 'ALL' && r.authorId !== memberFilter) return false;
        if (accountFilter !== 'ALL' && r.accountId !== accountFilter) return false;
        if (categoryFilter !== 'ALL' && r.categoryId !== categoryFilter && r.subcategoryId !== categoryFilter) return false;
        if (q) {
          const haystack = r.transaction
            ? `${r.transaction.note || ''} ${r.transaction.merchant || ''} ${r.transaction.amount}`.toLowerCase()
            : r.event!.title.toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [rangeFiltered, kind, statusFilter, memberFilter, accountFilter, categoryFilter, search]);

  // The cards stay a combined overview regardless of the kind tab — the
  // active tab's category filter narrows only its own card, the same fix
  // already applied on «Планы» to keep the card and the list in sync.
  const cardRowsBase = useMemo(
    () =>
      rangeFiltered.filter((r) => {
        if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
        if (memberFilter !== 'ALL' && r.authorId !== memberFilter) return false;
        if (accountFilter !== 'ALL' && r.accountId !== accountFilter) return false;
        return true;
      }),
    [rangeFiltered, statusFilter, memberFilter, accountFilter]
  );
  const cardRowsForActiveKind = useMemo(
    () =>
      cardRowsBase.filter(
        (r) => r.kind === kind && (categoryFilter === 'ALL' || r.categoryId === categoryFilter || r.subcategoryId === categoryFilter)
      ),
    [cardRowsBase, kind, categoryFilter]
  );
  const sumRows = (rows: UnifiedRow[]) => Math.round(rows.reduce((sum, r) => sum + r.amount, 0) * 100) / 100;
  const totalExpense = sumRows(kind === 'EXPENSE' ? cardRowsForActiveKind : cardRowsBase.filter((r) => r.kind === 'EXPENSE'));
  const totalIncome = sumRows(kind === 'INCOME' ? cardRowsForActiveKind : cardRowsBase.filter((r) => r.kind === 'INCOME'));

  // Expense and income have separate category trees, so a filter picked on one
  // tab would silently empty the other.
  const filterCategories = useMemo(
    () =>
      categories
        .filter((c) => c.kind === kind && !c.parentId && !c.isHidden)
        .map((parent) => ({
          parent,
          children: categories.filter((c) => c.parentId === parent.id && !c.isHidden),
        })),
    [categories, kind]
  );

  const activeFilterCount = [memberFilter, accountFilter, categoryFilter, statusFilter].filter(
    (value) => value !== 'ALL'
  ).length + (dateFrom || dateTo ? 1 : 0);

  const grouped = useMemo(() => {
    const map = new Map<string, UnifiedRow[]>();
    for (const row of visible) {
      const list = map.get(row.date) || [];
      list.push(row);
      map.set(row.date, list);
    }
    return Array.from(map.entries());
  }, [visible]);

  const chips: { id: QuickChip; label: string }[] = [
    { id: 'TODAY', label: t('tx.chipToday') },
    { id: 'WEEK', label: t('tx.chipWeek') },
    { id: 'MONTH', label: t('tx.chipMonth') },
    { id: 'UPCOMING', label: t('tx.chipUpcoming') },
    { id: 'ALL', label: t('tx.chipAll') },
  ];

  const hasActiveSelection = chip !== 'ALL' || activeFilterCount > 0 || search.length > 0;
  const resetAll = () => {
    setChip('ALL');
    setDateFrom('');
    setDateTo('');
    setStatusFilter('ALL');
    setMemberFilter('ALL');
    setAccountFilter('ALL');
    setCategoryFilter('ALL');
    setSearch('');
  };

  // A range entirely after today (the «Предстоящие» chip, or a custom
  // from-date in the future) is a forecast, not a ledger of what happened —
  // the card labels say so.
  const isFutureView = Boolean(effectiveRange && effectiveRange.from > today);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-rose-500">
            <ArrowUpRight className="w-3.5 h-3.5" />
            {isFutureView ? t('tx.dueForPayment') : t('common.expense')}
          </div>
          <p className="text-xl font-black text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
            {formatMoney(totalExpense, baseCurrency, { compact: true })}
          </p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-emerald-500">
            <ArrowDownLeft className="w-3.5 h-3.5" />
            {isFutureView ? t('tx.expected') : t('common.income')}
          </div>
          <p className="text-xl font-black text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
            {formatMoney(totalIncome, baseCurrency, { compact: true })}
          </p>
        </Card>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1">
        {chips.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setChip(option.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-black transition-colors ${
              chip === option.id
                ? 'bg-sky-500 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
            }`}
          >
            {option.label}
          </button>
        ))}
        {hasActiveSelection && (
          <button
            type="button"
            onClick={resetAll}
            className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-black text-slate-400"
          >
            <RotateCcw className="w-3 h-3" />
            {t('tx.resetFilter')}
          </button>
        )}
      </div>

      <SegmentedControl<TransactionKind>
        value={kind}
        onChange={(next) => {
          setKind(next);
          // The category trees do not overlap, so a filter kept across the
          // switch would show an empty list with no visible reason.
          setCategoryFilter('ALL');
        }}
        options={[
          {
            value: 'EXPENSE',
            label: t('common.expenses'),
            activeClass: 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-sm',
          },
          {
            value: 'INCOME',
            label: t('common.incomes'),
            activeClass: 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm',
          },
        ]}
      />

      <div>
        <SectionTitle title={t('tx.accounts')} />
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {accounts
            .filter((a) => !a.isArchived)
            .map((account) => {
              const balance = computeAccountBalance(account, transactions);
              return (
                <div
                  key={account.id}
                  className="min-w-[140px] rounded-2xl p-3 border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex-shrink-0"
                  style={{ borderTopColor: account.colorHex, borderTopWidth: 3 }}
                >
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    {accountKindLabel(account.kind, language)}
                  </p>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate mt-0.5">
                    {accountName(account, language)}
                  </p>
                  <p
                    className={`text-sm font-black tabular-nums mt-1 ${
                      balance < 0 ? 'text-rose-500' : 'text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {formatMoney(balance, account.currency)}
                  </p>
                </div>
              );
            })}
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('tx.searchPlaceholder')}
            className={`${inputClass} pl-9 text-xs`}
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((prev) => !prev)}
          className={`relative px-3.5 rounded-2xl border text-slate-500 transition-colors ${
            showFilters
              ? 'bg-sky-500 text-white border-transparent'
              : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
          }`}
        >
          <Filter className="w-4 h-4" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -end-1 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {showFilters && (
        <Card className="p-3 grid grid-cols-2 gap-2">
          <select
            value={memberFilter}
            onChange={(e) => setMemberFilter(e.target.value)}
            className={`${inputClass} text-xs`}
          >
            <option value="ALL">{t('tx.allAuthors')}</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {seededName('owner', member.displayName, language)}
              </option>
            ))}
          </select>
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className={`${inputClass} text-xs`}
          >
            <option value="ALL">{t('tx.allAccounts')}</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {accountName(account, language)}
              </option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className={`${inputClass} text-xs col-span-2`}
          >
            <option value="ALL">{t('tx.allCategories')}</option>
            {filterCategories.map(({ parent, children }) =>
              children.length > 0 ? (
                <optgroup key={parent.id} label={categoryName(parent, language)}>
                  <option value={parent.id}>{categoryName(parent, language)}</option>
                  {children.map((child) => (
                    <option key={child.id} value={child.id}>
                      {categoryName(child, language)}
                    </option>
                  ))}
                </optgroup>
              ) : (
                <option key={parent.id} value={parent.id}>
                  {categoryName(parent, language)}
                </option>
              )
            )}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            title={t('tx.dateFrom')}
            className={`${inputClass} text-xs`}
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            title={t('tx.dateTo')}
            className={`${inputClass} text-xs`}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className={`${inputClass} text-xs col-span-2`}
          >
            <option value="ALL">{t('tx.statusAll')}</option>
            <option value="DONE">{t('tx.statusDone')}</option>
            <option value="PLANNED">{t('tx.statusPlanned')}</option>
            <option value="OVERDUE">{t('tx.statusOverdue')}</option>
            <option value="UNCONFIRMED">{t('tx.statusUnconfirmed')}</option>
          </select>
        </Card>
      )}

      {grouped.length === 0 ? (
        <EmptyState
          icon={<Wallet className="w-7 h-7" />}
          title={t('tx.emptyTitle')}
          description={t('tx.emptyText')}
        />
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, items]) => {
            const dayTotal = Math.round(items.reduce((sum, r) => sum + r.amount, 0) * 100) / 100;
            return (
              <div key={date}>
                <div className="flex items-center justify-between px-1 mb-1.5">
                  <span className="text-[11px] font-black text-slate-500 dark:text-slate-400">
                    {formatDateHuman(date)}
                  </span>
                  <span className="text-[11px] font-black text-slate-400 tabular-nums">
                    {kind === 'EXPENSE' ? '−' : '+'}
                    {formatMoney(dayTotal, baseCurrency)}
                  </span>
                </div>

                <Card className="divide-y divide-slate-50 dark:divide-slate-800/80">
                  {items.map((row) =>
                    row.transaction ? (
                      <TransactionRow
                        key={row.id}
                        transaction={row.transaction}
                        category={categoryById.get(row.transaction.categoryId)}
                        subcategory={
                          row.transaction.subcategoryId ? categoryById.get(row.transaction.subcategoryId) : undefined
                        }
                        author={memberById.get(row.transaction.authorId)}
                        language={language}
                        baseCurrency={baseCurrency}
                        t={t}
                        onSelect={onSelect}
                      />
                    ) : (
                      <UpcomingRow
                        key={row.id}
                        row={row}
                        category={categoryById.get(row.categoryId || '')}
                        baseCurrency={baseCurrency}
                        t={t}
                        onOpen={onShowUpcoming}
                      />
                    )
                  )}
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TransactionRow({
  transaction,
  category,
  subcategory,
  author,
  language,
  baseCurrency,
  t,
  onSelect,
}: {
  transaction: Transaction;
  category?: FinanceCategory;
  subcategory?: FinanceCategory;
  author?: ProfileMember;
  language: ReturnType<typeof useT>['language'];
  baseCurrency: CurrencyCode;
  t: ReturnType<typeof useT>['t'];
  onSelect: (transaction: Transaction) => void;
}) {
  const Icon = getCategoryIcon(category?.iconName || 'CircleDashed');

  return (
    <button
      type="button"
      onClick={() => onSelect(transaction)}
      className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors first:rounded-t-3xl last:rounded-b-3xl"
    >
      <span
        className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
        style={{
          backgroundColor: `${category?.colorHex || '#64748B'}1F`,
          color: category?.colorHex || '#64748B',
        }}
      >
        <Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
      </span>

      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
            {category ? categoryName(category, language) : t('common.category')}
            {subcategory ? ` · ${categoryName(subcategory, language)}` : ''}
          </span>
          {transaction.source === 'RECEIPT_SCAN' && <ScanLine className="w-3 h-3 text-sky-500 flex-shrink-0" />}
          {transaction.source === 'VOICE' && <Mic className="w-3 h-3 text-violet-500 flex-shrink-0" />}
          {transaction.receiptPhoto && <Receipt className="w-3 h-3 text-slate-400 flex-shrink-0" />}
        </span>
        <span className="block text-[10.5px] text-slate-400 font-medium truncate mt-0.5">
          {[transaction.merchant, transaction.note].filter(Boolean).join(' · ') || t('tx.noDescription')}
        </span>
      </span>

      <span className="text-right flex-shrink-0">
        <span
          className={`block text-xs font-black tabular-nums ${
            transaction.kind === 'EXPENSE' ? 'text-slate-900 dark:text-slate-100' : 'text-emerald-600 dark:text-emerald-400'
          }`}
        >
          {transaction.kind === 'EXPENSE' ? '−' : '+'}
          {formatMoney(transaction.amount, transaction.currency)}
        </span>
        {author && (
          <span
            className="inline-block text-[9px] font-black px-1.5 py-0.5 rounded-md mt-0.5"
            style={{ backgroundColor: `${author.colorHex}1F`, color: author.colorHex }}
          >
            {seededName('owner', author.displayName, language)}
          </span>
        )}
      </span>
    </button>
  );
}

/** A plan/obligation/cheque event that hasn't happened yet — a lighter row
 *  than a real transaction, since there is no receipt/note/split to show.
 *  Tapping it hands off to «Планы», the one place it can be edited. */
function UpcomingRow({
  row,
  category,
  baseCurrency,
  t,
  onOpen,
}: {
  row: UnifiedRow;
  category?: FinanceCategory;
  baseCurrency: CurrencyCode;
  t: ReturnType<typeof useT>['t'];
  onOpen?: () => void;
}) {
  const event = row.event!;
  const Icon = getCategoryIcon(category?.iconName || 'CalendarClock');
  const statusLabel =
    row.status === 'OVERDUE'
      ? t('tx.statusOverdue')
      : row.status === 'UNCONFIRMED'
      ? t('tx.statusUnconfirmed')
      : t('tx.statusPlanned');
  const statusClass =
    row.status === 'OVERDUE'
      ? 'text-rose-500'
      : row.status === 'UNCONFIRMED'
      ? 'text-amber-500'
      : 'text-slate-400';

  return (
    <button
      type="button"
      onClick={onOpen}
      title={t('tx.upcomingRow')}
      className={`w-full flex items-center gap-3 p-3 text-left first:rounded-t-3xl last:rounded-b-3xl ${
        onOpen ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50' : ''
      }`}
    >
      <span
        className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 opacity-70"
        style={{ backgroundColor: `${category?.colorHex || '#64748B'}1F`, color: category?.colorHex || '#64748B' }}
      >
        <Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
      </span>

      <span className="flex-1 min-w-0">
        <span className="text-xs font-black text-slate-600 dark:text-slate-300 truncate block">{event.title}</span>
        <span className={`block text-[10.5px] font-bold truncate mt-0.5 ${statusClass}`}>{statusLabel}</span>
      </span>

      <span
        className={`text-xs font-black tabular-nums flex-shrink-0 ${
          row.kind === 'EXPENSE' ? 'text-slate-500 dark:text-slate-400' : 'text-emerald-600/80 dark:text-emerald-400/80'
        }`}
      >
        {row.kind === 'EXPENSE' ? '−' : '+'}
        {formatMoney(row.amount, baseCurrency)}
      </span>
    </button>
  );
}
