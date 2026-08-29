'use client';

import React from 'react';
import { CalendarDays, Info, Wallet } from 'lucide-react';
import { CurrencyCode, SafeToSpend } from '@/types';
import { formatMoney } from '@/services/analytics';
import { useT } from '@/i18n/context';
import { Card } from './ui';

/**
 * The one number that answers "сколько можно потратить сегодня": what is left of
 * the plan after money already spent and the bills still due this month, spread
 * across the days remaining.
 */
export function SafeToSpendCard({
  data,
  currency,
  onSetBudget,
}: {
  data: SafeToSpend;
  currency: CurrencyCode;
  onSetBudget?: () => void;
}) {
  const { t } = useT();

  if (data.basis === 'NONE') {
    return (
      <Card className="p-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black text-slate-700 dark:text-slate-200">
            {t('safe.title')}
          </p>
          <p className="text-[10.5px] text-slate-400 font-medium mt-0.5 leading-relaxed">
            {t('safe.setBudgetHint')}
          </p>
        </div>
        {onSetBudget && (
          <button
            type="button"
            onClick={onSetBudget}
            className="px-3 py-2 rounded-xl bg-sky-500 text-white text-[11px] font-black flex-shrink-0"
          >
            {t('budget.set')}
          </button>
        )}
      </Card>
    );
  }

  const isNegative = data.available < 0;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
            {t('safe.title')}
          </p>
          <p
            className={`text-3xl font-black tabular-nums leading-tight mt-0.5 ${
              isNegative ? 'text-rose-500' : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {formatMoney(data.available, currency)}
          </p>
        </div>

        <div className="text-right flex-shrink-0">
          <p
            className={`text-lg font-black tabular-nums leading-tight ${
              isNegative ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {formatMoney(data.perDay, currency)}
          </p>
          <p className="text-[10px] font-bold text-slate-400 flex items-center justify-end gap-1">
            <CalendarDays className="w-3 h-3" />{t('common.perDay')} · {data.daysLeft} {t('common.days')}
          </p>
        </div>
      </div>

      {/* The arithmetic in plain sight: a number nobody can retrace is a number nobody trusts. */}
      <div className="grid grid-cols-3 gap-2 pt-1">
        <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-2.5">
          <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
            {data.basis === 'BUDGET' ? t('safe.budget') : t('common.income')}
          </p>
          <p className="text-xs font-black text-slate-700 dark:text-slate-200 tabular-nums mt-0.5">
            {formatMoney(data.planned, currency, { compact: true })}
          </p>
        </div>
        <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-2.5">
          <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">{t('safe.spent')}</p>
          <p className="text-xs font-black text-rose-500 tabular-nums mt-0.5">
            −{formatMoney(data.spent, currency, { compact: true })}
          </p>
        </div>
        <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-2.5">
          <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">{t('safe.committed')}</p>
          <p className="text-xs font-black text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">
            −{formatMoney(data.upcomingCommitted, currency, { compact: true })}
          </p>
        </div>
      </div>

      <p className="text-[10px] text-slate-400 font-medium flex items-start gap-1.5">
        {isNegative ? (
          <>
            <Wallet className="w-3 h-3 mt-px flex-shrink-0 text-rose-500" />
            {t('stc.overBudget')}{' '}
            {data.basis === 'BUDGET' ? t('stc.budgetWord') : t('stc.incomeWord')} {t('stc.ofMonth')}
          </>
        ) : (
          <>
            <Info className="w-3 h-3 mt-px flex-shrink-0" />
            {t('safe.hint')}
          </>
        )}
      </p>
    </Card>
  );
}
