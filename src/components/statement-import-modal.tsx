'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CreditCard,
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
import { addFixedSchedulePlan, addTransaction, todayIso } from '@/lib/db';
import { formatMoney } from '@/services/analytics';
import {
  analyzeStatementTextWithAI,
  analyzeStatementWithAI,
  readFileAsDataUrl,
  ReceiptScanError,
  resolveStatementCategoryId,
} from '@/services/ai/receipt-parser';
import { isCsvFile, isSpreadsheetFile, readCsvAsTable, readSpreadsheetAsTable } from '@/services/ai/statement-table';
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
  /** Which file this row came from, shown only when more than one was picked. */
  sourceFile?: string;
  /** Booked as a debt plan (future payment) instead of an immediate expense. */
  asDebt: boolean;
  debtPaymentsCount: string;
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
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [fileErrors, setFileErrors] = useState<{ name: string; message: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [lastFiles, setLastFiles] = useState<File[]>([]);
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

  /** Reads one file through whichever pipeline matches its format — a
   *  spreadsheet and a CSV go through the text route, everything else
   *  (photo, scan, PDF) through the vision route Gemini already reads. */
  const parseOneFile = async (file: File): Promise<ParsedStatementRow[]> => {
    if (isSpreadsheetFile(file)) {
      const table = await readSpreadsheetAsTable(file);
      return (await analyzeStatementTextWithAI(table)).rows;
    }
    if (isCsvFile(file)) {
      const table = await readCsvAsTable(file);
      return (await analyzeStatementTextWithAI(table)).rows;
    }
    const dataUrl = await readFileAsDataUrl(file);
    return (await analyzeStatementWithAI(dataUrl, file.type || 'image/jpeg')).rows;
  };

  const handleFiles = async (fileList: FileList | File[] | null) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    setIsBusy(true);
    setError(null);
    setKeyError(null);
    setFileErrors([]);
    setLastFiles(files);
    setProgress({ done: 0, total: files.length });

    const draftRows: DraftRow[] = [];
    const failures: { name: string; message: string }[] = [];
    let keyErrorMessage: string | null = null;
    let rowIndex = 0;

    for (const file of files) {
      try {
        const parsedRows = await parseOneFile(file);
        for (const row of parsedRows) {
          draftRows.push({
            ...row,
            id: `row-${rowIndex++}`,
            date: row.date || todayIso(),
            categoryId: resolveStatementCategoryId(row, categories) || '',
            selected: true,
            asDebt: false,
            debtPaymentsCount: '1',
            sourceFile: files.length > 1 ? file.name : undefined,
            duplicate: transactions.some(
              (t) =>
                t.date === row.date &&
                Math.abs(t.amount - (row.amount || 0)) < 0.01 &&
                t.kind === row.kind
            ),
          });
        }
      } catch (err: any) {
        if (err instanceof ReceiptScanError && err.needsApiKey) {
          keyErrorMessage = err.message;
        }
        failures.push({ name: file.name, message: err.message || t('si.scanFailed') });
      }
      setProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : null));
    }

    setFileErrors(failures);
    if (keyErrorMessage) setKeyError(keyErrorMessage);
    if (draftRows.length > 0) setRows(draftRows);
    else if (failures.length > 0 && !keyErrorMessage) setError(t('si.allFilesFailed'));
    setIsBusy(false);
    setProgress(null);
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
        // A row marked «Кредит / рассрочка» is not money spent today — it
        // becomes a debt plan with its own schedule, same as picking that
        // option in the expense form, so it shows in Долги and Safe-to-Spend
        // instead of landing in the ledger as an immediate expense.
        if (row.asDebt && row.kind === 'EXPENSE') {
          await addFixedSchedulePlan({
            planType: 'INSTALLMENT',
            title: row.description?.trim() || t('tf.kindInstallmentTitle'),
            merchant: row.description,
            totalAmount: row.amount as number,
            currency: row.currency || baseCurrency,
            categoryId: row.categoryId,
            accountId: accountId || accounts[0]?.id,
            startDate: row.date as string,
            firstDueDate: row.date as string,
            paymentsCount: Math.max(1, parseInt(row.debtPaymentsCount, 10) || 1),
            intervalUnit: 'MONTH',
            intervalCount: 1,
            firstPaymentPaid: false,
          });
          continue;
        }

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
                {progress && progress.total > 1
                  ? ` (${t('si.processingProgress')} ${progress.done}/${progress.total})`
                  : ''}
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
                    onChange={(e) => handleFiles(e.target.files)}
                  />
                </label>
                <label className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 text-[11px] font-black cursor-pointer">
                  <ImagePlus className="w-3.5 h-3.5" />
                  {t('si.chooseFiles')}
                  <input
                    type="file"
                    accept="image/*,application/pdf,.pdf,.xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                  />
                </label>
              </div>
              <p className="text-[11px] text-slate-400 font-medium px-4">
                {t('si.shotHint')}
              </p>
              <p className="text-[10.5px] text-slate-400 font-medium px-4">{t('si.multiHint')}</p>
              {error && <p className="text-[11px] font-bold text-rose-500 px-4">{error}</p>}
              {fileErrors.length > 0 && (
                <div className="text-left mx-4 p-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 space-y-1">
                  <p className="text-[10.5px] font-black text-amber-700 dark:text-amber-400">
                    {t('si.someFilesFailed')}:
                  </p>
                  {fileErrors.map((f) => (
                    <p key={f.name} className="text-[10px] text-amber-600 dark:text-amber-400 font-medium truncate">
                      {f.name} — {f.message}
                    </p>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleFiles(lastFiles)}
                    className="text-[10.5px] font-black text-amber-700 dark:text-amber-400 underline underline-offset-2"
                  >
                    {t('si.retryFailed')}
                  </button>
                </div>
              )}
              {keyError && (
                <GeminiKeyPrompt message={keyError} onRetry={() => handleFiles(lastFiles)} />
              )}
            </>
          )}
        </div>
      )}

      {rows && (
        <>
          {fileErrors.length > 0 && (
            <p className="text-[10.5px] font-bold text-amber-600 dark:text-amber-400">
              {t('si.someFilesFailed')}: {fileErrors.map((f) => f.name).join(', ')}
            </p>
          )}

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

          {rows.some((row) => row.kind === 'EXPENSE') && (
            <button
              type="button"
              onClick={() => {
                const allOn = rows.every((row) => row.kind !== 'EXPENSE' || row.asDebt);
                setRows(
                  (prev) =>
                    prev?.map((row) => (row.kind === 'EXPENSE' ? { ...row, asDebt: !allOn } : row)) ||
                    null
                );
              }}
              className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-black transition-colors ${
                rows.every((row) => row.kind !== 'EXPENSE' || row.asDebt)
                  ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-400'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              {rows.every((row) => row.kind !== 'EXPENSE' || row.asDebt)
                ? t('si.bulkAsDebtOff')
                : t('si.bulkAsDebt')}
            </button>
          )}

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

                  {row.kind === 'EXPENSE' && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => update(row.id, { asDebt: !row.asDebt })}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-black flex-shrink-0 ${
                          row.asDebt
                            ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-400'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                        }`}
                      >
                        <CreditCard className="w-3 h-3" />
                        {t('si.asDebt')}
                      </button>
                      {row.asDebt && (
                        <>
                          <span className="text-[10px] text-slate-400 font-bold">
                            {t('si.paymentsCount')}
                          </span>
                          <input
                            type="number"
                            min={1}
                            value={row.debtPaymentsCount}
                            onChange={(e) => update(row.id, { debtPaymentsCount: e.target.value })}
                            className={`${inputClass} text-[11px] py-1 w-14`}
                          />
                        </>
                      )}
                    </div>
                  )}
                  {row.asDebt && (
                    <p className="text-[10px] text-violet-500 dark:text-violet-400 font-medium">
                      {t('si.asDebtHint')}
                    </p>
                  )}

                  {(row.duplicate || row.uncertainFields.length > 0 || row.sourceFile) && (
                    <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
                      <AlertTriangle className="w-3 h-3 mt-px flex-shrink-0" />
                      {row.duplicate
                        ? t('si.duplicate')
                        : row.uncertainFields.length > 0
                        ? `${t('si.aiUnsure')}: ${row.uncertainFields.join(', ')}`
                        : ''}
                      {row.sourceFile && !row.duplicate && row.uncertainFields.length === 0 && (
                        <span className="text-slate-400 dark:text-slate-500 font-medium">
                          {t('si.sourceFile')}: {row.sourceFile}
                        </span>
                      )}
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
