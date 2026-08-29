import { NextRequest, NextResponse } from 'next/server';
import {
  analyzeImageWithGemini,
  analyzeTextWithGemini,
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

const STATEMENT_TEXT_PROMPT = `Ты — ИИ-бухгалтер приложения FinTrack.
Ниже — ТАБЛИЦА операций из банковской выписки, извлечённая из файла Excel или CSV
(строки разделены переносом, столбцы — точкой с запятой). Первая строка может быть
заголовком таблицы — не превращай её в операцию.
Текст может быть на иврите (עברית), русском или английском.

ЗАДАЧА: извлеки КАЖДУЮ строку таблицы как отдельную операцию. Не объединяй строки и не пропускай их.

ПРАВИЛА:
1. Извлекай ТОЛЬКО реальные строки таблицы. Не выдумывай операции, суммы и даты.
2. Игнорируй заголовок, итоговые суммы («сума», «סה"כ», «Итого», «Баланс»), пустые строки.
3. date — дата строки в формате YYYY-MM-DD. В Израиле формат обычно DD/MM/YYYY или DD/MM/YY.
4. amount — сумма строки, ВСЕГДА положительное число.
5. kind — "income" для поступлений (зачисления, положительная сумма, отдельный столбец «Зачислено»),
   "expense" для списаний (отрицательная сумма, столбец «Списано»).
6. description — назначение платежа так, как в таблице.
7. category — предполагаемая категория, по тем же спискам, что и для фото чека.
8. currency — "ILS", "USD" или "EUR".
9. uncertainFields — поля, в которых ты не уверен из-за неоднозначного формата ячейки.

Верни СТРОГО тот же формат JSON, что описан выше для фото выписки:
{
  "rows": [
    { "date": "YYYY-MM-DD", "amount": 0.0, "currency": "ILS", "kind": "income" | "expense",
      "description": "...", "category": "...", "uncertainFields": [] }
  ],
  "rawText": "",
  "confidence": 0.0
}

Верни ИСКЛЮЧИТЕЛЬНО валидный JSON без markdown-обёрток и пояснений.

ТАБЛИЦА:
`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { base64Data, mimeType = 'image/jpeg', text, apiKey: clientApiKey } = body;

    if (!base64Data && !text) {
      return NextResponse.json(
        { success: false, error: 'MISSING_DATA', message: 'Отсутствует список операций' },
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

    // A spreadsheet/CSV export is already text — send it straight to the model
    // instead of through the vision path, which is built for photographed and
    // scanned documents.
    let result;
    if (text) {
      result = await analyzeTextWithGemini({
        apiKey,
        prompt: `${STATEMENT_TEXT_PROMPT}${String(text).slice(0, 60000)}`,
      });
    } else {
      const { cleanBase64, cleanMimeType } = normalizeImagePayload(base64Data, mimeType);
      result = await analyzeImageWithGemini({
        apiKey,
        base64: cleanBase64,
        mimeType: cleanMimeType,
        prompt: STATEMENT_PROMPT,
      });
    }

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
