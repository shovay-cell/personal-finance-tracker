'use client';

import React from 'react';
import { CalendarClock } from 'lucide-react';
import { CurrencyCode } from '@/types';
import { CalendarDay } from '@/services/forecast';
import { formatMoney, monthLabel } from '@/services/analytics';
import { useT } from '@/i18n/context';
import type { TranslationKey } from '@/i18n/dictionary';
import { Card } from './ui';

const WEEKDAY_KEYS: TranslationKey[] = [
  'pc.mon',
  'pc.tue',
  'pc.wed',
  'pc.thu',
  'pc.fri',
  'pc.sat',
  'pc.sun',
];

/**
 * Month grid of due dates: a week where three charges land together is visible
 * as a cluster long before it turns into a cash gap.
 */
export function PaymentCalendar({
  days,
  month,
  currency,
}: {
  days: CalendarDay[];
  month: string;
  currency: CurrencyCode;
}) {
  const { t } = useT();
  const withCharges = days.filter((day) => day.events.length > 0);
  const monthTotal = days.reduce((sum, day) => sum + day.total, 0);
  const remaining = days
    .filter((day) => !day.isPast)
    .reduce((sum, day) => sum + day.total, 0);

  if (withCharges.length === 0) {
    return (
      <Card className="p-4 flex items-start gap-3">
        <CalendarClock className="w-5 h-5 text-slate-400 flex-shrink-0" />
        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
          {t('pc.emptyA')} {monthLabel(month).toLowerCase()} {t('pc.emptyB')}
        </p>
      </Card>
    );
  }

  const maxTotal = Math.max(...days.map((day) => day.total), 1);
  // First cell offset so the 1st lands under its weekday (Monday-first grid).
  const firstWeekday = (new Date(`${month}-01T00:00:00`).getDay() + 6) % 7;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
            {t('pc.title')}
          </p>
          <p className="text-xl font-black text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
            {formatMoney(monthTotal, currency)}
          </p>
          <p className="text-[10.5px] font-bold text-slate-400">
            {t('pc.perMonth')} {formatMoney(remaining, currency)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_KEYS.map((key) => (
          <div
            key={key}
            className="text-center text-[9px] font-black uppercase tracking-wide text-slate-400 pb-1"
          >
            {t(key)}
          </div>
        ))}

        {Array.from({ length: firstWeekday }).map((_, index) => (
          <div key={`pad-${index}`} />
        ))}

        {days.map((day) => {
          const intensity = day.total > 0 ? 0.18 + (day.total / maxTotal) * 0.55 : 0;
          return (
            <div
              key={day.date}
              className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 border ${
                day.isToday
                  ? 'border-sky-400'
                  : day.total > 0
                  ? 'border-transparent'
                  : 'border-slate-100 dark:border-slate-800'
              } ${day.isPast ? 'opacity-45' : ''}`}
              style={
                day.total > 0 ? { backgroundColor: `rgba(249, 115, 22, ${intensity})` } : undefined
              }
              title={day.events.map((e) => e.title).join(', ')}
            >
              <span
                className={`text-[10px] font-black ${
                  day.total > 0 ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'
                }`}
              >
                {day.day}
              </span>
              {day.total > 0 && (
                <span className="text-[7.5px] font-black text-slate-700 dark:text-slate-200 tabular-nums leading-none">
                  {Math.round(day.total)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-1 pt-1 border-t border-slate-50 dark:border-slate-800">
        {withCharges.map((day) => (
          <div key={day.date} className="flex items-start gap-2 text-[10.5px]">
            <span
              className={`font-black w-6 flex-shrink-0 tabular-nums ${
                day.isPast ? 'text-slate-300 dark:text-slate-600' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {day.day}
            </span>
            <span className="flex-1 min-w-0 text-slate-600 dark:text-slate-300 font-bold truncate">
              {day.events.map((event) => event.title).join(' · ')}
            </span>
            <span
              className={`font-black tabular-nums flex-shrink-0 ${
                day.isPast ? 'text-slate-300 dark:text-slate-600' : 'text-slate-700 dark:text-slate-200'
              }`}
            >
              {formatMoney(day.total, currency)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
