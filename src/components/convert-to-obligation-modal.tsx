'use client';

import React, { useState } from 'react';
import { Scale } from 'lucide-react';
import { CreatableDebtKind, CurrencyCode, Transaction } from '@/types';
import { convertTransactionsToObligation } from '@/lib/db';
import { useT } from '@/i18n/context';
import { formatDateHuman, formatMoney } from '@/services/analytics';
import { DEBT_KIND_META } from './transaction-form-modal';
import { Field, ModalShell, PrimaryButton, inputClass } from './ui';

/**
 * Folds a set of already-booked transactions — e.g. a loan schedule that
 * came in via a statement import as plain expenses — into one obligation.
 * Amounts, dates, account and category are untouched; only each
 * transaction's note and planId change, and one FIXED_SCHEDULE Plan is
 * created to give them a shared card in «Обязательства».
 */
export function ConvertToObligationModal({
  transactions,
  baseCurrency,
  onClose,
  onDone,
}: {
  transactions: Transaction[];
  baseCurrency: CurrencyCode;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useT();
  const [planType, setPlanType] = useState<CreatableDebtKind>('LOAN');
  const [title, setTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = transactions.length;
  const total = Math.round(transactions.reduce((sum, t) => sum + t.baseAmount, 0) * 100) / 100;
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const firstDate = sorted[0]?.date;
  const lastDate = sorted[sorted.length - 1]?.date;

  const handleSave = async () => {
    if (!title.trim()) return setError(t('pl.enterTitle'));
    setIsSaving(true);
    setError(null);
    try {
      await convertTransactionsToObligation({
        transactionIds: transactions.map((t) => t.id),
        planType,
        title: title.trim(),
      });
      onDone();
      onClose();
    } catch (err: any) {
      setError(err.message || t('qa.saveFailed'));
      setIsSaving(false);
    }
  };

  return (
    <ModalShell
      title={t('cvo.bulkTitle')}
      icon={<Scale className="w-5 h-5" />}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {error && <p className="text-[11px] font-bold text-rose-500 text-center">{error}</p>}
          <PrimaryButton onClick={handleSave} disabled={isSaving || count === 0}>
            {t('cvo.confirm')}
          </PrimaryButton>
        </div>
      }
    >
      <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-3 space-y-1">
        <p className="text-xs font-black text-slate-700 dark:text-slate-200">
          {count} · {formatMoney(total, baseCurrency, { compact: true })}
        </p>
        {firstDate && lastDate && (
          <p className="text-[10.5px] text-slate-400 font-medium">
            {formatDateHuman(firstDate)} — {formatDateHuman(lastDate)}
          </p>
        )}
      </div>

      <p className="text-[10.5px] text-slate-400 font-medium leading-relaxed">{t('cvo.bulkHint')}</p>
      <p className="text-[10.5px] text-amber-600 dark:text-amber-400 font-bold leading-relaxed">
        {t('cvo.bulkCompletedNote')}
      </p>

      <div className="grid grid-cols-4 gap-1.5">
        {(Object.keys(DEBT_KIND_META) as CreatableDebtKind[]).map((option) => {
          const meta = DEBT_KIND_META[option];
          const isActive = planType === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => setPlanType(option)}
              className={`py-2 rounded-xl text-[10px] font-black border transition-all ${
                isActive
                  ? 'bg-violet-500 text-white border-transparent'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
              }`}
            >
              {t(meta.label)}
            </button>
          );
        })}
      </div>

      <Field label={t('pl.title')}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('cvo.titlePlaceholder')}
          className={inputClass}
          autoFocus
        />
      </Field>
    </ModalShell>
  );
}
