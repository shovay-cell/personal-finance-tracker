'use client';

import {
  CurrencyCode,
  FinanceCategory,
  ParsedReceiptResult,
  ParsedStatement,
  ParsedStatementRow,
  TransactionKind,
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

/** Google issues two key shapes: legacy `AIza…` and current auth keys `AQ.…`. */
export function looksLikeGeminiKey(key: string): boolean {
  const trimmed = key.trim();
  return trimmed.startsWith('AIza') || trimmed.startsWith('AQ.');
}

/**
 * One Gemini call, trying the `x-goog-api-key` header first and retrying through
 * the `?key=` query parameter when the header form is refused as unauthenticated.
 */
async function callGeminiDirect(
  model: string,
  apiKey: string,
  buildBody: () => string
): Promise<Response> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = buildBody();

  const withHeader = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body,
  });

  if (withHeader.ok || (withHeader.status !== 401 && withHeader.status !== 403)) {
    return withHeader;
  }

  return fetch(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

export type ReceiptScanErrorCode =
  | 'NO_API_KEY'
  | 'INVALID_KEY'
  | 'KEY_TYPE_UNSUPPORTED'
  | 'QUOTA'
  | 'OFFLINE'
  | 'MODEL_ERROR'
  | 'UNKNOWN';

/**
 * Carries why the scan failed instead of one catch-all sentence: the UI needs to
 * tell "no key configured" (fixable right here) apart from "no network".
 */
export class ReceiptScanError extends Error {
  code: ReceiptScanErrorCode;

  constructor(code: ReceiptScanErrorCode, message: string) {
    super(message);
    this.name = 'ReceiptScanError';
    this.code = code;
  }

  /** True when the user can fix it by pasting a personal Gemini key. */
  get needsApiKey(): boolean {
    return (
      this.code === 'NO_API_KEY' ||
      this.code === 'INVALID_KEY' ||
      this.code === 'KEY_TYPE_UNSUPPORTED' ||
      this.code === 'QUOTA'
    );
  }
}

/** Maps the API route's structured failure onto a code the UI can act on. */
function classifyServerError(error?: string, message?: string): ReceiptScanError {
  const text = `${error || ''} ${message || ''}`;

  if (error === 'NO_API_KEY') {
    return new ReceiptScanError(
      'NO_API_KEY',
      'Ключ Gemini не настроен. Вставьте свой ключ — он сохранится только на этом устройстве.'
    );
  }

  // Google rejects some new-format keys on this endpoint with a dedicated code;
  // saying "ключ неверный" there would send the user chasing the wrong problem.
  if (/ACCESS_TOKEN_TYPE_UNSUPPORTED/i.test(text)) {
    return new ReceiptScanError(
      'KEY_TYPE_UNSUPPORTED',
      'Google не принимает этот ключ для Gemini API (ACCESS_TOKEN_TYPE_UNSUPPORTED). Создайте ключ в проекте, где включён Generative Language API, и попробуйте снова.'
    );
  }

  if (/\b(400|401|403)\b/.test(text) || /API[_ ]?key not valid|invalid.*key|PERMISSION_DENIED/i.test(text)) {
    return new ReceiptScanError(
      'INVALID_KEY',
      'Google отклонил ключ Gemini. Проверьте, что ключ активен и скопирован целиком.'
    );
  }

  if (/\b429\b/.test(text) || /quota|RESOURCE_EXHAUSTED/i.test(text)) {
    return new ReceiptScanError(
      'QUOTA',
      'Исчерпан лимит запросов к Gemini. Попробуйте позже или используйте свой ключ.'
    );
  }

  return new ReceiptScanError(
    'MODEL_ERROR',
    message || 'Gemini не смог обработать снимок. Попробуйте переснять чек при хорошем освещении.'
  );
}

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

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ReceiptScanError(
      'OFFLINE',
      'Нет подключения к сети. Запишите операцию вручную — чек можно распознать позже.'
    );
  }

  let payload = base64DataUrl;
  let payloadMime = mimeType;
  if (mimeType.startsWith('image/')) {
    payload = await compressImage(base64DataUrl);
    payloadMime = 'image/jpeg';
  }

  // Remembered so a failing route can still report its real reason after the
  // direct-call fallback has also been exhausted.
  let serverError: ReceiptScanError | null = null;
  let routeUnreachable = false;

  try {
    const res = await fetch('/api/analyze-receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Data: payload, mimeType: payloadMime, apiKey }),
    });

    const json = await res.json().catch(() => null);

    if (res.ok && json?.success && json.data) {
      return normalizeResult(json.data as RawReceiptResponse);
    }

    serverError = classifyServerError(json?.error, json?.message);
  } catch (err) {
    routeUnreachable = true;
    console.warn('Receipt API route unavailable, trying direct Gemini call:', err);
  }

  if (apiKey) {
    const cleanBase64 = payload.includes('base64,') ? payload.split('base64,')[1] : payload;
    const models = ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.5-flash'];
    let directError: ReceiptScanError | null = null;

    for (const model of models) {
      try {
        // Header first: it keeps the key out of URLs and proxy logs. Some keys are
        // only accepted through the query parameter, so that stays as a fallback.
        const res = await callGeminiDirect(model, apiKey, () =>
          JSON.stringify({
            contents: [
              {
                parts: [
                  { inline_data: { mime_type: payloadMime, data: cleanBase64 } },
                  { text: CLIENT_PROMPT },
                ],
              },
            ],
            generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
          })
        );

        if (!res.ok) {
          directError = classifyServerError(String(res.status), await res.text());
          continue;
        }

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

    if (directError) throw directError;
  }

  if (serverError) throw serverError;

  if (routeUnreachable) {
    throw new ReceiptScanError(
      'OFFLINE',
      'Сервер распознавания недоступен. Проверьте соединение и попробуйте ещё раз.'
    );
  }

  throw new ReceiptScanError(
    'UNKNOWN',
    'Не удалось распознать чек. Попробуйте ещё раз или запишите операцию вручную.'
  );
}


// ------------------------------------------------- statement (list) parsing

interface RawStatementResponse {
  rows?: {
    date?: string;
    amount?: number | string;
    currency?: string;
    kind?: string;
    description?: string;
    category?: string;
    uncertainFields?: string[];
  }[];
  rawText?: string;
  confidence?: number;
}

function normalizeStatement(raw: RawStatementResponse): ParsedStatement {
  const rows: ParsedStatementRow[] = (raw.rows || [])
    .map((row) => {
      const amount = normalizeAmount(row.amount);
      const date = normalizeDate(row.date);
      const uncertain = new Set<ReceiptFieldFlag>(
        (row.uncertainFields || []).filter((f): f is ReceiptFieldFlag =>
          ['amount', 'date', 'merchant', 'category', 'currency'].includes(f)
        )
      );

      // A row the model could not read fully still gets imported — flagged, so
      // the user fixes it in the review list instead of losing the row entirely.
      if (amount === undefined || amount === 0) uncertain.add('amount');
      if (!date) uncertain.add('date');
      if (!row.category) uncertain.add('category');

      const kind: TransactionKind = /expense|расход|списан/i.test(row.kind || '')
        ? 'EXPENSE'
        : 'INCOME';

      return {
        date,
        amount,
        currency: normalizeCurrency(row.currency),
        kind,
        description: row.description?.trim() || undefined,
        suggestedCategoryName: row.category?.trim() || undefined,
        uncertainFields: Array.from(uncertain),
      };
    })
    // Rows with neither a sum nor a date are noise (headers, page numbers).
    .filter((row) => row.amount !== undefined || row.date !== undefined);

  return {
    rows,
    rawText: raw.rawText,
    modelConfidence: typeof raw.confidence === 'number' ? raw.confidence : undefined,
  };
}

/** Reads a photographed list of bank operations into separate rows. */
export async function analyzeStatementWithAI(
  base64DataUrl: string,
  mimeType = 'image/jpeg',
  userKey?: string
): Promise<ParsedStatement> {
  const apiKey = (userKey || getStoredGeminiKey() || '').trim();

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ReceiptScanError('OFFLINE', 'Нет подключения к сети — список нельзя распознать.');
  }

  // Statements are dense text: keep more pixels than a receipt scan does.
  const payload = mimeType.startsWith('image/')
    ? await compressImage(base64DataUrl, 2200)
    : base64DataUrl;

  const res = await fetch('/api/analyze-statement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64Data: payload, mimeType: 'image/jpeg', apiKey }),
  }).catch(() => null);

  if (!res) {
    throw new ReceiptScanError(
      'OFFLINE',
      'Сервер распознавания недоступен. Проверьте соединение и попробуйте ещё раз.'
    );
  }

  const json = await res.json().catch(() => null);

  if (res.ok && json?.success && json.data) {
    const parsed = normalizeStatement(json.data as RawStatementResponse);
    if (parsed.rows.length === 0) {
      throw new ReceiptScanError(
        'MODEL_ERROR',
        'В списке не распознано ни одной операции. Снимите список крупнее и без бликов.'
      );
    }
    return parsed;
  }

  throw classifyServerError(json?.error, json?.message);
}

/** Maps a statement row onto a category id, honouring the operation direction. */
export function resolveStatementCategoryId(
  row: ParsedStatementRow,
  categories: FinanceCategory[]
): string | undefined {
  const pool = categories.filter((c) => c.kind === row.kind && !c.parentId && !c.isHidden);
  const needle = row.suggestedCategoryName?.trim().toLowerCase();

  if (needle) {
    const exact = pool.find((c) => c.name.toLowerCase() === needle);
    if (exact) return exact.id;
    const partial = pool.find(
      (c) => c.name.toLowerCase().includes(needle) || needle.includes(c.name.toLowerCase())
    );
    if (partial) return partial.id;
  }

  if (row.kind === 'EXPENSE') {
    return resolveCategoryId(row.suggestedCategoryName, row.description, categories);
  }

  // Salary is the overwhelmingly common income row in a bank list.
  if (/משכורת|salary|зарплат|שכר/i.test(row.description || '')) {
    return pool.find((c) => c.id === 'cat-salary')?.id;
  }

  return undefined;
}
