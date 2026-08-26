'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarClock, CheckCircle2, X } from 'lucide-react';
import {
  applyBudgetRollovers,
  financeDb,
  initializeFinanceDb,
  currentMonth,
  getCurrentMemberId,
  refreshObligationStatuses,
  DEFAULT_SETTINGS,
} from '@/lib/db';
import { PlannedPayment, Transaction } from '@/types';
import {
  DateRange,
  PeriodPreset,
  budgetProgress,
  monthRange,
  rangeForPreset,
  monthLabel,
  formatMoney,
} from '@/services/analytics';
import {
  materializePlannedPayment,
  processDuePlannedPayments,
} from '@/services/planned';
import {
  checkBudgetAlerts,
  checkLargeTransactionAlert,
  checkPlannedPaymentReminders,
} from '@/services/notifications';
import { runDailyAutoBackup } from '@/services/backup/drive-backup';
import { FinanceBottomNav, FinanceHeader, FinanceTab } from '@/components/navigation';
import { TransactionsTab } from '@/components/transactions-tab';
import { BudgetsTab } from '@/components/budgets-tab';
import { PlannedTab } from '@/components/planned-tab';
import { ObligationsTab } from '@/components/obligations-tab';
import { ReportsTab } from '@/components/reports-tab';
import { SettingsTab } from '@/components/settings-tab';
import { QuickAddSheet } from '@/components/quick-add-sheet';
import {
  TransactionFormModal,
  TransactionPrefill,
} from '@/components/transaction-form-modal';

function FinanceApp() {
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<FinanceTab>('transactions');
  const [month, setMonth] = useState(currentMonth());
  const [preset, setPreset] = useState<PeriodPreset>('MONTH');
  const [range, setRange] = useState<DateRange>(() => rangeForPreset('MONTH'));

  const [quickAddMode, setQuickAddMode] = useState<'MANUAL' | 'SCAN' | 'VOICE' | null>(null);
  const [formPrefill, setFormPrefill] = useState<TransactionPrefill | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [pendingPlanned, setPendingPlanned] = useState<PlannedPayment[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const transactions = useLiveQuery(() => financeDb.transactions.toArray(), [], []);
  // Ordered by sortOrder so pickers keep the seeded category order everywhere.
  const categories = useLiveQuery(() => financeDb.categories.orderBy('sortOrder').toArray(), [], []);
  const accounts = useLiveQuery(() => financeDb.accounts.toArray(), [], []);
  const members = useLiveQuery(() => financeDb.members.toArray(), [], []);
  const budgets = useLiveQuery(() => financeDb.budgets.toArray(), [], []);
  const plannedPayments = useLiveQuery(() => financeDb.plannedPayments.toArray(), [], []);
  const obligations = useLiveQuery(() => financeDb.obligations.toArray(), [], []);
  const settlements = useLiveQuery(() => financeDb.obligationSettlements.toArray(), [], []);
  const settingsRow = useLiveQuery(() => financeDb.settings.get('default'), []);

  const settings = settingsRow || DEFAULT_SETTINGS;

  // Startup: seed defaults, refresh overdue flags, fire due planned payments and
  // the once-a-day Drive backup. Everything after seeding is best-effort.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      await initializeFinanceDb();
      await refreshObligationStatuses();
      // Carries last month's leftovers (and overspends) into the current month.
      await applyBudgetRollovers();
      if (cancelled) return;
      setMounted(true);

      const stored = await financeDb.settings.get('default');
      const { created, awaitingConfirmation } = await processDuePlannedPayments(
        stored?.plannedPaymentAutoCreate ?? false
      );
      if (cancelled) return;

      if (created.length > 0) {
        setToast(`Создано плановых операций: ${created.length}`);
      }
      setPendingPlanned(awaitingConfirmation);

      runDailyAutoBackup().catch(() => {
        /* backup is opportunistic — never block the UI on it */
      });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Home-screen shortcuts deep-link straight into an entry mode (?quick=scan|voice|expense).
  useEffect(() => {
    const quick = searchParams?.get('quick');
    if (!mounted || !quick) return;
    if (quick === 'scan') setQuickAddMode('SCAN');
    else if (quick === 'voice') setQuickAddMode('VOICE');
    else if (quick === 'expense' || quick === 'add') setQuickAddMode('MANUAL');
  }, [searchParams, mounted]);

  const monthBudgetProgress = useMemo(
    () => budgetProgress(budgets, transactions, categories, month),
    [budgets, transactions, categories, month]
  );

  // Limit alerts re-evaluate whenever spending or limits change.
  useEffect(() => {
    if (!mounted || monthBudgetProgress.length === 0) return;
    checkBudgetAlerts(monthBudgetProgress, settings.notifyAtPercent);
  }, [mounted, monthBudgetProgress, settings.notifyAtPercent]);

  useEffect(() => {
    if (!mounted || plannedPayments.length === 0) return;
    checkPlannedPaymentReminders(plannedPayments);
  }, [mounted, plannedPayments]);

  const handleTransactionSaved = useCallback(
    (transaction: Transaction) => {
      checkLargeTransactionAlert(transaction, members, getCurrentMemberId());
      setToast(
        `${transaction.kind === 'EXPENSE' ? 'Расход' : 'Доход'} ${formatMoney(
          transaction.amount,
          transaction.currency
        )} записан`
      );
    },
    [members]
  );

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleMonthChange = (nextMonth: string) => {
    setMonth(nextMonth);
    setRange(monthRange(nextMonth));
    setPreset('CUSTOM');
  };

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-500 to-cyan-400 animate-pulse" />
      </div>
    );
  }

  const periodSubtitle =
    activeTab === 'budgets'
      ? monthLabel(month)
      : `${range.from} — ${range.to} · база ${settings.baseCurrency}`;

  return (
    <div className="min-h-screen flex flex-col">
      <FinanceHeader
        profileName={settings.profileName}
        subtitle={periodSubtitle}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <main className="flex-1 max-w-lg w-full mx-auto px-4 py-4 safe-bottom">
        {pendingPlanned.length > 0 && (
          <div className="mb-4 p-4 rounded-3xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 space-y-2">
            <div className="flex items-start gap-2">
              <CalendarClock className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-black text-amber-700 dark:text-amber-300">
                  Плановые платежи ждут подтверждения
                </p>
                <p className="text-[10.5px] text-amber-600/80 dark:text-amber-400/80 font-medium">
                  Наступил срок — подтвердите создание операции
                </p>
              </div>
            </div>

            {pendingPlanned.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center gap-2 p-2.5 rounded-2xl bg-white/70 dark:bg-slate-900/60"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-[11px] font-black text-slate-800 dark:text-slate-100 truncate">
                    {payment.title}
                  </span>
                  <span className="block text-[10px] text-slate-400 font-medium">
                    {payment.nextDueDate} · {formatMoney(payment.amount, payment.currency)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await materializePlannedPayment(payment);
                    setPendingPlanned((prev) => prev.filter((p) => p.id !== payment.id));
                    setToast('Плановая операция создана');
                  }}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500 text-white text-[10px] font-black flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  Создать
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPendingPlanned((prev) => prev.filter((p) => p.id !== payment.id))
                  }
                  className="w-7 h-7 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'transactions' && (
          <TransactionsTab
            transactions={transactions}
            categories={categories}
            accounts={accounts}
            members={members}
            baseCurrency={settings.baseCurrency}
            range={range}
            onSelect={setEditingTransaction}
          />
        )}

        {activeTab === 'budgets' && (
          <BudgetsTab
            budgets={budgets}
            transactions={transactions}
            categories={categories}
            members={members}
            plannedPayments={plannedPayments}
            settings={settings}
            month={month}
            onMonthChange={handleMonthChange}
            rolloverDefault={settings.budgetRolloverEnabled}
          />
        )}

        {activeTab === 'planned' && (
          <PlannedTab
            plannedPayments={plannedPayments}
            categories={categories}
            accounts={accounts}
            settings={settings}
            autoCreateDefault={settings.plannedPaymentAutoCreate}
          />
        )}

        {activeTab === 'obligations' && (
          <ObligationsTab
            obligations={obligations}
            settlements={settlements}
            categories={categories}
            accounts={accounts}
            baseCurrency={settings.baseCurrency}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsTab
            transactions={transactions}
            plannedPayments={plannedPayments}
            settings={settings}
            categories={categories}
            accounts={accounts}
            members={members}
            budgets={budgets}
            obligations={obligations}
            settlements={settlements}
            baseCurrency={settings.baseCurrency}
            month={month}
            range={range}
            preset={preset}
            onRangeChange={(nextRange, nextPreset) => {
              setRange(nextRange);
              setPreset(nextPreset);
            }}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            settings={settings}
            categories={categories}
            accounts={accounts}
            members={members}
            transactions={transactions}
          />
        )}
      </main>

      <FinanceBottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onQuickAdd={() => setQuickAddMode('MANUAL')}
      />

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[11px] font-black shadow-xl animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </div>
      )}

      {quickAddMode && (
        <QuickAddSheet
          categories={categories}
          accounts={accounts}
          baseCurrency={settings.baseCurrency}
          speechLocale={settings.speechLocale}
          initialMode={quickAddMode}
          onClose={() => setQuickAddMode(null)}
          onOpenFullForm={(prefill) => setFormPrefill(prefill)}
          onSaved={() => setToast('Операция записана')}
        />
      )}

      {(formPrefill || editingTransaction) && (
        <TransactionFormModal
          categories={categories}
          accounts={accounts}
          members={members}
          baseCurrency={settings.baseCurrency}
          existing={editingTransaction}
          prefill={formPrefill || undefined}
          onClose={() => {
            setFormPrefill(null);
            setEditingTransaction(null);
          }}
          onSaved={handleTransactionSaved}
        />
      )}
    </div>
  );
}

export default function FinancePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-500 to-cyan-400 animate-pulse" />
        </div>
      }
    >
      <FinanceApp />
    </Suspense>
  );
}
