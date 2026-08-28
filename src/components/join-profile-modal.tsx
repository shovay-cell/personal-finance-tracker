'use client';

import React, { useState } from 'react';
import { Check, Cloud, KeyRound, Loader2, Users } from 'lucide-react';
import { AuthSession, FinanceBackupPayload } from '@/types';
import {
  financeDb,
  importFinanceDatabaseJson,
  mergeFinanceDatabaseJson,
  saveFinanceSettings,
  setCurrentMemberId,
} from '@/lib/db';
import {
  authenticateGoogleDrive,
  fetchProfileBackupByCode,
  getGoogleDriveState,
} from '@/services/backup/drive-backup';
import { MEMBER_COLORS } from '@/constants/categories';
import { Field, ModalShell, PrimaryButton, inputClass } from './ui';

type Step = 'CODE' | 'CONFIRM' | 'DONE';

/**
 * Partner side of the invitation. The code identifies the profile; the data
 * itself comes from the family's shared Google Drive backup — so joining is
 * "sign in to the same Drive, prove the code, pull the profile".
 */
export function JoinProfileModal({
  session,
  onClose,
  onJoined,
}: {
  session?: AuthSession;
  onClose: () => void;
  onJoined: (profileName: string) => void;
}) {
  const [step, setStep] = useState<Step>('CODE');
  const [code, setCode] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<{ payload: FinanceBackupPayload; json: string } | null>(null);
  const [displayName, setDisplayName] = useState(session?.displayName || '');

  const connectAndFind = async () => {
    setIsBusy(true);
    setError(null);

    try {
      if (!getGoogleDriveState().isConnected) {
        const auth = await authenticateGoogleDrive();
        if (!auth.success) {
          setError(auth.error || 'Не удалось подключить Google Drive');
          return;
        }
      }

      const result = await fetchProfileBackupByCode(code);
      if (!result.success || !result.payload || !result.json) {
        setError(result.error || 'Профиль не найден');
        return;
      }

      setFound({ payload: result.payload, json: result.json });
      setStep('CONFIRM');
    } catch (err: any) {
      setError(err.message || 'Ошибка подключения к Google Drive');
    } finally {
      setIsBusy(false);
    }
  };

  const join = async () => {
    if (!found) return;
    setIsBusy(true);
    setError(null);

    try {
      // A device that already has its own operations must not lose them, so an
      // occupied database is merged; an empty one takes the profile as it is.
      const hasOwnData = (await financeDb.transactions.count()) > 0;
      const result = hasOwnData
        ? await mergeFinanceDatabaseJson(found.json)
        : await importFinanceDatabaseJson(found.json);

      if (!result.success) {
        setError(result.error || 'Не удалось применить профиль');
        return;
      }

      // Identify this device as one of the profile's members: match by the email
      // the owner invited, otherwise add the person as a new participant.
      const members = await financeDb.members.toArray();
      const byEmail = session?.email
        ? members.find((m) => m.email?.toLowerCase() === session.email.toLowerCase())
        : undefined;

      let memberId = byEmail?.id;
      if (byEmail) {
        await financeDb.members.update(byEmail.id, {
          displayName: displayName.trim() || byEmail.displayName,
          isCurrentDevice: true,
        });
      } else {
        memberId = `member-${Date.now().toString(36)}`;
        await financeDb.members.put({
          id: memberId,
          displayName: displayName.trim() || session?.displayName || 'Партнёр',
          email: session?.email,
          colorHex: MEMBER_COLORS[members.length % MEMBER_COLORS.length],
          role: 'FULL',
          isCurrentDevice: true,
          notifyOnLargeTransactions: true,
          largeTransactionThreshold: 500,
          joinedAt: new Date().toISOString(),
        });
      }

      if (memberId) {
        setCurrentMemberId(memberId);
        // The imported profile marks the owner's device as current; on this
        // device only one member can hold that flag.
        for (const member of await financeDb.members.toArray()) {
          if (member.id !== memberId && member.isCurrentDevice) {
            await financeDb.members.update(member.id, { isCurrentDevice: false });
          }
        }
      }

      // The imported settings carry the owner's session — restore this device's.
      // The onboarding flag is left to the caller: setting it here would unmount
      // the wizard together with this screen before its confirmation is seen.
      await saveFinanceSettings({ session });

      setStep('DONE');
      onJoined(found.payload.settings?.profileName || 'Общий профиль');
    } catch (err: any) {
      setError(err.message || 'Не удалось присоединиться к профилю');
    } finally {
      setIsBusy(false);
    }
  };

  const profile = found?.payload.settings;

  return (
    <ModalShell
      title="Присоединиться к профилю"
      subtitle={
        step === 'CODE'
          ? 'Код у партнёра: Настройки → Семейный доступ'
          : step === 'CONFIRM'
          ? 'Профиль найден — проверьте, что это он'
          : undefined
      }
      icon={<Users className="w-5 h-5" />}
      onClose={onClose}
      maxWidthClass="max-w-md"
      footer={
        <div className="space-y-2">
          {error && <p className="text-[11px] font-bold text-rose-500 text-center leading-relaxed">{error}</p>}

          {step === 'CODE' && (
            <PrimaryButton onClick={connectAndFind} disabled={isBusy || code.trim().length < 4}>
              {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
              Подключить Google Drive и найти профиль
            </PrimaryButton>
          )}

          {step === 'CONFIRM' && (
            <PrimaryButton onClick={join} disabled={isBusy} variant="success">
              {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Присоединиться
            </PrimaryButton>
          )}

          {step === 'DONE' && <PrimaryButton onClick={onClose}>Открыть профиль</PrimaryButton>}
        </div>
      }
    >
      {step === 'CODE' && (
        <>
          <Field label="Код приглашения">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="A1B2C3"
              className={`${inputClass} text-xl font-black tracking-[0.3em] text-center uppercase`}
              autoFocus
              maxLength={12}
            />
          </Field>

          <Field label="Как вас показывать" hint="Метка автора у ваших операций">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Имя"
              className={inputClass}
            />
          </Field>

          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3 space-y-1.5">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
              Что произойдёт
            </p>
            <p className="text-[10.5px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
              1. Вы войдёте в <b>тот же Google-аккаунт</b>, что и партнёр — в нём лежит общая
              резервная копия профиля.
              <br />
              2. Приложение найдёт профиль и сверит код.
              <br />
              3. Счета, категории, бюджеты и операции появятся на этом устройстве, а ваши операции
              будут подписаны вашим именем.
            </p>
          </div>

          <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold leading-relaxed">
            Одного кода недостаточно: данные передаются через общий Google Drive, поэтому партнёр
            должен хотя бы раз нажать «Выгрузить» в разделе резервного копирования.
          </p>
        </>
      )}

      {step === 'CONFIRM' && profile && (
        <>
          <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20 p-3.5 space-y-2">
            <p className="text-sm font-black text-slate-900 dark:text-slate-100">
              {profile.profileName}
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Операций" value={String(found?.payload.transactions?.length || 0)} />
              <Stat label="Счетов" value={String(found?.payload.accounts?.length || 0)} />
              <Stat label="Участников" value={String(found?.payload.members?.length || 0)} />
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
              Валюта профиля: {profile.baseCurrency}
              {profile.vatEnabled ? ` · НДС ${profile.vatRate}%` : ''}
            </p>
          </div>

          <Field label="Как вас показывать">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputClass}
            />
          </Field>

          <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
            Если на этом устройстве уже есть операции, они сохранятся и объединятся с профилем.
          </p>
        </>
      )}

      {step === 'DONE' && (
        <div className="py-6 text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-3xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Check className="w-7 h-7" />
          </div>
          <p className="text-sm font-black text-slate-800 dark:text-slate-100">
            Вы в общем профиле
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium px-4 leading-relaxed">
            Чтобы обмениваться операциями дальше, каждый нажимает «Синхронизировать» в разделе
            резервного копирования — записи объединяются без потерь.
          </p>
        </div>
      )}
    </ModalShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/70 dark:bg-slate-900/60 p-2 text-center">
      <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm font-black text-slate-700 dark:text-slate-200 tabular-nums">{value}</p>
    </div>
  );
}
