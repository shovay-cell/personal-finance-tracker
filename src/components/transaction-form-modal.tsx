'use client';

import React, { useMemo, useState } from 'react';
import {
  Coins,
  ImagePlus,
  Percent,
  Repeat,
  Scale,
  Scissors,
  Loader2,
  Save,
  Sparkles,
  Trash2,
  Wallet,
} from 'lucide-react';
import {
  CurrencyCode,
  FinanceAccount,
  FinanceCategory,
  ProfileMember,
  ReceiptFieldFlag,
  FinanceSettings,
  ReceiptScanMeta,
  Transaction,
  TransactionKind,
  TransactionSplit,
  RecurrenceUnit,
  DebtKind,
} from '@/types';
import {
  addDebtPlan,
  addPlannedPayment,
  addTransaction,
  buildInstallmentAmounts,
  deleteTransaction,
  getCurrentMemberId,
  todayIso,
  updateTransaction,
} from '@/lib/db';
import {
  CategoryGrid,
  Field,
  ModalShell,
  PrimaryButton,
  SegmentedControl,
  fieldClass,
  inputClass,
} from './ui';
import { CURRENCIES } from '@/constants/categories';
import { useT } from '@/i18n/context';
import type { TranslationKey } from '@/i18n/dictionary';
import { unitNoun } from '@/i18n/plurals';
import { seededName } from '@/i18n/categories';
import { translate } from '@/i18n/dictionary';
import { getActiveLanguage } from '@/i18n/runtime';
import { netFromGross, vatFromGross } from '@/services/vat';
import { formatMoney } from '@/services/analytics';
import { CategoryEditorModal } from './category-manager-modal';
import { GeminiKeyPrompt } from './gemini-key-prompt';
import { SplitEditor } from './split-editor';
import {
  analyzeReceiptWithAI,
  ReceiptScanError,
  compressForStorage,
  readFileAsDataUrl,
  resolveCategoryId,
} from '@/services/ai/receipt-parser';

export interface TransactionPrefill {
  kind?: TransactionKind;
  amount?: number;
  currency?: CurrencyCode;
  categoryId?: string;
  accountId?: string;
  date?: string;
  note?: string;
  merchant?: string;
  receiptPhoto?: string;
  receiptScan?: ReceiptScanMeta;
  uncertainFields?: ReceiptFieldFlag[];
  source?: Transaction['source'];
}

interface TransactionFormModalProps {
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  members: ProfileMember[];
  settings: FinanceSettings;
  baseCurrency: CurrencyCode;
  existing?: Transaction | null;
  prefill?: TransactionPrefill;
  onClose: () => void;
  onSaved?: (transaction: Transaction) => void;
}

export function TransactionFormModal({
  categories,
  accounts,
  members,
  settings,
  baseCurrency,
  existing,
  prefill,
  onClose,
  onSaved,
}: TransactionFormModalProps) {
  const [kind, setKind] = useState<TransactionKind>(
    existing?.kind || prefill?.kind || 'EXPENSE'
  );
  const [amount, setAmount] = useState(
    existing ? String(existing.amount) : prefill?.amount ? String(prefill.amount) : ''
  );
  const [currency, setCurrency] = useState<CurrencyCode>(
    existing?.currency || prefill?.currency || baseCurrency
  );
  const [categoryId, setCategoryId] = useState<string>(
    existing?.categoryId || prefill?.categoryId || ''
  );
  const [subcategoryId, setSubcategoryId] = useState<string | undefined>(existing?.subcategoryId);
  const [accountId, setAccountId] = useState<string>(
    existing?.accountId || prefill?.accountId || accounts[0]?.id || ''
  );
  const [date, setDate] = useState(existing?.date || prefill?.date || todayIso());
  const [note, setNote] = useState(existing?.note || prefill?.note || '');
  const [merchant, setMerchant] = useState(existing?.merchant || prefill?.merchant || '');
  const [receiptPhoto, setReceiptPhoto] = useState<string | undefined>(
    existing?.receiptPhoto || prefill?.receiptPhoto
  );
  const [receiptScan, setReceiptScan] = useState<ReceiptScanMeta | undefined>(
    existing?.receiptScan || prefill?.receiptScan
  );
  const [splits, setSplits] = useState<TransactionSplit[]>(existing?.splits || []);
  const [separateVat, setSeparateVat] = useState(
    existing ? (existing.vatAmount || 0) > 0 : settings.vatEnabled && settings.vatSeparateByDefault
  );
  const [uncertainFields, setUncertainFields] = useState<ReceiptFieldFlag[]>(
    prefill?.uncertainFields || existing?.receiptScan?.uncertainFields || []
  );
  const [authorId, setAuthorId] = useState(existing?.authorId || getCurrentMemberId());
  const [isSaving, setIsSaving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [isRepeating, setIsRepeating] = useState(false);
  const [repeatCount, setRepeatCount] = useState('1');
  const [repeatUnit, setRepeatUnit] = useState<RecurrenceUnit>('MONTH');
  const [isDebt, setIsDebt] = useState(false);
  const [debtKind, setDebtKind] = useState<DebtKind>('INSTALLMENT');
  const [paymentsCount, setPaymentsCount] = useState('6');
  const [installmentUnit, setInstallmentUnit] = useState<RecurrenceUnit>('MONTH');
  const [installmentInterval, setInstallmentInterval] = useState('1');
  const [firstDueDate, setFirstDueDate] = useState(todayIso());
  const [firstPaymentPaid, setFirstPaymentPaid] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const { t, language } = useT();
  const [lastScanFile, setLastScanFile] = useState<File | null>(null);

  const rootCategories = useMemo(
    () => categories.filter((c) => c.kind === kind && !c.parentId && !c.isHidden),
    [categories, kind]
  );
  const subcategories = useMemo(
    () => categories.filter((c) => c.parentId === categoryId && !c.isHidden),
    [categories, categoryId]
  );

  /** Clearing a flag as the user edits the field is what "confirmed" means here. */
  const confirmField = (field: ReceiptFieldFlag) =>
    setUncertainFields((prev) => prev.filter((f) => f !== field));

  const handlePhoto = async (file: File | null, analyze: boolean) => {
    if (!file) return;
    setError(null);
    setKeyError(null);
    setLastScanFile(file);

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setReceiptPhoto(await compressForStorage(dataUrl));

      if (!analyze) return;

      setIsScanning(true);
      const parsed = await analyzeReceiptWithAI(dataUrl, file.type || 'image/jpeg');

      if (parsed.amount !== undefined) setAmount(String(parsed.amount));
      if (parsed.currency) setCurrency(parsed.currency);
      if (parsed.date) setDate(parsed.date);
      if (parsed.merchant) setMerchant(parsed.merchant);

      const suggested = resolveCategoryId(parsed.suggestedCategoryName, parsed.merchant, categories);
      if (suggested) setCategoryId(suggested);

      setKind('EXPENSE');
      setUncertainFields(parsed.uncertainFields);
      setReceiptScan({
        merchant: parsed.merchant,
        lineItems: parsed.lineItems,
        rawText: parsed.rawText,
        uncertainFields: parsed.uncertainFields,
        modelConfidence: parsed.modelConfidence,
        scannedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      if (err instanceof ReceiptScanError && err.needsApiKey) setKeyError(err.message);
      else setError(err.message || t('tf.scanFailed'));
    } finally {
      setIsScanning(false);
    }
  };

  const handleSubmit = async () => {
    const numericAmount = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError(t('tf.amountAboveZero'));
      return;
    }
    if (!categoryId) {
      setError(t('tf.pickCategory'));
      return;
    }
    if (!accountId) {
      setError(t('tf.pickAccount'));
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        kind,
        amount: numericAmount,
        currency,
        categoryId,
        subcategoryId,
        splits: splits.length > 1 ? splits : undefined,
        accountId,
        date,
        note: note.trim() || undefined,
        merchant: merchant.trim() || undefined,
        receiptPhoto,
        receiptScan: receiptScan
          ? { ...receiptScan, uncertainFields }
          : undefined,
        // VAT belongs to the tax authority from the moment the money arrives —
        // full payment, partial payment and advance alike.
        vatAmount:
          kind === 'INCOME' && settings.vatEnabled && separateVat
            ? vatFromGross(numericAmount, settings.vatRate)
            : undefined,
        vatRate:
          kind === 'INCOME' && settings.vatEnabled && separateVat ? settings.vatRate : undefined,
        authorId,
        source: existing?.source || prefill?.source || (receiptScan ? 'RECEIPT_SCAN' : 'MANUAL'),
      };

      if (existing) {
        await updateTransaction(existing.id, payload as Partial<Transaction>);
        onSaved?.({ ...existing, ...payload } as Transaction);
        onClose();
        return;
      }

      // A liability is not an expense today: it becomes a debt with a schedule,
      // and only the payments actually marked paid turn into expenses.
      if (kind === 'EXPENSE' && isDebt) {
        const count = Math.max(1, parseInt(paymentsCount, 10) || 1);
        await addDebtPlan({
          kind: debtKind,
          title: merchant.trim() || note.trim() || t(DEBT_KIND_META[debtKind].defaultTitle),
          merchant: merchant.trim() || undefined,
          totalAmount: numericAmount,
          currency,
          categoryId,
          accountId,
          startDate: date,
          firstDueDate,
          note: note.trim() || undefined,
          paymentsCount: count,
          intervalUnit: installmentUnit,
          intervalCount: Math.max(1, parseInt(installmentInterval, 10) || 1),
          firstPaymentPaid,
        });
        onClose();
        return;
      }

      const created = await addTransaction(payload as any);
      onSaved?.(created);

      if (isRepeating) {
        const every = Math.max(1, parseInt(repeatCount, 10) || 1);
        await addPlannedPayment({
          title: merchant.trim() || note.trim() || t('tf.recurringTitle'),
          planKind: 'PAYMENT',
          kind,
          amount: numericAmount,
          currency,
          categoryId,
          accountId,
          recurrence: 'CUSTOM_DAYS',
          intervalUnit: repeatUnit,
          intervalCount: every,
          // The operation just saved counts as this period; the rule starts next.
          nextDueDate: shiftByUnit(date, repeatUnit, every),
          remindDaysBefore: 1,
          autoCreate: false,
          isActive: true,
          note: note.trim() || undefined,
        });
      }

      onClose();
    } catch (err: any) {
      setError(err.message || t('tf.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existing) return;
    await deleteTransaction(existing.id);
    onClose();
  };

  return (
    <ModalShell
      title={
        existing
          ? t('form.operation')
          : kind === 'EXPENSE'
          ? t('form.newExpense')
          : t('form.newIncome')
      }
      subtitle={
        uncertainFields.length > 0
          ? t('form.uncertainHint')
          : undefined
      }
      icon={<Wallet className="w-5 h-5" />}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {error && (
            <p className="text-[11px] font-bold text-rose-500 text-center px-2">{error}</p>
          )}
          <PrimaryButton
            onClick={handleSubmit}
            disabled={isSaving || isScanning}
            variant={kind === 'EXPENSE' ? 'primary' : 'success'}
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{existing ? t('form.saveChanges') : t('form.saveOperation')}</span>
          </PrimaryButton>
        </div>
      }
    >
      <SegmentedControl<TransactionKind>
        value={kind}
        onChange={(next) => {
          setKind(next);
          setCategoryId('');
          setSubcategoryId(undefined);
        }}
        options={[
          {
            value: 'EXPENSE',
            label: t('common.expenses'),
            activeClass: 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-sm',
          },
          {
            value: 'INCOME',
            label: t('common.incomes'),
            activeClass: 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm',
          },
        ]}
      />

      <Field
        label={`${t('common.amount')}, ${CURRENCIES[currency].symbol}`}
        warn={uncertainFields.includes('amount')}
      >
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              confirmField('amount');
            }}
            placeholder="0"
            className={`${fieldClass(uncertainFields, 'amount')} text-2xl font-black py-3`}
            autoFocus={!existing}
          />
        </div>
      </Field>

      {currency !== baseCurrency && (
        <div className="flex items-start gap-2 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400">
          <Coins className="w-4 h-4 flex-shrink-0 mt-px" />
          <p className="text-[11px] font-bold leading-relaxed">
            {t('tf.currencyNoteA')} {CURRENCIES[currency].name} ({CURRENCIES[currency].symbol}){' '}
            {t('tf.currencyNoteB')} {baseCurrency} {t('tf.currencyNoteC')}
          </p>
        </div>
      )}

      <Field label={t('common.category')} warn={uncertainFields.includes('category')}>
        <CategoryGrid
          categories={rootCategories}
          selectedId={categoryId}
          onSelect={(id) => {
            setCategoryId(id);
            setSubcategoryId(undefined);
            confirmField('category');
          }}
          onCreate={() => setIsCreatingCategory(true)}
        />
      </Field>

      {subcategories.length > 0 && (
        <Field label={t('form.subcategory')}>
          <div className="flex flex-wrap gap-2">
            {subcategories.map((sub) => (
              <button
                key={sub.id}
                type="button"
                onClick={() => setSubcategoryId(subcategoryId === sub.id ? undefined : sub.id)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${
                  subcategoryId === sub.id
                    ? 'bg-sky-500 text-white border-transparent'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                }`}
              >
                {sub.name}
              </button>
            ))}
          </div>
        </Field>
      )}

      {kind === 'EXPENSE' && !existing && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 space-y-2.5">
          <button
            type="button"
            onClick={() => {
              setIsRepeating((prev) => !prev);
              if (!isRepeating) setIsDebt(false);
            }}
            className="w-full flex items-center justify-between gap-3 text-left"
          >
            <span className="flex items-start gap-2">
              <Repeat className="w-4 h-4 text-slate-400 mt-px flex-shrink-0" />
              <span>
                <span className="block text-xs font-black text-slate-800 dark:text-slate-100">
                  {t('form.repeat')}
                </span>
                <span className="block text-[10px] text-slate-400 font-medium mt-0.5">
                  {t('form.repeatHint')}
                </span>
              </span>
            </span>
            <span
              className={`w-11 h-6 rounded-full flex items-center px-0.5 transition-colors flex-shrink-0 ${
                isRepeating ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  isRepeating ? 'translate-x-5' : ''
                }`}
              />
            </span>
          </button>

          {isRepeating && (
            <div className="flex items-end gap-2 pt-1">
              <Field label={t('form.repeatEvery')}>
                <input
                  type="number"
                  min={1}
                  value={repeatCount}
                  onChange={(e) => setRepeatCount(e.target.value)}
                  className={`${inputClass} w-20 text-center font-black`}
                />
              </Field>
              <div className="flex-1">
                <Field label={t('form.period')}>
                  <select
                    value={repeatUnit}
                    onChange={(e) => setRepeatUnit(e.target.value as RecurrenceUnit)}
                    className={inputClass}
                  >
                    <option value="DAY">{pluralUnit('DAY', repeatCount)}</option>
                    <option value="WEEK">{pluralUnit('WEEK', repeatCount)}</option>
                    <option value="MONTH">{pluralUnit('MONTH', repeatCount)}</option>
                    <option value="YEAR">{pluralUnit('YEAR', repeatCount)}</option>
                  </select>
                </Field>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setIsDebt((prev) => !prev);
              if (!isDebt) setIsRepeating(false);
            }}
            className="w-full flex items-center justify-between gap-3 text-left pt-2 border-t border-slate-100 dark:border-slate-800"
          >
            <span className="flex items-start gap-2">
              <Scale className="w-4 h-4 text-slate-400 mt-px flex-shrink-0" />
              <span>
                <span className="block text-xs font-black text-slate-800 dark:text-slate-100">
                  {t('form.asDebt')}
                </span>
                <span className="block text-[10px] text-slate-400 font-medium mt-0.5">
                  {t('form.asDebtHint')}
                </span>
              </span>
            </span>
            <span
              className={`w-11 h-6 rounded-full flex items-center px-0.5 transition-colors flex-shrink-0 ${
                isDebt ? 'bg-violet-500' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  isDebt ? 'translate-x-5' : ''
                }`}
              />
            </span>
          </button>

          {isDebt && (
            <div className="space-y-2.5 pt-1">
              <div className="grid grid-cols-4 gap-1.5">
                {(Object.keys(DEBT_KIND_META) as DebtKind[]).map((option) => {
                  const meta = DEBT_KIND_META[option];
                  const isActive = debtKind === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setDebtKind(option);
                        setPaymentsCount(String(meta.defaultPayments));
                      }}
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

              <div className="grid grid-cols-2 gap-3">
                <Field label={t('form.paymentsCount')}>
                  <input
                    type="number"
                    min={1}
                    value={paymentsCount}
                    onChange={(e) => setPaymentsCount(e.target.value)}
                    className={`${inputClass} text-center font-black`}
                  />
                </Field>
                <Field label={paymentsCount === '1' ? t('form.paymentDate') : t('form.firstPayment')}>
                  <input
                    type="date"
                    value={firstDueDate}
                    onChange={(e) => setFirstDueDate(e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>

              {parseInt(paymentsCount, 10) > 1 && (
                <Field label={t('form.paymentsEvery')}>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      min={1}
                      value={installmentInterval}
                      onChange={(e) => setInstallmentInterval(e.target.value)}
                      className={`${inputClass} w-16 text-center`}
                    />
                    <select
                      value={installmentUnit}
                      onChange={(e) => setInstallmentUnit(e.target.value as RecurrenceUnit)}
                      className={`${inputClass} flex-1`}
                    >
                      <option value="WEEK">{pluralUnit('WEEK', installmentInterval)}</option>
                      <option value="MONTH">{pluralUnit('MONTH', installmentInterval)}</option>
                      <option value="YEAR">{pluralUnit('YEAR', installmentInterval)}</option>
                    </select>
                  </div>
                </Field>
              )}

              <button
                type="button"
                onClick={() => setFirstPaymentPaid((prev) => !prev)}
                className="w-full flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 text-left"
              >
                <span>
                  <span className="block text-[11px] font-black text-slate-700 dark:text-slate-200">
                    {parseInt(paymentsCount, 10) > 1
                      ? t('form.firstPaid')
                      : t('form.alreadyPaid')}
                  </span>
                  <span className="block text-[10px] text-slate-400 font-medium">
                    {t('form.paidHint')}
                  </span>
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

              <InstallmentPreview
                total={parseFloat(amount.replace(',', '.')) || 0}
                count={Math.max(1, parseInt(paymentsCount, 10) || 1)}
                currency={currency}
                firstPaid={firstPaymentPaid}
              />
            </div>
          )}
        </div>
      )}

      {kind === 'INCOME' && settings.vatEnabled && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-2">
          <button
            type="button"
            onClick={() => setSeparateVat((prev) => !prev)}
            className="w-full flex items-center justify-between gap-3 text-left"
          >
            <span className="flex items-start gap-2 min-w-0">
              <Percent className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-px flex-shrink-0" />
              <span>
                <span className="block text-xs font-black text-slate-800 dark:text-slate-100">
                  {t('form.vatSeparate')}
                </span>
                <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                  {t('tf.rate')} {settings.vatRate}% · {t('tf.vatRateHint')}
                </span>
              </span>
            </span>
            <span
              className={`w-11 h-6 rounded-full flex items-center px-0.5 transition-colors flex-shrink-0 ${
                separateVat ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  separateVat ? 'translate-x-5' : ''
                }`}
              />
            </span>
          </button>

          {separateVat && (
            <div className="flex items-center justify-between pt-2 border-t border-amber-200/70 dark:border-amber-900/70">
              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                {t('tf.profit')}:{' '}
                {netFromGross(parseFloat(amount.replace(',', '.')) || 0, settings.vatRate).toFixed(2)}
              </span>
              <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                {t('settings.vat')}:{' '}
                {vatFromGross(parseFloat(amount.replace(',', '.')) || 0, settings.vatRate).toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}

      {splits.length > 0 ? (
        <Field
          label={t('tf.splitLabel')}
          hint={t('tf.splitHint')}
        >
          <SplitEditor
            amount={parseFloat(amount.replace(',', '.')) || 0}
            currency={currency}
            categories={rootCategories}
            splits={splits}
            onChange={setSplits}
          />
          <button
            type="button"
            onClick={() => setSplits([])}
            className="mt-2 w-full py-2 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 text-[11px] font-black"
          >
            {t('tf.cancelSplit')}
          </button>
        </Field>
      ) : (
        <button
          type="button"
          onClick={() => {
            const total = parseFloat(amount.replace(',', '.')) || 0;
            const majority = Math.round(total * 0.7 * 100) / 100;
            setSplits([
              { categoryId, amount: majority },
              { categoryId: '', amount: Math.round((total - majority) * 100) / 100 },
            ]);
          }}
          className="w-full py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-black flex items-center justify-center gap-1.5"
        >
          <Scissors className="w-3.5 h-3.5" />
          {t('form.splitReceipt')}
        </button>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label={t('common.date')} warn={uncertainFields.includes('date')}>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              confirmField('date');
            }}
            className={fieldClass(uncertainFields, 'date')}
          />
        </Field>

        <Field label={t('common.account')}>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className={inputClass}
          >
            {accounts
              .filter((a) => !a.isArchived || a.id === accountId)
              .map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
          </select>
        </Field>
      </div>

      <Field label={t('form.merchant')} warn={uncertainFields.includes('merchant')}>
        <input
          type="text"
          value={merchant}
          onChange={(e) => {
            setMerchant(e.target.value);
            confirmField('merchant');
          }}
          placeholder={t('tf.merchantPlaceholder')}
          className={fieldClass(uncertainFields, 'merchant')}
        />
      </Field>

      <Field label={t('common.note')}>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('tf.notePlaceholder')}
          className={inputClass}
        />
      </Field>

      {members.length > 1 && settings.showTransactionAuthor && (
        <Field label={t('form.author')}>
          <select
            value={authorId}
            onChange={(e) => setAuthorId(e.target.value)}
            className={inputClass}
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {seededName('owner', member.displayName, language)}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label={t('form.receipt')} hint={t('tf.receiptHint')}>
        <div className="flex gap-2">
          <label className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 text-[11px] font-black cursor-pointer border border-sky-100 dark:border-sky-900 active:scale-95 transition-transform">
            <Sparkles className="w-3.5 h-3.5" />
            {t('form.scanAndRead')}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handlePhoto(e.target.files?.[0] || null, true)}
            />
          </label>
          <label className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 text-[11px] font-black cursor-pointer active:scale-95 transition-transform">
            <ImagePlus className="w-3.5 h-3.5" />
            {t('form.file')}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handlePhoto(e.target.files?.[0] || null, true)}
            />
          </label>
        </div>

        {isScanning && (
          <div className="mt-2 flex items-center gap-2 text-[11px] font-bold text-sky-600 dark:text-sky-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {t('tf.geminiReading')}
          </div>
        )}

        {keyError && (
          <div className="mt-2">
            <GeminiKeyPrompt
              message={keyError}
              onRetry={() => lastScanFile && handlePhoto(lastScanFile, true)}
            />
          </div>
        )}

        {receiptPhoto && (
          <div className="mt-2 relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={receiptPhoto}
              alt={t('tf.receiptAlt')}
              className="w-full max-h-52 object-contain rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
            <button
              type="button"
              onClick={() => {
                setReceiptPhoto(undefined);
                setReceiptScan(undefined);
              }}
              className="absolute top-2 right-2 w-8 h-8 rounded-xl bg-slate-900/70 text-white flex items-center justify-center"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {receiptScan?.lineItems && receiptScan.lineItems.length > 0 && (
          <div className="mt-2 rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
              {t('tf.receiptItems')} ({receiptScan.lineItems.length})
            </p>
            {receiptScan.lineItems.slice(0, 12).map((item, index) => (
              <div key={index} className="flex justify-between gap-2 text-[11px]">
                <span className="text-slate-600 dark:text-slate-300 truncate">
                  {item.quantity ? `${item.quantity}× ` : ''}
                  {item.name}
                </span>
                {item.price !== undefined && (
                  <span className="font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                    {item.price}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </Field>

      {isCreatingCategory && (
        <CategoryEditorModal
          category={null}
          defaultKind={kind}
          categories={categories}
          onClose={() => setIsCreatingCategory(false)}
          onCreated={(created) => {
            setCategoryId(created.id);
            setSubcategoryId(undefined);
            confirmField('category');
          }}
        />
      )}

      {existing && (
        <button
          type="button"
          onClick={handleDelete}
          className="w-full py-2.5 rounded-2xl text-[11px] font-black text-rose-500 bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t('form.deleteOperation')}
        </button>
      )}
    </ModalShell>
  );
}


/** Liability types that can be created straight from the expense form. */
const DEBT_KIND_META: Record<
  DebtKind,
  { label: TranslationKey; defaultTitle: TranslationKey; defaultPayments: number }
> = {
  INSTALLMENT: {
    label: 'tf.kindInstallment',
    defaultTitle: 'tf.kindInstallmentTitle',
    defaultPayments: 6,
  },
  CHEQUE: { label: 'tf.kindCheque', defaultTitle: 'tf.kindChequeTitle', defaultPayments: 1 },
  TAX: { label: 'tf.kindTax', defaultTitle: 'tf.kindTax', defaultPayments: 1 },
  LOAN: { label: 'tf.kindLoan', defaultTitle: 'tf.kindLoan', defaultPayments: 1 },
};

/** The period noun in the form that agrees with the number beside it. */
function pluralUnit(unit: RecurrenceUnit, rawCount: string): string {
  return unitNoun(unit, Math.max(1, parseInt(rawCount, 10) || 1));
}

function shiftByUnit(dateStr: string, unit: RecurrenceUnit, count: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);

  if (unit === 'DAY') date.setDate(date.getDate() + count);
  else if (unit === 'WEEK') date.setDate(date.getDate() + count * 7);
  else if (unit === 'YEAR') date.setFullYear(date.getFullYear() + count);
  else {
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + count);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(day, lastDay));
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

/** Shows the schedule the way it will be booked, before anything is saved. */
function InstallmentPreview({
  total,
  count,
  currency,
  firstPaid,
}: {
  total: number;
  count: number;
  currency: CurrencyCode;
  firstPaid: boolean;
}) {
  if (total <= 0) return null;
  // Rendered from a plain function, not a component with the hook — the label
  // lookup goes through the module-level active language instead.
  const tr = (key: TranslationKey) => translate(getActiveLanguage(), key);
  const amounts = buildInstallmentAmounts(total, count);
  const first = amounts[0];
  const single = amounts.length === 1;

  return (
    <div className="rounded-2xl bg-violet-50/70 dark:bg-violet-950/20 p-3 space-y-1">
      <p className="text-[10px] font-black uppercase tracking-wide text-violet-600 dark:text-violet-400">
        {tr('tf.schedule')}
      </p>
      <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
        {single ? formatMoney(first, currency) : `${count} × ${formatMoney(amounts[1] ?? first, currency)}`}
        {!single && amounts[1] !== undefined && amounts[0] !== amounts[1]
          ? ` (${tr('tf.firstIs')} ${formatMoney(first, currency)})`
          : ''}
      </p>
      <p className="text-[10.5px] text-slate-500 dark:text-slate-400 font-medium">
        {firstPaid
          ? single
            ? `${tr('tf.allNowA')} ${formatMoney(total, currency)} ${tr('tf.allNowB')}`
            : `${tr('tf.todayExpense')} ${formatMoney(first, currency)}, ${tr(
                'tf.debtLeft'
              )} ${formatMoney(Math.round((total - first) * 100) / 100, currency)}`
          : `${tr('tf.wholeAmount')} ${formatMoney(total, currency)} ${tr('tf.wholeAmountDebt')}`}
      </p>
    </div>
  );
}
