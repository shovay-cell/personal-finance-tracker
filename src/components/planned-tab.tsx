'use client';

import React, { useMemo, useState } from 'react';
import {
  AlarmClock,
  CalendarClock,
  CheckCircle2,
  Pause,
  Play,
  Plus,
  Repeat,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import {
  CurrencyCode,
  FinanceAccount,
  FinanceCategory,
  FinanceSettings,
  Plan,
  PlanType,
  RecurrenceKind,
  TransactionKind,
} from '@/types';
import {
  addRecurringPlan,
  convertToBase,
  currentMonth,
  todayIso,
  deletePlan,
  updatePlan,
} from '@/lib/db';
import { describeRecurrence, materializeRecurringPlan, planState, recurringTotals } from '@/services/planned';
import { formatDateHuman, formatMoney } from '@/services/analytics';
import { paymentCalendar } from '@/services/forecast';
import {
  getCategoryIcon,
  INVESTMENT_CATEGORY_ID,
  SUBSCRIPTION_CATEGORY_ID,
} from '@/constants/categories';
import { PaymentCalendar } from './payment-calendar';
import { useT } from '@/i18n/context';
import type { TranslationKey } from '@/i18n/dictionary';
import { accountName, categoryName } from '@/i18n/categories';
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
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  settings: FinanceSettings;
  autoCreateDefault: boolean;
}

/** The three RECURRING plan types this tab shows; each carries translation
 *  keys, so the wording follows the language. */
type RecurringPlanType = 'PAYMENT' | 'SUBSCRIPTION' | 'INVESTMENT';

const PLAN_KIND_META: Record<
  RecurringPlanType,
  {
    label: TranslationKey;
    addLabel: TranslationKey;
    emptyTitle: TranslationKey;
    emptyText: TranslationKey;
    defaultCategoryId?: string;
  }
> = {
  PAYMENT: {
    label: 'plans.payments',
    addLabel: 'pl.addPayment',
    emptyTitle: 'pl.emptyPayments',
    emptyText: 'pl.emptyPaymentsText',
  },
  SUBSCRIPTION: {
    label: 'plans.subscriptions',
    addLabel: 'pl.addSubscription',
    emptyTitle: 'pl.emptySubscriptions',
    emptyText: 'pl.emptySubscriptionsText',
    defaultCategoryId: SUBSCRIPTION_CATEGORY_ID,
  },
  INVESTMENT: {
    label: 'plans.investments',
    addLabel: 'pl.addInvestment',
    emptyTitle: 'pl.emptyInvestments',
    emptyText: 'pl.emptyInvestmentsText',
    defaultCategoryId: INVESTMENT_CATEGORY_ID,
  },
};

export function PlannedTab({ plans, categories, accounts, settings, autoCreateDefault }: PlannedTabProps) {
  const [planType, setPlanType] = useState<RecurringPlanType>('PAYMENT');
  const [editing, setEditing] = useState<Plan | 'NEW' | null>(null);
  const { t } = useT();

  const baseCurrency = settings.baseCurrency;
  const meta = PLAN_KIND_META[planType];

  const recurringPlans = useMemo(() => plans.filter((p) => p.scheduleType === 'RECURRING'), [plans]);

  const ofKind = useMemo(
    () => recurringPlans.filter((p) => (p.planType || 'PAYMENT') === planType),
    [recurringPlans, planType]
  );

  const states = useMemo(
    () =>
      ofKind
        .map((plan) => planState(plan))
        .sort((a, b) => (a.plan.nextDueDate || '').localeCompare(b.plan.nextDueDate || '')),
    [ofKind]
  );

  const totals = useMemo(
    () =>
      recurringTotals(recurringPlans, planType, (amount, currency) =>
        convertToBase(amount, currency, settings).baseAmount
      ),
    [recurringPlans, planType, settings]
  );

  // Every scheduled charge of the month, whatever section it belongs to — a cash
  // gap does not care whether it was rent or Netflix.
  const calendarDays = useMemo(
    () =>
      paymentCalendar({
        month: currentMonth(),
        plans: recurringPlans,
        transactions: [],
        today: todayIso(),
        toBase: (amount, currency) => convertToBase(amount, currency, settings).baseAmount,
      }),
    [recurringPlans, settings]
  );

  const overdue = states.filter((s) => s.plan.status === 'ACTIVE' && s.isOverdue);
  const upcoming = states.filter((s) => s.plan.status === 'ACTIVE' && !s.isOverdue);
  const inactive = states.filter((s) => s.plan.status !== 'ACTIVE');

  return (
    <div className="space-y-4">
      <SegmentedControl<RecurringPlanType>
        value={planType}
        onChange={setPlanType}
        options={[
          { value: 'PAYMENT', label: t('plans.payments') },
          { value: 'SUBSCRIPTION', label: t('plans.subscriptions') },
          { value: 'INVESTMENT', label: t('plans.investments') },
        ]}
      />

      {planType === 'PAYMENT' && (
        <PaymentCalendar days={calendarDays} month={currentMonth()} currency={baseCurrency} />
      )}

      {totals.rows.length > 0 && (
        <Card className="p-4 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
            {planType === 'INVESTMENT' ? t('plans.saving') : t('plans.fixedCosts')}
          </p>
          <div className="flex items-end gap-3">
            <div>
              <p className="text-2xl font-black text-slate-900 dark:text-slate-100 tabular-nums leading-tight">
                {formatMoney(totals.monthly, baseCurrency)}
              </p>
              <p className="text-[10px] font-bold text-slate-400">{t('pl.perMonth')}</p>
            </div>
            <div className="pb-0.5">
              <p className="text-sm font-black text-slate-500 dark:text-slate-400 tabular-nums leading-tight">
                {formatMoney(totals.yearly, baseCurrency)}
              </p>
              <p className="text-[10px] font-bold text-slate-400">{t('pl.perYear')}</p>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 font-medium">
            {totals.rows.length} {t('pl.activeHint')}
          </p>
        </Card>
      )}

      <button
        type="button"
        onClick={() => setEditing('NEW')}
        className="w-full py-3 rounded-2xl bg-gradient-to-tr from-sky-500 to-cyan-400 text-white text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-sky-500/25 active:scale-[0.98] transition-transform"
      >
        <Plus className="w-4 h-4" />
        {t(meta.addLabel)}
      </button>

      {overdue.length > 0 && (
        <div>
          <SectionTitle title={`${t('pl.overdue')} · ${overdue.length}`} />
          <div className="space-y-2">
            {overdue.map((state) => (
              <PlannedRow
                key={state.plan.id}
                plan={state.plan}
                categories={categories}
                baseCurrency={baseCurrency}
                settings={settings}
                daysUntilDue={state.daysUntilDue}
                isOverdue
                onEdit={() => setEditing(state.plan)}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <SectionTitle title={planType === 'PAYMENT' ? t('plans.upcoming') : t('plans.active')} />
        {upcoming.length === 0 && overdue.length === 0 ? (
          <EmptyState
            icon={
              planType === 'SUBSCRIPTION' ? (
                <Repeat className="w-7 h-7" />
              ) : planType === 'INVESTMENT' ? (
                <TrendingUp className="w-7 h-7" />
              ) : (
                <CalendarClock className="w-7 h-7" />
              )
            }
            title={t(meta.emptyTitle)}
            description={t(meta.emptyText)}
          />
        ) : (
          <div className="space-y-2">
            {upcoming.map((state) => (
              <PlannedRow
                key={state.plan.id}
                plan={state.plan}
                categories={categories}
                baseCurrency={baseCurrency}
                settings={settings}
                daysUntilDue={state.daysUntilDue}
                onEdit={() => setEditing(state.plan)}
              />
            ))}
          </div>
        )}
      </div>

      {inactive.length > 0 && (
        <div>
          <SectionTitle title={t('pl.finished')} />
          <div className="space-y-2 opacity-60">
            {inactive.map((state) => (
              <PlannedRow
                key={state.plan.id}
                plan={state.plan}
                categories={categories}
                baseCurrency={baseCurrency}
                settings={settings}
                daysUntilDue={state.daysUntilDue}
                onEdit={() => setEditing(state.plan)}
              />
            ))}
          </div>
        </div>
      )}

      {editing && (
        <PlannedPaymentModal
          plan={editing === 'NEW' ? null : editing}
          planType={editing === 'NEW' ? planType : ((editing.planType as RecurringPlanType) || 'PAYMENT')}
          categories={categories}
          accounts={accounts}
          baseCurrency={baseCurrency}
          autoCreateDefault={autoCreateDefault}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function PlannedRow({
  plan,
  categories,
  baseCurrency,
  settings,
  daysUntilDue,
  isOverdue,
  onEdit,
}: {
  plan: Plan;
  categories: FinanceCategory[];
  baseCurrency: CurrencyCode;
  settings: FinanceSettings;
  daysUntilDue: number;
  isOverdue?: boolean;
  onEdit: () => void;
}) {
  const { t } = useT();
  const category = categories.find((c) => c.id === plan.categoryId);
  const Icon = getCategoryIcon(category?.iconName || 'CalendarClock');
  const isRecurring = plan.recurrence !== 'ONCE';

  // Only long billing periods need the "≈ per month" hint — a monthly plan
  // already shows its monthly cost in the amount itself.
  const showsMonthlyHint =
    isRecurring && plan.recurrence !== 'MONTHLY' && plan.recurrence !== 'WEEKLY';
  const monthlyBase = showsMonthlyHint
    ? convertToBase(
        plan.recurrence === 'QUARTERLY'
          ? plan.amount / 3
          : plan.recurrence === 'SEMIANNUAL'
          ? plan.amount / 6
          : plan.recurrence === 'YEARLY'
          ? plan.amount / 12
          : (plan.amount * 30.44) / Math.max(1, plan.intervalDays || 30),
        plan.currency,
        settings
      ).baseAmount
    : 0;

  return (
    <Card
      className={`p-3.5 flex items-center gap-3 ${
        isOverdue ? 'border-rose-200 dark:border-rose-900 bg-rose-50/60 dark:bg-rose-950/20' : ''
      }`}
      onClick={onEdit}
    >
      <span
        className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
        style={{
          backgroundColor: `${category?.colorHex || '#0EA5E9'}1F`,
          color: category?.colorHex || '#0EA5E9',
        }}
      >
        <Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
          {plan.title}
        </p>
        <p className="text-[10.5px] text-slate-400 font-medium truncate">
          {[plan.provider, describeRecurrence(plan), formatDateHuman(plan.nextDueDate || '')]
            .filter(Boolean)
            .join(' · ')}
          {plan.autoCreate ? ` · ${t('pl.auto')}` : ''}
        </p>
        {plan.note && (
          <p className="text-[10.5px] text-slate-500 dark:text-slate-400 font-medium truncate">
            {plan.note}
          </p>
        )}
      </div>

      <div className="text-right flex-shrink-0">
        <p
          className={`text-xs font-black tabular-nums ${
            plan.kind === 'INCOME'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-900 dark:text-slate-100'
          }`}
        >
          {plan.kind === 'EXPENSE' ? '−' : '+'}
          {formatMoney(plan.amount, plan.currency)}
        </p>
        {showsMonthlyHint ? (
          <p className="text-[10px] font-bold text-slate-400 tabular-nums">
            ≈ {formatMoney(monthlyBase, baseCurrency)}/{t('pl.perMonthShort')}
          </p>
        ) : (
          <p
            className={`text-[10px] font-black ${
              isOverdue
                ? 'text-rose-500'
                : daysUntilDue <= (plan.remindDaysBefore ?? 0)
                ? 'text-amber-500'
                : 'text-slate-400'
            }`}
          >
            {isOverdue
              ? `${t('pl.overdueBy')} ${Math.abs(daysUntilDue)} ${t('pl.daysShort')}`
              : daysUntilDue === 0
              ? t('pl.dueToday')
              : `${t('pl.inDays')} ${daysUntilDue} ${t('pl.daysShort')}`}
          </p>
        )}
      </div>
    </Card>
  );
}

function PlannedPaymentModal({
  plan,
  planType,
  categories,
  accounts,
  baseCurrency,
  autoCreateDefault,
  onClose,
}: {
  plan: Plan | null;
  planType: RecurringPlanType;
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  baseCurrency: CurrencyCode;
  autoCreateDefault: boolean;
  onClose: () => void;
}) {
  const { t, language } = useT();
  const meta = PLAN_KIND_META[planType];
  const isPayment = planType === 'PAYMENT';

  const [title, setTitle] = useState(plan?.title || '');
  const [provider, setProvider] = useState(plan?.provider || '');
  const [kind, setKind] = useState<TransactionKind>(plan?.kind || 'EXPENSE');
  const [amount, setAmount] = useState(plan ? String(plan.amount) : '');
  const [categoryId, setCategoryId] = useState(
    plan?.categoryId ||
      (meta.defaultCategoryId && categories.some((c) => c.id === meta.defaultCategoryId)
        ? meta.defaultCategoryId
        : '')
  );
  const [accountId, setAccountId] = useState(plan?.accountId || accounts[0]?.id || '');
  const [recurrence, setRecurrence] = useState<RecurrenceKind>(
    plan?.recurrence || (isPayment ? 'MONTHLY' : 'MONTHLY')
  );
  const [intervalDays, setIntervalDays] = useState(String(plan?.intervalDays || 30));
  const [nextDueDate, setNextDueDate] = useState(plan?.nextDueDate || todayIso());
  const [endDate, setEndDate] = useState(plan?.endDate || '');
  const [note, setNote] = useState(plan?.note || '');
  const [remindDaysBefore, setRemindDaysBefore] = useState(String(plan?.remindDaysBefore ?? 3));
  const [autoCreate, setAutoCreate] = useState(plan?.autoCreate ?? autoCreateDefault);
  const [error, setError] = useState<string | null>(null);

  // The plan books an operation in the profile's base currency; a different
  // currency stays only on entries created before it was switched.
  const currency: CurrencyCode = plan?.currency || baseCurrency;
  const relevantCategories = categories.filter((c) => c.kind === kind && !c.parentId && !c.isHidden);

  const handleSave = async () => {
    const numericAmount = parseFloat(amount.replace(',', '.'));
    if (!title.trim()) return setError(t('pl.enterTitle'));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return setError(t('pl.enterAmount'));
    if (!categoryId) return setError(t('pl.pickCategory'));

    const payload = {
      planType: planType as PlanType,
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
      title={t(plan ? meta.label : meta.addLabel)}
      subtitle={
        planType === 'SUBSCRIPTION'
          ? t('pl.subscriptionSub')
          : planType === 'INVESTMENT'
          ? t('pl.investmentSub')
          : undefined
      }
      icon={
        planType === 'SUBSCRIPTION' ? (
          <Repeat className="w-5 h-5" />
        ) : planType === 'INVESTMENT' ? (
          <TrendingUp className="w-5 h-5" />
        ) : (
          <CalendarClock className="w-5 h-5" />
        )
      }
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
                {planType === 'INVESTMENT' ? t('pl.invested') : t('pl.paid')}
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
      <Field label={planType === 'SUBSCRIPTION' ? t('pl.service') : t('pl.title')}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            planType === 'SUBSCRIPTION'
              ? 'Netflix'
              : planType === 'INVESTMENT'
              ? t('pl.investmentPlaceholder')
              : t('pl.paymentPlaceholder')
          }
          className={inputClass}
          autoFocus
        />
      </Field>

      {planType !== 'PAYMENT' && (
        <Field
          label={planType === 'INVESTMENT' ? t('pl.broker') : t('pl.provider')}
          hint={t('pl.optional')}
        >
          <input
            type="text"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            placeholder={
              planType === 'INVESTMENT' ? 'Interactive Brokers' : t('pl.providerPlaceholder')
            }
            className={inputClass}
          />
        </Field>
      )}

      {isPayment && (
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
      )}

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

      <Field label={planType === 'INVESTMENT' ? t('pl.debitAccount') : t('common.account')}>
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
          {isPayment && <option value="ONCE">{t('pl.once')}</option>}
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
        <Field label={planType === 'PAYMENT' ? t('pl.paymentDate') : t('pl.nextCharge')}>
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
