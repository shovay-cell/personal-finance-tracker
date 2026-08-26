'use client';

import React, { useMemo, useState } from 'react';
import {
  Coins,
  ImagePlus,
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
  ReceiptScanMeta,
  Transaction,
  TransactionKind,
  TransactionSplit,
} from '@/types';
import {
  addTransaction,
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
  const [uncertainFields, setUncertainFields] = useState<ReceiptFieldFlag[]>(
    prefill?.uncertainFields || existing?.receiptScan?.uncertainFields || []
  );
  const [authorId, setAuthorId] = useState(existing?.authorId || getCurrentMemberId());
  const [isSaving, setIsSaving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
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
      else setError(err.message || 'Не удалось распознать чек');
    } finally {
      setIsScanning(false);
    }
  };

  const handleSubmit = async () => {
    const numericAmount = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Укажите сумму больше нуля');
      return;
    }
    if (!categoryId) {
      setError('Выберите категорию');
      return;
    }
    if (!accountId) {
      setError('Выберите счёт');
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
        authorId,
        source: existing?.source || prefill?.source || (receiptScan ? 'RECEIPT_SCAN' : 'MANUAL'),
      };

      if (existing) {
        await updateTransaction(existing.id, payload as Partial<Transaction>);
        onSaved?.({ ...existing, ...payload } as Transaction);
      } else {
        const created = await addTransaction(payload as any);
        onSaved?.(created);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Не удалось сохранить операцию');
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
      title={existing ? 'Операция' : kind === 'EXPENSE' ? 'Новый расход' : 'Новый доход'}
      subtitle={
        uncertainFields.length > 0
          ? 'ИИ не уверен в подсвеченных полях — проверьте их перед сохранением'
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
            <span>{existing ? 'Сохранить изменения' : 'Записать операцию'}</span>
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
            label: 'РАСХОДЫ',
            activeClass: 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-sm',
          },
          {
            value: 'INCOME',
            label: 'ДОХОДЫ',
            activeClass: 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm',
          },
        ]}
      />

      <Field label={`Сумма, ${CURRENCIES[currency].symbol}`} warn={uncertainFields.includes('amount')}>
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
            Операция в {CURRENCIES[currency].name} ({CURRENCIES[currency].symbol}) — в отчётах
            пересчитывается в {baseCurrency} по курсу из настроек.
          </p>
        </div>
      )}

      <Field label="Категория" warn={uncertainFields.includes('category')}>
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
        <Field label="Подкатегория">
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

      {splits.length > 0 ? (
        <Field
          label="Разделение чека"
          hint="Одна покупка распределяется между категориями — в отчётах и бюджетах учтётся каждая часть"
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
            Отменить разделение
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
          Разделить чек между категориями
        </button>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Дата" warn={uncertainFields.includes('date')}>
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

        <Field label="Счёт">
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

      <Field label="Продавец / место" warn={uncertainFields.includes('merchant')}>
        <input
          type="text"
          value={merchant}
          onChange={(e) => {
            setMerchant(e.target.value);
            confirmField('merchant');
          }}
          placeholder="Например, Rami Levy"
          className={fieldClass(uncertainFields, 'merchant')}
        />
      </Field>

      <Field label="Заметка">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Комментарий к операции"
          className={inputClass}
        />
      </Field>

      {members.length > 1 && (
        <Field label="Автор операции">
          <select
            value={authorId}
            onChange={(e) => setAuthorId(e.target.value)}
            className={inputClass}
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Чек" hint="Фото хранится вместе с операцией для последующей сверки">
        <div className="flex gap-2">
          <label className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 text-[11px] font-black cursor-pointer border border-sky-100 dark:border-sky-900 active:scale-95 transition-transform">
            <Sparkles className="w-3.5 h-3.5" />
            Снять и распознать
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
            Файл
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
            Gemini распознаёт чек…
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
              alt="Чек"
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
              Позиции чека ({receiptScan.lineItems.length})
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
          Удалить операцию
        </button>
      )}
    </ModalShell>
  );
}
