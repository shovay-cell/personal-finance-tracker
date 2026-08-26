'use client';

import React, { useState } from 'react';
import { ExternalLink, KeyRound, RefreshCw } from 'lucide-react';
import { getStoredGeminiKey, setStoredGeminiKey } from '@/services/ai/receipt-parser';
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
  // Google's Gemini keys are all AIza-prefixed; catching that here saves a round
  // trip that would come back as the same failure.
  const looksWrong = trimmed.length > 0 && !trimmed.startsWith('AIza');

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
          placeholder="AIza…"
          className={`${inputClass} text-xs`}
          autoComplete="off"
        />
        <button
          type="button"
          disabled={!trimmed || looksWrong}
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
        <p className="text-[10px] font-bold text-rose-500">
          Ключ Gemini начинается с «AIza». Похоже, скопировано что-то другое.
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
