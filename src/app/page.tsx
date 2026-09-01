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
  saveFinanceSettings,
  summarizeVat,
  DEFAULT_SETTINGS,
} from '@/lib/db';
import { AuthSession, Plan, Transaction } from '@/types';
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
  materializeRecurringPlan,
  processDueRecurringPlans,
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
import { DebtsTab } from '@/components/debts-tab';
import { ReportsTab } from '@/components/reports-tab';
import { SettingsTab } from '@/components/settings-tab';
import { QuickAddSheet } from '@/components/quick-add-sheet';
import { StatementImportModal } from '@/components/statement-import-modal';
import { LanguageProvider, useT } from '@/i18n/context';
import { seededName } from '@/i18n/categories';
import { tr } from '@/i18n/t';
import { AuthGate } from '@/components/auth-gate';
import { OnboardingWizard } from '@/components/onboarding-wizard';
import { PinLockScreen } from '@/components/pin-lock';
import {
  isSessionUnlocked,
  markSessionUnlocked,
  subscribeSessionLock,
} from '@/services/security/session-lock';
import {
  TransactionFormModal,
  TransactionPrefill,
} from '@/components/transaction-form-modal';

function FinanceApp() {
  const { t } = useT();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<FinanceTab>('transactions');
  const [month, setMonth] = useState(currentMonth());
  const [preset, setPreset] = useState<PeriodPreset>('MONTH');
  const [range, setRange] = useState<DateRange>(() => rangeForPreset('MONTH'));

  const [quickAddMode, setQuickAddMode] = useState<
    'MANUAL' | 'SCAN' | 'VOICE' | 'STATEMENT' | null
  >(null);
  const [isImportingStatement, setIsImportingStatement] = useState(false);
  const [formPrefill, setFormPrefill] = useState<TransactionPrefill | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [pendingPlanned, setPendingPlanned] = useState<Plan[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  // Unlocking lives in a module store: it survives re-renders and setting a PIN
  // from inside the app, but not a reload — which is when the lock should return.
  const [isUnlocked, setIsUnlocked] = useState(isSessionUnlocked);

  useEffect(() => subscribeSessionLock(() => setIsUnlocked(isSessionUnlocked())), []);

  const transactions = useLiveQuery(() => financeDb.transactions.toArray(), [], []);
  // Ordered by sortOrder so pickers keep the seeded category order everywhere.
  const categories = useLiveQuery(() => financeDb.categories.orderBy('sortOrder').toArray(), [], []);
  const accounts = useLiveQuery(() => financeDb.accounts.toArray(), [], []);
  const members = useLiveQuery(() => financeDb.members.toArray(), [], []);
  const budgets = useLiveQuery(() => financeDb.budgets.toArray(), [], []);
  const plans = useLiveQuery(() => financeDb.plans.toArray(), [], []);
  const occurrences = useLiveQuery(() => financeDb.planOccurrences.toArray(), [], []);
  const obligations = useLiveQuery(() => financeDb.obligations.toArray(), [], []);
  const settlements = useLiveQuery(() => financeDb.obligationSettlements.toArray(), [], []);
  const vatPayments = useLiveQuery(() => financeDb.vatPayments.toArray(), [], []);
  const bearerCheques = useLiveQuery(() => financeDb.bearerCheques.toArray(), [], []);
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
      const { created, awaitingConfirmation } = await processDueRecurringPlans(
        stored?.plannedPaymentAutoCreate ?? false
      );
      if (cancelled) return;

      if (created.length > 0) {
        setToast(`${tr('app.plansCreated')}: ${created.length}`);
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
    else if (quick === 'list' || quick === 'statement') setIsImportingStatement(true);
    else if (quick === 'expense' || quick === 'add') setQuickAddMode('MANUAL');
  }, [searchParams, mounted]);

  // `range` for a rolling preset (Неделя/Месяц/Квартал/Год) is resolved once
  // against "now" and then held in state — left open across a day boundary
  // (a bookmarked PWA left open overnight is the common case), its `to` stays
  // stuck on the day it was computed, and a transaction entered "today" silently
  // falls outside it. Re-resolve whenever the tab regains focus so the period
  // catches up with the real date; a CUSTOM range the user picked is untouched.
  useEffect(() => {
    const refreshIfStale = () => {
      setPreset((currentPreset) => {
        if (currentPreset !== 'CUSTOM') {
          const fresh = rangeForPreset(currentPreset);
          setRange((prev) =>
            prev.from === fresh.from && prev.to === fresh.to ? prev : fresh
          );
        }
        return currentPreset;
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshIfStale();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', refreshIfStale);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', refreshIfStale);
    };
  }, []);

  const vatSummary = useMemo(
    () =>
      settings.vatEnabled
        ? summarizeVat(transactions, vatPayments, settings.vatRate)
        : undefined,
    [settings.vatEnabled, settings.vatRate, transactions, vatPayments]
  );

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
    if (!mounted || plans.length === 0) return;
    checkPlannedPaymentReminders(plans);
  }, [mounted, plans]);

  const handleTransactionSaved = useCallback(
    (transaction: Transaction) => {
      checkLargeTransactionAlert(transaction, members, getCurrentMemberId());
      setToast(
        `${tr(transaction.kind === 'EXPENSE' ? 'common.expense' : 'common.income')} ${formatMoney(
          transaction.amount,
          transaction.currency
        )} — ${tr('app.recorded')}`
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

  const handleSignedIn = async (session: AuthSession) => {
    await saveFinanceSettings({ session });
    // A signed-in owner should carry their own name on the operations they add.
    const owner = members.find((m) => m.role === 'OWNER');
    if (owner && (owner.displayName === 'Я' || !owner.email)) {
      await financeDb.members.update(owner.id, {
        displayName: session.displayName,
        email: session.email,
      });
    }
  };

  if (!settings.session) {
    return <AuthGate onSignedIn={handleSignedIn} />;
  }

  if (settings.pinEnabled && !isUnlocked) {
    return <PinLockScreen settings={settings} onUnlocked={markSessionUnlocked} />;
  }

  if (!settings.onboardingCompleted) {
    return (
      <OnboardingWizard
        settings={settings}
        session={settings.session}
        onFinish={(message) => {
          // The PIN was just chosen here — do not ask for it on the next frame.
          markSessionUnlocked();
          setToast(message || t('app.settingsSaved'));
        }}
      />
    );
  }

  const periodSubtitle =
    activeTab === 'budgets'
      ? monthLabel(month)
      : `${range.from} — ${range.to} · ${t('app.base')} ${settings.baseCurrency}`;

  return (
    <div className="min-h-screen flex flex-col">
      <FinanceHeader
        profileName={seededName('profile', settings.profileName, settings.language || 'ru')}
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
                  {t('app.plansWaiting')}
                </p>
                <p className="text-[10.5px] text-amber-600/80 dark:text-amber-400/80 font-medium">
                  {t('app.plansWaitingHint')}
                </p>
              </div>
            </div>

            {pendingPlanned.map((plan) => (
              <div
                key={plan.id}
                className="flex items-center gap-2 p-2.5 rounded-2xl bg-white/70 dark:bg-slate-900/60"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-[11px] font-black text-slate-800 dark:text-slate-100 truncate">
                    {plan.title}
                  </span>
                  <span className="block text-[10px] text-slate-400 font-medium">
                    {plan.nextDueDate} · {formatMoney(plan.amount, plan.currency)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await materializeRecurringPlan(plan);
                    setPendingPlanned((prev) => prev.filter((p) => p.id !== plan.id));
                    setToast(t('app.planCreated'));
                  }}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500 text-white text-[10px] font-black flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  {t('common.create')}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPendingPlanned((prev) => prev.filter((p) => p.id !== plan.id))
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
            plans={plans}
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
            plans={plans}
            occurrences={occurrences}
            bearerCheques={bearerCheques}
            settings={settings}
            month={month}
            onMonthChange={handleMonthChange}
            rolloverDefault={settings.budgetRolloverEnabled}
          />
        )}

        {activeTab === 'planned' && (
          <PlannedTab
            plans={plans}
            categories={categories}
            accounts={accounts}
            settings={settings}
            autoCreateDefault={settings.plannedPaymentAutoCreate}
          />
        )}

        {activeTab === 'obligations' && (
          <DebtsTab
            settings={settings}
            categories={categories}
            accounts={accounts}
            obligations={obligations}
            settlements={settlements}
            plans={plans}
            occurrences={occurrences}
            bearerCheques={bearerCheques}
            vatSummary={vatSummary}
            vatPayments={vatPayments}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsTab
            transactions={transactions}
            plans={plans}
            occurrences={occurrences}
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
            vatSummary={vatSummary}
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
          onOpenStatementImport={() => setIsImportingStatement(true)}
          onSaved={() => setToast(t('app.operationSaved'))}
        />
      )}

      {isImportingStatement && (
        <StatementImportModal
          categories={categories}
          accounts={accounts}
          transactions={transactions}
          baseCurrency={settings.baseCurrency}
          onClose={() => setIsImportingStatement(false)}
          onImported={(count) =>
            setToast(`${t('app.imported')}: ${count}`)
          }
        />
      )}

      {(formPrefill || editingTransaction) && (
        <TransactionFormModal
          categories={categories}
          accounts={accounts}
          members={members}
          baseCurrency={settings.baseCurrency}
          settings={settings}
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

/**
 * Reads the chosen language before the app renders, so every screen — including
 * the login and lock gates — comes up already translated and, for Hebrew,
 * already right-to-left.
 */
function LanguageBoundary({ children }: { children: React.ReactNode }) {
  const settings = useLiveQuery(() => financeDb.settings.get('default'), []);
  return <LanguageProvider language={settings?.language || 'ru'}>{children}</LanguageProvider>;
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
      <LanguageBoundary>
        <FinanceApp />
      </LanguageBoundary>
    </Suspense>
  );
}
