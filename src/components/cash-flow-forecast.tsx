'use client';

import React, { useState } from 'react';
import { AlertTriangle, LineChart, TrendingDown } from 'lucide-react';
import { CashFlowForecast, CurrencyCode } from '@/types';
import { formatDateHuman, formatMoney } from '@/services/analytics';
import { Card } from './ui';

const HORIZONS = [30, 60, 90];

/**
 * Projected liquidity: today's balance carried forward through every scheduled
 * subscription, rent and expected income. The point is to see a cash gap while
 * there is still time to move something.
 */
export function CashFlowForecastCard({
  forecast,
  currency,
  horizon,
  onHorizonChange,
}: {
  forecast: CashFlowForecast;
  currency: CurrencyCode;
  horizon: number;
  onHorizonChange: (days: number) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  const width = 320;
  const height = 130;
  const balances = forecast.points.map((p) => p.balance);
  const max = Math.max(...balances, 0);
  const min = Math.min(...balances, 0);
  const span = Math.max(1, max - min);

  const x = (index: number) => (index / Math.max(1, forecast.points.length - 1)) * width;
  const y = (value: number) => height - ((value - min) / span) * height;

  const linePoints = forecast.points.map((p, i) => `${x(i)},${y(p.balance)}`).join(' ');
  const areaPoints = `0,${y(min)} ${linePoints} ${width},${y(min)}`;
  const zeroY = y(0);

  const active = selected !== null ? forecast.points[selected] : null;
  const upcoming = forecast.points.flatMap((p) => p.events).slice(0, 6);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
            Прогноз баланса
          </p>
          <p className="text-xl font-black text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
            {formatMoney(forecast.points[forecast.points.length - 1]?.balance ?? 0, currency)}
          </p>
          <p className="text-[10.5px] font-bold text-slate-400">
            через {horizon} дн. · сейчас {formatMoney(forecast.startBalance, currency)}
          </p>
        </div>

        <div className="flex gap-1 flex-shrink-0">
          {HORIZONS.map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => {
                setSelected(null);
                onHorizonChange(days);
              }}
              className={`px-2.5 py-1 rounded-xl text-[10px] font-black transition-all ${
                horizon === days
                  ? 'bg-sky-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}
            >
              {days}д
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          style={{ height: 130 }}
          onMouseLeave={() => setSelected(null)}
        >
          <defs>
            <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0EA5E9" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#0EA5E9" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {min < 0 && (
            <line
              x1="0"
              x2={width}
              y1={zeroY}
              y2={zeroY}
              strokeWidth="1"
              strokeDasharray="3 3"
              className="stroke-rose-400"
            />
          )}

          <polygon points={areaPoints} fill="url(#forecastFill)" />
          <polyline
            points={linePoints}
            fill="none"
            stroke={forecast.shortfallDate ? '#F43F5E' : '#0EA5E9'}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Days carrying a scheduled movement get a dot — those are the ones worth tapping. */}
          {forecast.points.map((point, index) =>
            point.events.length > 0 ? (
              <circle
                key={point.date}
                cx={x(index)}
                cy={y(point.balance)}
                r={selected === index ? 4.5 : 3}
                fill={point.events.some((e) => e.amount > 0) ? '#10B981' : '#F97316'}
                onClick={() => setSelected(index)}
                style={{ cursor: 'pointer' }}
              />
            ) : null
          )}
        </svg>

        {active && (
          <div className="absolute inset-x-0 -bottom-1 mx-auto w-fit px-3 py-1.5 rounded-xl bg-slate-900 text-white text-[10px] font-bold shadow-lg">
            {formatDateHuman(active.date)} · {formatMoney(active.balance, currency)}
            {active.events.map((event) => (
              <span key={event.title} className="block font-medium opacity-80">
                {event.title} {event.amount > 0 ? '+' : ''}
                {formatMoney(event.amount, currency)}
              </span>
            ))}
          </div>
        )}
      </div>

      {forecast.shortfallDate ? (
        <div className="flex items-start gap-2 p-2.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400">
          <AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0" />
          <p className="text-[10.5px] font-bold leading-relaxed">
            Кассовый разрыв {formatDateHuman(forecast.shortfallDate)} — баланс уходит в минус.
            Перенесите платёж или пополните счёт заранее.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2 p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400">
          <TrendingDown className="w-3.5 h-3.5 mt-px flex-shrink-0" />
          <p className="text-[10.5px] font-bold leading-relaxed">
            Минимум {formatMoney(forecast.minimum.balance, currency)}{' '}
            {formatDateHuman(forecast.minimum.date)} · плановые доходы{' '}
            {formatMoney(forecast.totalIncome, currency, { compact: true })}, списания{' '}
            {formatMoney(forecast.totalExpense, currency, { compact: true })}
          </p>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-slate-50 dark:border-slate-800">
          <p className="text-[9px] font-black uppercase tracking-wide text-slate-400 flex items-center gap-1">
            <LineChart className="w-3 h-3" />
            Ближайшие движения
          </p>
          {upcoming.map((event, index) => (
            <div key={`${event.title}-${index}`} className="flex items-center gap-2 text-[10.5px]">
              <span className="text-slate-400 font-medium w-14 flex-shrink-0">
                {formatDateHuman(event.date)}
              </span>
              <span className="flex-1 truncate text-slate-600 dark:text-slate-300 font-bold">
                {event.title}
              </span>
              <span
                className={`font-black tabular-nums ${
                  event.amount > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {event.amount > 0 ? '+' : ''}
                {formatMoney(event.amount, currency)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
