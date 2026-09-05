'use client';

import React, { useMemo, useState } from 'react';
import {
  AlarmClock,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  Pause,
  Play,
  Plus,
  Scale,
  Trash2,
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
  PlanOccurrenceOverride,
  RecurrenceKind,
  Transaction,
  TransactionKind,
} from '@/types';
import {
  addRecurringPlan,
  convertToBase,
  currentMonth,
  todayIso,
  deletePlan,
  splitFixedSchedulePlanFromOccurrence,
  splitRecurringPlanFromDate,
  updatePlan,
} from '@/lib/db';
import { describeRecurrence, materializeRecurringPlan } from '@/services/planned';
import { formatDateHuman, formatMoney, shiftMonth } from '@/services/analytics';
import { UpcomingEvent, groupByDay, upcomingEvents } from '@/services/upcoming';
import { getCategoryIcon } from '@/constants/categories';
import { useT } from '@/i18n/context';
import { accountName, categoryName } from '@/i18n/categories';
import { EditScopeModal, OccurrenceOverrideModal, PlanEditScope } from './plan-scope-modal';
import { PlanEditModal } from './debt-card';
import { BearerChequeEditModal } from './debts-tab';
import { ObligationModal } from './obligations-tab';
import {
  Card,
  EmptyState,
  Field,
  ModalShell,
  PrimaryButton,
  SectionTitle,
  SegmentedControl,
  inputClass,
} from './ui';

interface PlannedTabProps {
  plans: Plan[];
  occurrences: PlanOccurrence[];
  planOverrides?: PlanOccurrenceOverride[];
  obligations: Obligation[];
  settlements: ObligationSettlement[];
  bearerCheques: BearerCheque[];
  transactions: Transaction[];
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  settings: FinanceSettings;
  autoCreateDefault: boolean;
  /** Opens the ordinary transaction edit form — for an event that is a plain,
   *  hand-entered transaction rather than a plan (no schedule to manage). */
  onEditTransaction: (transaction: Transaction) => void;
}

type Preset = 'ALL' | 'TODAY' | 'WEEK' | 'MONTH' | 'NEXT_MONTH' | 'OVERDUE' | 'UNCONFIRMED' | 'CUSTOM';

function sumAmounts(items: { amount: number }[]): number {
  return Math.round(items.reduce((sum, i) => sum + i.amount, 0) * 100) / 100;
}

function addDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

/**
 * One screen for every known future money movement — payments and income
 * alike, whether they come from a recurring plan or a fixed-schedule
 * obligation (credit, instalment, tax). Replaces the old three-way
 * Платежи/Подписки/Инвестиции split: those were all just plans with
 * different categories, not different kinds of future money.
 */
export function PlannedTab({
  plans,
  occurrences,
  planOverrides,
  obligations,
  settlements,
  bearerCheques,
  transactions,
  categories,
  accounts,
  settings,
  autoCreateDefault,
  onEditTransaction,
}: PlannedTabProps) {
  const [kind, setKind] = useState<TransactionKind>('EXPENSE');
  const [preset, setPreset] = useState<Preset>('ALL');
  const [customDate, setCustomDate] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [editing, setEditing] = useState<Plan | 'NEW' | null>(null);
  const [scopeTarget, setScopeTarget] = useState<{
    plan: Plan;
    date: string;
    occurrence?: PlanOccurrence;
  } | null>(null);
  const [editingCheque, setEditingCheque] = useState<BearerCheque | null>(null);
  const [editingObligation, setEditingObligation] = useState<Obligation | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<{
    plan: Plan;
    date: string;
    occurrence?: PlanOccurrence;
  } | null>(null);
  const { t, language } = useT();

  const baseCurrency = settings.baseCurrency;
  const toBase = (amount: number, currency: CurrencyCode) =>
    convertToBase(amount, currency, settings).baseAmount;
  const today = todayIso();
  const thisMonth = currentMonth();
  const nextMonth = shiftMonth(thisMonth, 1);
  const weekEnd = addDaysStr(today, 6);

  const events = useMemo(
    () =>
      upcomingEvents({
        plans,
        occurrences,
        overrides: planOverrides,
        obligations,
        settlements,
        bearerCheques,
        transactions,
        categories,
        // A future payment or income must never quietly fall off this
        // screen just for being far out — a year out covers anything
        // anyone plans this far ahead of time.
        months: 12,
        today,
        toBase,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plans, occurrences, planOverrides, obligations, settlements, bearerCheques, transactions, categories, settings, today]
  );

  const monthEvents = useMemo(
    () => events.filter((e) => e.date.slice(0, 7) === thisMonth),
    [events, thisMonth]
  );

  const kindEvents = useMemo(() => events.filter((e) => e.kind === kind), [events, kind]);

  const categoryOptions = useMemo(
    () => categories.filter((c) => c.kind === kind && !c.parentId && !c.isHidden),
    [categories, kind]
  );

  const byCategory = useMemo(
    () => (categoryFilter === 'ALL' ? kindEvents : kindEvents.filter((e) => e.categoryId === categoryFilter)),
    [kindEvents, categoryFilter]
  );

  // The active tab's card must total the exact same events the list below
  // can show — otherwise picking a category with nothing due this month
  // leaves a nonzero card sitting above an empty "Ничего не найдено" list.
  // The other kind's card has no category selector of its own, so it stays
  // an unfiltered month total.
  const monthEventsForActiveKind = useMemo(
    () => byCategory.filter((e) => e.date.slice(0, 7) === thisMonth),
    [byCategory, thisMonth]
  );
  const dueThisMonth = sumAmounts(
    kind === 'EXPENSE' ? monthEventsForActiveKind : monthEvents.filter((e) => e.kind === 'EXPENSE')
  );
  const expectedThisMonth = sumAmounts(
    kind === 'INCOME' ? monthEventsForActiveKind : monthEvents.filter((e) => e.kind === 'INCOME')
  );
  const monthBalance = Math.round((expectedThisMonth - dueThisMonth) * 100) / 100;

  const next7 = useMemo(
    () => byCategory.filter((e) => e.date >= today && e.date <= weekEnd).slice(0, 5),
    [byCategory, today, weekEnd]
  );

  const presetFiltered = useMemo(() => {
    switch (preset) {
      case 'TODAY':
        return byCategory.filter((e) => e.date === today);
      case 'WEEK':
        return byCategory.filter((e) => e.date >= today && e.date <= weekEnd);
      case 'MONTH':
        return byCategory.filter((e) => e.date.slice(0, 7) === thisMonth);
      case 'NEXT_MONTH':
        return byCategory.filter((e) => e.date.slice(0, 7) === nextMonth);
      case 'OVERDUE':
        return byCategory.filter((e) => e.isOverdue);
      case 'UNCONFIRMED':
        return byCategory.filter((e) => e.needsConfirmation);
      case 'CUSTOM':
        return customDate ? byCategory.filter((e) => e.date === customDate) : byCategory;
      default:
        return byCategory;
    }
  }, [byCategory, preset, today, weekEnd, thisMonth, nextMonth, customDate]);

  const days = useMemo(() => groupByDay(presetFiltered), [presetFiltered]);

  const planById = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans]);
  const transactionById = useMemo(() => new Map(transactions.map((t) => [t.id, t])), [transactions]);
  const occurrenceById = useMemo(() => new Map(occurrences.map((o) => [o.id, o])), [occurrences]);

  const openEvent = (item: UpcomingEvent) => {
    if (item.planId) {
      const plan = planById.get(item.planId);
      if (!plan) return;

      // FIXED_SCHEDULE events carry the real occurrence id; RECURRING ones
      // are synthetic (`${planId}-${date}`) — either way `item.date` names
      // the exact payment the user clicked.
      const occurrence = plan.scheduleType === 'FIXED_SCHEDULE' ? occurrenceById.get(item.id) : undefined;

      // A single one-off payment has nothing to disambiguate between "this"
      // and "the rule" — they are the same thing, so skip straight to the
      // plan editor exactly like before this existed.
      const hasMoreThanOnePayment =
        plan.scheduleType === 'FIXED_SCHEDULE'
          ? (plan.occurrencesCount ?? 0) > 1
          : plan.recurrence !== 'ONCE';

      if (!hasMoreThanOnePayment) {
        setEditing(plan);
        return;
      }
      setScopeTarget({ plan, date: item.date, occurrence });
      return;
    }
    // A hand-entered transaction (source 'TRANSACTION') has no plan behind
    // it — its id is the transaction's own, so it opens the ordinary form.
    if (item.source === 'TRANSACTION') {
      const transaction = transactionById.get(item.id);
      if (transaction) onEditTransaction(transaction);
      return;
    }
    // A postdated cheque the profile issued (`item.id` is the cheque's own
    // id) or an old-style issued obligation (bearer note) — each has its
    // own editor elsewhere in the app; open it directly from here too.
    if (item.source === 'BEARER_CHEQUE') {
      const cheque = bearerCheques.find((c) => c.id === item.id);
      if (cheque) setEditingCheque(cheque);
      return;
    }
    if (item.source === 'CHEQUE') {
      const obligation = obligations.find((o) => o.id === item.id);
      if (obligation) setEditingObligation(obligation);
    }
  };

  const chooseScope = async (scope: PlanEditScope) => {
    if (!scopeTarget) return;
    const { plan, date, occurrence } = scopeTarget;
    setScopeTarget(null);

    if (scope === 'THIS') {
      setOverrideTarget({ plan, date, occurrence });
      return;
    }
    if (scope === 'RULE') {
      setEditing(plan);
      return;
    }
    // THIS_AND_FUTURE — spin off a new plan starting at this date/occurrence,
    // then hand it straight to the existing plan editor for the user's
    // actual edits; the split itself carries no field changes.
    const newPlan =
      plan.scheduleType === 'FIXED_SCHEDULE' && occurrence
        ? await splitFixedSchedulePlanFromOccurrence(occurrence.id, {})
        : await splitRecurringPlanFromDate(plan.id, date, {});
    if (newPlan) setEditing(newPlan);
  };

  const presets: { id: Preset; label: string }[] = [
    { id: 'ALL', label: t('pl.presetAll') },
    { id: 'TODAY', label: t('pl.presetToday') },
    { id: 'WEEK', label: t('pl.presetWeek') },
    { id: 'MONTH', label: t('pl.presetMonth') },
    { id: 'NEXT_MONTH', label: t('pl.presetNextMonth') },
    { id: 'OVERDUE', label: t('pl.presetOverdue') },
    { id: 'UNCONFIRMED', label: t('pl.presetUnconfirmed') },
    { id: 'CUSTOM', label: t('pl.presetCustom') },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3">
          <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-rose-500">
            <ArrowUpRight className="w-3 h-3" />
            {t('pl.dueThisMonth')}
          </div>
          <p className="text-sm font-black text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">
            {formatMoney(dueThisMonth, baseCurrency, { compact: true })}
          </p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-emerald-500">
            <ArrowDownLeft className="w-3 h-3" />
            {t('pl.expectedIncomeMonth')}
          </div>
          <p className="text-sm font-black text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">
            {formatMoney(expectedThisMonth, baseCurrency, { compact: true })}
          </p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-slate-400">
            <Scale className="w-3 h-3" />
            {t('pl.monthBalance')}
          </div>
          <p
            className={`text-sm font-black mt-0.5 tabular-nums ${
              monthBalance < 0 ? 'text-rose-500' : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {formatMoney(monthBalance, baseCurrency, { compact: true })}
          </p>
        </Card>
      </div>

      <SegmentedControl<TransactionKind>
        value={kind}
        onChange={(next) => {
          setKind(next);
          setCategoryFilter('ALL');
        }}
        options={[
          {
            value: 'EXPENSE',
            label: t('pl.tabPayments'),
            activeClass: 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-sm',
          },
          {
            value: 'INCOME',
            label: t('pl.tabIncome'),
            activeClass: 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm',
          },
        ]}
      />

      <button
        type="button"
        onClick={() => setEditing('NEW')}
        className="w-full py-3 rounded-2xl bg-gradient-to-tr from-sky-500 to-cyan-400 text-white text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-sky-500/25 active:scale-[0.98] transition-transform"
      >
        <Plus className="w-4 h-4" />
        {kind === 'EXPENSE' ? t('pl.addPayment') : t('pl.addIncome')}
      </button>

      {next7.length > 0 && (
        <div>
          <SectionTitle title={t('pl.next7')} />
          <Card className="divide-y divide-slate-50 dark:divide-slate-800/80">
            {next7.map((item) => (
              <EventRow key={item.id} item={item} categories={categories} baseCurrency={baseCurrency} onOpen={openEvent} />
            ))}
          </Card>
        </div>
      )}

      <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1">
        {presets.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => {
              setPreset(option.id);
              // First tap: seed with today so the picker opens on a real date.
              if (option.id === 'CUSTOM' && !customDate) setCustomDate(today);
            }}
            className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-black transition-colors ${
              preset === option.id
                ? 'bg-sky-500 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {preset === 'CUSTOM' && (
        <input
          type="date"
          value={customDate}
          onChange={(e) => setCustomDate(e.target.value)}
          className={inputClass}
        />
      )}

      {categoryOptions.length > 0 && (
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className={`${inputClass} text-xs`}
        >
          <option value="ALL">{t('tx.allCategories')}</option>
          {categoryOptions.map((category) => (
            <option key={category.id} value={category.id}>
              {categoryName(category, language)}
            </option>
          ))}
        </select>
      )}

      <div>
        <SectionTitle title={kind === 'EXPENSE' ? t('pl.tabPayments') : t('pl.tabIncome')} />
        {days.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="w-7 h-7" />}
            title={
              preset === 'ALL'
                ? kind === 'EXPENSE'
                  ? t('pl.emptyPayments')
                  : t('pl.emptyIncome')
                : t('pl.emptyEventsTitle')
            }
            description={
              preset === 'ALL'
                ? kind === 'EXPENSE'
                  ? t('pl.emptyPaymentsText')
                  : t('pl.emptyIncomeText')
                : t('pl.emptyEventsText')
            }
          />
        ) : (
          <div className="space-y-3">
            {days.map((day) => (
              <div key={day.date}>
                <div className="flex items-center justify-between px-1 mb-1.5">
                  <span className="text-[11px] font-black text-slate-500 dark:text-slate-400">
                    {formatDateHuman(day.date)}
                  </span>
                  <span className="text-[11px] font-black text-slate-400 tabular-nums">
                    {formatMoney(day.total, baseCurrency)}
                  </span>
                </div>
                <Card className="divide-y divide-slate-50 dark:divide-slate-800/80">
                  {day.items.map((item) => (
                    <EventRow key={item.id} item={item} categories={categories} baseCurrency={baseCurrency} onOpen={openEvent} />
                  ))}
                </Card>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && editing !== 'NEW' && editing.scheduleType === 'FIXED_SCHEDULE' ? (
        <PlanEditModal
          plan={editing}
          categories={categories}
          accounts={accounts}
          onClose={() => setEditing(null)}
        />
      ) : (
        editing && (
          <PlannedPaymentModal
            plan={editing === 'NEW' ? null : editing}
            defaultKind={kind}
            categories={categories}
            accounts={accounts}
            baseCurrency={baseCurrency}
            autoCreateDefault={autoCreateDefault}
            onClose={() => setEditing(null)}
          />
        )
      )}

      {scopeTarget && <EditScopeModal onChoose={chooseScope} onClose={() => setScopeTarget(null)} />}

      {overrideTarget && (
        <OccurrenceOverrideModal
          plan={overrideTarget.plan}
          date={overrideTarget.date}
          occurrence={overrideTarget.occurrence}
          categories={categories}
          accounts={accounts}
          onClose={() => setOverrideTarget(null)}
        />
      )}

      {editingCheque && (
        <BearerChequeEditModal
          cheque={editingCheque}
          categories={categories}
          accounts={accounts}
          onClose={() => setEditingCheque(null)}
        />
      )}

      {editingObligation && (
        <ObligationModal
          obligation={editingObligation}
          baseCurrency={baseCurrency}
          onClose={() => setEditingObligation(null)}
        />
      )}
    </div>
  );
}

function EventRow({
  item,
  categories,
  baseCurrency,
  onOpen,
}: {
  item: UpcomingEvent;
  categories: FinanceCategory[];
  baseCurrency: CurrencyCode;
  onOpen: (item: UpcomingEvent) => void;
}) {
  const { t } = useT();
  const category = categories.find((c) => c.id === item.categoryId);
  const Icon = getCategoryIcon(category?.iconName || 'CalendarClock');
  const clickable =
    Boolean(item.planId) ||
    item.source === 'TRANSACTION' ||
    item.source === 'BEARER_CHEQUE' ||
    item.source === 'CHEQUE';

  return (
    <div
      onClick={clickable ? () => onOpen(item) : undefined}
      className={`flex items-center gap-3 p-3 ${clickable ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50' : ''}`}
    >
      <span
        className="w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0"
        style={{
          backgroundColor: `${category?.colorHex || '#0EA5E9'}1F`,
          color: category?.colorHex || '#0EA5E9',
        }}
      >
        <Icon className="w-4 h-4" style={{ width: 16, height: 16 }} />
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">{item.title}</p>
        <p className="text-[10.5px] text-slate-400 font-medium flex items-center gap-1">
          {formatDateHuman(item.date)}
          {item.isOverdue && (
            <span className="inline-flex items-center gap-0.5 text-rose-500 font-black">
              <AlertTriangle className="w-3 h-3" />
              {t('debts.overdue')}
            </span>
          )}
          {!item.isOverdue && item.needsConfirmation && (
            <span className="inline-flex items-center gap-0.5 text-amber-500 font-black">
              <Clock className="w-3 h-3" />
              {t('pl.needsConfirmation')}
            </span>
          )}
        </p>
      </div>

      <span
        className={`text-xs font-black tabular-nums flex-shrink-0 ${
          item.kind === 'EXPENSE' ? 'text-slate-900 dark:text-slate-100' : 'text-emerald-600 dark:text-emerald-400'
        }`}
      >
        {item.kind === 'EXPENSE' ? '−' : '+'}
        {formatMoney(item.amount, baseCurrency)}
      </span>
    </div>
  );
}

function PlannedPaymentModal({
  plan,
  defaultKind,
  categories,
  accounts,
  baseCurrency,
  autoCreateDefault,
  onClose,
}: {
  plan: Plan | null;
  defaultKind: TransactionKind;
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  baseCurrency: CurrencyCode;
  autoCreateDefault: boolean;
  onClose: () => void;
}) {
  const { t, language } = useT();

  const [title, setTitle] = useState(plan?.title || '');
  const [provider, setProvider] = useState(plan?.provider || '');
  const [kind, setKind] = useState<TransactionKind>(plan?.kind || defaultKind);
  const [amount, setAmount] = useState(plan ? String(plan.amount) : '');
  const [categoryId, setCategoryId] = useState(plan?.categoryId || '');
  const [accountId, setAccountId] = useState(plan?.accountId || accounts[0]?.id || '');
  const [recurrence, setRecurrence] = useState<RecurrenceKind>(plan?.recurrence || 'MONTHLY');
  const [intervalDays, setIntervalDays] = useState(String(plan?.intervalDays || 30));
  const [nextDueDate, setNextDueDate] = useState(plan?.nextDueDate || todayIso());
  const [endDate, setEndDate] = useState(plan?.endDate || '');
  const [note, setNote] = useState(plan?.note || '');
  const [remindDaysBefore, setRemindDaysBefore] = useState(String(plan?.remindDaysBefore ?? 3));
  const [autoCreate, setAutoCreate] = useState(plan?.autoCreate ?? autoCreateDefault);
  const [error, setError] = useState<string | null>(null);

  const currency: CurrencyCode = plan?.currency || baseCurrency;
  const relevantCategories = categories.filter((c) => c.kind === kind && !c.parentId && !c.isHidden);

  const handleSave = async () => {
    const numericAmount = parseFloat(amount.replace(',', '.'));
    if (!title.trim()) return setError(t('pl.enterTitle'));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return setError(t('pl.enterAmount'));
    if (!categoryId) return setError(t('pl.pickCategory'));

    const payload = {
      planType: plan?.planType || ('PAYMENT' as const),
      title: title.trim(),
      provider: provider.trim() || undefined,
      kind,
      amount: numericAmount,
      currency,
      categoryId,
      accountId: accountId || accounts[0]?.id,
      recurrence,
      intervalDays: recurrence === 'CUSTOM_DAYS' ? parseInt(intervalDays, 10) || 30 : undefined,
      nextDueDate,
      endDate: endDate || undefined,
      note: note.trim() || undefined,
      remindDaysBefore: parseInt(remindDaysBefore, 10) || 0,
      autoCreate,
    };

    if (plan) await updatePlan(plan.id, payload);
    else await addRecurringPlan(payload);
    onClose();
  };

  return (
    <ModalShell
      title={
        plan
          ? kind === 'EXPENSE'
            ? t('pl.editPayment')
            : t('pl.editIncome')
          : kind === 'EXPENSE'
          ? t('pl.addPayment')
          : t('pl.addIncome')
      }
      icon={<CalendarClock className="w-5 h-5" />}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {error && <p className="text-[11px] font-bold text-rose-500 text-center">{error}</p>}
          <PrimaryButton onClick={handleSave}>{t('common.save')}</PrimaryButton>

          {plan && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  await materializeRecurringPlan(plan);
                  onClose();
                }}
                className="flex-1 py-2.5 rounded-2xl text-[11px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {t('pl.paid')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await updatePlan(plan.id, {
                    status: plan.status === 'ACTIVE' ? 'CANCELLED' : 'ACTIVE',
                  });
                  onClose();
                }}
                className="flex-1 py-2.5 rounded-2xl text-[11px] font-black text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 flex items-center justify-center gap-1.5"
              >
                {plan.status === 'ACTIVE' ? (
                  <Pause className="w-3.5 h-3.5" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                {plan.status === 'ACTIVE' ? t('pl.pause') : t('pl.resume')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await deletePlan(plan.id);
                  onClose();
                }}
                className="px-4 py-2.5 rounded-2xl text-rose-500 bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      }
    >
      <Field label={t('pl.title')}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === 'EXPENSE' ? t('pl.paymentPlaceholder') : 'Зарплата'}
          className={inputClass}
          autoFocus
        />
      </Field>

      <SegmentedControl<TransactionKind>
        value={kind}
        onChange={(next) => {
          setKind(next);
          setCategoryId('');
        }}
        options={[
          { value: 'EXPENSE', label: t('pl.expenseUpper') },
          { value: 'INCOME', label: t('pl.incomeUpper') },
        ]}
      />

      <Field label={t('pl.provider')} hint={t('pl.optional')}>
        <input
          type="text"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          placeholder={t('pl.providerPlaceholder')}
          className={inputClass}
        />
      </Field>

      <Field label={`${t('common.amount')}, ${currency}`}>
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="4500"
          className={`${inputClass} text-lg font-black`}
        />
      </Field>

      <Field label={t('common.category')}>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className={inputClass}
        >
          <option value="">{t('pl.pickCategory')}</option>
          {relevantCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {categoryName(category, language)}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t('common.account')}>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputClass}>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {accountName(account, language)}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t('pl.frequency')}>
        <select
          value={recurrence}
          onChange={(e) => setRecurrence(e.target.value as RecurrenceKind)}
          className={inputClass}
        >
          <option value="ONCE">{t('pl.once')}</option>
          <option value="WEEKLY">{t('pl.weekly')}</option>
          <option value="MONTHLY">{t('pl.monthly')}</option>
          <option value="QUARTERLY">{t('pl.quarterly')}</option>
          <option value="SEMIANNUAL">{t('pl.semiannual')}</option>
          <option value="YEARLY">{t('pl.yearly')}</option>
          <option value="CUSTOM_DAYS">{t('pl.customDays')}</option>
        </select>
      </Field>

      {recurrence === 'CUSTOM_DAYS' && (
        <Field label={t('pl.intervalDays')}>
          <input
            type="number"
            min={1}
            value={intervalDays}
            onChange={(e) => setIntervalDays(e.target.value)}
            className={inputClass}
          />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label={t('pl.paymentDate')}>
          <input
            type="date"
            value={nextDueDate}
            onChange={(e) => setNextDueDate(e.target.value)}
            className={inputClass}
          />
        </Field>
        {recurrence !== 'ONCE' && (
          <Field label={t('pl.activeUntil')} hint={t('pl.optional')}>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputClass}
            />
          </Field>
        )}
      </div>

      <Field label={t('pl.note')} hint={t('pl.noteHint')}>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('pl.notePlaceholder')}
          className={inputClass}
        />
      </Field>

      <Field label={t('pl.remindBefore')}>
        <div className="flex gap-2">
          {[0, 1, 3, 7].map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setRemindDaysBefore(String(days))}
              className={`flex-1 py-2 rounded-xl text-xs font-black border transition-all ${
                remindDaysBefore === String(days)
                  ? 'bg-sky-500 text-white border-transparent'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
              }`}
            >
              {days === 0 ? t('pl.onTheDay') : days}
            </button>
          ))}
        </div>
      </Field>

      <button
        type="button"
        onClick={() => setAutoCreate((prev) => !prev)}
        className="w-full flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70"
      >
        <span className="text-left flex items-start gap-2">
          <AlarmClock className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
          <span>
            <span className="block text-xs font-black text-slate-700 dark:text-slate-200">
              {t('pl.autoCreate')}
            </span>
            <span className="block text-[10px] text-slate-400 font-medium">
              {t('pl.autoCreateHint')}
            </span>
          </span>
        </span>
        <span
          className={`w-11 h-6 rounded-full flex items-center px-0.5 transition-colors flex-shrink-0 ${
            autoCreate ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
          }`}
        >
          <span
            className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
              autoCreate ? 'translate-x-5' : ''
            }`}
          />
        </span>
      </button>
    </ModalShell>
  );
}
