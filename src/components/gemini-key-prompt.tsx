'use client';

import React from 'react';
import { RefreshCw, ServerCog } from 'lucide-react';

/**
 * Shown when a scan failed for a key-related reason. Keys live in the server
 * environment, not on the device, so this explains the cause and offers a retry
 * rather than asking the user to paste a secret into their phone.
 */
export function GeminiKeyPrompt({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-3.5 space-y-2 text-left">
      <div className="flex items-start gap-2">
        <ServerCog className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-px" />
        <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300 leading-relaxed">
          {message}
        </p>
      </div>

      <p className="text-[10px] text-amber-700/70 dark:text-amber-400/70 font-medium leading-relaxed">
        Ключ распознавания задаётся переменной GEMINI_API_KEY на сервере. Статус виден в
        настройках, в разделе «ИИ-сканирование чеков».
      </p>

      <button
        type="button"
        onClick={onRetry}
        className="w-full py-2 rounded-xl bg-amber-500 text-white text-[11px] font-black flex items-center justify-center gap-1.5"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Повторить распознавание
      </button>
    </div>
  );
}
