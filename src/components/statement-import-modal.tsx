'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ImagePlus,
  Layers,
  Loader2,
  ScanLine,
  Trash2,
} from 'lucide-react';
import {
  CurrencyCode,
  FinanceAccount,
  FinanceCategory,
  ParsedStatementRow,
  Transaction,
  TransactionKind,
} from '@/types';
import { addTransaction, todayIso } from '@/lib/db';
import { formatMoney } from '@/services/analytics';
import {
  analyzeStatementWithAI,
  readFileAsDataUrl,
  ReceiptScanError,
  resolveStatementCategoryId,
} from '@/services/ai/receipt-parser';
import { GeminiKeyPrompt } from './gemini-key-prompt';
import { useT } from '@/i18n/context';
import { accountName, categoryName } from '@/i18n/categories';
import { Field, ModalShell, PrimaryButton, inputClass } from './ui';

interface DraftRow extends ParsedStatementRow {
  id: string;
  categoryId: string;
  selected: boolean;
  /** Same date and amount already exist — importing again would double-count. */
  duplicate: boolean;
}

/**
 * Reads a photographed list of bank operations and imports every line as its own
 * transaction. Nothing is written until the user has looked the list over: an
 * import that silently invents or duplicates income is worse than no import.
 */
export function StatementImportModal({
  categories,
  accounts,
  transactions,
  baseCurrency,
  onClose,
  onImported,
}: {
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  transactions: Transaction[];
  baseCurrency: CurrencyCode;
  onClose: () => void;
  onImported: (count: number) => void;
}) {
  const { t, language } = useT();
  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [bulkCategoryId, setBulkCategoryId] = useState('');

  const incomeCategories = useMemo(
    () => categories.filter((c) => c.kind === 'INCOME' && !c.parentId && !c.isHidden),
    [categories]
  );
  const expenseCategories = useMemo(
    () => categories.filter((c) => c.kind === 'EXPENSE' && !c.parentId && !c.isHidden),
    [categories]
  );

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setIsBusy(true);
    setError(null);
    setKeyError(null);
    setLastFile(file);

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const parsed = await analyzeStatementWithAI(dataUrl, file.type || 'image/jpeg');

      setRows(
        parsed.rows.map((row, index) => ({
          ...row,
          id: `row-${index}`,
          date: row.date || todayIso(),
          categoryId: resolveStatementCategoryId(row, categories) || '',
          selected: true,
          duplicate: transactions.some(
            (t) =>
              t.date === row.date &&
              Math.abs(t.amount - (row.amount || 0)) < 0.01 &&
              t.kind === row.kind
          ),
        }))
      );
    } catch (err: any) {
      if (err instanceof ReceiptScanError && err.needsApiKey) setKeyError(err.message);
      else setError(err.message || t('si.scanFailed'));
    } finally {
      setIsBusy(false);
    }
  };

  const update = (id: string, patch: Partial<DraftRow>) =>
    setRows((prev) => prev?.map((row) => (row.id === id ? { ...row, ...patch } : row)) || null);

  const selected = rows?.filter((row) => row.selected && row.categoryId && row.amount) || [];
  const selectedTotal = selected.reduce(
    (sum, row) => sum + (row.kind === 'INCOME' ? row.amount || 0 : -(row.amount || 0)),
    0
  );

  const handleImport = async () => {
    if (selected.length === 0) return;
    setIsBusy(true);

    try {
      for (const row of selected) {
        await addTransaction({
          kind: row.kind,
          amount: row.amount as number,
          currency: row.currency || baseCurrency,
          categoryId: row.categoryId,
          accountId: accountId || accounts[0]?.id,
          date: row.date as string,
          note: row.description,
          source: 'RECEIPT_SCAN',
        } as any);
      }
      onImported(selected.length);
      onClose();
    } catch (err: any) {
      setError(err.message || t('si.importFailed'));
      setIsBusy(false);
    }
  };

  return (
    <ModalShell
      title={t('si.title')}
      subtitle={
        rows
          ? `${t('si.recognizedRows')}: ${rows.length} — ${t('si.checkBeforeImport')}`
          : t('si.subtitle')
      }
      icon={<Layers className="w-5 h-5" />}
      onClose={onClose}
      footer={
        rows ? (
          <div className="space-y-2">
            {error && <p className="text-[11px] font-bold text-rose-500 text-center">{error}</p>}
            <PrimaryButton onClick={handleImport} disabled={isBusy || selected.length === 0} variant="success">
              {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {t('si.importCount')}: {selected.length} ·{' '}
              {formatMoney(selectedTotal, baseCurrency)}
            </PrimaryButton>
          </div>
        ) : undefined
      }
    >
      {!rows && (
        <div className="py-6 text-center space-y-3">
          {isBusy ? (
            <>
              <Loader2 className="w-9 h-9 mx-auto text-sky-500 animate-spin" />
              <p className="text-xs font-black text-slate-600 dark:text-slate-300">
                {t('si.geminiReading')}
              </p>
              <p className="text-[11px] text-slate-400 font-medium px-6">
                {t('si.eachRow')}
              </p>
            </>
          ) : (
            <>
              <Layers className="w-9 h-9 mx-auto text-sky-500" />
              <div className="flex gap-2">
                <label className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl bg-gradient-to-tr from-sky-500 to-cyan-400 text-white text-xs font-black cursor-pointer active:scale-95 transition-transform">
                  <ScanLine className="w-4 h-4" />
                  {t('si.photograph')}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0] || null)}
                  />
                </label>
                <label className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 text-[11px] font-black cursor-pointer">
                  <ImagePlus className="w-3.5 h-3.5" />
                  {t('form.file')}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
              <p className="text-[11px] text-slate-400 font-medium px-4">
                {t('si.shotHint')}
              </p>
              {error && <p className="text-[11px] font-bold text-rose-500 px-4">{error}</p>}
              {keyError && (
                <GeminiKeyPrompt message={keyError} onRetry={() => handleFile(lastFile)} />
              )}
            </>
          )}
        </div>
      )}

      {rows && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('obl.creditAccount')}>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className={`${inputClass} text-xs`}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {accountName(account, language)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t('si.bulkCategory')}>
              <select
                value={bulkCategoryId}
                onChange={(e) => {
                  const value = e.target.value;
                  setBulkCategoryId(value);
                  if (!value) return;
                  const kind = incomeCategories.some((c) => c.id === value) ? 'INCOME' : 'EXPENSE';
                  setRows(
                    (prev) =>
                      prev?.map((row) =>
                        row.kind === kind ? { ...row, categoryId: value } : row
                      ) || null
                  );
                }}
                className={`${inputClass} text-xs`}
              >
                <option value="">{t('si.keepAsIs')}</option>
                <optgroup label={t('si.incomeGroup')}>
                  {incomeCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {categoryName(category, language)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={t('si.expenseGroup')}>
                  {expenseCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {categoryName(category, language)}
                    </option>
                  ))}
                </optgroup>
              </select>
            </Field>
          </div>

          <div className="space-y-2">
            {rows.map((row) => {
              const pool = row.kind === 'INCOME' ? incomeCategories : expenseCategories;
              const needsAttention = row.uncertainFields.length > 0 || !row.categoryId;

              return (
                <div
                  key={row.id}
                  className={`rounded-2xl border p-2.5 space-y-2 transition-opacity ${
                    row.selected ? '' : 'opacity-40'
                  } ${
                    row.duplicate
                      ? 'border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20'
                      : needsAttention
                      ? 'border-amber-200 dark:border-amber-900'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => update(row.id, { selected: !row.selected })}
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                        row.selected
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {row.selected && <Check className="w-3 h-3" />}
                    </button>

                    <input
                      type="date"
                      value={row.date || ''}
                      onChange={(e) => update(row.id, { date: e.target.value })}
                      className={`${inputClass} text-[11px] py-1.5 w-36`}
                    />

                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.amount ?? ''}
                      onChange={(e) =>
                        update(row.id, { amount: parseFloat(e.target.value.replace(',', '.')) || 0 })
                      }
                      className={`${inputClass} text-xs py-1.5 flex-1 font-black`}
                    />

                    <button
                      type="button"
                      onClick={() =>
                        update(row.id, {
                          kind: row.kind === 'INCOME' ? 'EXPENSE' : ('INCOME' as TransactionKind),
                          categoryId: '',
                        })
                      }
                      className={`px-2 py-1.5 rounded-lg text-[10px] font-black flex-shrink-0 ${
                        row.kind === 'INCOME'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                          : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                      }`}
                    >
                      {row.kind === 'INCOME' ? t('si.incomeTag') : t('si.expenseTag')}
                    </button>

                    <button
                      type="button"
                      onClick={() => setRows((prev) => prev?.filter((r) => r.id !== row.id) || null)}
                      className="text-slate-300 hover:text-rose-500 flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={row.categoryId}
                      onChange={(e) => update(row.id, { categoryId: e.target.value })}
                      className={`${inputClass} text-[11px] py-1.5 flex-1`}
                    >
                      <option value="">{t('si.categoryPlaceholder')}</option>
                      {pool.map((category) => (
                        <option key={category.id} value={category.id}>
                          {categoryName(category, language)}
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      value={row.description || ''}
                      onChange={(e) => update(row.id, { description: e.target.value })}
                      placeholder={t('si.purpose')}
                      className={`${inputClass} text-[11px] py-1.5 flex-1`}
                    />
                  </div>

                  {(row.duplicate || row.uncertainFields.length > 0) && (
                    <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
                      <AlertTriangle className="w-3 h-3 mt-px flex-shrink-0" />
                      {row.duplicate
                        ? t('si.duplicate')
                        : `${t('si.aiUnsure')}: ${row.uncertainFields.join(', ')}`}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </ModalShell>
  );
}
