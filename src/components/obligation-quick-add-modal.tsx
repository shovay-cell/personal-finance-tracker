'use client';

import React, { useState } from 'react';
import { Scale } from 'lucide-react';
import {
  CreatableDebtKind,
  CurrencyCode,
  FinanceAccount,
  FinanceCategory,
  RecurrenceUnit,
} from '@/types';
import { addFixedSchedulePlan, todayIso } from '@/lib/db';
import { unitNoun } from '@/i18n/plurals';
import { useT } from '@/i18n/context';
import { accountName, categoryName } from '@/i18n/categories';
import { DEBT_KIND_META, InstallmentPreview } from './transaction-form-modal';
import { Field, ModalShell, PrimaryButton, inputClass } from './ui';

function pluralUnit(unit: RecurrenceUnit, rawCount: string): string {
  return unitNoun(unit, Math.max(1, parseInt(rawCount, 10) || 1));
}

/** Default category, if it exists in this profile, for each obligation kind. */
const DEFAULT_CATEGORY_ID: Record<CreatableDebtKind, string> = {
  INSTALLMENT: 'cat-fees',
  LOAN: 'cat-fees',
  OTHER: 'cat-fees',
  TAX: 'cat-taxes',
};

interface ObligationQuickAddModalProps {
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  baseCurrency: CurrencyCode;
  initialKind?: CreatableDebtKind;
  initialAmount?: number;
  onClose: () => void;
  onSaved?: () => void;
}

/**
 * A dedicated entry point for future obligations — a credit, an instalment
 * purchase, a tax, or anything else paid off later or on a schedule. Kept
 * separate from the ordinary expense form: an obligation is not money spent
 * today, and burying it behind a toggle on the expense form meant people
 * didn't know where to look for it.
 */
export function ObligationQuickAddModal({
  categories,
  accounts,
  baseCurrency,
  initialKind,
  initialAmount,
  onClose,
  onSaved,
}: ObligationQuickAddModalProps) {
  const { t, language } = useT();
  const startKind = initialKind || 'INSTALLMENT';

  const [debtKind, setDebtKind] = useState<CreatableDebtKind>(startKind);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState(initialAmount ? String(initialAmount) : '');
  const [categoryId, setCategoryId] = useState(
    categories.some((c) => c.id === DEFAULT_CATEGORY_ID[startKind]) ? DEFAULT_CATEGORY_ID[startKind] : ''
  );
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [firstDueDate, setFirstDueDate] = useState(todayIso());
  const [paymentsCount, setPaymentsCount] = useState(String(DEBT_KIND_META[startKind].defaultPayments));
  const [intervalUnit, setIntervalUnit] = useState<RecurrenceUnit>('MONTH');
  const [intervalCount, setIntervalCount] = useState('1');
  const [firstPaymentPaid, setFirstPaymentPaid] = useState(false);
  const [taxPeriod, setTaxPeriod] = useState('');
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTax = debtKind === 'TAX';
  const relevantCategories = categories.filter((c) => c.kind === 'EXPENSE' && !c.parentId && !c.isHidden);

  const handleKindChange = (kind: CreatableDebtKind) => {
    setDebtKind(kind);
    setPaymentsCount(String(DEBT_KIND_META[kind].defaultPayments));
    const defaultCategory = DEFAULT_CATEGORY_ID[kind];
    if (!categoryId && categories.some((c) => c.id === defaultCategory)) {
      setCategoryId(defaultCategory);
    }
  };

  const handleSave = async () => {
    const numericAmount = parseFloat(amount.replace(',', '.'));
    if (!title.trim()) return setError(t('pl.enterTitle'));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return setError(t('pl.enterAmount'));
    if (!categoryId) return setError(t('pl.pickCategory'));
    if (!accountId) return setError(t('tf.pickAccount'));

    const count = isTax ? 1 : Math.max(1, parseInt(paymentsCount, 10) || 1);
    const combinedNote = isTax && taxPeriod.trim() ? [taxPeriod.trim(), note.trim()].filter(Boolean).join(' · ') : note.trim();

    setIsSaving(true);
    try {
      await addFixedSchedulePlan({
        planType: debtKind,
        title: title.trim(),
        totalAmount: numericAmount,
        currency: baseCurrency,
        categoryId,
        accountId,
        startDate: todayIso(),
        firstDueDate,
        note: combinedNote || undefined,
        paymentsCount: count,
        intervalUnit,
        intervalCount: Math.max(1, parseInt(intervalCount, 10) || 1),
        firstPaymentPaid,
      });
      onSaved?.();
      onClose();
    } catch (err: any) {
      setError(err.message || t('qa.saveFailed'));
      setIsSaving(false);
    }
  };

  return (
    <ModalShell
      title={t('obq.title')}
      subtitle={t('obq.subtitle')}
      icon={<Scale className="w-5 h-5" />}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {error && <p className="text-[11px] font-bold text-rose-500 text-center">{error}</p>}
          <PrimaryButton onClick={handleSave} disabled={isSaving}>
            {t('obq.create')}
          </PrimaryButton>
        </div>
      }
    >
      <div className="grid grid-cols-4 gap-1.5">
        {(Object.keys(DEBT_KIND_META) as CreatableDebtKind[]).map((option) => {
          const meta = DEBT_KIND_META[option];
          const isActive = debtKind === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => handleKindChange(option)}
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
          placeholder={isTax ? t('obq.taxPlaceholder') : t('obq.titlePlaceholder')}
          className={inputClass}
          autoFocus
        />
      </Field>

      <Field label={`${isTax ? t('obq.taxAmount') : t('obq.totalAmount')}, ${baseCurrency}`}>
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={`${inputClass} text-lg font-black`}
        />
      </Field>

      {isTax && (
        <Field label={t('obq.taxPeriod')} hint={t('obq.taxPeriodHint')}>
          <input
            type="text"
            value={taxPeriod}
            onChange={(e) => setTaxPeriod(e.target.value)}
            placeholder={t('obq.taxPeriodPlaceholder')}
            className={inputClass}
          />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label={isTax || paymentsCount === '1' ? t('form.paymentDate') : t('form.firstPayment')}>
          <input
            type="date"
            value={firstDueDate}
            onChange={(e) => setFirstDueDate(e.target.value)}
            className={inputClass}
          />
        </Field>
        {!isTax && (
          <Field label={t('form.paymentsCount')}>
            <input
              type="number"
              min={1}
              value={paymentsCount}
              onChange={(e) => setPaymentsCount(e.target.value)}
              className={`${inputClass} text-center font-black`}
            />
          </Field>
        )}
      </div>

      {!isTax && parseInt(paymentsCount, 10) > 1 && (
        <Field label={t('form.paymentsEvery')}>
          <div className="flex gap-1.5">
            <input
              type="number"
              min={1}
              value={intervalCount}
              onChange={(e) => setIntervalCount(e.target.value)}
              className={`${inputClass} w-16 text-center`}
            />
            <select
              value={intervalUnit}
              onChange={(e) => setIntervalUnit(e.target.value as RecurrenceUnit)}
              className={`${inputClass} flex-1`}
            >
              <option value="WEEK">{pluralUnit('WEEK', intervalCount)}</option>
              <option value="MONTH">{pluralUnit('MONTH', intervalCount)}</option>
              <option value="YEAR">{pluralUnit('YEAR', intervalCount)}</option>
            </select>
          </div>
        </Field>
      )}

      <Field label={t('common.category')}>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
          <option value="">{t('pl.pickCategory')}</option>
          {relevantCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {categoryName(category, language)}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t('bc.debitAccount')}>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputClass}>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {accountName(account, language)}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t('pl.note')} hint={t('pl.noteHint')}>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('pl.notePlaceholder')}
          className={inputClass}
        />
      </Field>

      {!isTax && (
        <button
          type="button"
          onClick={() => setFirstPaymentPaid((prev) => !prev)}
          className="w-full flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 text-left"
        >
          <span>
            <span className="block text-[11px] font-black text-slate-700 dark:text-slate-200">
              {parseInt(paymentsCount, 10) > 1 ? t('form.firstPaid') : t('form.alreadyPaid')}
            </span>
            <span className="block text-[10px] text-slate-400 font-medium">{t('form.paidHint')}</span>
          </span>
          <span
            className={`w-11 h-6 rounded-full flex items-center px-0.5 transition-colors flex-shrink-0 ${
              firstPaymentPaid ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                firstPaymentPaid ? 'translate-x-5' : ''
              }`}
            />
          </span>
        </button>
      )}

      {!isTax && (
        <InstallmentPreview
          total={parseFloat(amount.replace(',', '.')) || 0}
          count={Math.max(1, parseInt(paymentsCount, 10) || 1)}
          currency={baseCurrency}
          firstPaid={firstPaymentPaid}
        />
      )}
    </ModalShell>
  );
}
