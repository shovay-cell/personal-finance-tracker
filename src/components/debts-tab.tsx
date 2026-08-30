'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  Check,
  CreditCard,
  FileSignature,
  Landmark,
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
  PlanType,
  VatPayment,
  VatSummary,
} from '@/types';
import { cancelBearerCheque, clearBearerCheque, convertToBase, todayIso } from '@/lib/db';
import { formatDateHuman, formatMoney, monthLabel } from '@/services/analytics';
import { debtsOverview, describeAllFixedSchedulePlans, upcomingByMonth } from '@/services/debts';
import { VatCard } from './vat-card';
import { DebtCard } from './debt-card';
import { ObligationsTab } from './obligations-tab';
import { useT } from '@/i18n/context';
import type { TranslationKey } from '@/i18n/dictionary';
import { Card, EmptyState, SectionTitle } from './ui';

type Segment = 'ALL' | 'VAT' | 'CHEQUE' | 'INSTALLMENT' | 'TAX' | 'LOAN';

interface DebtsTabProps {
  settings: FinanceSettings;
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  obligations: Obligation[];
  settlements: ObligationSettlement[];
  plans: Plan[];
  occurrences: PlanOccurrence[];
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
        obligations,
        settlements,
        bearerCheques,
        months: 3,
        toBase,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plans, occurrences, obligations, settlements, bearerCheques, settings]
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
          <div>
            <SectionTitle title={t('bc.pendingTitle')} />
            <PendingChequesList cheques={bearerCheques} currency={baseCurrency} />
          </div>

          <DebtList kind="CHEQUE" rows={ofKind('CHEQUE')} currency={baseCurrency} />

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

      {(segment === 'INSTALLMENT' || segment === 'TAX' || segment === 'LOAN') && (
        <DebtList kind={segment} rows={ofKind(segment)} currency={baseCurrency} />
      )}
    </div>
  );
}

function DebtList({
  kind,
  rows,
  currency,
}: {
  kind: 'INSTALLMENT' | 'TAX' | 'LOAN' | 'CHEQUE';
  rows: ReturnType<typeof describeAllFixedSchedulePlans>;
  currency: CurrencyCode;
}) {
  const { t } = useT();

  // All of these are created from the expense form now: one place to enter money
  // going out, whether it leaves today or on a schedule.
  const meta = {
    INSTALLMENT: { empty: 'dt.emptyInstallments', hint: 'dt.hintInstallments' },
    TAX: { empty: 'dt.emptyTaxes', hint: 'dt.hintTaxes' },
    LOAN: { empty: 'dt.emptyLoans', hint: 'dt.hintLoans' },
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
            <DebtCard key={row.plan.id} row={row} currency={currency} />
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
}: {
  cheques: BearerCheque[];
  currency: CurrencyCode;
}) {
  const { t } = useT();
  const today = todayIso();
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
    </div>
  );
}
