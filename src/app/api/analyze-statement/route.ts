import { NextRequest, NextResponse } from 'next/server';
import {
  analyzeImageWithGemini,
  normalizeImagePayload,
  resolveApiKey,
} from '@/services/ai/gemini-server';

const STATEMENT_PROMPT = `Ты — ИИ-бухгалтер приложения FinTrack.
На фото — СПИСОК операций из интернет-банка или выписки (несколько строк подряд).
Текст может быть на иврите (עברית), русском или английском.

ЗАДАЧА: извлеки КАЖДУЮ строку списка как отдельную операцию. Не объединяй строки и не пропускай их.

ПРАВИЛА:
1. Извлекай ТОЛЬКО реально напечатанные строки. Не выдумывай операции, суммы и даты.
2. Игнорируй заголовки таблицы, итоговые суммы («сума», «סה"כ», «Итого», «Баланс»), номера страниц.
3. date — дата строки в формате YYYY-MM-DD. В Израиле формат обычно DD/MM/YYYY или DD/MM/YY:
   03/04/2026 → 2026-04-03. Если у строки года нет, возьми год из заголовка выписки.
4. amount — сумма строки, ВСЕГДА положительное число.
5. kind — "income" для поступлений (зачисления, зарплата, перевод в вашу пользу, знак «+»),
   "expense" для списаний (знак «−», снятие, покупка).
6. description — назначение платежа/название так, как напечатано (например «משכורת», «Зарплата», имя плательщика).
7. category — предполагаемая категория. Для поступлений выбирай из:
   Зарплата, Подарок, Проценты по вкладам, Погашение расписки/чека, Другое.
   Для списаний: Продукты, Кафе и рестораны, Машина, Транспорт, Здоровье, Дом/уют, Покупки,
   Коммуналка, Развлечения, Дети, Спорт, Образование, Путешествия, Подписки, Одежда,
   Инвестиции, Платежи, комиссии, Другое.
8. currency — "ILS", "USD" или "EUR".
9. uncertainFields — для каждой строки перечисли поля ("amount", "date", "merchant", "category", "currency"),
   в которых ты НЕ уверен (плохо видно, обрезано, неоднозначно). Пустой массив, если строка читается чётко.

Верни СТРОГО валидный JSON:
{
  "rows": [
    {
      "date": "YYYY-MM-DD",
      "amount": 0.0,
      "currency": "ILS",
      "kind": "income" | "expense",
      "description": "Назначение как на фото",
      "category": "Категория из списка",
      "uncertainFields": []
    }
  ],
  "rawText": "Распознанный текст списка",
  "confidence": 0.0
}

Верни ИСКЛЮЧИТЕЛЬНО валидный JSON без markdown-обёрток и пояснений.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { base64Data, mimeType = 'image/jpeg', apiKey: clientApiKey } = body;

    if (!base64Data) {
      return NextResponse.json(
        { success: false, error: 'MISSING_DATA', message: 'Отсутствует изображение списка операций' },
        { status: 400 }
      );
    }

    const apiKey = resolveApiKey(clientApiKey);
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'NO_API_KEY',
          message:
            'Ключ Gemini не найден на сервере этого деплоя. Добавьте переменную GEMINI_API_KEY в проект и передеплойте.',
          serverKeyConfigured: false,
          environment: process.env.VERCEL_ENV || 'local',
        },
        { status: 400 }
      );
    }

    const { cleanBase64, cleanMimeType } = normalizeImagePayload(base64Data, mimeType);

    const result = await analyzeImageWithGemini({
      apiKey,
      base64: cleanBase64,
      mimeType: cleanMimeType,
      prompt: STATEMENT_PROMPT,
    });

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error, message: result.message },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, data: result.data, source: 'gemini_multimodal_api' });
  } catch (error: any) {
    console.error('Server analyze-statement error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'SERVER_ERROR',
        message: error.message || 'Внутренняя ошибка сервера при разборе списка операций',
      },
      { status: 500 }
    );
  }
}
