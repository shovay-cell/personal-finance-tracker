'use client';

import { tr } from '@/i18n/t';
import {
  CurrencyCode,
  FinanceCategory,
  ParsedVoiceResult,
  ReceiptFieldFlag,
  SpeechLocale,
  TransactionKind,
} from '@/types';
import { VOICE_CATEGORY_KEYWORDS } from '@/constants/categories';
import { todayIso } from '@/lib/db';

type SpeechRecognitionCtor = new () => any;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isVoiceInputSupported(): boolean {
  return getSpeechRecognition() !== null;
}

export interface VoiceSession {
  stop: () => void;
}

/**
 * Thin wrapper over the Web Speech API. Interim results are streamed so the
 * sheet can show what is being heard; the final transcript resolves the promise.
 */
export function startVoiceCapture(
  locale: SpeechLocale,
  handlers: {
    onInterim?: (text: string) => void;
    onResult: (text: string) => void;
    onError: (message: string) => void;
    onEnd?: () => void;
  }
): VoiceSession | null {
  const Recognition = getSpeechRecognition();
  if (!Recognition) {
    handlers.onError(tr('svc.voiceUnsupported'));
    return null;
  }

  const recognition = new Recognition();
  recognition.lang = locale;
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  let finalTranscript = '';

  recognition.onresult = (event: any) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const chunk = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += chunk;
      else interim += chunk;
    }
    if (interim && handlers.onInterim) handlers.onInterim(interim);
  };

  recognition.onerror = (event: any) => {
    const map: Record<string, string> = {
      'no-speech': tr('svc.noSpeech'),
      'audio-capture': tr('svc.noMic'),
      'not-allowed': tr('svc.micDenied'),
      network: tr('svc.speechNetwork'),
    };
    handlers.onError(map[event.error] || `${tr('svc.recognitionError')}: ${event.error}`);
  };

  recognition.onend = () => {
    if (finalTranscript.trim()) handlers.onResult(finalTranscript.trim());
    handlers.onEnd?.();
  };

  try {
    recognition.start();
  } catch (err: any) {
    handlers.onError(err.message || tr('svc.micStartFailed'));
    return null;
  }

  return { stop: () => recognition.stop() };
}

const NUMBER_WORDS: Record<string, number> = {
  ноль: 0, один: 1, одна: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5,
  шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10, одиннадцать: 11,
  двенадцать: 12, тринадцать: 13, четырнадцать: 14, пятнадцать: 15,
  шестнадцать: 16, семнадцать: 17, восемнадцать: 18, девятнадцать: 19,
  двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50, шестьдесят: 60,
  семьдесят: 70, восемьдесят: 80, девяносто: 90, сто: 100, двести: 200,
  триста: 300, четыреста: 400, пятьсот: 500, тысяча: 1000, тысячу: 1000,
};

const INCOME_WORDS = [
  'получил', 'получила', 'заработал', 'заработала', 'доход', 'зарплат', 'премия',
  'вернули', 'income', 'received', 'salary', 'קיבלתי', 'הכנסה', 'משכורת',
];

/** "потратил 50 на кафе" → amount 50, category «Кафе и рестораны», date today. */
export function parseVoiceTransaction(
  transcript: string,
  categories: FinanceCategory[],
  defaultCurrency: CurrencyCode = 'ILS'
): ParsedVoiceResult {
  const text = transcript.toLowerCase();
  const uncertainFields: ReceiptFieldFlag[] = [];

  const kind: TransactionKind = INCOME_WORDS.some((w) => text.includes(w)) ? 'INCOME' : 'EXPENSE';

  // Digits win over spelled-out numbers; "50.5" and "50,5" both parse.
  let amount: number | undefined;
  const digitMatch = text.match(/(\d+(?:[.,]\d{1,2})?)/);
  if (digitMatch) {
    amount = parseFloat(digitMatch[1].replace(',', '.'));
  } else {
    let sum = 0;
    let found = false;
    for (const word of text.split(/\s+/)) {
      const value = NUMBER_WORDS[word.replace(/[^а-яё]/g, '')];
      if (value !== undefined) {
        sum += value;
        found = true;
      }
    }
    if (found) amount = sum;
  }
  if (amount === undefined || amount <= 0) uncertainFields.push('amount');

  let currency: CurrencyCode = defaultCurrency;
  if (/доллар|dollar|\$|усд|usd/.test(text)) currency = 'USD';
  else if (/евро|euro|€|eur/.test(text)) currency = 'EUR';
  else if (/шекел|шек|₪|ils|nis|שקל/.test(text)) currency = 'ILS';

  let date = todayIso();
  if (/вчера|yesterday|אתמול/.test(text)) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    date = d.toISOString().slice(0, 10);
  } else if (/позавчера/.test(text)) {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    date = d.toISOString().slice(0, 10);
  }

  let categoryId: string | undefined;
  let categoryName: string | undefined;

  // Direct hit on a category name (including user-created ones) beats keywords.
  const relevant = categories.filter((c) => c.kind === kind && !c.isHidden);
  const byName = relevant.find((c) => text.includes(c.name.toLowerCase()));
  if (byName) {
    categoryId = byName.id;
    categoryName = byName.name;
  } else {
    for (const entry of VOICE_CATEGORY_KEYWORDS) {
      if (!entry.words.some((w) => text.includes(w))) continue;
      const match = relevant.find((c) => c.id === `cat-${entry.categoryKey}`);
      if (match) {
        categoryId = match.id;
        categoryName = match.name;
        break;
      }
    }
  }

  if (!categoryId) uncertainFields.push('category');

  return {
    kind,
    amount,
    currency,
    categoryId,
    categoryName,
    date,
    note: transcript.trim(),
    transcript: transcript.trim(),
    uncertainFields,
  };
}
