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
  CurrencyCode,
  FinanceAccount,
  FinanceCategory,
  FinanceSettings,
  Plan,
  PlanOccurrence,
  ProfileMember,
  Transaction,
  TransactionKind,
} from '@/types';
import { computeAccountBalance, convertToBase, todayIso } from '@/lib/db';
import { ACCOUNT_KIND_LABELS, getCategoryIcon } from '@/constants/categories';
import {
  DateRange,
  excludeDebtRepayments,
  filterTransactions,
  formatDateHuman,
  formatMoney,
  rangeForPreset,
  sumBase,
} from '@/services/analytics';
import { useT } from '@/i18n/context';
import { accountKindLabel, accountName, categoryName, seededName } from '@/i18n/categories';
import { Card, EmptyState, SectionTitle, SegmentedControl, inputClass } from './ui';

type QuickChip = 'TODAY' | 'WEEK' | 'MONTH' | 'UPCOMING' | 'ALL';

interface TransactionsTabProps {
  transactions: Transaction[];
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  members: ProfileMember[];
  plans: Plan[];
  occurrences: PlanOccurrence[];
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
  const [showFilters, setShowFilters] = useState(false);
  const [chip, setChip] = useState<QuickChip>('ALL');
  const { t, language } = useT();
  const today = todayIso();

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  // Сегодня/7 дней/Месяц are quick local overrides — they don't touch the
  // shared range the rest of the app (Отчёты) uses. «Всё» means exactly
  // that: no date bound at all, past or future — the one chip a transaction
  // can never fall out of, so anything recorded (a post-dated income
  // included) stays findable and editable here even once it isn't "this
  // month, so far" any more.
  const effectiveRange: DateRange | undefined = useMemo(() => {
    if (chip === 'TODAY') return { from: today, to: today };
    if (chip === 'WEEK') {
      const from = new Date(today);
      from.setDate(from.getDate() - 6);
      return { from: from.toISOString().slice(0, 10), to: today };
    }
    if (chip === 'MONTH') return rangeForPreset('MONTH');
    if (chip === 'ALL') return undefined;
    return range;
  }, [chip, range, today]);

  const periodTransactions = useMemo(
    () => filterTransactions(transactions, { range: effectiveRange }),
    [transactions, effectiveRange]
  );

  const visible = useMemo(
    () =>
      filterTransactions(periodTransactions, {
        kind,
        search: search || undefined,
        memberId: memberFilter === 'ALL' ? undefined : memberFilter,
        accountId: accountFilter === 'ALL' ? undefined : accountFilter,
        categoryId: categoryFilter === 'ALL' ? undefined : categoryFilter,
      }).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [periodTransactions, kind, search, memberFilter, accountFilter, categoryFilter]
  );

  // A short, forward-looking peek at plan-driven money movement — the full
  // picture with editing lives in «Планы»/«Обязательства».
  const upcomingItems = useMemo(() => {
    if (chip !== 'UPCOMING') return [];
    const toBase = (amount: number, currency: CurrencyCode) =>
      convertToBase(amount, currency, settings).baseAmount;
    const horizon = rangeForPreset('MONTH').from.slice(0, 7); // current month, YYYY-MM
    const items: { id: string; date: string; title: string; amount: number; kind: TransactionKind }[] = [];

    const planById = new Map(plans.map((p) => [p.id, p]));
    for (const occurrence of occurrences) {
      if (occurrence.isPaid || occurrence.dueDate.slice(0, 7) > horizon) continue;
      if (occurrence.dueDate < today) continue;
      const plan = planById.get(occurrence.planId);
      if (!plan) continue;
      items.push({
        id: occurrence.id,
        date: occurrence.dueDate,
        title: plan.title,
        amount: toBase(occurrence.amount, occurrence.currency),
        kind: plan.kind,
      });
    }
    for (const plan of plans) {
      if (plan.scheduleType !== 'RECURRING' || plan.status !== 'ACTIVE') continue;
      if (!plan.nextDueDate || plan.nextDueDate < today || plan.nextDueDate.slice(0, 7) > horizon) continue;
      items.push({
        id: plan.id,
        date: plan.nextDueDate,
        title: plan.title,
        amount: toBase(plan.amount, plan.currency),
        kind: plan.kind,
      });
    }
    // A transaction the user post-dated by hand, outside any plan, is just
    // as much an upcoming movement — `planId` marks the ones already
    // represented above via their occurrence/plan.
    for (const transaction of transactions) {
      if (transaction.planId) continue;
      if (transaction.date <= today || transaction.date.slice(0, 7) > horizon) continue;
      const category = categoryById.get(transaction.categoryId);
      items.push({
        id: transaction.id,
        date: transaction.date,
        title: transaction.merchant || transaction.note || (category ? categoryName(category, language) : t('form.operation')),
        amount: transaction.baseAmount,
        kind: transaction.kind,
      });
    }
    return items.sort((a, b) => a.date.localeCompare(b.date));
  }, [chip, plans, occurrences, transactions, categoryById, settings, today, t, language]);

  const sumAmounts = (items: { amount: number }[]) =>
    Math.round(items.reduce((sum, i) => sum + i.amount, 0) * 100) / 100;
  const upcomingExpense = sumAmounts(upcomingItems.filter((i) => i.kind === 'EXPENSE'));
  const upcomingIncome = sumAmounts(upcomingItems.filter((i) => i.kind === 'INCOME'));

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

  const activeFilterCount = [memberFilter, accountFilter, categoryFilter].filter(
    (value) => value !== 'ALL'
  ).length;

  const grouped = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const transaction of visible) {
      const list = map.get(transaction.date) || [];
      list.push(transaction);
      map.set(transaction.date, list);
    }
    return Array.from(map.entries());
  }, [visible]);

  // Debt/instalment/loan repayments stay visible in the list below but are
  // tracked in Обязательства, not counted again as regular period spending
  // here. The author/account/category filter applies to the cards too, not
  // just the list — otherwise picking a filter would look like it did nothing.
  const periodSpending = useMemo(
    () =>
      filterTransactions(excludeDebtRepayments(periodTransactions, plans), {
        memberId: memberFilter === 'ALL' ? undefined : memberFilter,
        accountId: accountFilter === 'ALL' ? undefined : accountFilter,
        categoryId: categoryFilter === 'ALL' ? undefined : categoryFilter,
      }),
    [periodTransactions, plans, memberFilter, accountFilter, categoryFilter]
  );
  const totalExpense = sumBase(periodSpending.filter((t) => t.kind === 'EXPENSE'));
  const totalIncome = sumBase(periodSpending.filter((t) => t.kind === 'INCOME'));

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
    setMemberFilter('ALL');
    setAccountFilter('ALL');
    setCategoryFilter('ALL');
    setSearch('');
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-rose-500">
            <ArrowUpRight className="w-3.5 h-3.5" />
            {chip === 'UPCOMING' ? t('tx.dueForPayment') : t('common.expense')}
          </div>
          <p className="text-xl font-black text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
            {formatMoney(chip === 'UPCOMING' ? upcomingExpense : totalExpense, baseCurrency, { compact: true })}
          </p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-emerald-500">
            <ArrowDownLeft className="w-3.5 h-3.5" />
            {chip === 'UPCOMING' ? t('tx.expected') : t('common.income')}
          </div>
          <p className="text-xl font-black text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
            {formatMoney(chip === 'UPCOMING' ? upcomingIncome : totalIncome, baseCurrency, { compact: true })}
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

      {chip === 'UPCOMING' ? (
        <div>
          <SectionTitle title={t('tx.chipUpcoming')} />
          {upcomingItems.length === 0 ? (
            <EmptyState
              icon={<CalendarClock className="w-7 h-7" />}
              title={t('tx.emptyUpcomingTitle')}
              description={t('tx.emptyUpcomingText')}
            />
          ) : (
            <Card className="divide-y divide-slate-50 dark:divide-slate-800/80">
              {upcomingItems.slice(0, 7).map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-3">
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                      {item.title}
                    </span>
                    <span className="block text-[10.5px] text-slate-400 font-medium">
                      {formatDateHuman(item.date)}
                    </span>
                  </span>
                  <span
                    className={`text-xs font-black tabular-nums flex-shrink-0 ${
                      item.kind === 'EXPENSE'
                        ? 'text-slate-900 dark:text-slate-100'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {item.kind === 'EXPENSE' ? '−' : '+'}
                    {formatMoney(item.amount, baseCurrency)}
                  </span>
                </div>
              ))}
            </Card>
          )}
          {onShowUpcoming && (
            <button
              type="button"
              onClick={onShowUpcoming}
              className="w-full mt-2 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 text-[11px] font-black active:scale-95 transition-transform"
            >
              {t('tx.showAllUpcoming')}
            </button>
          )}
        </div>
      ) : (
        <>
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
            const dayTotal = sumBase(items);
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
                  {items.map((transaction) => {
                    const category = categoryById.get(transaction.categoryId);
                    const subcategory = transaction.subcategoryId
                      ? categoryById.get(transaction.subcategoryId)
                      : undefined;
                    const author = memberById.get(transaction.authorId);
                    const Icon = getCategoryIcon(category?.iconName || 'CircleDashed');

                    return (
                      <button
                        key={transaction.id}
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
                            {transaction.source === 'RECEIPT_SCAN' && (
                              <ScanLine className="w-3 h-3 text-sky-500 flex-shrink-0" />
                            )}
                            {transaction.source === 'VOICE' && (
                              <Mic className="w-3 h-3 text-violet-500 flex-shrink-0" />
                            )}
                            {transaction.receiptPhoto && (
                              <Receipt className="w-3 h-3 text-slate-400 flex-shrink-0" />
                            )}
                          </span>
                          <span className="block text-[10.5px] text-slate-400 font-medium truncate mt-0.5">
                            {[transaction.merchant, transaction.note].filter(Boolean).join(' · ') ||
                              t('tx.noDescription')}
                          </span>
                        </span>

                        <span className="text-right flex-shrink-0">
                          <span
                            className={`block text-xs font-black tabular-nums ${
                              transaction.kind === 'EXPENSE'
                                ? 'text-slate-900 dark:text-slate-100'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {transaction.kind === 'EXPENSE' ? '−' : '+'}
                            {formatMoney(transaction.amount, transaction.currency)}
                          </span>
                          {author && (
                            <span
                              className="inline-block text-[9px] font-black px-1.5 py-0.5 rounded-md mt-0.5"
                              style={{
                                backgroundColor: `${author.colorHex}1F`,
                                color: author.colorHex,
                              }}
                            >
                              {seededName('owner', author.displayName, language)}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </Card>
              </div>
            );
          })}
        </div>
      )}
        </>
      )}
    </div>
  );
}
