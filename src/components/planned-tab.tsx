'use client';

import React, { useMemo, useState } from 'react';
import {
  AlarmClock,
  CalendarClock,
  CheckCircle2,
  Pause,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  CurrencyCode,
  FinanceAccount,
  FinanceCategory,
  PlannedPayment,
  RecurrenceKind,
  TransactionKind,
} from '@/types';
import {
  addPlannedPayment,
  deletePlannedPayment,
  todayIso,
  updatePlannedPayment,
} from '@/lib/db';
import {
  describeRecurrence,
  materializePlannedPayment,
  plannedPaymentState,
} from '@/services/planned';
import { formatDateHuman, formatMoney } from '@/services/analytics';
import { getCategoryIcon } from '@/constants/categories';
import {
  Card,
  CurrencySelector,
  EmptyState,
  Field,
  ModalShell,
  PrimaryButton,
  SectionTitle,
  SegmentedControl,
  inputClass,
} from './ui';

interface PlannedTabProps {
  plannedPayments: PlannedPayment[];
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  baseCurrency: CurrencyCode;
  autoCreateDefault: boolean;
}

export function PlannedTab({
  plannedPayments,
  categories,
  accounts,
  baseCurrency,
  autoCreateDefault,
}: PlannedTabProps) {
  const [editing, setEditing] = useState<PlannedPayment | 'NEW' | null>(null);

  const states = useMemo(
    () =>
      plannedPayments
        .map((payment) => plannedPaymentState(payment))
        .sort((a, b) => a.payment.nextDueDate.localeCompare(b.payment.nextDueDate)),
    [plannedPayments]
  );

  const overdue = states.filter((s) => s.payment.isActive && s.isOverdue);
  const upcoming = states.filter((s) => s.payment.isActive && !s.isOverdue);
  const inactive = states.filter((s) => !s.payment.isActive);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setEditing('NEW')}
        className="w-full py-3 rounded-2xl bg-gradient-to-tr from-sky-500 to-cyan-400 text-white text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-sky-500/25 active:scale-[0.98] transition-transform"
      >
        <Plus className="w-4 h-4" />
        Новый плановый платёж
      </button>

      {overdue.length > 0 && (
        <div>
          <SectionTitle title={`Просрочено · ${overdue.length}`} />
          <div className="space-y-2">
            {overdue.map((state) => (
              <PlannedRow
                key={state.payment.id}
                payment={state.payment}
                categories={categories}
                daysUntilDue={state.daysUntilDue}
                isOverdue
                onEdit={() => setEditing(state.payment)}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <SectionTitle title="Предстоящие" />
        {upcoming.length === 0 && overdue.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="w-7 h-7" />}
            title="Плановых платежей нет"
            description="Добавьте регулярную аренду, страховку или подписку — приложение напомнит заранее и создаст операцию в день платежа."
          />
        ) : (
          <div className="space-y-2">
            {upcoming.map((state) => (
              <PlannedRow
                key={state.payment.id}
                payment={state.payment}
                categories={categories}
                daysUntilDue={state.daysUntilDue}
                onEdit={() => setEditing(state.payment)}
              />
            ))}
          </div>
        )}
      </div>

      {inactive.length > 0 && (
        <div>
          <SectionTitle title="Завершённые и приостановленные" />
          <div className="space-y-2 opacity-60">
            {inactive.map((state) => (
              <PlannedRow
                key={state.payment.id}
                payment={state.payment}
                categories={categories}
                daysUntilDue={state.daysUntilDue}
                onEdit={() => setEditing(state.payment)}
              />
            ))}
          </div>
        </div>
      )}

      {editing && (
        <PlannedPaymentModal
          payment={editing === 'NEW' ? null : editing}
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
  payment,
  categories,
  daysUntilDue,
  isOverdue,
  onEdit,
}: {
  payment: PlannedPayment;
  categories: FinanceCategory[];
  daysUntilDue: number;
  isOverdue?: boolean;
  onEdit: () => void;
}) {
  const category = categories.find((c) => c.id === payment.categoryId);
  const Icon = getCategoryIcon(category?.iconName || 'CalendarClock');

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
          {payment.title}
        </p>
        <p className="text-[10.5px] text-slate-400 font-medium truncate">
          {describeRecurrence(payment)} · {formatDateHuman(payment.nextDueDate)}
          {payment.autoCreate ? ' · авто' : ''}
        </p>
      </div>

      <div className="text-right flex-shrink-0">
        <p
          className={`text-xs font-black tabular-nums ${
            payment.kind === 'INCOME'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-900 dark:text-slate-100'
          }`}
        >
          {payment.kind === 'EXPENSE' ? '−' : '+'}
          {formatMoney(payment.amount, payment.currency)}
        </p>
        <p
          className={`text-[10px] font-black ${
            isOverdue ? 'text-rose-500' : daysUntilDue <= payment.remindDaysBefore ? 'text-amber-500' : 'text-slate-400'
          }`}
        >
          {isOverdue
            ? `просрочен на ${Math.abs(daysUntilDue)} дн.`
            : daysUntilDue === 0
            ? 'сегодня'
            : `через ${daysUntilDue} дн.`}
        </p>
      </div>
    </Card>
  );
}

function PlannedPaymentModal({
  payment,
  categories,
  accounts,
  baseCurrency,
  autoCreateDefault,
  onClose,
}: {
  payment: PlannedPayment | null;
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  baseCurrency: CurrencyCode;
  autoCreateDefault: boolean;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(payment?.title || '');
  const [kind, setKind] = useState<TransactionKind>(payment?.kind || 'EXPENSE');
  const [amount, setAmount] = useState(payment ? String(payment.amount) : '');
  const [currency, setCurrency] = useState<CurrencyCode>(payment?.currency || baseCurrency);
  const [categoryId, setCategoryId] = useState(payment?.categoryId || '');
  const [accountId, setAccountId] = useState(payment?.accountId || accounts[0]?.id || '');
  const [recurrence, setRecurrence] = useState<RecurrenceKind>(payment?.recurrence || 'MONTHLY');
  const [intervalDays, setIntervalDays] = useState(String(payment?.intervalDays || 30));
  const [nextDueDate, setNextDueDate] = useState(payment?.nextDueDate || todayIso());
  const [endDate, setEndDate] = useState(payment?.endDate || '');
  const [remindDaysBefore, setRemindDaysBefore] = useState(String(payment?.remindDaysBefore ?? 3));
  const [autoCreate, setAutoCreate] = useState(payment?.autoCreate ?? autoCreateDefault);
  const [error, setError] = useState<string | null>(null);

  const relevantCategories = categories.filter((c) => c.kind === kind && !c.parentId && !c.isHidden);

  const handleSave = async () => {
    const numericAmount = parseFloat(amount.replace(',', '.'));
    if (!title.trim()) return setError('Укажите название платежа');
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return setError('Укажите сумму');
    if (!categoryId) return setError('Выберите категорию');

    const payload = {
      title: title.trim(),
      kind,
      amount: numericAmount,
      currency,
      categoryId,
      accountId: accountId || accounts[0]?.id,
      recurrence,
      intervalDays: recurrence === 'CUSTOM_DAYS' ? parseInt(intervalDays, 10) || 30 : undefined,
      nextDueDate,
      endDate: endDate || undefined,
      remindDaysBefore: parseInt(remindDaysBefore, 10) || 0,
      autoCreate,
      isActive: payment?.isActive ?? true,
      lastRunDate: payment?.lastRunDate,
    };

    if (payment) await updatePlannedPayment(payment.id, payload);
    else await addPlannedPayment(payload);
    onClose();
  };

  return (
    <ModalShell
      title={payment ? 'Плановый платёж' : 'Новый плановый платёж'}
      icon={<CalendarClock className="w-5 h-5" />}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {error && <p className="text-[11px] font-bold text-rose-500 text-center">{error}</p>}
          <PrimaryButton onClick={handleSave}>Сохранить</PrimaryButton>

          {payment && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  await materializePlannedPayment(payment);
                  onClose();
                }}
                className="flex-1 py-2.5 rounded-2xl text-[11px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Оплачен
              </button>
              <button
                type="button"
                onClick={async () => {
                  await updatePlannedPayment(payment.id, { isActive: !payment.isActive });
                  onClose();
                }}
                className="flex-1 py-2.5 rounded-2xl text-[11px] font-black text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 flex items-center justify-center gap-1.5"
              >
                {payment.isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {payment.isActive ? 'Пауза' : 'Возобновить'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await deletePlannedPayment(payment.id);
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
      <Field label="Название">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Аренда квартиры"
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
          { value: 'EXPENSE', label: 'РАСХОД' },
          { value: 'INCOME', label: 'ДОХОД' },
        ]}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Сумма">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="4500"
            className={`${inputClass} text-lg font-black`}
          />
        </Field>
        <Field label="Валюта">
          <CurrencySelector value={currency} onChange={setCurrency} />
        </Field>
      </div>

      <Field label="Категория">
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className={inputClass}
        >
          <option value="">Выберите категорию</option>
          {relevantCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Счёт списания">
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputClass}>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Периодичность">
        <select
          value={recurrence}
          onChange={(e) => setRecurrence(e.target.value as RecurrenceKind)}
          className={inputClass}
        >
          <option value="ONCE">Разовый</option>
          <option value="WEEKLY">Еженедельно</option>
          <option value="MONTHLY">Ежемесячно</option>
          <option value="YEARLY">Ежегодно</option>
          <option value="CUSTOM_DAYS">Произвольный интервал</option>
        </select>
      </Field>

      {recurrence === 'CUSTOM_DAYS' && (
        <Field label="Интервал, дней">
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
        <Field label="Дата платежа">
          <input
            type="date"
            value={nextDueDate}
            onChange={(e) => setNextDueDate(e.target.value)}
            className={inputClass}
          />
        </Field>
        {recurrence !== 'ONCE' && (
          <Field label="Активен до" hint="Необязательно">
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputClass}
            />
          </Field>
        )}
      </div>

      <Field label="Напомнить за (дней)">
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
              {days === 0 ? 'В день' : days}
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
              Создавать операцию автоматически
            </span>
            <span className="block text-[10px] text-slate-400 font-medium">
              Иначе приложение спросит подтверждение в день платежа
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
