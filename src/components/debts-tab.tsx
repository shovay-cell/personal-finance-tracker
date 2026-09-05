'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  Check,
  CircleDashed,
  CreditCard,
  FileSignature,
  Landmark,
  Layers,
  Pencil,
  Percent,
  Scale,
  Wallet,
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
  PlanType,
  VatPayment,
  VatSummary,
} from '@/types';
import {
  cancelBearerCheque,
  cancelBearerChequeSeries,
  clearBearerCheque,
  convertToBase,
  deleteBearerCheque,
  todayIso,
  updateBearerCheque,
  updateBearerChequeSeries,
} from '@/lib/db';
import { formatDateHuman, formatMoney, monthLabel } from '@/services/analytics';
import { debtsOverview, describeAllFixedSchedulePlans, upcomingByMonth } from '@/services/debts';
import { VatCard } from './vat-card';
import { DebtCard } from './debt-card';
import { ObligationsTab } from './obligations-tab';
import { useT } from '@/i18n/context';
import { accountName, categoryName } from '@/i18n/categories';
import type { TranslationKey } from '@/i18n/dictionary';
import { Card, EmptyState, Field, ModalShell, PrimaryButton, SectionTitle, inputClass } from './ui';

type Segment = 'ALL' | 'VAT' | 'CHEQUE' | 'INSTALLMENT' | 'TAX' | 'LOAN' | 'OTHER';

interface DebtsTabProps {
  settings: FinanceSettings;
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  obligations: Obligation[];
  settlements: ObligationSettlement[];
  plans: Plan[];
  occurrences: PlanOccurrence[];
  planOverrides?: PlanOccurrenceOverride[];
  bearerCheques: BearerCheque[];
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
  plans,
  occurrences,
  planOverrides,
  bearerCheques,
  vatSummary,
  vatPayments,
}: DebtsTabProps) {
  const [segment, setSegment] = useState<Segment>('ALL');
  const { t } = useT();

  const baseCurrency = settings.baseCurrency;
  const toBase = (amount: number, currency: CurrencyCode) =>
    convertToBase(amount, currency, settings).baseAmount;

  const overview = useMemo(
    () =>
      debtsOverview({ vatSummary, obligations, settlements, plans, occurrences, bearerCheques, toBase }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vatSummary, obligations, settlements, plans, occurrences, bearerCheques, settings]
  );

  const upcoming = useMemo(
    () =>
      upcomingByMonth({
        plans,
        occurrences,
        overrides: planOverrides,
        obligations,
        settlements,
        bearerCheques,
        months: 3,
        toBase,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plans, occurrences, planOverrides, obligations, settlements, bearerCheques, settings]
  );

  const described = useMemo(
    () => describeAllFixedSchedulePlans(plans, occurrences),
    [plans, occurrences]
  );
  const ofKind = (planType: PlanType) => described.filter((row) => row.plan.planType === planType);

  const tiles: { id: Segment; label: string; amount: number; icon: React.ReactNode; color: string }[] = [
    { id: 'VAT', label: t('debts.vat'), amount: overview.vat, icon: <Percent className="w-3.5 h-3.5" />, color: '#F59E0B' },
    { id: 'CHEQUE', label: t('debts.cheques'), amount: overview.cheques, icon: <FileSignature className="w-3.5 h-3.5" />, color: '#A855F7' },
    { id: 'INSTALLMENT', label: t('debts.installments'), amount: overview.installments, icon: <CreditCard className="w-3.5 h-3.5" />, color: '#8B5CF6' },
    { id: 'TAX', label: t('debts.taxes'), amount: overview.taxes, icon: <Landmark className="w-3.5 h-3.5" />, color: '#F97316' },
    { id: 'LOAN', label: t('debts.loans'), amount: overview.loans, icon: <Wallet className="w-3.5 h-3.5" />, color: '#0EA5E9' },
    { id: 'OTHER', label: t('debts.other'), amount: overview.other, icon: <CircleDashed className="w-3.5 h-3.5" />, color: '#64748B' },
  ];

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
              {t('debts.total')}
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
              {t('debts.all')}
            </span>
            <span className="block text-xs font-black tabular-nums mt-0.5">{t('debts.byMonth')}</span>
          </button>
        </div>
      </Card>

      {segment === 'ALL' && (
        <>
          <div>
            <SectionTitle title={t('debts.upcoming')} />
            {upcoming.length === 0 ? (
              <EmptyState
                icon={<CalendarClock className="w-7 h-7" />}
                title={t('debts.emptyUpcoming')}
                description={t('debts.emptyUpcomingHint')}
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
              <SectionTitle title={t('dt.vatDue')} />
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
            title={t('dt.vatOffTitle')}
            description={t('dt.vatOffText')}
          />
        ))}

      {segment === 'CHEQUE' && (
        <>
          <BearerChequeSeriesList cheques={bearerCheques} categories={categories} accounts={accounts} />

          <div>
            <SectionTitle title={t('bc.pendingTitle')} />
            <PendingChequesList
              cheques={bearerCheques}
              currency={baseCurrency}
              categories={categories}
              accounts={accounts}
            />
          </div>

          <DebtList
            kind="CHEQUE"
            rows={ofKind('CHEQUE')}
            currency={baseCurrency}
            categories={categories}
            accounts={accounts}
          />

          <div>
            <SectionTitle title={t('dt.issuedCheques')} />
            <ObligationsTab
              obligations={obligations}
              settlements={settlements}
              categories={categories}
              accounts={accounts}
              baseCurrency={baseCurrency}
              vatPayments={[]}
            />
          </div>
        </>
      )}

      {(segment === 'INSTALLMENT' || segment === 'TAX' || segment === 'LOAN' || segment === 'OTHER') && (
        <DebtList
          kind={segment}
          rows={ofKind(segment)}
          currency={baseCurrency}
          categories={categories}
          accounts={accounts}
        />
      )}
    </div>
  );
}

function DebtList({
  kind,
  rows,
  currency,
  categories,
  accounts,
}: {
  kind: 'INSTALLMENT' | 'TAX' | 'LOAN' | 'OTHER' | 'CHEQUE';
  rows: ReturnType<typeof describeAllFixedSchedulePlans>;
  currency: CurrencyCode;
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
}) {
  const { t } = useT();

  // All of these are created from the expense form now: one place to enter money
  // going out, whether it leaves today or on a schedule.
  const meta = {
    INSTALLMENT: { empty: 'dt.emptyInstallments', hint: 'dt.hintInstallments' },
    TAX: { empty: 'dt.emptyTaxes', hint: 'dt.hintTaxes' },
    LOAN: { empty: 'dt.emptyLoans', hint: 'dt.hintLoans' },
    OTHER: { empty: 'dt.emptyOther', hint: 'dt.hintOther' },
    CHEQUE: { empty: 'dt.emptyCheques', hint: 'dt.hintCheques' },
  }[kind] as { empty: TranslationKey; hint: TranslationKey };

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <EmptyState
          icon={<CreditCard className="w-7 h-7" />}
          title={t(meta.empty)}
          description={t(meta.hint)}
        />
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <DebtCard
              key={row.plan.id}
              row={row}
              currency={currency}
              categories={categories}
              accounts={accounts}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Cheques the profile itself wrote and that have not cleared yet — a bearer
 * cheque is its own mechanic (issue now, clear later), so it lives here
 * rather than inside the debt-plan or obligation lists above.
 */
function PendingChequesList({
  cheques,
  currency,
  categories,
  accounts,
}: {
  cheques: BearerCheque[];
  currency: CurrencyCode;
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
}) {
  const { t } = useT();
  const today = todayIso();
  const [editing, setEditing] = useState<BearerCheque | null>(null);
  const pending = cheques
    .filter((c) => c.status === 'ISSUED')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  if (pending.length === 0) {
    return (
      <EmptyState
        icon={<FileSignature className="w-7 h-7" />}
        title={t('bc.emptyPending')}
        description={t('bc.emptyPendingHint')}
      />
    );
  }

  return (
    <div className="space-y-2">
      {pending.map((cheque) => {
        const isOverdue = cheque.dueDate < today;
        return (
          <Card key={cheque.id} className="p-3 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                  {cheque.payee}
                </p>
                <p
                  className={`text-[10px] font-bold mt-0.5 flex items-center gap-1 ${
                    isOverdue ? 'text-rose-500' : 'text-slate-400'
                  }`}
                >
                  {isOverdue && <AlertTriangle className="w-3 h-3 flex-shrink-0" />}
                  {isOverdue ? t('bc.statusOverdue') : t('bc.dueOn')} · {formatDateHuman(cheque.dueDate)}
                  {cheque.chequeNumber ? ` · №${cheque.chequeNumber}` : ''}
                </p>
                {cheque.note && (
                  <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                    {cheque.note}
                  </p>
                )}
              </div>
              <span className="text-xs font-black text-slate-900 dark:text-slate-100 tabular-nums flex-shrink-0">
                {formatMoney(cheque.amount, cheque.currency)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditing(cheque)}
                className="px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 flex items-center justify-center active:scale-95 transition-transform"
                title={t('dc.edit')}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => clearBearerCheque(cheque.id)}
                className="flex-1 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-[10.5px] font-black flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
              >
                <Check className="w-3.5 h-3.5" />
                {t('bc.markCleared')}
              </button>
              <button
                type="button"
                onClick={() => cancelBearerCheque(cheque.id)}
                className="flex-1 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-[10.5px] font-black flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
              >
                <Ban className="w-3.5 h-3.5" />
                {t('bc.cancelCheque')}
              </button>
            </div>
          </Card>
        );
      })}

      {editing && (
        <BearerChequeEditModal
          cheque={editing}
          categories={categories}
          accounts={accounts}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/**
 * Fields for a postdated cheque already issued — payee, amount, dates,
 * account, cheque number, note. Nothing about this changes what clearing or
 * cancelling it does; it just corrects the record itself.
 */
export function BearerChequeEditModal({
  cheque,
  categories,
  accounts,
  onClose,
}: {
  cheque: BearerCheque;
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  onClose: () => void;
}) {
  const { t, language } = useT();
  const [payee, setPayee] = useState(cheque.payee);
  const [chequeNumber, setChequeNumber] = useState(cheque.chequeNumber || '');
  const [amount, setAmount] = useState(String(cheque.amount));
  const [categoryId, setCategoryId] = useState(cheque.categoryId);
  const [accountId, setAccountId] = useState(cheque.accountId);
  const [issueDate, setIssueDate] = useState(cheque.issueDate);
  const [dueDate, setDueDate] = useState(cheque.dueDate);
  const [note, setNote] = useState(cheque.note || '');
  const [error, setError] = useState<string | null>(null);

  const relevantCategories = categories.filter((c) => c.kind === 'EXPENSE' && !c.parentId && !c.isHidden);

  const handleSave = async () => {
    const numericAmount = parseFloat(amount.replace(',', '.'));
    if (!payee.trim()) return setError(t('bc.enterPayee'));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return setError(t('pl.enterAmount'));

    await updateBearerCheque(cheque.id, {
      payee: payee.trim(),
      chequeNumber: chequeNumber.trim() || undefined,
      amount: numericAmount,
      categoryId,
      accountId,
      issueDate,
      dueDate,
      note: note.trim() || undefined,
    });
    onClose();
  };

  return (
    <ModalShell
      title={t('bc.editTitle')}
      icon={<Pencil className="w-5 h-5" />}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {error && <p className="text-[11px] font-bold text-rose-500 text-center">{error}</p>}
          <PrimaryButton onClick={handleSave}>{t('common.save')}</PrimaryButton>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={async () => {
                await clearBearerCheque(cheque.id);
                onClose();
              }}
              className="flex-1 py-2.5 rounded-2xl text-[11px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              {t('bc.markCleared')}
            </button>
            <button
              type="button"
              onClick={async () => {
                await deleteBearerCheque(cheque.id);
                onClose();
              }}
              className="px-4 py-2.5 rounded-2xl text-rose-500 bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center"
            >
              <Ban className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      }
    >
      <Field label={t('bc.payee')}>
        <input
          type="text"
          value={payee}
          onChange={(e) => setPayee(e.target.value)}
          className={inputClass}
          autoFocus
        />
      </Field>

      <Field label={`${t('common.amount')}, ${cheque.currency}`}>
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={`${inputClass} text-lg font-black`}
        />
      </Field>

      <Field label={t('common.category')}>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
          {relevantCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {categoryName(category, language)}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t('bc.issueDate')}>
          <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={inputClass} />
        </Field>
        <Field label={t('bc.dueDate')}>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
        </Field>
      </div>

      <Field label={t('bc.chequeNumber')} hint={t('bc.chequeNumberOptional')}>
        <input
          type="text"
          value={chequeNumber}
          onChange={(e) => setChequeNumber(e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field label={t('bc.debitAccount')}>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputClass}>
          {accounts
            .filter((a) => !a.isArchived || a.id === accountId)
            .map((account) => (
              <option key={account.id} value={account.id}>
                {accountName(account, language)}
              </option>
            ))}
        </select>
      </Field>

      <Field label={t('common.note')}>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
      </Field>
    </ModalShell>
  );
}

interface ChequeSeries {
  seriesId: string;
  payee: string;
  items: BearerCheque[];
}

/** Groups cheques that share a `seriesId` — the linked postdated-cheque sets. */
function groupChequeSeries(cheques: BearerCheque[]): ChequeSeries[] {
  const map = new Map<string, BearerCheque[]>();
  for (const cheque of cheques) {
    if (!cheque.seriesId) continue;
    const list = map.get(cheque.seriesId) || [];
    list.push(cheque);
    map.set(cheque.seriesId, list);
  }
  return Array.from(map.entries())
    .filter(([, items]) => items.length > 1)
    .map(([seriesId, items]) => ({
      seriesId,
      payee: items[0].payee,
      items: items.slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    }))
    .sort((a, b) => a.items[0].dueDate.localeCompare(b.items[0].dueDate));
}

/**
 * Cheques issued together as one split payment (same payee, several
 * postdated cheques) — surfaced as a group so the whole set can be found and
 * edited in one place instead of hunting through the flat pending list.
 */
function BearerChequeSeriesList({
  cheques,
  categories,
  accounts,
}: {
  cheques: BearerCheque[];
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
}) {
  const { t } = useT();
  const [editingSeries, setEditingSeries] = useState<ChequeSeries | null>(null);
  const series = groupChequeSeries(cheques);

  if (series.length === 0) return null;

  return (
    <div>
      <SectionTitle title={t('bc.seriesTitle')} />
      <div className="space-y-2">
        {series.map((s) => {
          const issued = s.items.filter((c) => c.status === 'ISSUED');
          const cleared = s.items.filter((c) => c.status === 'CLEARED');
          const outstanding = issued.reduce((sum, c) => sum + c.amount, 0);
          return (
            <Card key={s.seriesId} className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">{s.payee}</p>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                    {s.items.length} {t('bc.seriesCountLabel')} · {t('bc.seriesClearedLabel')} {cleared.length}/
                    {s.items.length}
                  </p>
                </div>
                <span className="text-xs font-black text-slate-900 dark:text-slate-100 tabular-nums flex-shrink-0">
                  {formatMoney(outstanding, s.items[0].currency)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditingSeries(s)}
                className="w-full py-2 rounded-xl bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 text-[10.5px] font-black flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
              >
                <Layers className="w-3.5 h-3.5" />
                {t('bc.seriesManage')}
              </button>
            </Card>
          );
        })}
      </div>

      {editingSeries && (
        <BearerChequeSeriesEditModal
          series={editingSeries}
          categories={categories}
          accounts={accounts}
          onClose={() => setEditingSeries(null)}
        />
      )}
    </div>
  );
}

function SeriesRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-slate-400 font-medium">{label}</span>
      <span className="text-slate-700 dark:text-slate-200 font-black tabular-nums">{value}</span>
    </div>
  );
}

/**
 * Bulk edit for one cheque series: shared fields (payee/category/account/
 * note) apply to every cheque in the set at once, and due dates can be
 * shifted together. Cleared and cancelled cheques keep their own history —
 * only still-issued ones move or get cancelled.
 */
function BearerChequeSeriesEditModal({
  series,
  categories,
  accounts,
  onClose,
}: {
  series: ChequeSeries;
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  onClose: () => void;
}) {
  const { t, language } = useT();
  const first = series.items[0];
  const [payee, setPayee] = useState(first.payee);
  const [categoryId, setCategoryId] = useState(first.categoryId);
  const [accountId, setAccountId] = useState(first.accountId);
  const [note, setNote] = useState('');
  const [shiftDays, setShiftDays] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const relevantCategories = categories.filter((c) => c.kind === 'EXPENSE' && !c.parentId && !c.isHidden);
  const issued = series.items.filter((c) => c.status === 'ISSUED');
  const cleared = series.items.filter((c) => c.status === 'CLEARED');
  const cancelled = series.items.filter((c) => c.status === 'CANCELLED');
  const outstandingSum = issued.reduce((sum, c) => sum + c.amount, 0);
  const clearedSum = cleared.reduce((sum, c) => sum + c.amount, 0);

  const handleSave = async () => {
    if (!payee.trim()) return setError(t('bc.enterPayee'));
    setBusy(true);
    const days = parseInt(shiftDays, 10);
    await updateBearerChequeSeries(series.seriesId, {
      payee: payee.trim(),
      categoryId,
      accountId,
      note: note.trim() ? note.trim() : undefined,
      shiftDueDateDays: Number.isFinite(days) && days !== 0 ? days : undefined,
    });
    onClose();
  };

  const handleCancelSeries = async () => {
    setBusy(true);
    await cancelBearerChequeSeries(series.seriesId);
    onClose();
  };

  return (
    <ModalShell
      title={t('bc.seriesEditTitle')}
      subtitle={`${first.payee} · ${series.items.length} ${t('bc.chequeNoun').toLowerCase()}`}
      icon={<Layers className="w-5 h-5" />}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {error && <p className="text-[11px] font-bold text-rose-500 text-center">{error}</p>}
          <PrimaryButton onClick={handleSave} disabled={busy}>
            {t('bc.seriesApplyToAll')}
          </PrimaryButton>
          <button
            type="button"
            disabled={busy || issued.length === 0}
            onClick={handleCancelSeries}
            className="w-full py-2.5 rounded-2xl text-[11px] font-black text-rose-500 bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center gap-1.5 disabled:opacity-40"
          >
            <Ban className="w-3.5 h-3.5" />
            {t('bc.seriesCancelAll')}
          </button>
        </div>
      }
    >
      <Card className="p-3.5 space-y-1.5">
        <SeriesRow label={t('bc.statusIssued')} value={`${issued.length} · ${formatMoney(outstandingSum, first.currency)}`} />
        <SeriesRow label={t('bc.statusCleared')} value={`${cleared.length} · ${formatMoney(clearedSum, first.currency)}`} />
        {cancelled.length > 0 && <SeriesRow label={t('bc.statusCancelled')} value={`${cancelled.length}`} />}
      </Card>

      <Field label={t('bc.payee')}>
        <input
          type="text"
          value={payee}
          onChange={(e) => setPayee(e.target.value)}
          className={inputClass}
          autoFocus
        />
      </Field>

      <Field label={t('common.category')}>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
          {relevantCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {categoryName(category, language)}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t('bc.debitAccount')}>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputClass}>
          {accounts
            .filter((a) => !a.isArchived || a.id === accountId)
            .map((account) => (
              <option key={account.id} value={account.id}>
                {accountName(account, language)}
              </option>
            ))}
        </select>
      </Field>

      <Field label={t('common.note')} hint={t('bc.seriesNoteHint')}>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('bc.seriesNotePlaceholder')}
          className={inputClass}
        />
      </Field>

      <Field label={t('bc.seriesShiftDays')} hint={t('bc.seriesShiftDaysHint')}>
        <input
          type="text"
          inputMode="numeric"
          value={shiftDays}
          onChange={(e) => setShiftDays(e.target.value.replace(/[^-\d]/g, ''))}
          placeholder="0"
          className={inputClass}
        />
      </Field>

      <div className="space-y-1.5 pt-1">
        {series.items.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-2 text-[10.5px] px-1">
            <span
              className={`font-bold ${
                c.status === 'ISSUED'
                  ? 'text-slate-500 dark:text-slate-400'
                  : c.status === 'CLEARED'
                    ? 'text-emerald-600'
                    : 'text-slate-300 dark:text-slate-600 line-through'
              }`}
            >
              {formatDateHuman(c.dueDate)}
            </span>
            <span className="text-slate-400 font-medium tabular-nums">{formatMoney(c.amount, c.currency)}</span>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}
