'use client';

import {
  CurrencyCode,
  FinanceCategory,
  ParsedReceiptResult,
  ReceiptFieldFlag,
  ReceiptLineItem,
} from '@/types';
import { RECEIPT_CATEGORY_HINTS } from '@/constants/categories';

const GEMINI_KEY_STORAGE_KEYS = ['fintrack_gemini_api_key', 'gemini_api_key'];

interface RawReceiptResponse {
  merchant?: string;
  total?: number | string;
  currency?: string;
  date?: string;
  category?: string;
  items?: { name?: string; quantity?: number; price?: number }[];
  rawText?: string;
  confidence?: number;
  uncertainFields?: string[];
}

/**
 * Downscale before upload: Vercel functions cap request bodies at ~4.5MB and a
 * phone photo blows past that once base64-encoded. The original photo attached
 * to the transaction is untouched — only the analysed copy shrinks.
 */
export async function compressImage(dataUrl: string, maxDimension = 1600): Promise<string> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return dataUrl;

  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      let { width, height } = img;
      const scale = Math.min(1, maxDimension / Math.max(width, height));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      let quality = 0.82;
      let result = canvas.toDataURL('image/jpeg', quality);
      while (result.length > 3.5 * 1024 * 1024 && quality > 0.35) {
        quality -= 0.15;
        result = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(result);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/** Thumbnail-sized copy stored with the transaction so IndexedDB stays small. */
export async function compressForStorage(dataUrl: string): Promise<string> {
  return compressImage(dataUrl, 1000);
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}

export function getStoredGeminiKey(): string {
  if (typeof window === 'undefined') return '';
  for (const key of GEMINI_KEY_STORAGE_KEYS) {
    const value = localStorage.getItem(key);
    if (value) return value.trim();
  }
  return '';
}

export function setStoredGeminiKey(value: string): void {
  if (typeof window === 'undefined') return;
  if (value.trim()) localStorage.setItem(GEMINI_KEY_STORAGE_KEYS[0], value.trim());
  else localStorage.removeItem(GEMINI_KEY_STORAGE_KEYS[0]);
}

function normalizeAmount(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.abs(raw);
  if (typeof raw !== 'string') return undefined;

  // "1.234,56" (EU) and "1,234.56" (US) both appear on Israeli receipts.
  const cleaned = raw.replace(/[^\d.,-]/g, '');
  if (!cleaned) return undefined;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized = cleaned;
  if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = cleaned.replace(/,/g, '');
  }
  const value = parseFloat(normalized);
  return Number.isFinite(value) ? Math.abs(value) : undefined;
}

function normalizeCurrency(raw?: string): CurrencyCode | undefined {
  if (!raw) return undefined;
  const value = raw.toUpperCase();
  if (value.includes('ILS') || value.includes('NIS') || raw.includes('₪') || raw.includes('ש"ח'))
    return 'ILS';
  if (value.includes('USD') || raw.includes('$')) return 'USD';
  if (value.includes('EUR') || raw.includes('€')) return 'EUR';
  return undefined;
}

function normalizeDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // DD/MM/YYYY and DD.MM.YY — the dominant formats on Israeli/EU receipts.
  const match = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (match) {
    const [, d, m, y] = match;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return undefined;
}

/**
 * Maps the model's free-text category guess onto a real category id: first by
 * name, then by merchant keyword hints, so "רמי לוי" still lands in Продукты.
 */
export function resolveCategoryId(
  suggestedName: string | undefined,
  merchant: string | undefined,
  categories: FinanceCategory[]
): string | undefined {
  const expenseCategories = categories.filter((c) => c.kind === 'EXPENSE' && !c.parentId);

  if (suggestedName) {
    const needle = suggestedName.trim().toLowerCase();
    const byName = expenseCategories.find((c) => c.name.toLowerCase() === needle);
    if (byName) return byName.id;
    const byPartial = expenseCategories.find(
      (c) => c.name.toLowerCase().includes(needle) || needle.includes(c.name.toLowerCase())
    );
    if (byPartial) return byPartial.id;
  }

  const haystack = `${merchant || ''} ${suggestedName || ''}`.toLowerCase();
  for (const hint of RECEIPT_CATEGORY_HINTS) {
    if (hint.words.some((w) => haystack.includes(w.toLowerCase()))) {
      const target = categories.find((c) => c.id === `cat-${hint.categoryKey}`);
      if (target) return target.id;
    }
  }

  return undefined;
}

function normalizeResult(raw: RawReceiptResponse): ParsedReceiptResult {
  const amount = normalizeAmount(raw.total);
  const currency = normalizeCurrency(raw.currency);
  const date = normalizeDate(raw.date);

  const uncertain = new Set<ReceiptFieldFlag>(
    (raw.uncertainFields || []).filter((f): f is ReceiptFieldFlag =>
      ['amount', 'date', 'merchant', 'category', 'currency'].includes(f)
    )
  );

  // Anything the model failed to produce is by definition unconfirmed — flag it
  // so the form highlights it instead of silently saving a guess.
  if (amount === undefined || amount === 0) uncertain.add('amount');
  if (!date) uncertain.add('date');
  if (!raw.merchant) uncertain.add('merchant');
  if (!currency) uncertain.add('currency');
  if (!raw.category) uncertain.add('category');
  if (typeof raw.confidence === 'number' && raw.confidence < 0.6) {
    uncertain.add('amount');
    uncertain.add('date');
  }

  const lineItems: ReceiptLineItem[] = (raw.items || [])
    .filter((i) => i && i.name)
    .map((i) => ({
      name: String(i.name),
      quantity: typeof i.quantity === 'number' ? i.quantity : undefined,
      price: typeof i.price === 'number' ? i.price : undefined,
    }));

  return {
    amount,
    currency,
    date,
    merchant: raw.merchant?.trim() || undefined,
    suggestedCategoryName: raw.category?.trim() || undefined,
    lineItems,
    rawText: raw.rawText,
    uncertainFields: Array.from(uncertain),
    modelConfidence: typeof raw.confidence === 'number' ? raw.confidence : undefined,
  };
}

const CLIENT_PROMPT = `Ты — ИИ-бухгалтер приложения FinTrack. Проанализируй фото чека (иврит/русский/английский).
Извлекай только реально напечатанное, ничего не выдумывай. total — итоговая сумма к оплате (סה"כ / TOTAL / ИТОГО).
Дата в израильском формате DD/MM/YYYY. Верни СТРОГО JSON:
{"merchant":"","total":0.0,"currency":"ILS"|"USD"|"EUR","date":"YYYY-MM-DD","category":"","items":[{"name":"","quantity":1,"price":0.0}],"rawText":"","confidence":0.0,"uncertainFields":[]}
uncertainFields — поля ("amount","date","merchant","category","currency"), в которых ты не уверен.`;

/**
 * Server route first (it owns the shared key), then a direct Gemini call with the
 * user's personal key as a fallback for offline-ish/proxy failures.
 */
export async function analyzeReceiptWithAI(
  base64DataUrl: string,
  mimeType = 'image/jpeg',
  userKey?: string
): Promise<ParsedReceiptResult> {
  const apiKey = (userKey || getStoredGeminiKey() || '').trim();

  let payload = base64DataUrl;
  let payloadMime = mimeType;
  if (mimeType.startsWith('image/')) {
    payload = await compressImage(base64DataUrl);
    payloadMime = 'image/jpeg';
  }

  try {
    const res = await fetch('/api/analyze-receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Data: payload, mimeType: payloadMime, apiKey }),
    });

    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) return normalizeResult(json.data as RawReceiptResponse);
    }
  } catch (err) {
    console.warn('Receipt API route unavailable, trying direct Gemini call:', err);
  }

  if (apiKey) {
    const cleanBase64 = payload.includes('base64,') ? payload.split('base64,')[1] : payload;
    const models = ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.5-flash'];

    for (const model of models) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { inline_data: { mime_type: payloadMime, data: cleanBase64 } },
                    { text: CLIENT_PROMPT },
                  ],
                },
              ],
              generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
            }),
          }
        );

        if (!res.ok) continue;
        const json = await res.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) continue;

        let clean = text.trim();
        if (clean.startsWith('```json')) clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        else if (clean.startsWith('```')) clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
        return normalizeResult(JSON.parse(clean) as RawReceiptResponse);
      } catch (err) {
        console.warn(`Direct Gemini receipt call failed on ${model}:`, err);
      }
    }
  }

  throw new Error(
    'Не удалось распознать чек. Проверьте подключение к сети или укажите Gemini API ключ в настройках.'
  );
}
