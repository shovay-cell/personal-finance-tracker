'use client';

import React from 'react';
import { CategoryBreakdownRow, CurrencyCode, MonthlyPoint } from '@/types';
import { formatMoney, monthLabel } from '@/services/analytics';
import { useT } from '@/i18n/context';

/**
 * Donut rendered with stroke-dasharray on a single circle per slice: no chart
 * library, no layout shift, and it scales cleanly on a phone screen.
 */
export function DonutChart({
  rows,
  total,
  currency,
  centerLabel,
}: {
  rows: CategoryBreakdownRow[];
  total: number;
  currency: CurrencyCode;
  centerLabel: string;
}) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="relative w-44 h-44 mx-auto">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="13"
          className="stroke-slate-100 dark:stroke-slate-800"
        />
        {rows.map((row) => {
          const length = row.share * circumference;
          const circle = (
            <circle
              key={row.categoryId}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={row.colorHex}
              strokeWidth="13"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += length;
          return circle;
        })}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">
          {centerLabel}
        </span>
        <span className="text-lg font-black text-slate-900 dark:text-slate-100 leading-tight">
          {formatMoney(total, currency, { compact: true })}
        </span>
      </div>
    </div>
  );
}

export function CategoryLegend({
  rows,
  currency,
  onSelect,
}: {
  rows: CategoryBreakdownRow[];
  currency: CurrencyCode;
  onSelect?: (categoryId: string) => void;
}) {
  const { t } = useT();

  return (
    <div className="space-y-1.5">
      {rows.map((row) => (
        <button
          key={row.categoryId}
          type="button"
          onClick={() => onSelect?.(row.categoryId)}
          className="w-full flex items-center gap-3 py-2 px-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left"
        >
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: row.colorHex }}
          />
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
              {row.categoryName}
            </span>
            <span className="block text-[10px] text-slate-400 font-medium">
              {row.transactionCount} {t('ch.operationsShort')} · {(row.share * 100).toFixed(1)}%
            </span>
          </span>
          <span className="text-xs font-black text-slate-900 dark:text-slate-100 tabular-nums">
            {formatMoney(row.total, currency)}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Grouped expense/income bars per month. */
export function MonthlyBarChart({
  points,
  currency,
}: {
  points: MonthlyPoint[];
  currency: CurrencyCode;
}) {
  const { t } = useT();
  const max = Math.max(1, ...points.flatMap((p) => [p.expense, p.income]));
  // Bars are sized in pixels rather than percentages: a percentage height inside a
  // flex column with no definite height collapses to nothing in every browser.
  const plotHeight = 128;
  const barHeight = (value: number) => Math.max(2, Math.round((value / max) * plotHeight));

  return (
    <div className="flex items-end justify-between gap-2 px-1">
      {points.map((point) => (
        <div key={point.month} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
          <div
            className="w-full flex items-end justify-center gap-1"
            style={{ height: plotHeight }}
          >
            <div
              className="w-1/2 max-w-[16px] rounded-t-lg bg-gradient-to-t from-rose-500 to-rose-400 transition-all"
              style={{ height: barHeight(point.expense) }}
              title={`${t('ch.expense')}: ${formatMoney(point.expense, currency)}`}
            />
            <div
              className="w-1/2 max-w-[16px] rounded-t-lg bg-gradient-to-t from-emerald-500 to-emerald-400 transition-all"
              style={{ height: barHeight(point.income) }}
              title={`${t('ch.income')}: ${formatMoney(point.income, currency)}`}
            />
          </div>
          <span className="text-[9px] font-bold text-slate-400 whitespace-nowrap">
            {monthLabel(point.month).slice(0, 3)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ProgressBar({
  percent,
  level,
}: {
  percent: number;
  level: 'OK' | 'WARNING' | 'EXCEEDED';
}) {
  const color =
    level === 'EXCEEDED'
      ? 'from-rose-500 to-rose-400'
      : level === 'WARNING'
      ? 'from-amber-500 to-amber-400'
      : 'from-emerald-500 to-emerald-400';

  return (
    <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
      <div
        className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-500`}
        style={{ width: `${Math.min(100, Math.max(2, percent))}%` }}
      />
    </div>
  );
}
