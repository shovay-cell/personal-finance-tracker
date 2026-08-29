'use client';

import React, { useState } from 'react';
import { Check, Percent, Receipt, Trash2 } from 'lucide-react';
import { CurrencyCode, FinanceAccount, FinanceCategory, VatPayment, VatSummary } from '@/types';
import { addTransaction, addVatPayment, deleteVatPayment, todayIso } from '@/lib/db';
import { formatDateHuman, formatMoney } from '@/services/analytics';
import { useT } from '@/i18n/context';
import { accountName } from '@/i18n/categories';
import { Card, Field, ModalShell, PrimaryButton, inputClass } from './ui';

/**
 * VAT set aside from income is a debt, not income: it is shown next to the other
 * obligations, with the remittance recorded as a real expense so the balance
 * follows the money out.
 */
export function VatCard({
  summary,
  payments,
  currency,
  accounts,
  categories,
}: {
  summary: VatSummary;
  payments: VatPayment[];
  currency: CurrencyCode;
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
}) {
  const { t } = useT();
  const [isPaying, setIsPaying] = useState(false);

  return (
    <>
      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
              {t('vat.duePlusRate')} {summary.rate}%
            </p>
            <p
              className={`text-2xl font-black tabular-nums mt-0.5 ${
                summary.outstanding > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {formatMoney(summary.outstanding, currency)}
            </p>
          </div>

          <span className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
            <Percent className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-2.5">
            <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">{t('vat.accrued')}</p>
            <p className="text-xs font-black text-slate-700 dark:text-slate-200 tabular-nums mt-0.5">
              {formatMoney(summary.accrued, currency, { compact: true })}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-2.5">
            <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">{t('vat.paid')}</p>
            <p className="text-xs font-black text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
              {formatMoney(summary.paid, currency, { compact: true })}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-2.5">
            <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">{t('vat.profit')}</p>
            <p className="text-xs font-black text-slate-700 dark:text-slate-200 tabular-nums mt-0.5">
              {formatMoney(summary.netIncome, currency, { compact: true })}
            </p>
          </div>
        </div>

        <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
          {t('vat.separatedFrom')}: {summary.incomeCount} — {t('vat.notInProfit')}
        </p>

        {payments.length > 0 && (
          <div className="space-y-1 pt-1 border-t border-slate-50 dark:border-slate-800">
            {payments.map((payment) => (
              <div key={payment.id} className="flex items-center gap-2 text-[10.5px]">
                <Check className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                <span className="flex-1 truncate text-slate-500 dark:text-slate-400">
                  {formatDateHuman(payment.date)}
                  {payment.note ? ` · ${payment.note}` : ''}
                </span>
                <span className="font-black text-slate-600 dark:text-slate-300 tabular-nums">
                  {formatMoney(payment.amount, payment.currency)}
                </span>
                <button
                  type="button"
                  onClick={() => deleteVatPayment(payment.id)}
                  className="text-slate-300 hover:text-rose-500 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {summary.outstanding > 0.009 && (
          <button
            type="button"
            onClick={() => setIsPaying(true)}
            className="w-full py-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 text-[11px] font-black flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
          >
            <Receipt className="w-3.5 h-3.5" />
            {t('vat.markPayment')}
          </button>
        )}
      </Card>

      {isPaying && (
        <VatPaymentModal
          outstanding={summary.outstanding}
          currency={currency}
          accounts={accounts}
          categories={categories}
          onClose={() => setIsPaying(false)}
        />
      )}
    </>
  );
}

function VatPaymentModal({
  outstanding,
  currency,
  accounts,
  categories,
  onClose,
}: {
  outstanding: number;
  currency: CurrencyCode;
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  onClose: () => void;
}) {
  const { t, language } = useT();
  const [amount, setAmount] = useState(String(outstanding));
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const numericAmount = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return setError(t('vat.enterAmount'));

    const category =
      categories.find((c) => c.id === 'cat-fees') ||
      categories.find((c) => c.kind === 'EXPENSE');

    const transaction = await addTransaction({
      kind: 'EXPENSE',
      amount: numericAmount,
      currency,
      categoryId: category?.id || '',
      accountId: accountId || accounts[0]?.id,
      date,
      note: note.trim() || t('vat.paymentNote'),
      source: 'MANUAL',
    } as any);

    await addVatPayment({
      amount: numericAmount,
      currency,
      date,
      note: note.trim() || undefined,
      transactionId: transaction.id,
    });

    onClose();
  };

  return (
    <ModalShell
      title={t('vat.paymentTitle')}
      subtitle={`${t('vat.due')}: ${formatMoney(outstanding, currency)}`}
      icon={<Percent className="w-5 h-5" />}
      onClose={onClose}
      maxWidthClass="max-w-md"
      footer={
        <div className="space-y-2">
          {error && <p className="text-[11px] font-bold text-rose-500 text-center">{error}</p>}
          <PrimaryButton onClick={handleSave}>{t('vat.record')}</PrimaryButton>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label={`${t('common.amount')}, ${currency}`}>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputClass} text-lg font-black`}
            autoFocus
          />
        </Field>
        <Field label={t('common.date')}>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label={t('vat.debitAccount')}>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputClass}>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {accountName(account, language)}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t('obl.note')} hint={t('vat.noteHint')}>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('vat.notePlaceholder')}
          className={inputClass}
        />
      </Field>

      <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
        {t('vat.footer')}
      </p>
    </ModalShell>
  );
}
