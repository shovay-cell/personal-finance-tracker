'use client';

import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Filter,
  Mic,
  Receipt,
  ScanLine,
  Search,
  Wallet,
} from 'lucide-react';
import {
  CurrencyCode,
  FinanceAccount,
  FinanceCategory,
  ProfileMember,
  Transaction,
  TransactionKind,
} from '@/types';
import { computeAccountBalance } from '@/lib/db';
import { ACCOUNT_KIND_LABELS, getCategoryIcon } from '@/constants/categories';
import {
  DateRange,
  filterTransactions,
  formatDateHuman,
  formatMoney,
  sumBase,
} from '@/services/analytics';
import { Card, EmptyState, SectionTitle, SegmentedControl, inputClass } from './ui';

interface TransactionsTabProps {
  transactions: Transaction[];
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  members: ProfileMember[];
  baseCurrency: CurrencyCode;
  range: DateRange;
  onSelect: (transaction: Transaction) => void;
}

export function TransactionsTab({
  transactions,
  categories,
  accounts,
  members,
  baseCurrency,
  range,
  onSelect,
}: TransactionsTabProps) {
  const [kind, setKind] = useState<TransactionKind>('EXPENSE');
  const [search, setSearch] = useState('');
  const [memberFilter, setMemberFilter] = useState<string>('ALL');
  const [accountFilter, setAccountFilter] = useState<string>('ALL');
  const [showFilters, setShowFilters] = useState(false);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const periodTransactions = useMemo(
    () => filterTransactions(transactions, { range }),
    [transactions, range]
  );

  const visible = useMemo(
    () =>
      filterTransactions(periodTransactions, {
        kind,
        search: search || undefined,
        memberId: memberFilter === 'ALL' ? undefined : memberFilter,
        accountId: accountFilter === 'ALL' ? undefined : accountFilter,
      }).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [periodTransactions, kind, search, memberFilter, accountFilter]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const transaction of visible) {
      const list = map.get(transaction.date) || [];
      list.push(transaction);
      map.set(transaction.date, list);
    }
    return Array.from(map.entries());
  }, [visible]);

  const totalExpense = sumBase(periodTransactions.filter((t) => t.kind === 'EXPENSE'));
  const totalIncome = sumBase(periodTransactions.filter((t) => t.kind === 'INCOME'));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-rose-500">
            <ArrowUpRight className="w-3.5 h-3.5" />
            Расходы
          </div>
          <p className="text-xl font-black text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
            {formatMoney(totalExpense, baseCurrency, { compact: true })}
          </p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-emerald-500">
            <ArrowDownLeft className="w-3.5 h-3.5" />
            Доходы
          </div>
          <p className="text-xl font-black text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
            {formatMoney(totalIncome, baseCurrency, { compact: true })}
          </p>
        </Card>
      </div>

      <div>
        <SectionTitle title="Счета и кошельки" />
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
                    {ACCOUNT_KIND_LABELS[account.kind]}
                  </p>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate mt-0.5">
                    {account.name}
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
        onChange={setKind}
        options={[
          {
            value: 'EXPENSE',
            label: 'РАСХОДЫ',
            activeClass: 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-sm',
          },
          {
            value: 'INCOME',
            label: 'ДОХОДЫ',
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
            placeholder="Поиск по заметке, продавцу, сумме"
            className={`${inputClass} pl-9 text-xs`}
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((prev) => !prev)}
          className={`px-3.5 rounded-2xl border text-slate-500 transition-colors ${
            showFilters
              ? 'bg-sky-500 text-white border-transparent'
              : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
          }`}
        >
          <Filter className="w-4 h-4" />
        </button>
      </div>

      {showFilters && (
        <Card className="p-3 grid grid-cols-2 gap-2">
          <select
            value={memberFilter}
            onChange={(e) => setMemberFilter(e.target.value)}
            className={`${inputClass} text-xs`}
          >
            <option value="ALL">Все авторы</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </select>
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className={`${inputClass} text-xs`}
          >
            <option value="ALL">Все счета</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </Card>
      )}

      {grouped.length === 0 ? (
        <EmptyState
          icon={<Wallet className="w-7 h-7" />}
          title="Операций пока нет"
          description="Нажмите «+», чтобы записать трату за пару касаний, сфотографировать чек или надиктовать операцию голосом."
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
                              {category?.name || 'Без категории'}
                              {subcategory ? ` · ${subcategory.name}` : ''}
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
                              'Без описания'}
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
                              {author.displayName}
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
    </div>
  );
}
