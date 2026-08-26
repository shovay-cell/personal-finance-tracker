'use client';

import React from 'react';
import { Plus, Scissors, Trash2 } from 'lucide-react';
import { CurrencyCode, FinanceCategory, TransactionSplit } from '@/types';
import { formatMoney } from '@/services/analytics';
import { getCategoryIcon } from '@/constants/categories';
import { inputClass } from './ui';

/**
 * Splits one receipt across categories (70% продукты / 30% бытовая химия).
 * Percentages and amounts stay in sync, and the remainder is always visible so a
 * split can never silently drift away from the receipt total.
 */
export function SplitEditor({
  amount,
  currency,
  categories,
  splits,
  onChange,
}: {
  amount: number;
  currency: CurrencyCode;
  categories: FinanceCategory[];
  splits: TransactionSplit[];
  onChange: (splits: TransactionSplit[]) => void;
}) {
  const assigned = splits.reduce((sum, part) => sum + (part.amount || 0), 0);
  const remainder = Math.round((amount - assigned) * 100) / 100;

  const update = (index: number, patch: Partial<TransactionSplit>) => {
    onChange(splits.map((part, i) => (i === index ? { ...part, ...patch } : part)));
  };

  const setPercent = (index: number, percent: number) => {
    const value = Math.round(((amount * percent) / 100) * 100) / 100;
    update(index, { amount: value });
  };

  return (
    <div className="space-y-2">
      {splits.map((part, index) => {
        const category = categories.find((c) => c.id === part.categoryId);
        const Icon = getCategoryIcon(category?.iconName || 'CircleDashed');
        const percent = amount > 0 ? Math.round(((part.amount || 0) / amount) * 100) : 0;

        return (
          <div
            key={index}
            className="rounded-2xl border border-slate-200 dark:border-slate-700 p-2.5 space-y-2"
          >
            <div className="flex items-center gap-2">
              <span
                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: `${category?.colorHex || '#64748B'}1F`,
                  color: category?.colorHex || '#64748B',
                }}
              >
                <Icon className="w-3.5 h-3.5" />
              </span>

              <select
                value={part.categoryId}
                onChange={(e) => update(index, { categoryId: e.target.value })}
                className={`${inputClass} text-xs py-2 flex-1`}
              >
                <option value="">Категория</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => onChange(splits.filter((_, i) => i !== index))}
                className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-500 flex items-center justify-center flex-shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={part.amount || ''}
                onChange={(e) =>
                  update(index, { amount: parseFloat(e.target.value.replace(',', '.')) || 0 })
                }
                placeholder="0"
                className={`${inputClass} text-xs py-2 w-24`}
              />
              <input
                type="range"
                min={0}
                max={100}
                value={percent}
                onChange={(e) => setPercent(index, Number(e.target.value))}
                className="flex-1 accent-sky-500"
              />
              <span className="text-[11px] font-black text-slate-500 w-10 text-right tabular-nums">
                {percent}%
              </span>
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() =>
            onChange([
              ...splits,
              { categoryId: '', amount: Math.max(0, remainder) },
            ])
          }
          className="flex-1 py-2.5 rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 text-slate-400 text-[11px] font-black flex items-center justify-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Добавить часть
        </button>

        <span
          className={`text-[11px] font-black tabular-nums px-3 py-2.5 rounded-2xl ${
            Math.abs(remainder) < 0.01
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
              : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
          }`}
        >
          {Math.abs(remainder) < 0.01
            ? 'Сходится'
            : `Остаток ${formatMoney(remainder, currency)}`}
        </span>
      </div>

      <p className="text-[10px] text-slate-400 font-medium flex items-start gap-1.5">
        <Scissors className="w-3 h-3 mt-px flex-shrink-0" />
        Остаток автоматически добавится к последней части при сохранении.
      </p>
    </div>
  );
}
