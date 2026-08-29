import 'server-only';

/** Current Flash lineup, tried in order — the first that answers wins. */
const MODELS = ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.5-flash'];

export interface GeminiVisionResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  message?: string;
  status?: number;
}

/**
 * One image + one prompt through Gemini, with the key sent in the
 * `x-goog-api-key` header and retried through `?key=` when the header form is
 * refused — some keys are only accepted one way.
 */
async function callModel(
  model: string,
  apiKey: string,
  mimeType: string,
  base64: string,
  prompt: string
): Promise<Response> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = JSON.stringify({
    contents: [
      {
        parts: [{ inline_data: { mime_type: mimeType, data: base64 } }, { text: prompt }],
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

/** Strips the ```json fences some responses still arrive wrapped in. */
export function parseModelJson(text: string): unknown {
  let clean = text.trim();
  if (clean.startsWith('```json')) clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  else if (clean.startsWith('```')) clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
  return JSON.parse(clean);
}

export function resolveApiKey(clientApiKey?: string): string {
  return (clientApiKey || process.env.GEMINI_API_KEY || '').trim();
}

export function normalizeImagePayload(base64Data: string, mimeType?: string) {
  const cleanBase64 = base64Data.includes('base64,') ? base64Data.split('base64,')[1] : base64Data;

  let cleanMimeType = mimeType;
  if (base64Data.startsWith('data:')) {
    const match = base64Data.match(/data:([^;]+);/);
    if (match) cleanMimeType = match[1];
  }
  if (!cleanMimeType || cleanMimeType === 'application/octet-stream') {
    cleanMimeType = 'image/jpeg';
  }

  return { cleanBase64, cleanMimeType };
}

export async function analyzeImageWithGemini(input: {
  apiKey: string;
  base64: string;
  mimeType: string;
  prompt: string;
}): Promise<GeminiVisionResult> {
  const { apiKey, base64, mimeType, prompt } = input;
  let lastError = '';
  let lastStatus: number | undefined;

  for (const model of MODELS) {
    try {
      const res = await callModel(model, apiKey, mimeType, base64, prompt);

      if (!res.ok) {
        lastStatus = res.status;
        lastError = `${model} returned ${res.status}: ${await res.text()}`;
        console.warn('Gemini model error:', lastError);
        continue;
      }

      const json = await res.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!text) {
        lastError = `${model} returned an empty response`;
        continue;
      }

      return { ok: true, data: parseModelJson(text) };
    } catch (err: any) {
      lastError = err.message || String(err);
      console.warn(`Gemini fetch error on ${model}:`, err);
    }
  }

  return {
    ok: false,
    error: 'GEMINI_API_ERROR',
    message: `Gemini API request failed: ${lastError}`,
    status: lastStatus,
  };
}
