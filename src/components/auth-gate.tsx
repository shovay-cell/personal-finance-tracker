'use client';

import React, { useState } from 'react';
import { AtSign, Loader2, LogIn, ShieldCheck, Wallet } from 'lucide-react';
import { AuthSession } from '@/types';
import { isGoogleSignInAvailable, signInWithEmail, signInWithGoogle } from '@/services/auth';
import { PrimaryButton, inputClass } from './ui';

/**
 * First screen when nobody is signed in. Two ways in, nothing else: Google for
 * people who will also use the Drive backup, email for everyone else.
 */
export function AuthGate({ onSignedIn }: { onSignedIn: (session: AuthSession) => void }) {
  const [mode, setMode] = useState<'CHOOSE' | 'EMAIL'>('CHOOSE');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogle = async () => {
    setIsBusy(true);
    setError(null);
    const result = await signInWithGoogle();
    setIsBusy(false);
    if (result.success) onSignedIn(result.session);
    else setError(result.error);
  };

  const handleEmail = () => {
    const result = signInWithEmail(email, name);
    if (result.success) onSignedIn(result.session);
    else setError(result.error);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-gradient-to-tr from-sky-500 via-cyan-500 to-teal-400 text-white flex items-center justify-center shadow-xl shadow-sky-500/30">
            <Wallet className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100">FinTrack</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1 leading-relaxed">
              Доходы и расходы, отделение НДС и совместный счёт с партнёром
            </p>
          </div>
        </div>

        {mode === 'CHOOSE' ? (
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={handleGoogle}
              disabled={isBusy || !isGoogleSignInAvailable()}
              className="w-full py-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-black text-sm flex items-center justify-center gap-2.5 shadow-sm active:scale-[0.98] transition-all disabled:opacity-40"
            >
              {isBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <GoogleMark />
              )}
              Войти через Google
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('EMAIL');
                setError(null);
              }}
              className="w-full py-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-black text-sm flex items-center justify-center gap-2.5 active:scale-[0.98] transition-all"
            >
              <AtSign className="w-4 h-4" />
              Продолжить с email
            </button>

            {!isGoogleSignInAvailable() && (
              <p className="text-[10.5px] text-amber-600 dark:text-amber-400 font-bold text-center px-2 leading-relaxed">
                Вход через Google не настроен в этом деплое — доступен вход по email.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputClass}
              autoFocus
              inputMode="email"
            />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Как вас показывать (необязательно)"
              className={inputClass}
            />
            <PrimaryButton onClick={handleEmail}>
              <LogIn className="w-4 h-4" />
              Продолжить
            </PrimaryButton>
            <button
              type="button"
              onClick={() => {
                setMode('CHOOSE');
                setError(null);
              }}
              className="w-full py-2 text-[11px] font-black text-slate-400"
            >
              Назад
            </button>
          </div>
        )}

        {error && (
          <p className="text-[11px] font-bold text-rose-500 text-center leading-relaxed px-2">
            {error}
          </p>
        )}

        <div className="flex items-start gap-2 p-3 rounded-2xl bg-slate-100/70 dark:bg-slate-800/50">
          <ShieldCheck className="w-4 h-4 text-slate-400 flex-shrink-0 mt-px" />
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
            Данные хранятся на устройстве. Вход нужен, чтобы подписывать операции автором,
            приглашать партнёра и привязывать резервную копию к вашему Google Drive.
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.86c2.26-2.09 3.57-5.17 3.57-8.87z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}
