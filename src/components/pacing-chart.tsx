'use client';

import React from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { CurrencyCode, PacingComparison } from '@/types';
import { formatMoney } from '@/services/analytics';
import { useT } from '@/i18n/context';
import { Card } from './ui';

/**
 * Cumulative spending of this month against the previous one, compared at the
 * same day — the comparison that says "быстрее или медленнее", unlike two
 * month-end totals that only agree at the finish line.
 */
export function PacingChart({
  data,
  currency,
}: {
  data: PacingComparison;
  currency: CurrencyCode;
}) {
  const { t } = useT();
  const width = 320;
  const height = 120;
  const max = Math.max(
    1,
    ...data.points.map((p) => Math.max(p.previous, p.current ?? 0))
  );
  const days = data.points.length;

  const x = (day: number) => ((day - 1) / Math.max(1, days - 1)) * width;
  const y = (value: number) => height - (value / max) * height;

  const line = (pick: (p: (typeof data.points)[number]) => number | undefined) =>
    data.points
      .map((point) => {
        const value = pick(point);
        return value === undefined ? null : `${x(point.day)},${y(value)}`;
      })
      .filter(Boolean)
      .join(' ');

  const isFaster = data.deltaShare > 0.02;
  const isSlower = data.deltaShare < -0.02;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
            {t('pace.title')} · {data.dayOfMonth} {t('pace.dayOfMonth')}
          </p>
          <p className="text-xl font-black text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
            {formatMoney(data.currentTotal, currency)}
          </p>
          <p className="text-[10.5px] font-bold text-slate-400">
            {t('pace.previousSameDay')} — {formatMoney(data.previousTotal, currency)}
          </p>
        </div>

        <span
          className={`flex items-center gap-1 px-2 py-1 rounded-xl text-[10px] font-black flex-shrink-0 ${
            isFaster
              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
              : isSlower
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
              : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
          }`}
        >
          {isFaster ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {data.deltaShare === 0 && data.previousTotal === 0
            ? t('pace.noData')
            : `${data.deltaShare > 0 ? '+' : ''}${(data.deltaShare * 100).toFixed(0)}%`}
        </span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height: 120 }}>
        <polyline
          points={line((p) => p.previous)}
          fill="none"
          strokeWidth="2"
          strokeDasharray="4 4"
          className="stroke-slate-300 dark:stroke-slate-600"
        />
        <polyline
          points={line((p) => p.current)}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          stroke={isFaster ? '#F43F5E' : '#10B981'}
        />
      </svg>

      <div className="flex items-center justify-center gap-4">
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
          <span
            className="w-4 h-0.5 rounded-full"
            style={{ backgroundColor: isFaster ? '#F43F5E' : '#10B981' }}
          />
          {t('pace.currentMonth')}
        </span>
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
          <span className="w-4 h-0.5 rounded-full bg-slate-300 dark:bg-slate-600" />
          {t('pace.previousMonth')} ({formatMoney(data.previousMonthTotal, currency, { compact: true })})
        </span>
      </div>
    </Card>
  );
}
