import { NextRequest, NextResponse } from 'next/server';

/** Kept in sync with the client fallback in services/ai/receipt-parser.ts. */
const RECEIPT_PROMPT = `Ты — ИИ-бухгалтер приложения FinTrack.
Проанализируй фото/скан кассового чека, квитанции или расписки.
Документ может быть на иврите (עברית), русском или английском.

ПРАВИЛА:
1. Извлекай ТОЛЬКО то, что реально напечатано на изображении. НИКОГДА не выдумывай суммы, даты и названия.
2. total — ИТОГОВАЯ сумма к оплате (סה"כ לתשלום / TOTAL / ИТОГО), а не сумма одной позиции и не сумма НДС.
3. Если чек в шекелях (₪ / ש"ח / ILS) — currency: "ILS". Доллар ($ / USD) — "USD". Евро (€ / EUR) — "EUR".
4. date — дата чека в формате YYYY-MM-DD. Формат в Израиле обычно DD/MM/YYYY: 03/04/2026 — это 2026-04-03.
5. category — предполагаемая категория расхода одним словом из списка:
   Продукты, Кафе и рестораны, Машина, Транспорт, Здоровье, Дом/уют, Покупки, Коммуналка,
   Развлечения, Дети, Спорт, Образование, Путешествия, Подписки, Платежи, комиссии, Другое.
6. confidence — твоя общая уверенность в распознавании от 0 до 1.
7. uncertainFields — массив имён полей ("amount", "date", "merchant", "category", "currency"),
   в которых ты НЕ уверен (плохо видно, затёрто, неоднозначно). Пустой массив, если всё читается чётко.
   Это критично: непроверенные поля пользователь подтверждает вручную.

Верни СТРОГО валидный JSON:
{
  "merchant": "Название магазина/продавца как на чеке",
  "total": 0.0,
  "currency": "ILS" | "USD" | "EUR",
  "date": "YYYY-MM-DD",
  "category": "Категория из списка выше",
  "items": [{ "name": "Позиция", "quantity": 1, "price": 0.0 }],
  "rawText": "Распознанный текст чека",
  "confidence": 0.0,
  "uncertainFields": ["amount"]
}

Верни ИСКЛЮЧИТЕЛЬНО валидный JSON без markdown-обёрток и пояснений.`;

/**
 * Diagnostics: says whether THIS deployment can see a server-side Gemini key,
 * without ever echoing the key itself. Open it in a browser when scanning keeps
 * reporting a missing key — a variable added in Vercel reaches the function only
 * after a redeploy, and only in the environments it was ticked for.
 */
/**
 * Sends the key in the `x-goog-api-key` header — the form Google documents for
 * current auth keys — and retries through `?key=` when the header is refused,
 * since some keys are still only accepted that way.
 */
async function callGemini(
  model: string,
  apiKey: string,
  mimeType: string,
  base64: string
): Promise<Response> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = JSON.stringify({
    contents: [
      {
        parts: [
          { inline_data: { mime_type: mimeType, data: base64 } },
          { text: RECEIPT_PROMPT },
        ],
      },
    ],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
  });

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

export async function GET() {
  const rawKey = process.env.GEMINI_API_KEY || '';
  const key = rawKey.trim();

  return NextResponse.json({
    serverKeyConfigured: key.length > 0,
    environment: process.env.VERCEL_ENV || 'local',
    deploymentUrl: process.env.VERCEL_URL || null,
    // Shape hints only — enough to spot a truncated paste or a wrong secret,
    // never enough to reconstruct the key.
    // Google issues legacy `AIza…` keys and current auth keys `AQ.…`.
    keyLooksValid: key.startsWith('AIza') || key.startsWith('AQ.'),
    keyLength: key.length,
    hadSurroundingWhitespace: rawKey.length !== key.length,
    hint: !key.length
      ? 'Переменная GEMINI_API_KEY не видна этому деплою: добавьте её в этот проект Vercel (Production и Preview) и передеплойте.'
      : !(key.startsWith('AIza') || key.startsWith('AQ.'))
      ? 'Значение не похоже на ключ Gemini: ключ из Google AI Studio начинается с «AQ.» (новый формат) или «AIza» (прежний). Похоже, вставлен другой токен.'
      : 'Ключ найден на сервере. Если сканирование всё равно не работает — проверьте квоту ключа в Google AI Studio.',
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { base64Data, mimeType = 'image/jpeg', apiKey: clientApiKey } = body;

    if (!base64Data) {
      return NextResponse.json(
        { success: false, error: 'MISSING_DATA', message: 'Отсутствует изображение чека для анализа' },
        { status: 400 }
      );
    }

    // Only a key the user typed in themselves may arrive from the browser; the
    // shared default key stays server-side in this env var.
    const apiKey = (clientApiKey || process.env.GEMINI_API_KEY || '').trim();

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'NO_API_KEY',
          message:
            'Ключ Gemini не найден на сервере этого деплоя. Добавьте переменную GEMINI_API_KEY в проект и передеплойте — или вставьте свой личный ключ здесь.',
          serverKeyConfigured: false,
          environment: process.env.VERCEL_ENV || 'local',
        },
        { status: 400 }
      );
    }

    const cleanBase64 = base64Data.includes('base64,')
      ? base64Data.split('base64,')[1]
      : base64Data;

    let cleanMimeType = mimeType;
    if (base64Data.startsWith('data:')) {
      const match = base64Data.match(/data:([^;]+);/);
      if (match) cleanMimeType = match[1];
    }
    if (!cleanMimeType || cleanMimeType === 'application/octet-stream') {
      cleanMimeType = 'image/jpeg';
    }

    const modelsToTry = ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.5-flash'];
    let geminiJson: any = null;
    let lastError = '';

    for (const model of modelsToTry) {
      try {
        const res = await callGemini(model, apiKey, cleanMimeType, cleanBase64);

        if (res.ok) {
          geminiJson = await res.json();
          break;
        }

        lastError = `${model} returned ${res.status}: ${await res.text()}`;
        console.warn(`Gemini receipt model ${model} error:`, lastError);
      } catch (err: any) {
        lastError = err.message || String(err);
        console.warn(`Gemini receipt fetch error on ${model}:`, err);
      }
    }

    if (!geminiJson) {
      return NextResponse.json(
        {
          success: false,
          error: 'GEMINI_API_ERROR',
          message: `Ошибка обращения к Gemini API: ${lastError}`,
        },
        { status: 502 }
      );
    }

    const textContent = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!textContent) {
      return NextResponse.json(
        { success: false, error: 'EMPTY_RESPONSE', message: 'Модель Gemini вернула пустой ответ' },
        { status: 500 }
      );
    }

    let cleanJsonString = textContent.trim();
    if (cleanJsonString.startsWith('```json')) {
      cleanJsonString = cleanJsonString.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanJsonString.startsWith('```')) {
      cleanJsonString = cleanJsonString.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    return NextResponse.json({
      success: true,
      data: JSON.parse(cleanJsonString),
      source: 'gemini_multimodal_api',
    });
  } catch (error: any) {
    console.error('Server analyze-receipt error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'SERVER_ERROR',
        message: error.message || 'Внутренняя ошибка сервера при анализе чека',
      },
      { status: 500 }
    );
  }
}
