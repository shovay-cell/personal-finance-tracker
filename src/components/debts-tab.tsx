'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CreditCard,
  FileSignature,
  Landmark,
  Percent,
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
import { convertToBase } from '@/lib/db';
import { formatDateHuman, formatMoney, monthLabel } from '@/services/analytics';
import { debtsOverview, describeAllDebts, upcomingByMonth } from '@/services/debts';
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
  const { t } = useT();

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
  kind: DebtKind;
  rows: ReturnType<typeof describeAllDebts>;
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
            <DebtCard key={row.debt.id} row={row} currency={currency} />
          ))}
        </div>
      )}
    </div>
  );
}
