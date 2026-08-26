'use client';

import React, { useState } from 'react';
import { ExternalLink, KeyRound, RefreshCw } from 'lucide-react';
import {
  getStoredGeminiKey,
  looksLikeGeminiKey,
  setStoredGeminiKey,
} from '@/services/ai/receipt-parser';
import { inputClass } from './ui';

/**
 * Shown where a scan failed for a key-related reason, so the fix happens on the
 * spot instead of sending the user hunting through settings and back.
 */
export function GeminiKeyPrompt({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const [key, setKey] = useState(getStoredGeminiKey());
  const [saved, setSaved] = useState(false);

  const trimmed = key.trim();
  // Only a warning, never a block: Google changes key shapes (legacy `AIza…`,
  // current `AQ.…`), and refusing to save an unfamiliar one would lock the user
  // out of a perfectly valid key.
  const looksWrong = trimmed.length > 0 && !looksLikeGeminiKey(trimmed);

  return (
    <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-3.5 space-y-2.5 text-left">
      <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300 leading-relaxed">
        {message}
      </p>

      <div className="flex gap-2">
        <input
          type="password"
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setSaved(false);
          }}
          placeholder="AQ.… или AIza…"
          className={`${inputClass} text-xs`}
          autoComplete="off"
        />
        <button
          type="button"
          disabled={!trimmed}
          onClick={() => {
            setStoredGeminiKey(trimmed);
            setSaved(true);
            onRetry();
          }}
          className="px-4 rounded-2xl bg-amber-500 text-white flex items-center justify-center disabled:opacity-40"
          title="Сохранить ключ и повторить"
        >
          <KeyRound className="w-4 h-4" />
        </button>
      </div>

      {looksWrong && (
        <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
          Обычно ключ Gemini начинается с «AQ.» или «AIza» — проверьте, что скопирован
          весь ключ. Сохранить всё равно можно.
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noreferrer"
          className="text-[10px] font-black text-amber-700 dark:text-amber-400 flex items-center gap-1"
        >
          Получить ключ
          <ExternalLink className="w-3 h-3" />
        </a>

        <button
          type="button"
          onClick={onRetry}
          className="text-[10px] font-black text-slate-500 dark:text-slate-400 flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" />
          {saved ? 'Повторить' : 'Попробовать ещё раз'}
        </button>
      </div>

      <p className="text-[10px] text-amber-700/70 dark:text-amber-400/70 font-medium leading-relaxed">
        Ключ хранится только на этом устройстве и используется для распознавания чеков.
      </p>
    </div>
  );
}
