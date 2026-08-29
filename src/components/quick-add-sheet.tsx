'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Delete, Layers, Loader2, Mic, MicOff, ScanLine, Sparkles, Wallet } from 'lucide-react';
import {
  CurrencyCode,
  FinanceAccount,
  FinanceCategory,
  SpeechLocale,
  TransactionKind,
} from '@/types';
import { addTransaction } from '@/lib/db';
import {
  CategoryGrid,
  ModalShell,
  PrimaryButton,
  SegmentedControl,
} from './ui';
import { TransactionPrefill } from './transaction-form-modal';
import { CategoryEditorModal } from './category-manager-modal';
import { CURRENCIES } from '@/constants/categories';
import { useT } from '@/i18n/context';
import { GeminiKeyPrompt } from './gemini-key-prompt';
import {
  analyzeReceiptWithAI,
  ReceiptScanError,
  compressForStorage,
  readFileAsDataUrl,
  resolveCategoryId,
} from '@/services/ai/receipt-parser';
import {
  isVoiceInputSupported,
  parseVoiceTransaction,
  startVoiceCapture,
  VoiceSession,
} from '@/services/voice/voice-input';

type QuickMode = 'MANUAL' | 'SCAN' | 'VOICE' | 'STATEMENT';

interface QuickAddSheetProps {
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  baseCurrency: CurrencyCode;
  speechLocale: SpeechLocale;
  initialMode?: QuickMode;
  onClose: () => void;
  /** Hands an AI/voice draft over to the full form for confirmation. */
  onOpenFullForm: (prefill: TransactionPrefill) => void;
  /** Opens the batch importer for a photographed list of bank operations. */
  onOpenStatementImport: () => void;
  onSaved?: () => void;
}

/**
 * The sticky quick-entry surface: two taps from opening the app to a saved
 * expense (amount on the keypad → category chip). Scan and voice are alternate
 * entry modes on the same sheet, and both hand off to the full form so nothing
 * an AI guessed is saved without a look.
 */
export function QuickAddSheet({
  categories,
  accounts,
  baseCurrency,
  speechLocale,
  initialMode = 'MANUAL',
  onClose,
  onOpenFullForm,
  onOpenStatementImport,
  onSaved,
}: QuickAddSheetProps) {
  const [mode, setMode] = useState<QuickMode>(initialMode);
  const [kind, setKind] = useState<TransactionKind>('EXPENSE');
  const [amount, setAmount] = useState('');
  const currency: CurrencyCode = baseCurrency;
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [isBusy, setIsBusy] = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const { t } = useT();
  const [error, setError] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [lastScanFile, setLastScanFile] = useState<File | null>(null);

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const voiceSession = useRef<VoiceSession | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  const visibleCategories = categories.filter((c) => c.kind === kind && !c.parentId && !c.isHidden);

  useEffect(() => {
    if (initialMode === 'SCAN') {
      // Deep link from a home-screen shortcut: open the camera immediately.
      scanInputRef.current?.click();
    }
    if (initialMode === 'VOICE') {
      handleVoiceToggle();
    }
    if (initialMode === 'STATEMENT') {
      onOpenStatementImport();
      onClose();
    }
    return () => voiceSession.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pressKey = (key: string) => {
    setError(null);
    if (key === 'DEL') {
      setAmount((prev) => prev.slice(0, -1));
      return;
    }
    if (key === '.') {
      setAmount((prev) => (prev.includes('.') ? prev : prev === '' ? '0.' : `${prev}.`));
      return;
    }
    setAmount((prev) => {
      const next = prev + key;
      // Two decimals max, and no absurdly long inputs from a stuck key.
      if (next.includes('.') && next.split('.')[1].length > 2) return prev;
      return next.length > 12 ? prev : next;
    });
  };

  /**
   * On a desktop the on-screen keypad is not how anyone enters a number — they
   * type. Without this the amount could only be set by clicking, which made the
   * sheet look broken and pushed people into the full form just to get a field
   * they could type into.
   */
  useEffect(() => {
    if (mode !== 'MANUAL' || isCreatingCategory) return;

    const onKeyDown = (event: KeyboardEvent) => {
      // A real field somewhere on top of the sheet owns its own keystrokes.
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (target?.isContentEditable) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key >= '0' && event.key <= '9') {
        event.preventDefault();
        pressKey(event.key);
        return;
      }
      // Both separators land on the decimal point: the numpad emits a comma in
      // many locales, and nobody wants to hunt for the right one.
      if (event.key === '.' || event.key === ',') {
        event.preventDefault();
        pressKey('.');
        return;
      }
      if (event.key === 'Backspace') {
        event.preventDefault();
        pressKey('DEL');
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, isCreatingCategory, amount, categoryId, kind, accountId, isBusy]);

  const handleSave = async () => {
    const numericAmount = parseFloat(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError(t('qa.enterAmount'));
      return;
    }
    if (!categoryId) {
      setError(t('qa.pickCategory'));
      return;
    }

    setIsBusy(true);
    try {
      await addTransaction({
        kind,
        amount: numericAmount,
        currency,
        categoryId,
        accountId: accountId || accounts[0]?.id,
        date: new Date().toISOString().slice(0, 10),
        source: 'MANUAL',
      } as any);
      onSaved?.();
      onClose();
    } catch (err: any) {
      setError(err.message || t('qa.saveFailed'));
    } finally {
      setIsBusy(false);
    }
  };

  const handleScan = async (file: File | null) => {
    if (!file) return;
    setIsBusy(true);
    setError(null);
    setKeyError(null);
    // Kept so «повторить» after entering a key does not ask for the photo again.
    setLastScanFile(file);

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const [stored, parsed] = await Promise.all([
        compressForStorage(dataUrl),
        analyzeReceiptWithAI(dataUrl, file.type || 'image/jpeg'),
      ]);

      onOpenFullForm({
        kind: 'EXPENSE',
        amount: parsed.amount,
        currency: parsed.currency || baseCurrency,
        date: parsed.date,
        merchant: parsed.merchant,
        categoryId: resolveCategoryId(parsed.suggestedCategoryName, parsed.merchant, categories),
        receiptPhoto: stored,
        receiptScan: {
          merchant: parsed.merchant,
          lineItems: parsed.lineItems,
          rawText: parsed.rawText,
          uncertainFields: parsed.uncertainFields,
          modelConfidence: parsed.modelConfidence,
          scannedAt: new Date().toISOString(),
        },
        uncertainFields: parsed.uncertainFields,
        source: 'RECEIPT_SCAN',
      });
      onClose();
    } catch (err: any) {
      if (err instanceof ReceiptScanError && err.needsApiKey) setKeyError(err.message);
      else setError(err.message || t('tf.scanFailed'));
      setIsBusy(false);
    }
  };

  function handleVoiceToggle() {
    if (isListening) {
      voiceSession.current?.stop();
      setIsListening(false);
      return;
    }

    setError(null);
    setTranscript('');
    setIsListening(true);

    voiceSession.current = startVoiceCapture(speechLocale, {
      onInterim: setTranscript,
      onResult: (text) => {
        setTranscript(text);
        const parsed = parseVoiceTransaction(text, categories, baseCurrency);
        onOpenFullForm({
          kind: parsed.kind,
          amount: parsed.amount,
          currency: parsed.currency,
          categoryId: parsed.categoryId,
          date: parsed.date,
          note: parsed.note,
          uncertainFields: parsed.uncertainFields,
          source: 'VOICE',
        });
        onClose();
      },
      onError: (message) => {
        setError(message);
        setIsListening(false);
      },
      onEnd: () => setIsListening(false),
    });
  }

  const keypadKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'DEL'];

  return (
    <ModalShell
      title={t('quick.title')}
      subtitle={t('quick.subtitle')}
      icon={<Wallet className="w-5 h-5" />}
      onClose={onClose}
      footer={
        mode === 'MANUAL' ? (
          <div className="space-y-2">
            {error && <p className="text-[11px] font-bold text-rose-500 text-center">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  onOpenFullForm({
                    kind,
                    amount: parseFloat(amount) || undefined,
                    currency,
                    categoryId: categoryId || undefined,
                    accountId,
                  });
                  // Hand over to the full form instead of stacking on top of it,
                  // so saving there does not drop the user back on this sheet.
                  onClose();
                }}
                className="px-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-black active:scale-95 transition-transform whitespace-nowrap"
              >
                {t('common.details')}
              </button>
              <PrimaryButton
                onClick={handleSave}
                disabled={isBusy}
                variant={kind === 'EXPENSE' ? 'primary' : 'success'}
              >
                {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {t('common.record')}
              </PrimaryButton>
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="flex gap-1.5">
        {(
          [
            { value: 'MANUAL' as QuickMode, label: t('quick.manual'), icon: Wallet },
            { value: 'SCAN' as QuickMode, label: t('quick.receipt'), icon: ScanLine },
            { value: 'STATEMENT' as QuickMode, label: t('quick.list'), icon: Layers },
            { value: 'VOICE' as QuickMode, label: t('quick.voice'), icon: Mic },
          ]
        ).map((option) => {
          const Icon = option.icon;
          const isActive = mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setError(null);
                // The statement importer owns its own review flow — hand over
                // instead of stacking it inside the quick-entry sheet.
                if (option.value === 'STATEMENT') {
                  onOpenStatementImport();
                  onClose();
                  return;
                }
                setMode(option.value);
                if (option.value === 'SCAN') scanInputRef.current?.click();
              }}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-2xl border text-[10px] font-black transition-all ${
                isActive
                  ? 'bg-sky-500 text-white border-transparent shadow-md shadow-sky-500/25'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {option.label}
            </button>
          );
        })}
      </div>

      <input
        ref={scanInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleScan(e.target.files?.[0] || null)}
      />

      {mode === 'SCAN' && (
        <div className="py-6 text-center space-y-3">
          {isBusy ? (
            <>
              <Loader2 className="w-9 h-9 mx-auto text-sky-500 animate-spin" />
              <p className="text-xs font-black text-slate-600 dark:text-slate-300">
                {t('quick.scanning')}
              </p>
              <p className="text-[11px] text-slate-400 font-medium px-6">
                {t('qa.scanHint')}
              </p>
            </>
          ) : (
            <>
              {!keyError && <Sparkles className="w-9 h-9 mx-auto text-sky-500" />}
              <PrimaryButton onClick={() => scanInputRef.current?.click()}>
                <ScanLine className="w-4 h-4" />
                {t('quick.photograph')}
              </PrimaryButton>
              {error && <p className="text-[11px] font-bold text-rose-500">{error}</p>}
              {keyError && (
                <GeminiKeyPrompt
                  message={keyError}
                  onRetry={() => {
                    if (lastScanFile) handleScan(lastScanFile);
                    else scanInputRef.current?.click();
                  }}
                />
              )}
            </>
          )}
        </div>
      )}

      {mode === 'VOICE' && (
        <div className="py-6 text-center space-y-4">
          {!isVoiceInputSupported() ? (
            <p className="text-xs font-bold text-slate-500 px-6">
              {t('qa.voiceUnsupported')}
            </p>
          ) : (
            <>
              <button
                type="button"
                onClick={handleVoiceToggle}
                className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center transition-all active:scale-95 ${
                  isListening
                    ? 'bg-rose-500 text-white shadow-xl shadow-rose-500/40 animate-pulse'
                    : 'bg-gradient-to-tr from-sky-500 to-cyan-400 text-white shadow-xl shadow-sky-500/30'
                }`}
              >
                {isListening ? <MicOff className="w-9 h-9" /> : <Mic className="w-9 h-9" />}
              </button>
              <p className="text-xs font-black text-slate-600 dark:text-slate-300">
                {isListening ? t('quick.listening') : t('quick.voicePrompt')}
              </p>
              <p className="text-[11px] text-slate-400 font-medium px-6">
                {t('qa.voiceExample')}
              </p>
              {transcript && (
                <p className="text-xs font-bold text-sky-600 dark:text-sky-400 px-6">«{transcript}»</p>
              )}
              {error && <p className="text-[11px] font-bold text-rose-500 px-6">{error}</p>}
            </>
          )}
        </div>
      )}

      {mode === 'MANUAL' && (
        <>
          <SegmentedControl<TransactionKind>
            value={kind}
            onChange={(next) => {
              setKind(next);
              setCategoryId('');
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
                activeClass:
                  'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm',
              },
            ]}
          />

          <div className="text-center py-2">
            <span
              className={`text-4xl font-black tabular-nums ${
                kind === 'EXPENSE'
                  ? 'text-slate-900 dark:text-slate-100'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {amount || '0'}
              <span className="text-2xl text-slate-400 font-bold ml-1">
                {CURRENCIES[currency].symbol}
              </span>
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {keypadKeys.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => pressKey(key)}
                className="py-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800 text-lg font-black text-slate-700 dark:text-slate-200 active:scale-95 active:bg-slate-100 transition-all flex items-center justify-center"
              >
                {key === 'DEL' ? <Delete className="w-5 h-5" /> : key}
              </button>
            ))}
          </div>

          <CategoryGrid
            categories={visibleCategories}
            selectedId={categoryId}
            onSelect={setCategoryId}
            onCreate={() => setIsCreatingCategory(true)}
          />
        </>
      )}

      {isCreatingCategory && (
        <CategoryEditorModal
          category={null}
          defaultKind={kind}
          categories={categories}
          onClose={() => setIsCreatingCategory(false)}
          onCreated={(created) => setCategoryId(created.id)}
        />
      )}
    </ModalShell>
  );
}
