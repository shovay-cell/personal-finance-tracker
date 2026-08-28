'use client';

import React, { useMemo, useState } from 'react';
import { BarChart3, FileDown, FileText, PieChart } from 'lucide-react';
import {
  Budget,
  CurrencyCode,
  FinanceAccount,
  FinanceCategory,
  DebtInstallment,
  DebtPlan,
  FinanceSettings,
  PlannedPayment,
  Obligation,
  ObligationSettlement,
  ProfileMember,
  Transaction,
  TransactionKind,
} from '@/types';
import {
  DateRange,
  PeriodPreset,
  budgetProgress,
  categoryBreakdown,
  filterTransactions,
  formatMoney,
  monthlyDynamics,
  obligationsWithBalance,
  rangeForPreset,
  sumBase,
} from '@/services/analytics';
import { exportReportPdf, exportTransactionsCsv } from '@/services/export';
import { forecastCashFlow } from '@/services/forecast';
import { convertToBase, todayIso } from '@/lib/db';
import { CategoryLegend, DonutChart, MonthlyBarChart } from './charts';
import { CashFlowForecastCard } from './cash-flow-forecast';
import { Card, EmptyState, SectionTitle, SegmentedControl, inputClass } from './ui';
import { ProgressBar } from './charts';

interface ReportsTabProps {
  transactions: Transaction[];
  plannedPayments: PlannedPayment[];
  debts: DebtPlan[];
  installments: DebtInstallment[];
  settings: FinanceSettings;
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  members: ProfileMember[];
  budgets: Budget[];
  obligations: Obligation[];
  settlements: ObligationSettlement[];
  baseCurrency: CurrencyCode;
  month: string;
  range: DateRange;
  preset: PeriodPreset;
  onRangeChange: (range: DateRange, preset: PeriodPreset) => void;
}

const PRESET_LABELS: { value: PeriodPreset; label: string }[] = [
  { value: 'WEEK', label: 'Неделя' },
  { value: 'MONTH', label: 'Месяц' },
  { value: 'QUARTER', label: 'Квартал' },
  { value: 'YEAR', label: 'Год' },
];

export function ReportsTab({
  transactions,
  plannedPayments,
  debts,
  installments,
  settings,
  categories,
  accounts,
  members,
  budgets,
  obligations,
  settlements,
  baseCurrency,
  month,
  range,
  preset,
  onRangeChange,
}: ReportsTabProps) {
  const [kind, setKind] = useState<TransactionKind>('EXPENSE');
  const [showCustom, setShowCustom] = useState(preset === 'CUSTOM');
  const [forecastDays, setForecastDays] = useState(30);

  const forecast = useMemo(
    () =>
      forecastCashFlow({
        accounts,
        transactions,
        plannedPayments,
        debts,
        installments,
        days: forecastDays,
        today: todayIso(),
        toBase: (amount, currency) => convertToBase(amount, currency, settings).baseAmount,
      }),
    [accounts, transactions, plannedPayments, debts, installments, forecastDays, settings]
  );

  const periodTransactions = useMemo(
    () => filterTransactions(transactions, { range }),
    [transactions, range]
  );

  const expenseRows = useMemo(
    () => categoryBreakdown(periodTransactions, categories, 'EXPENSE'),
    [periodTransactions, categories]
  );
  const incomeRows = useMemo(
    () => categoryBreakdown(periodTransactions, categories, 'INCOME'),
    [periodTransactions, categories]
  );

  const totalExpense = sumBase(periodTransactions.filter((t) => t.kind === 'EXPENSE'));
  const totalIncome = sumBase(periodTransactions.filter((t) => t.kind === 'INCOME'));

  const dynamics = useMemo(() => monthlyDynamics(transactions, 6), [transactions]);
  const budgetRows = useMemo(
    () => budgetProgress(budgets, transactions, categories, month),
    [budgets, transactions, categories, month]
  );
  const obligationRows = useMemo(
    () => obligationsWithBalance(obligations, settlements).filter((r) => r.status !== 'SETTLED'),
    [obligations, settlements]
  );

  const activeRows = kind === 'EXPENSE' ? expenseRows : incomeRows;
  const activeTotal = kind === 'EXPENSE' ? totalExpense : totalIncome;

  const handlePdf = () => {
    exportReportPdf({
      title: 'Финансовый отчёт',
      period: `${range.from} — ${range.to}`,
      baseCurrency,
      totalExpense,
      totalIncome,
      expenseBreakdown: expenseRows,
      incomeBreakdown: incomeRows,
      budgets: budgetRows,
      obligations: obligationRows,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {PRESET_LABELS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              setShowCustom(false);
              onRangeChange(rangeForPreset(option.value), option.value);
            }}
            className={`flex-1 py-2 rounded-xl text-[11px] font-black border transition-all ${
              preset === option.value && !showCustom
                ? 'bg-sky-500 text-white border-transparent shadow-md shadow-sky-500/25'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
            }`}
          >
            {option.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowCustom((prev) => !prev)}
          className={`px-3 py-2 rounded-xl text-[11px] font-black border transition-all ${
            showCustom
              ? 'bg-sky-500 text-white border-transparent'
              : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
          }`}
        >
          ⋯
        </button>
      </div>

      {showCustom && (
        <Card className="p-3 grid grid-cols-2 gap-2">
          <input
            type="date"
            value={range.from}
            onChange={(e) => onRangeChange({ ...range, from: e.target.value }, 'CUSTOM')}
            className={`${inputClass} text-xs`}
          />
          <input
            type="date"
            value={range.to}
            onChange={(e) => onRangeChange({ ...range, to: e.target.value }, 'CUSTOM')}
            className={`${inputClass} text-xs`}
          />
        </Card>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3">
          <p className="text-[9px] font-black uppercase tracking-wide text-rose-500">Расходы</p>
          <p className="text-sm font-black text-slate-900 dark:text-slate-100 tabular-nums mt-1">
            {formatMoney(totalExpense, baseCurrency, { compact: true })}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[9px] font-black uppercase tracking-wide text-emerald-500">Доходы</p>
          <p className="text-sm font-black text-slate-900 dark:text-slate-100 tabular-nums mt-1">
            {formatMoney(totalIncome, baseCurrency, { compact: true })}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">Баланс</p>
          <p
            className={`text-sm font-black tabular-nums mt-1 ${
              totalIncome - totalExpense < 0
                ? 'text-rose-500'
                : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {formatMoney(totalIncome - totalExpense, baseCurrency, { compact: true })}
          </p>
        </Card>
      </div>

      <SegmentedControl<TransactionKind>
        value={kind}
        onChange={setKind}
        options={[
          { value: 'EXPENSE', label: 'РАСХОДЫ' },
          { value: 'INCOME', label: 'ДОХОДЫ' },
        ]}
      />

      <Card className="p-4">
        {activeRows.length === 0 ? (
          <EmptyState
            icon={<PieChart className="w-7 h-7" />}
            title="Нет данных за период"
            description="Выберите другой период или добавьте операции."
          />
        ) : (
          <>
            <DonutChart
              rows={activeRows}
              total={activeTotal}
              currency={baseCurrency}
              centerLabel={kind === 'EXPENSE' ? 'Расходы' : 'Доходы'}
            />
            <div className="mt-4">
              <CategoryLegend rows={activeRows} currency={baseCurrency} />
            </div>
          </>
        )}
      </Card>

      <div>
        <SectionTitle title="Прогноз ликвидности" />
        <CashFlowForecastCard
          forecast={forecast}
          currency={baseCurrency}
          horizon={forecastDays}
          onHorizonChange={setForecastDays}
        />
      </div>

      <div>
        <SectionTitle title="Динамика по месяцам" />
        <Card className="p-4">
          <MonthlyBarChart points={dynamics} currency={baseCurrency} />
          <div className="flex items-center justify-center gap-4 mt-3">
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" /> Расходы
            </span>
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Доходы
            </span>
          </div>
        </Card>
      </div>

      <div>
        <SectionTitle title="План / факт по бюджетам" />
        {budgetRows.length === 0 ? (
          <Card className="p-4 text-[11px] font-medium text-slate-400 text-center">
            Лимиты на этот месяц не заданы
          </Card>
        ) : (
          <Card className="p-4 space-y-3">
            {budgetRows.map((item) => (
              <div key={item.budget.id} className="space-y-1.5">
                <div className="flex justify-between text-[11px] font-bold">
                  <span className="text-slate-600 dark:text-slate-300 truncate">
                    {item.categoryName}
                  </span>
                  <span className="text-slate-400 tabular-nums flex-shrink-0">
                    {formatMoney(item.spent, baseCurrency)} /{' '}
                    {formatMoney(item.effectiveLimit, baseCurrency)}
                  </span>
                </div>
                <ProgressBar percent={item.percent} level={item.level} />
              </div>
            ))}
          </Card>
        )}
      </div>

      {obligationRows.length > 0 && (
        <div>
          <SectionTitle title="Открытые обязательства" />
          <Card className="p-4 space-y-2">
            {obligationRows.map((row) => (
              <div key={row.obligation.id} className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate">
                  {row.obligation.payeeLabel || 'Чек на предъявителя'}
                </span>
                <span className="text-[11px] font-black text-rose-500 tabular-nums flex-shrink-0">
                  {formatMoney(row.outstandingAmount, row.obligation.currency)}
                </span>
              </div>
            ))}
          </Card>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() =>
            exportTransactionsCsv(periodTransactions, categories, accounts, members, range)
          }
          className="py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-black flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
        >
          <FileDown className="w-4 h-4" />
          Экспорт CSV
        </button>
        <button
          type="button"
          onClick={handlePdf}
          className="py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-black flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
        >
          <FileText className="w-4 h-4" />
          Отчёт PDF
        </button>
      </div>

      <p className="text-[10px] text-slate-400 font-medium text-center px-4 flex items-center justify-center gap-1.5">
        <BarChart3 className="w-3 h-3" />
        Все суммы приведены к базовой валюте ({baseCurrency}) по курсу на момент операции
      </p>
    </div>
  );
}
