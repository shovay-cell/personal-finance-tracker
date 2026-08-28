'use client';

import React, { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  PiggyBank,
  Plus,
  Target,
  Trash2,
  Users,
} from 'lucide-react';
import {
  Budget,
  BudgetProgress,
  DebtInstallment,
  FinanceCategory,
  FinanceSettings,
  PlannedPayment,
  ProfileMember,
  Transaction,
} from '@/types';
import { convertToBase, deleteBudget, upsertBudget } from '@/lib/db';
import {
  budgetProgress,
  computeRollover,
  formatMoney,
  monthLabel,
  pacingComparison,
  safeToSpend,
  shiftMonth,
} from '@/services/analytics';
import { getCategoryIcon } from '@/constants/categories';
import { useT } from '@/i18n/context';
import { ProgressBar } from './charts';
import { SafeToSpendCard } from './safe-to-spend-card';
import { PacingChart } from './pacing-chart';
import {
  Card,
  EmptyState,
  Field,
  ModalShell,
  PrimaryButton,
  SectionTitle,
  inputClass,
} from './ui';
import { CurrencyCode } from '@/types';

interface BudgetsTabProps {
  budgets: Budget[];
  transactions: Transaction[];
  categories: FinanceCategory[];
  members: ProfileMember[];
  plannedPayments: PlannedPayment[];
  installments: DebtInstallment[];
  settings: FinanceSettings;
  month: string;
  onMonthChange: (month: string) => void;
  rolloverDefault: boolean;
}

export function BudgetsTab({
  budgets,
  transactions,
  categories,
  members,
  plannedPayments,
  installments,
  settings,
  month,
  onMonthChange,
  rolloverDefault,
}: BudgetsTabProps) {
  const [editing, setEditing] = useState<Budget | 'NEW' | null>(null);
  const baseCurrency = settings.baseCurrency;
  const { t } = useT();

  const progress = useMemo(
    () => budgetProgress(budgets, transactions, categories, month),
    [budgets, transactions, categories, month]
  );

  const safeToSpendData = useMemo(
    () =>
      safeToSpend({
        month,
        transactions,
        budgets,
        plannedPayments,
        installments,
        toBase: (amount, currency) => convertToBase(amount, currency, settings).baseAmount,
      }),
    [month, transactions, budgets, plannedPayments, installments, settings]
  );

  const pacing = useMemo(() => pacingComparison(transactions, month), [transactions, month]);

  const totalBudget = progress.find((p) => !p.budget.categoryId && !p.budget.memberId);
  const categoryBudgets = progress.filter((p) => p.budget.categoryId && !p.budget.memberId);
  const personalBudgets = progress.filter((p) => p.budget.memberId);

  /**
   * Carrying a remainder forward is an explicit action: it copies each rollover
   * budget into next month with the unspent part recorded in `carriedOver`.
   */
  const handleCarryOver = async () => {
    const nextMonth = shiftMonth(month, 1);
    for (const item of progress) {
      if (!item.budget.rolloverEnabled) continue;
      await upsertBudget({
        month: nextMonth,
        categoryId: item.budget.categoryId,
        memberId: item.budget.memberId,
        limitAmount: item.budget.limitAmount,
        currency: item.budget.currency,
        rolloverEnabled: true,
        // Same rule as the automatic pass: an overspend carries as a negative.
        carriedOver: Math.round((item.effectiveLimit - item.spent) * 100) / 100,
        rolloverAppliedFrom: month,
      });
    }
    onMonthChange(nextMonth);
  };

  return (
    <div className="space-y-4">
      <Card className="flex items-center justify-between p-2">
        <button
          type="button"
          onClick={() => onMonthChange(shiftMonth(month, -1))}
          className="w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-500 flex items-center justify-center"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-black text-slate-800 dark:text-slate-100">
          {monthLabel(month)}
        </span>
        <button
          type="button"
          onClick={() => onMonthChange(shiftMonth(month, 1))}
          className="w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-500 flex items-center justify-center"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </Card>

      <SafeToSpendCard
        data={safeToSpendData}
        currency={baseCurrency}
        onSetBudget={() => setEditing('NEW')}
      />

      <PacingChart data={pacing} currency={baseCurrency} />

      {totalBudget ? (
        <Card className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                {t('budget.monthly')}
              </p>
              <p className="text-2xl font-black text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
                {formatMoney(totalBudget.spent, baseCurrency)}
                <span className="text-sm text-slate-400 font-bold">
                  {' '}
                  / {formatMoney(totalBudget.effectiveLimit, baseCurrency)}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditing(totalBudget.budget)}
              className="text-[10px] font-black text-sky-600 dark:text-sky-400 px-2 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/50"
            >
              {t('budget.change')}
            </button>
          </div>

          <ProgressBar percent={totalBudget.percent} level={totalBudget.level} />

          <div className="flex justify-between text-[11px] font-bold">
            <span
              className={
                totalBudget.remaining < 0
                  ? 'text-rose-500'
                  : 'text-emerald-600 dark:text-emerald-400'
              }
            >
              {totalBudget.remaining < 0 ? `${t('budget.overspent')} ` : `${t('budget.remaining')} `}
              {formatMoney(Math.abs(totalBudget.remaining), baseCurrency)}
            </span>
            <span className="text-slate-400">{totalBudget.percent.toFixed(0)}%</span>
          </div>

          {totalBudget.budget.carriedOver > 0 && (
            <p className="text-[10px] font-bold text-sky-600 dark:text-sky-400">
              + {formatMoney(totalBudget.budget.carriedOver, baseCurrency)} перенесено с прошлого
              месяца
            </p>
          )}
        </Card>
      ) : (
        <Card className="p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black text-slate-700 dark:text-slate-200">
              Общий бюджет не задан
            </p>
            <p className="text-[10.5px] text-slate-400 font-medium mt-0.5">
              Задайте лимит на весь месяц, чтобы видеть остаток
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing('NEW')}
            className="px-3 py-2 rounded-xl bg-sky-500 text-white text-[11px] font-black flex-shrink-0"
          >
            {t('budget.set')}
          </button>
        </Card>
      )}

      <div>
        <SectionTitle
          title={t('budget.limits')}
          action={
            <button
              type="button"
              onClick={() => setEditing('NEW')}
              className="flex items-center gap-1 text-[10px] font-black text-sky-600 dark:text-sky-400"
            >
              <Plus className="w-3 h-3" />
              Добавить
            </button>
          }
        />

        {categoryBudgets.length === 0 ? (
          <EmptyState
            icon={<Target className="w-7 h-7" />}
            title="Лимиты не заданы"
            description="Например, «Продукты — не более 2500 ₪ в месяц». При 80% и 100% придёт уведомление."
          />
        ) : (
          <div className="space-y-2">
            {categoryBudgets.map((item) => (
              <BudgetRow
                key={item.budget.id}
                item={item}
                categories={categories}
                onEdit={() => setEditing(item.budget)}
              />
            ))}
          </div>
        )}
      </div>

      {members.length > 1 && (
        <div>
          <SectionTitle title="Индивидуальные лимиты супругов" />
          {personalBudgets.length === 0 ? (
            <Card className="p-4 flex items-center gap-3">
              <Users className="w-5 h-5 text-slate-400 flex-shrink-0" />
              <p className="text-[11px] text-slate-500 font-medium">
                Внутри общего профиля можно задать личный лимит каждому — прогресс считается
                раздельно по автору операции.
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {personalBudgets.map((item) => (
                <BudgetRow
                  key={item.budget.id}
                  item={item}
                  categories={categories}
                  memberName={
                    members.find((m) => m.id === item.budget.memberId)?.displayName || 'Участник'
                  }
                  onEdit={() => setEditing(item.budget)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {progress.some((p) => p.budget.rolloverEnabled) && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 p-3 rounded-2xl bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400">
            <PiggyBank className="w-4 h-4 mt-px flex-shrink-0" />
            <p className="text-[10.5px] font-bold leading-relaxed">
              Остатки переносятся автоматически при наступлении нового месяца:
              неизрасходованный лимит увеличивает следующий месяц, перерасход — уменьшает.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCarryOver}
            className="w-full py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 text-[11px] font-black active:scale-95 transition-transform"
          >
            Перенести сейчас в {monthLabel(shiftMonth(month, 1))}
          </button>
        </div>
      )}

      {editing && (
        <BudgetEditorModal
          budget={editing === 'NEW' ? null : editing}
          month={month}
          categories={categories}
          members={members}
          baseCurrency={baseCurrency}
          rolloverDefault={rolloverDefault}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function BudgetRow({
  item,
  categories,
  memberName,
  onEdit,
}: {
  item: BudgetProgress;
  categories: FinanceCategory[];
  memberName?: string;
  onEdit: () => void;
}) {
  const category = categories.find((c) => c.id === item.budget.categoryId);
  const Icon = getCategoryIcon(category?.iconName || 'Target');

  return (
    <Card className="p-3.5 space-y-2.5" onClick={onEdit}>
      <div className="flex items-center gap-3">
        <span
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            backgroundColor: `${category?.colorHex || '#0EA5E9'}1F`,
            color: category?.colorHex || '#0EA5E9',
          }}
        >
          <Icon className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
            {item.categoryName}
            {memberName && (
              <span className="text-[10px] font-bold text-slate-400"> · {memberName}</span>
            )}
          </p>
          <p className="text-[10.5px] text-slate-400 font-medium tabular-nums">
            {formatMoney(item.spent, item.budget.currency)} из{' '}
            {formatMoney(item.effectiveLimit, item.budget.currency)}
          </p>
        </div>
        <span
          className={`text-xs font-black tabular-nums ${
            item.level === 'EXCEEDED'
              ? 'text-rose-500'
              : item.level === 'WARNING'
              ? 'text-amber-500'
              : 'text-emerald-500'
          }`}
        >
          {item.percent.toFixed(0)}%
        </span>
      </div>
      <ProgressBar percent={item.percent} level={item.level} />
    </Card>
  );
}

function BudgetEditorModal({
  budget,
  month,
  categories,
  members,
  baseCurrency,
  rolloverDefault,
  onClose,
}: {
  budget: Budget | null;
  month: string;
  categories: FinanceCategory[];
  members: ProfileMember[];
  baseCurrency: CurrencyCode;
  rolloverDefault: boolean;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<string>(budget?.categoryId || 'TOTAL');
  const [memberId, setMemberId] = useState<string>(budget?.memberId || 'SHARED');
  const [limit, setLimit] = useState(budget ? String(budget.limitAmount) : '');
  const [rollover, setRollover] = useState(budget?.rolloverEnabled ?? rolloverDefault);
  const [error, setError] = useState<string | null>(null);

  const expenseCategories = categories.filter((c) => c.kind === 'EXPENSE' && !c.parentId && !c.isHidden);

  const handleSave = async () => {
    const amount = parseFloat(limit.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Укажите лимит больше нуля');
      return;
    }

    await upsertBudget({
      id: budget?.id,
      month,
      categoryId: scope === 'TOTAL' ? undefined : scope,
      memberId: memberId === 'SHARED' ? undefined : memberId,
      limitAmount: amount,
      currency: baseCurrency,
      rolloverEnabled: rollover,
      carriedOver: budget?.carriedOver || 0,
    });
    onClose();
  };

  return (
    <ModalShell
      title={budget ? 'Изменить лимит' : 'Новый лимит'}
      subtitle={monthLabel(month)}
      icon={<Target className="w-5 h-5" />}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {error && <p className="text-[11px] font-bold text-rose-500 text-center">{error}</p>}
          <PrimaryButton onClick={handleSave}>Сохранить лимит</PrimaryButton>
          {budget && (
            <button
              type="button"
              onClick={async () => {
                await deleteBudget(budget.id);
                onClose();
              }}
              className="w-full py-2.5 rounded-2xl text-[11px] font-black text-rose-500 bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Удалить лимит
            </button>
          )}
        </div>
      }
    >
      <Field label="На что лимит">
        <select value={scope} onChange={(e) => setScope(e.target.value)} className={inputClass}>
          <option value="TOTAL">Общий бюджет месяца</option>
          {expenseCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </Field>

      {members.length > 1 && (
        <Field label="Кого касается" hint="Личный лимит считается только по операциям этого участника">
          <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className={inputClass}>
            <option value="SHARED">Общий (оба участника)</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                Личный лимит: {member.displayName}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label={`Лимит на месяц, ${baseCurrency}`}>
        <input
          type="text"
          inputMode="decimal"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          placeholder="2500"
          className={`${inputClass} text-lg font-black`}
          autoFocus
        />
      </Field>

      <button
        type="button"
        onClick={() => setRollover((prev) => !prev)}
        className="w-full flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70"
      >
        <span className="text-left">
          <span className="block text-xs font-black text-slate-700 dark:text-slate-200">
            Переносить остаток
          </span>
          <span className="block text-[10px] text-slate-400 font-medium">
            Неизрасходованная часть добавится к лимиту следующего месяца
          </span>
        </span>
        <span
          className={`w-11 h-6 rounded-full flex items-center px-0.5 transition-colors flex-shrink-0 ${
            rollover ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
          }`}
        >
          <span
            className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
              rollover ? 'translate-x-5' : ''
            }`}
          />
        </span>
      </button>
    </ModalShell>
  );
}
