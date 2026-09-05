'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  FileSignature,
  ImagePlus,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  CurrencyCode,
  FinanceAccount,
  FinanceCategory,
  Obligation,
  ObligationSettlement,
  ObligationWithBalance,
  PayeeKind,
  Transaction,
  VatPayment,
  VatSummary,
} from '@/types';
import {
  addObligation,
  addObligationSettlement,
  addTransaction,
  deleteObligation,
  deleteObligationSettlement,
  todayIso,
  updateObligation,
} from '@/lib/db';
import {
  obligationsWithBalance,
  formatDateHuman,
  formatMoney,
} from '@/services/analytics';
import { exportObligationsCsv } from '@/services/export';
import { PAYEE_KIND_OPTIONS, OBLIGATION_INCOME_CATEGORY_ID } from '@/constants/categories';
import { useT } from '@/i18n/context';
import { usePasteUpload } from '@/hooks/use-paste-upload';
import { accountName, obligationStatusLabel, payeeKindLabelI18n } from '@/i18n/categories';
import {
  analyzeReceiptWithAI,
  compressForStorage,
  readFileAsDataUrl,
} from '@/services/ai/receipt-parser';
import {
  Card,
  EmptyState,
  Field,
  ModalShell,
  PrimaryButton,
  SectionTitle,
  inputClass,
} from './ui';

interface ObligationsTabProps {
  obligations: Obligation[];
  settlements: ObligationSettlement[];
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  baseCurrency: CurrencyCode;
  vatSummary?: VatSummary;
  vatPayments: VatPayment[];
}

const STATUS_STYLES: Record<string, string> = {
  ISSUED: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-400',
  PARTIALLY_SETTLED: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400',
  SETTLED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400',
  OVERDUE: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400',
};

export function ObligationsTab({
  obligations,
  settlements,
  categories,
  accounts,
  baseCurrency,
  vatSummary,
  vatPayments,
}: ObligationsTabProps) {
  const { t } = useT();
  const [editing, setEditing] = useState<Obligation | 'NEW' | null>(null);
  const [settling, setSettling] = useState<ObligationWithBalance | null>(null);

  const rows = useMemo(
    () => obligationsWithBalance(obligations, settlements),
    [obligations, settlements]
  );

  const open = rows.filter((r) => r.status !== 'SETTLED');
  const closed = rows.filter((r) => r.status === 'SETTLED');
  const totalOutstanding = open.reduce((sum, r) => sum + r.outstandingAmount, 0);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
          {t('obl.outstandingTitle')}
        </p>
        <p className="text-2xl font-black text-slate-900 dark:text-slate-100 tabular-nums mt-1">
          {formatMoney(totalOutstanding, baseCurrency)}
        </p>
        <p className="text-[11px] text-slate-400 font-medium mt-1">
          {open.length} {t('obl.openCount')}
          {rows.some((r) => r.status === 'OVERDUE') && (
            <span className="text-rose-500 font-black">
              {' '}
              · {rows.filter((r) => r.status === 'OVERDUE').length} {t('obl.overdueCount')}
            </span>
          )}
        </p>
      </Card>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setEditing('NEW')}
          className="flex-1 py-3 rounded-2xl bg-gradient-to-tr from-violet-500 to-fuchsia-400 text-white text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-violet-500/25 active:scale-[0.98] transition-transform"
        >
          <Plus className="w-4 h-4" />
          {t('obl.issueCheque')}
        </button>
        {rows.length > 0 && (
          <button
            type="button"
            onClick={() => exportObligationsCsv(rows)}
            className="px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-black"
          >
            CSV
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<FileSignature className="w-7 h-7" />}
          title={t('obl.emptyTitle')}
          description={t('obl.emptyText')}
        />
      ) : (
        <>
          <div>
            <SectionTitle title={t('obl.openSection')} />
            <div className="space-y-2">
              {open.map((row) => (
                <ObligationRow
                  key={row.obligation.id}
                  row={row}
                  onEdit={() => setEditing(row.obligation)}
                  onSettle={() => setSettling(row)}
                />
              ))}
              {open.length === 0 && (
                <Card className="p-4 text-[11px] font-medium text-slate-400 text-center">
                  {t('obl.allClosed')}
                </Card>
              )}
            </div>
          </div>

          {closed.length > 0 && (
            <div>
              <SectionTitle title={t('obl.closedSection')} />
              <div className="space-y-2 opacity-60">
                {closed.map((row) => (
                  <ObligationRow
                    key={row.obligation.id}
                    row={row}
                    onEdit={() => setEditing(row.obligation)}
                    onSettle={() => setSettling(row)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {editing && (
        <ObligationModal
          obligation={editing === 'NEW' ? null : editing}
          baseCurrency={baseCurrency}
          onClose={() => setEditing(null)}
        />
      )}

      {settling && (
        <SettleObligationModal
          row={settling}
          categories={categories}
          accounts={accounts}
          onClose={() => setSettling(null)}
        />
      )}
    </div>
  );
}

function ObligationRow({
  row,
  onEdit,
  onSettle,
}: {
  row: ObligationWithBalance;
  onEdit: () => void;
  onSettle: () => void;
}) {
  const { t, language } = useT();
  const { obligation, settledAmount, outstandingAmount, status } = row;
  const progress = obligation.amount > 0 ? (settledAmount / obligation.amount) * 100 : 0;

  return (
    <Card className="p-3.5 space-y-2.5">
      <div className="flex items-start gap-3" onClick={onEdit}>
        <span className="w-10 h-10 rounded-2xl bg-violet-100 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 flex items-center justify-center flex-shrink-0">
          <FileSignature className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
            {obligation.payeeLabel || payeeKindLabelI18n(obligation.payeeKind, language)}
          </p>
          <p className="text-[10.5px] text-slate-400 font-medium truncate">
            {payeeKindLabelI18n(obligation.payeeKind, language)} · {t('obl.issuedOn')}{' '}
            {formatDateHuman(obligation.issueDate)}
            {obligation.dueDate
              ? ` · ${t('obl.dueBy')} ${formatDateHuman(obligation.dueDate)}`
              : ''}
          </p>
        </div>

        <span
          className={`text-[9px] font-black px-2 py-1 rounded-lg flex-shrink-0 ${STATUS_STYLES[status]}`}
        >
          {obligationStatusLabel(status, language)}
        </span>
      </div>

      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-all duration-500"
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] font-bold">
        <span className="text-slate-400 tabular-nums">
          {t('obl.settledOf')} {formatMoney(settledAmount, obligation.currency)} {t('obl.of')}{' '}
          {formatMoney(obligation.amount, obligation.currency)}
        </span>
        <span
          className={`tabular-nums ${
            outstandingAmount > 0 ? 'text-rose-500' : 'text-emerald-500'
          }`}
        >
          {outstandingAmount > 0
            ? `${t('obl.remainder')} ${formatMoney(outstandingAmount, obligation.currency)}`
            : t('obl.closed')}
        </span>
      </div>

      {row.settlements.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-slate-50 dark:border-slate-800">
          {row.settlements.map((settlement) => (
            <div key={settlement.id} className="flex items-center gap-2 text-[10.5px]">
              <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
              <span className="text-slate-500 dark:text-slate-400 flex-1 truncate">
                {formatDateHuman(settlement.date)}
                {settlement.note ? ` · ${settlement.note}` : ''}
              </span>
              <span className="font-black text-slate-600 dark:text-slate-300 tabular-nums">
                {formatMoney(settlement.amount, settlement.currency)}
              </span>
              <button
                type="button"
                onClick={() => deleteObligationSettlement(settlement.id)}
                className="text-slate-300 hover:text-rose-500 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {outstandingAmount > 0 && (
        <button
          type="button"
          onClick={onSettle}
          className="w-full py-2.5 rounded-2xl bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 text-[11px] font-black flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
        >
          <FileCheck2 className="w-3.5 h-3.5" />
          {t('obl.attachProof')}
        </button>
      )}
    </Card>
  );
}

export function ObligationModal({
  obligation,
  baseCurrency,
  onClose,
}: {
  obligation: Obligation | null;
  baseCurrency: CurrencyCode;
  onClose: () => void;
}) {
  const { t, language } = useT();
  const [amount, setAmount] = useState(obligation ? String(obligation.amount) : '');
  const currency: CurrencyCode = obligation?.currency || baseCurrency;
  const [issueDate, setIssueDate] = useState(obligation?.issueDate || todayIso());
  const [dueDate, setDueDate] = useState(obligation?.dueDate || '');
  const [payeeKind, setPayeeKind] = useState<PayeeKind>(obligation?.payeeKind || 'LANDLORD');
  const [payeeLabel, setPayeeLabel] = useState(obligation?.payeeLabel || '');
  const [note, setNote] = useState(obligation?.note || '');
  const [documentPhoto, setDocumentPhoto] = useState(obligation?.documentPhoto);
  const [error, setError] = useState<string | null>(null);

  const handlePhoto = async (file: File | null) => {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setDocumentPhoto(await compressForStorage(dataUrl));
  };

  usePasteUpload({
    accept: ['image/'],
    onFile: handlePhoto,
    onUnsupported: () => setError(t('paste.unsupportedFormat')),
  });

  const handleSave = async () => {
    const numericAmount = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return setError(t('obl.enterAmount'));
    if (payeeKind === 'CUSTOM' && !payeeLabel.trim()) return setError(t('obl.enterPayee'));

    const payload = {
      amount: numericAmount,
      currency,
      issueDate,
      dueDate: dueDate || undefined,
      payeeKind,
      payeeLabel: payeeLabel.trim(),
      documentPhoto,
      note: note.trim() || undefined,
    };

    if (obligation) await updateObligation(obligation.id, payload);
    else await addObligation(payload);
    onClose();
  };

  return (
    <ModalShell
      title={obligation ? t('obl.issuedCheque') : t('obl.issueCheque')}
      subtitle={t('obl.modalSub')}
      icon={<FileSignature className="w-5 h-5" />}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {error && <p className="text-[11px] font-bold text-rose-500 text-center">{error}</p>}
          <PrimaryButton onClick={handleSave}>{t('obl.save')}</PrimaryButton>
          {obligation && (
            <button
              type="button"
              onClick={async () => {
                await deleteObligation(obligation.id);
                onClose();
              }}
              className="w-full py-2.5 rounded-2xl text-[11px] font-black text-rose-500 bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t('obl.delete')}
            </button>
          )}
        </div>
      }
    >
      <Field label={`${t('obl.chequeAmount')}, ${currency}`}>
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="5000"
          className={`${inputClass} text-lg font-black`}
          autoFocus
        />
      </Field>

      <Field label={t('obl.payeeField')}>
        <div className="space-y-1.5">
          {PAYEE_KIND_OPTIONS.map((option) => (
            <button
              key={option.kind}
              type="button"
              onClick={() => setPayeeKind(option.kind)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl border text-left transition-all ${
                payeeKind === option.kind
                  ? 'bg-violet-50 dark:bg-violet-950/40 border-violet-300 dark:border-violet-800'
                  : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                  payeeKind === option.kind
                    ? 'border-violet-500 bg-violet-500'
                    : 'border-slate-300 dark:border-slate-600'
                }`}
              />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                {payeeKindLabelI18n(option.kind, language)}
              </span>
            </button>
          ))}
        </div>
      </Field>

      <Field
        label={payeeKind === 'CUSTOM' ? t('obl.ownOption') : t('obl.clarification')}
        hint={payeeKind === 'CUSTOM' ? undefined : t('obl.clarificationHint')}
      >
        <input
          type="text"
          value={payeeLabel}
          onChange={(e) => setPayeeLabel(e.target.value)}
          placeholder={payeeKind === 'CUSTOM' ? t('obl.payeePlaceholder') : t('obl.optional')}
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t('obl.issueDate')}>
          <input
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label={t('obl.dueDate')} hint={t('obl.dueDateHint')}>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label={t('obl.note')}>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('obl.comment')}
          className={inputClass}
        />
      </Field>

      <Field label={t('obl.documentPhoto')}>
        <label className="flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 text-[11px] font-black cursor-pointer active:scale-95 transition-transform">
          <ImagePlus className="w-3.5 h-3.5" />
          {documentPhoto ? t('obl.replacePhoto') : t('obl.attachPhoto')}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handlePhoto(e.target.files?.[0] || null)}
          />
        </label>
        {documentPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={documentPhoto}
            alt={t('obl.issuedCheque')}
            className="mt-2 w-full max-h-52 object-contain rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
          />
        )}
      </Field>
    </ModalShell>
  );
}

function SettleObligationModal({
  row,
  categories,
  accounts,
  onClose,
}: {
  row: ObligationWithBalance;
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  onClose: () => void;
}) {
  const { t, language } = useT();
  const { obligation, outstandingAmount } = row;
  const [amount, setAmount] = useState(String(outstandingAmount));
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [documentPhoto, setDocumentPhoto] = useState<string | undefined>();
  const [createIncome, setCreateIncome] = useState(true);
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanHint, setScanHint] = useState<string | null>(null);

  const handleDocument = async (file: File | null, analyze: boolean) => {
    if (!file) return;
    setError(null);

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setDocumentPhoto(await compressForStorage(dataUrl));
      if (!analyze) return;

      setIsScanning(true);
      const parsed = await analyzeReceiptWithAI(dataUrl, file.type || 'image/jpeg');

      // A closing document only informs the settlement amount and date — the user
      // still confirms both, because a wrong amount here silently mis-states a debt.
      if (parsed.amount !== undefined) setAmount(String(parsed.amount));
      if (parsed.date) setDate(parsed.date);
      if (parsed.merchant) setNote(parsed.merchant);
      setScanHint(
        parsed.uncertainFields.length > 0
          ? `${t('obl.aiUnsure')}: ${parsed.uncertainFields.join(', ')} — ${t('obl.checkAmountDate')}`
          : t('obl.filledFromDoc')
      );
    } catch (err: any) {
      setError(err.message || t('obl.scanFailed'));
    } finally {
      setIsScanning(false);
    }
  };

  usePasteUpload({
    accept: ['image/'],
    onFile: (file) => handleDocument(file, true),
    onUnsupported: () => setError(t('paste.unsupportedFormat')),
  });

  const handleSave = async () => {
    const numericAmount = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return setError(t('obl.amountRequired'));
    if (numericAmount > outstandingAmount + 0.009) {
      return setError(
        `${t('obl.aboveRemainder')} (${formatMoney(outstandingAmount, obligation.currency)})`
      );
    }

    let transaction: Transaction | undefined;
    if (createIncome) {
      const settlementCategory =
        categories.find((c) => c.id === OBLIGATION_INCOME_CATEGORY_ID) ||
        categories.find((c) => c.kind === 'INCOME');

      transaction = await addTransaction({
        kind: 'INCOME',
        amount: numericAmount,
        currency: obligation.currency,
        categoryId: settlementCategory?.id || '',
        accountId: accountId || accounts[0]?.id,
        date,
        note:
          note.trim() ||
          `${t('obl.settlementNote')}: ${
            obligation.payeeLabel || payeeKindLabelI18n(obligation.payeeKind, language)
          }`,
        receiptPhoto: documentPhoto,
        obligationId: obligation.id,
        source: documentPhoto ? 'RECEIPT_SCAN' : 'MANUAL',
      } as any);
    }

    await addObligationSettlement({
      obligationId: obligation.id,
      amount: numericAmount,
      currency: obligation.currency,
      date,
      documentPhoto,
      note: note.trim() || undefined,
      transactionId: transaction?.id,
    });

    onClose();
  };

  return (
    <ModalShell
      title={t('obl.settleTitle')}
      subtitle={`${t('obl.remainder')}: ${formatMoney(outstandingAmount, obligation.currency)}`}
      icon={<FileCheck2 className="w-5 h-5" />}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {error && <p className="text-[11px] font-bold text-rose-500 text-center">{error}</p>}
          <PrimaryButton onClick={handleSave} disabled={isScanning} variant="success">
            {t('obl.settleAction')}
          </PrimaryButton>
        </div>
      }
    >
      <Field label={t('obl.proofDocument')}>
        <div className="flex gap-2">
          <label className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 text-[11px] font-black cursor-pointer active:scale-95 transition-transform">
            <Sparkles className="w-3.5 h-3.5" />
            {t('obl.scanIt')}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleDocument(e.target.files?.[0] || null, true)}
            />
          </label>
          <label className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 text-[11px] font-black cursor-pointer">
            <ImagePlus className="w-3.5 h-3.5" />
            {t('form.file')}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleDocument(e.target.files?.[0] || null, true)}
            />
          </label>
        </div>

        {isScanning && (
          <div className="mt-2 flex items-center gap-2 text-[11px] font-bold text-violet-600 dark:text-violet-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {t('obl.geminiReading')}
          </div>
        )}

        {scanHint && (
          <div className="mt-2 flex items-start gap-1.5 text-[10.5px] font-bold text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
            {scanHint}
          </div>
        )}

        {documentPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={documentPhoto}
            alt={t('obl.proofDocument')}
            className="mt-2 w-full max-h-48 object-contain rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
          />
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={`${t('common.amount')}, ${obligation.currency}`}>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputClass} text-lg font-black`}
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

      <Field label={t('obl.note')}>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('obl.notePlaceholder')}
          className={inputClass}
        />
      </Field>

      <button
        type="button"
        onClick={() => setCreateIncome((prev) => !prev)}
        className="w-full flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70"
      >
        <span className="text-left">
          <span className="block text-xs font-black text-slate-700 dark:text-slate-200">
            {t('obl.createIncome')}
          </span>
          <span className="block text-[10px] text-slate-400 font-medium">
            {t('obl.createIncomeHint')}
          </span>
        </span>
        <span
          className={`w-11 h-6 rounded-full flex items-center px-0.5 transition-colors flex-shrink-0 ${
            createIncome ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
          }`}
        >
          <span
            className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
              createIncome ? 'translate-x-5' : ''
            }`}
          />
        </span>
      </button>

      {createIncome && (
        <Field label={t('obl.creditAccount')}>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputClass}>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {accountName(account, language)}
              </option>
            ))}
          </select>
        </Field>
      )}
    </ModalShell>
  );
}
