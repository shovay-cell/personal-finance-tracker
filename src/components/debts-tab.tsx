'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CreditCard,
  FileSignature,
  Landmark,
  Percent,
  Plus,
  Scale,
  Wallet,
} from 'lucide-react';
import {
  CurrencyCode,
  DebtInstallment,
  DebtKind,
  DebtPlan,
  FinanceAccount,
  FinanceCategory,
  FinanceSettings,
  Obligation,
  ObligationSettlement,
  PlannedPayment,
  VatPayment,
  VatSummary,
} from '@/types';
import { addDebtPlan, convertToBase, todayIso } from '@/lib/db';
import { formatDateHuman, formatMoney, monthLabel } from '@/services/analytics';
import { debtsOverview, describeAllDebts, upcomingByMonth } from '@/services/debts';
import { VatCard } from './vat-card';
import { DebtCard } from './debt-card';
import { ObligationsTab } from './obligations-tab';
import { Card, EmptyState, Field, ModalShell, PrimaryButton, SectionTitle, inputClass } from './ui';

type Segment = 'ALL' | 'VAT' | 'CHEQUE' | 'INSTALLMENT' | 'TAX' | 'LOAN';

interface DebtsTabProps {
  settings: FinanceSettings;
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  obligations: Obligation[];
  settlements: ObligationSettlement[];
  debts: DebtPlan[];
  installments: DebtInstallment[];
  plannedPayments: PlannedPayment[];
  vatSummary?: VatSummary;
  vatPayments: VatPayment[];
}

/**
 * One place for everything owed: VAT, bearer cheques, instalment purchases,
 * taxes and loans — plus the timeline of what is due month by month.
 */
export function DebtsTab({
  settings,
  categories,
  accounts,
  obligations,
  settlements,
  debts,
  installments,
  plannedPayments,
  vatSummary,
  vatPayments,
}: DebtsTabProps) {
  const [segment, setSegment] = useState<Segment>('ALL');
  const [creatingKind, setCreatingKind] = useState<DebtKind | null>(null);

  const baseCurrency = settings.baseCurrency;
  const toBase = (amount: number, currency: CurrencyCode) =>
    convertToBase(amount, currency, settings).baseAmount;

  const overview = useMemo(
    () => debtsOverview({ vatSummary, obligations, settlements, debts, installments, toBase }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vatSummary, obligations, settlements, debts, installments, settings]
  );

  const upcoming = useMemo(
    () =>
      upcomingByMonth({
        debts,
        installments,
        obligations,
        settlements,
        plannedPayments,
        months: 3,
        toBase,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [debts, installments, obligations, settlements, plannedPayments, settings]
  );

  const described = useMemo(() => describeAllDebts(debts, installments), [debts, installments]);
  const ofKind = (kind: DebtKind) => described.filter((row) => row.debt.kind === kind);

  const tiles: { id: Segment; label: string; amount: number; icon: React.ReactNode; color: string }[] = [
    { id: 'VAT', label: 'НДС', amount: overview.vat, icon: <Percent className="w-3.5 h-3.5" />, color: '#F59E0B' },
    { id: 'CHEQUE', label: 'Чеки', amount: overview.cheques, icon: <FileSignature className="w-3.5 h-3.5" />, color: '#A855F7' },
    { id: 'INSTALLMENT', label: 'Рассрочка', amount: overview.installments, icon: <CreditCard className="w-3.5 h-3.5" />, color: '#8B5CF6' },
    { id: 'TAX', label: 'Налоги', amount: overview.taxes, icon: <Landmark className="w-3.5 h-3.5" />, color: '#F97316' },
    { id: 'LOAN', label: 'Кредиты', amount: overview.loans, icon: <Wallet className="w-3.5 h-3.5" />, color: '#0EA5E9' },
  ];

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
              Всего обязательств
            </p>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
              {formatMoney(overview.total, baseCurrency)}
            </p>
          </div>
          <span className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center flex-shrink-0">
            <Scale className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {tiles.map((tile) => (
            <button
              key={tile.id}
              type="button"
              onClick={() => setSegment(tile.id)}
              className={`rounded-2xl p-2.5 text-left transition-all ${
                segment === tile.id
                  ? 'ring-2 ring-offset-1 dark:ring-offset-slate-900'
                  : 'bg-slate-50 dark:bg-slate-800/60'
              }`}
              style={
                segment === tile.id
                  ? ({
                      backgroundColor: `${tile.color}1A`,
                      '--tw-ring-color': tile.color,
                    } as React.CSSProperties)
                  : undefined
              }
            >
              <span
                className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide"
                style={{ color: tile.color }}
              >
                {tile.icon}
                {tile.label}
              </span>
              <span className="block text-xs font-black text-slate-700 dark:text-slate-200 tabular-nums mt-0.5">
                {formatMoney(tile.amount, baseCurrency, { compact: true })}
              </span>
            </button>
          ))}

          <button
            type="button"
            onClick={() => setSegment('ALL')}
            className={`rounded-2xl p-2.5 text-left transition-all ${
              segment === 'ALL'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'bg-slate-50 dark:bg-slate-800/60 text-slate-500'
            }`}
          >
            <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide">
              <CalendarClock className="w-3.5 h-3.5" />
              Всё
            </span>
            <span className="block text-xs font-black tabular-nums mt-0.5">по месяцам</span>
          </button>
        </div>
      </Card>

      {segment === 'ALL' && (
        <>
          <div>
            <SectionTitle title="Предстоящие платежи по месяцам" />
            {upcoming.length === 0 ? (
              <EmptyState
                icon={<CalendarClock className="w-7 h-7" />}
                title="Предстоящих платежей нет"
                description="Здесь появятся платежи по рассрочкам, чекам с датой закрытия и регулярным списаниям на ближайшие три месяца."
              />
            ) : (
              <div className="space-y-3">
                {upcoming.map((month) => (
                  <Card key={month.month} className="p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-800 dark:text-slate-100">
                        {monthLabel(month.month)}
                      </span>
                      <span className="text-xs font-black text-slate-900 dark:text-slate-100 tabular-nums">
                        {formatMoney(month.total, baseCurrency)}
                      </span>
                    </div>

                    <div className="space-y-1">
                      {month.items.map((item) => (
                        <div key={item.id} className="flex items-center gap-2 text-[10.5px]">
                          <span
                            className={`font-bold w-14 flex-shrink-0 ${
                              item.isOverdue ? 'text-rose-500' : 'text-slate-400'
                            }`}
                          >
                            {formatDateHuman(item.date)}
                          </span>
                          <span className="flex-1 truncate text-slate-600 dark:text-slate-300 font-bold">
                            {item.title}
                          </span>
                          {item.isOverdue && (
                            <AlertTriangle className="w-3 h-3 text-rose-500 flex-shrink-0" />
                          )}
                          <span className="font-black text-slate-700 dark:text-slate-200 tabular-nums flex-shrink-0">
                            {formatMoney(item.amount, baseCurrency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {vatSummary && vatSummary.outstanding > 0 && (
            <div>
              <SectionTitle title="НДС к выплате" />
              <VatCard
                summary={vatSummary}
                payments={vatPayments}
                currency={baseCurrency}
                accounts={accounts}
                categories={categories}
              />
            </div>
          )}
        </>
      )}

      {segment === 'VAT' &&
        (vatSummary ? (
          <VatCard
            summary={vatSummary}
            payments={vatPayments}
            currency={baseCurrency}
            accounts={accounts}
            categories={categories}
          />
        ) : (
          <EmptyState
            icon={<Percent className="w-7 h-7" />}
            title="НДС не отделяется"
            description="Включите отделение НДС в настройках — налог будет вычитаться из дохода и попадать сюда как обязательство."
          />
        ))}

      {segment === 'CHEQUE' && (
        <ObligationsTab
          obligations={obligations}
          settlements={settlements}
          categories={categories}
          accounts={accounts}
          baseCurrency={baseCurrency}
          vatPayments={[]}
        />
      )}

      {(segment === 'INSTALLMENT' || segment === 'TAX' || segment === 'LOAN') && (
        <DebtList
          kind={segment}
          rows={ofKind(segment)}
          currency={baseCurrency}
          onCreate={() => setCreatingKind(segment)}
        />
      )}

      {creatingKind && (
        <DebtFormModal
          kind={creatingKind}
          categories={categories}
          accounts={accounts}
          baseCurrency={baseCurrency}
          onClose={() => setCreatingKind(null)}
        />
      )}
    </div>
  );
}

function DebtList({
  kind,
  rows,
  currency,
  onCreate,
}: {
  kind: DebtKind;
  rows: ReturnType<typeof describeAllDebts>;
  currency: CurrencyCode;
  onCreate: () => void;
}) {
  const meta = {
    INSTALLMENT: {
      title: 'Покупки в рассрочку',
      empty: 'Рассрочек нет',
      hint: 'Рассрочка создаётся в форме расхода: включите «Покупка в рассрочку», укажите количество платежей — и график появится здесь.',
      add: 'Добавить рассрочку вручную',
    },
    TAX: {
      title: 'Налоги',
      empty: 'Налоговых обязательств нет',
      hint: 'Добавьте начисленный налог с датой или графиком платежей — он попадёт в прогноз и в календарь списаний.',
      add: 'Добавить налог',
    },
    LOAN: {
      title: 'Долги и кредиты',
      empty: 'Кредитов нет',
      hint: 'Добавьте кредит или долг с графиком выплат — остаток и ближайший платёж будут на виду.',
      add: 'Добавить кредит',
    },
  }[kind];

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onCreate}
        className="w-full py-3 rounded-2xl bg-gradient-to-tr from-violet-500 to-fuchsia-400 text-white text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-violet-500/25 active:scale-[0.98] transition-transform"
      >
        <Plus className="w-4 h-4" />
        {meta.add}
      </button>

      {rows.length === 0 ? (
        <EmptyState icon={<CreditCard className="w-7 h-7" />} title={meta.empty} description={meta.hint} />
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <DebtCard key={row.debt.id} row={row} currency={currency} />
          ))}
        </div>
      )}
    </div>
  );
}

function DebtFormModal({
  kind,
  categories,
  accounts,
  baseCurrency,
  onClose,
}: {
  kind: DebtKind;
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  baseCurrency: CurrencyCode;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('cat-fees');
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [startDate, setStartDate] = useState(todayIso());
  const [paymentsCount, setPaymentsCount] = useState(kind === 'TAX' ? '1' : '6');
  const [intervalCount, setIntervalCount] = useState('1');
  const [firstPaid, setFirstPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expenseCategories = categories.filter((c) => c.kind === 'EXPENSE' && !c.parentId && !c.isHidden);

  const handleSave = async () => {
    const total = parseFloat(amount.replace(',', '.'));
    if (!title.trim()) return setError('Укажите название');
    if (!Number.isFinite(total) || total <= 0) return setError('Укажите сумму');

    await addDebtPlan({
      kind,
      title: title.trim(),
      totalAmount: total,
      currency: baseCurrency,
      categoryId: categoryId || expenseCategories[0]?.id || '',
      accountId: accountId || accounts[0]?.id,
      startDate,
      paymentsCount: Math.max(1, parseInt(paymentsCount, 10) || 1),
      intervalUnit: 'MONTH',
      intervalCount: Math.max(1, parseInt(intervalCount, 10) || 1),
      firstPaymentPaid: firstPaid,
    });
    onClose();
  };

  const label = kind === 'TAX' ? 'налог' : kind === 'LOAN' ? 'кредит' : 'рассрочку';

  return (
    <ModalShell
      title={`Добавить ${label}`}
      icon={<Scale className="w-5 h-5" />}
      onClose={onClose}
      maxWidthClass="max-w-md"
      footer={
        <div className="space-y-2">
          {error && <p className="text-[11px] font-bold text-rose-500 text-center">{error}</p>}
          <PrimaryButton onClick={handleSave}>Создать обязательство</PrimaryButton>
        </div>
      }
    >
      <Field label="Название">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === 'TAX' ? 'Налог на прибыль' : kind === 'LOAN' ? 'Кредит на авто' : 'Техника'}
          className={inputClass}
          autoFocus
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={`Сумма, ${baseCurrency}`}>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputClass} text-lg font-black`}
          />
        </Field>
        <Field label="Дата начала">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Количество платежей">
          <input
            type="number"
            min={1}
            value={paymentsCount}
            onChange={(e) => setPaymentsCount(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Каждые N месяцев">
          <input
            type="number"
            min={1}
            value={intervalCount}
            onChange={(e) => setIntervalCount(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Категория расхода">
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
          {expenseCategories.map((category) => (
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

      <button
        type="button"
        onClick={() => setFirstPaid((prev) => !prev)}
        className="w-full flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 text-left"
      >
        <span>
          <span className="block text-xs font-black text-slate-700 dark:text-slate-200">
            Первый платёж оплачен сейчас
          </span>
          <span className="block text-[10px] text-slate-400 font-medium">
            Он сразу уйдёт в расходы, остальное останется долгом
          </span>
        </span>
        <span
          className={`w-11 h-6 rounded-full flex items-center px-0.5 transition-colors flex-shrink-0 ${
            firstPaid ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
          }`}
        >
          <span
            className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
              firstPaid ? 'translate-x-5' : ''
            }`}
          />
        </span>
      </button>
    </ModalShell>
  );
}
