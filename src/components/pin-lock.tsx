'use client';

import React, { useEffect, useState } from 'react';
import { Delete, KeyRound, Lock, ShieldOff } from 'lucide-react';
import { AuthSession, FinanceSettings } from '@/types';
import { saveFinanceSettings } from '@/lib/db';
import {
  createSalt,
  hashPin,
  isValidPin,
  registerFailedAttempt,
  resetFailedAttempts,
  verifyPin,
} from '@/services/security/pin';
import { signInWithGoogle } from '@/services/auth';
import { markSessionUnlocked } from './../services/security/session-lock';
import { useT } from '@/i18n/context';
import { ModalShell, PrimaryButton, inputClass } from './ui';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'DEL'];

function Keypad({
  value,
  onChange,
  onSubmit,
  maxLength = 6,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit?: () => void;
  maxLength?: number;
}) {
  return (
    <>
      <div className="flex justify-center gap-2.5 py-4">
        {Array.from({ length: maxLength }).map((_, index) => (
          <span
            key={index}
            className={`w-3 h-3 rounded-full transition-all ${
              index < value.length
                ? 'bg-sky-500 scale-110'
                : index < 4
                ? 'bg-slate-200 dark:bg-slate-700'
                : 'bg-slate-100 dark:bg-slate-800'
            }`}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 max-w-[260px] mx-auto">
        {KEYS.map((key, index) =>
          key === '' ? (
            <div key={`empty-${index}`} />
          ) : (
            <button
              key={key}
              type="button"
              onClick={() => {
                if (key === 'DEL') return onChange(value.slice(0, -1));
                if (value.length >= maxLength) return;
                const next = value + key;
                onChange(next);
                if (next.length === maxLength) onSubmit?.();
              }}
              className="py-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800 text-lg font-black text-slate-700 dark:text-slate-200 active:scale-95 transition-all flex items-center justify-center"
            >
              {key === 'DEL' ? <Delete className="w-5 h-5" /> : key}
            </button>
          )
        )}
      </div>
    </>
  );
}

/**
 * Lock screen shown before the app when a PIN is set. Recovery goes through the
 * account that owns the profile: proving the Google login, or confirming the
 * email the profile was created with. It never reveals the PIN — it clears it.
 */
export function PinLockScreen({
  settings,
  onUnlocked,
}: {
  settings: FinanceSettings;
  onUnlocked: () => void;
}) {
  const { t } = useT();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [attempts, setAttempts] = useState(0);

  const session = settings.session;

  const submit = async (candidate: string) => {
    const ok = await verifyPin(candidate, settings.pinSalt, settings.pinHash);
    if (ok) {
      resetFailedAttempts();
      onUnlocked();
      return;
    }
    setAttempts(registerFailedAttempt());
    setError(t('pin.wrong'));
    setPin('');
  };

  /**
   * The stored digest hides how long the PIN is, so every entry from four digits
   * up is checked silently: a 4-digit code unlocks on the fourth tap, a longer
   * one keeps accepting digits. Only a full six digits reports a failure.
   */
  const handleChange = async (next: string) => {
    setPin(next);
    setError(null);

    if (next.length < 4) return;
    if (await verifyPin(next, settings.pinSalt, settings.pinHash)) {
      resetFailedAttempts();
      onUnlocked();
    } else if (next.length === 6) {
      setAttempts(registerFailedAttempt());
      setError(t('pin.wrong'));
      setPin('');
    }
  };

  const resetPin = async () => {
    await saveFinanceSettings({ pinEnabled: false, pinHash: undefined, pinSalt: undefined });
    resetFailedAttempts();
    onUnlocked();
  };

  const recoverWithGoogle = async () => {
    setError(null);
    const result = await signInWithGoogle();
    if (!result.success) {
      setError(result.error);
      return;
    }
    if (session && result.session.email.toLowerCase() !== session.email.toLowerCase()) {
      setError(`${t('pin.otherAccount')} ${session.email}.`);
      return;
    }
    await resetPin();
  };

  const recoverWithEmail = async () => {
    if (!session || recoveryEmail.trim().toLowerCase() !== session.email.toLowerCase()) {
      setError(t('pin.emailMismatch'));
      return;
    }
    await resetPin();
  };

  if (isRecovering) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-4 text-center">
          <div className="w-14 h-14 mx-auto rounded-3xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <ShieldOff className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">{t('pin.forgot')}</h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
            {t('pin.recoverText')}
          </p>

          {session?.provider === 'GOOGLE' ? (
            <PrimaryButton onClick={recoverWithGoogle}>
              {t('pin.confirmGoogle')}
            </PrimaryButton>
          ) : (
            <>
              <input
                type="email"
                value={recoveryEmail}
                onChange={(e) => setRecoveryEmail(e.target.value)}
                placeholder={session?.email || t('pin.profileEmail')}
                className={inputClass}
                autoFocus
              />
              <PrimaryButton onClick={recoverWithEmail}>{t('pin.resetCode')}</PrimaryButton>
            </>
          )}

          {error && <p className="text-[11px] font-bold text-rose-500">{error}</p>}

          <button
            type="button"
            onClick={() => {
              setIsRecovering(false);
              setError(null);
            }}
            className="w-full py-2 text-[11px] font-black text-slate-400"
          >
            {t('pin.backToEntry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-2 text-center">
        <div className="w-14 h-14 mx-auto rounded-3xl bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center">
          <Lock className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">{t('pin.enterCode')}</h2>
        <p className="text-[11px] text-slate-400 font-medium">
          {settings.profileName}
          {session?.email ? ` · ${session.email}` : ''}
        </p>

        <Keypad value={pin} onChange={handleChange} />

        {pin.length >= 4 && (
          <PrimaryButton onClick={() => submit(pin)} className="mt-3">
            {t('pin.unlock')}
          </PrimaryButton>
        )}

        {error && (
          <p className="text-[11px] font-bold text-rose-500 pt-2">
            {error}
            {attempts >= 3 ? ` · ${t('pin.attempts')}: ${attempts}` : ''}
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            setIsRecovering(true);
            setError(null);
          }}
          className="w-full py-2 text-[11px] font-black text-slate-400 mt-2"
        >
          {t('pin.forgot')}
        </button>
      </div>
    </div>
  );
}

/** Set, change or turn off the PIN — all three flows in one place. */
export function ManagePinModal({
  settings,
  onClose,
}: {
  settings: FinanceSettings;
  onClose: () => void;
}) {
  const { t } = useT();
  const [step, setStep] = useState<'CURRENT' | 'NEW' | 'CONFIRM'>(
    settings.pinEnabled ? 'CURRENT' : 'NEW'
  );
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setError(null), [step]);

  const checkCurrent = async () => {
    if (!(await verifyPin(current, settings.pinSalt, settings.pinHash))) {
      setError(t('pin.wrongCurrent'));
      setCurrent('');
      return;
    }
    setStep('NEW');
  };

  const savePin = async () => {
    if (!isValidPin(next)) return setError(t('pin.mustBe46'));
    if (next !== confirm) {
      setError(t('pin.mismatch'));
      setConfirm('');
      return;
    }
    const salt = createSalt();
    await saveFinanceSettings({
      pinEnabled: true,
      pinSalt: salt,
      pinHash: await hashPin(next, salt),
    });
    // Setting a PIN must not lock the screen the user is standing on.
    markSessionUnlocked();
    onClose();
  };

  const disablePin = async () => {
    await saveFinanceSettings({ pinEnabled: false, pinHash: undefined, pinSalt: undefined });
    onClose();
  };

  return (
    <ModalShell
      title={settings.pinEnabled ? t('settings.pin') : t('pin.setCode')}
      subtitle={
        step === 'CURRENT'
          ? t('pin.currentSub')
          : step === 'NEW'
          ? t('pin.newSub')
          : t('pin.confirmSub')
      }
      icon={<KeyRound className="w-5 h-5" />}
      onClose={onClose}
      maxWidthClass="max-w-sm"
      footer={
        <div className="space-y-2">
          {error && <p className="text-[11px] font-bold text-rose-500 text-center">{error}</p>}

          {step === 'CURRENT' && (
            <>
              <PrimaryButton onClick={checkCurrent} disabled={current.length < 4}>
                {t('pin.continue')}
              </PrimaryButton>
              <button
                type="button"
                onClick={async () => {
                  if (!(await verifyPin(current, settings.pinSalt, settings.pinHash))) {
                    setError(t('pin.currentToDisable'));
                    return;
                  }
                  await disablePin();
                }}
                className="w-full py-2.5 rounded-2xl text-[11px] font-black text-rose-500 bg-rose-50 dark:bg-rose-950/40"
              >
                {t('pin.disable')}
              </button>
            </>
          )}

          {step === 'NEW' && (
            <PrimaryButton
              onClick={() => {
                if (!isValidPin(next)) return setError(t('pin.mustBe46'));
                setStep('CONFIRM');
              }}
              disabled={next.length < 4}
            >
              {t('common.next')}
            </PrimaryButton>
          )}

          {step === 'CONFIRM' && (
            <PrimaryButton onClick={savePin} disabled={confirm.length < 4}>
              {t('pin.saveCode')}
            </PrimaryButton>
          )}
        </div>
      }
    >
      {step === 'CURRENT' && <Keypad value={current} onChange={setCurrent} />}
      {step === 'NEW' && <Keypad value={next} onChange={setNext} />}
      {step === 'CONFIRM' && <Keypad value={confirm} onChange={setConfirm} />}

      <p className="text-[10px] text-slate-400 font-medium text-center leading-relaxed">
        {t('pin.footerNote')}
      </p>
    </ModalShell>
  );
}
