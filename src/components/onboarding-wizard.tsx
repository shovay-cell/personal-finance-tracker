'use client';

import React, { useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Check,
  Coins,
  FileSignature,
  Mic,
  Percent,
  ScanLine,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { AuthSession, CurrencyCode, FinanceSettings } from '@/types';
import { addMember, saveFinanceSettings } from '@/lib/db';
import { CURRENCY_LIST, MEMBER_COLORS } from '@/constants/categories';
import { createSalt, hashPin, isValidPin } from '@/services/security/pin';
import { vatFromGross, netFromGross } from '@/services/vat';
import { formatMoney } from '@/services/analytics';
import { PrimaryButton, inputClass } from './ui';

type StepId = 'INTRO' | 'MONEY' | 'VAT' | 'PROFIT' | 'PARTNER' | 'SECURITY' | 'DONE';

const STEPS: StepId[] = ['INTRO', 'MONEY', 'VAT', 'PROFIT', 'PARTNER', 'SECURITY', 'DONE'];

/**
 * First-run wizard: explains the six things that are not obvious from the UI and
 * collects the settings that would otherwise be hunted for later. Every step can
 * be skipped — nothing here blocks getting to the app.
 */
export function OnboardingWizard({
  settings,
  session,
  onFinish,
}: {
  settings: FinanceSettings;
  session?: AuthSession;
  onFinish: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];

  const [currency, setCurrency] = useState<CurrencyCode>(settings.baseCurrency);
  const [vatEnabled, setVatEnabled] = useState(settings.vatEnabled);
  const [vatRate, setVatRate] = useState(String(settings.vatRate ?? 18));
  const [partnerEmail, setPartnerEmail] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [showAuthor, setShowAuthor] = useState(settings.showTransactionAuthor);
  const [pinEnabled, setPinEnabled] = useState(settings.pinEnabled);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [inviteCode] = useState(() => Math.random().toString(36).slice(2, 8).toUpperCase());

  const next = () => setStepIndex((index) => Math.min(index + 1, STEPS.length - 1));
  const back = () => setStepIndex((index) => Math.max(index - 1, 0));

  const finish = async () => {
    if (pinEnabled && !isValidPin(pin)) {
      setError('Код должен состоять из 4–6 цифр — или выключите защиту');
      return;
    }

    const patch: Partial<FinanceSettings> = {
      baseCurrency: currency,
      vatEnabled,
      vatRate: parseFloat(vatRate.replace(',', '.')) || 18,
      showTransactionAuthor: showAuthor,
      onboardingCompleted: true,
      inviteCode,
    };

    if (pinEnabled) {
      const salt = createSalt();
      patch.pinEnabled = true;
      patch.pinSalt = salt;
      patch.pinHash = await hashPin(pin, salt);
    } else {
      patch.pinEnabled = false;
      patch.pinHash = undefined;
      patch.pinSalt = undefined;
    }

    if (partnerEmail.trim()) {
      await addMember({
        displayName: partnerName.trim() || partnerEmail.trim().split('@')[0],
        email: partnerEmail.trim(),
        colorHex: MEMBER_COLORS[1],
        role: 'FULL',
        isCurrentDevice: false,
        notifyOnLargeTransactions: true,
        largeTransactionThreshold: 500,
      });
    }

    await saveFinanceSettings(patch);
    onFinish();
  };

  const skipAll = async () => {
    await saveFinanceSettings({ onboardingCompleted: true, inviteCode });
    onFinish();
  };

  const rate = parseFloat(vatRate.replace(',', '.')) || 0;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 max-w-lg w-full mx-auto px-5 py-8 flex flex-col">
        <div className="flex items-center gap-1.5 mb-6">
          {STEPS.map((id, index) => (
            <span
              key={id}
              className={`h-1 flex-1 rounded-full transition-all ${
                index <= stepIndex ? 'bg-sky-500' : 'bg-slate-200 dark:bg-slate-800'
              }`}
            />
          ))}
        </div>

        <div className="flex-1 space-y-5">
          {step === 'INTRO' && (
            <StepShell
              icon={<Wallet className="w-7 h-7" />}
              title={`Привет${session?.displayName ? `, ${session.displayName}` : ''}!`}
              text="Коротко покажу, как здесь всё устроено, и сразу настроим главное. Это займёт минуту — любой шаг можно пропустить."
            >
              <Feature icon={<ScanLine className="w-4 h-4" />} title="Чек в операцию" text="Фото чека — сумма, дата и категория подставляются сами." />
              <Feature icon={<Mic className="w-4 h-4" />} title="Голос и списки" text="«Потратил 50 на кафе» или фото списка операций из банка." />
              <Feature icon={<BarChart3 className="w-4 h-4" />} title="Отчёты и прогноз" text="Куда уходят деньги и хватит ли до конца месяца." />
            </StepShell>
          )}

          {step === 'MONEY' && (
            <StepShell
              icon={<Coins className="w-7 h-7" />}
              title="Доходы и расходы"
              text="Кнопка «+» внизу — главный вход. Сумма и категория, и операция записана."
            >
              <Feature icon={<span className="font-black text-rose-500">−</span>} title="Расход" title2="таб «РАСХОДЫ»" text="Вручную, фото чека или голосом. Чек можно разделить между категориями." />
              <Feature icon={<span className="font-black text-emerald-500">+</span>} title="Доход" title2="таб «ДОХОДЫ»" text="Тот же экран, переключатель сверху. Список поступлений из банка вносится одним фото." />

              <div className="pt-2">
                <p className="text-[11px] font-black uppercase tracking-wide text-slate-400 mb-2">
                  Валюта по умолчанию
                </p>
                <div className="flex gap-1.5">
                  {CURRENCY_LIST.map((option) => (
                    <button
                      key={option.code}
                      type="button"
                      onClick={() => setCurrency(option.code)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-black border transition-all ${
                        currency === option.code
                          ? 'bg-sky-500 text-white border-transparent'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {option.symbol} {option.code}
                    </button>
                  ))}
                </div>
              </div>
            </StepShell>
          )}

          {step === 'VAT' && (
            <StepShell
              icon={<Percent className="w-7 h-7" />}
              title="Отделение НДС"
              text="Если вы работаете с НДС, налог отделяется в момент внесения дохода — и полной оплаты, и аванса, и частичного платежа."
            >
              <Toggle
                label="Отделять НДС от доходов"
                hint="Появится галочка «Отделить НДС и отложить» в форме дохода"
                value={vatEnabled}
                onChange={setVatEnabled}
              />

              {vatEnabled && (
                <>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wide text-slate-400 mb-1.5">
                      Ставка НДС, %
                    </p>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={vatRate}
                      onChange={(e) => setVatRate(e.target.value)}
                      className={`${inputClass} text-lg font-black`}
                    />
                  </div>

                  <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3 space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                      Например, доход {formatMoney(1000, currency)}
                    </p>
                    <div className="flex justify-between text-[11px] font-bold">
                      <span className="text-emerald-600 dark:text-emerald-400">
                        Ваша прибыль: {formatMoney(netFromGross(1000, rate), currency)}
                      </span>
                      <span className="text-amber-600 dark:text-amber-400">
                        НДС: {formatMoney(vatFromGross(1000, rate), currency)}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                      НДС сразу уходит из доступной прибыли и становится обязательством к выплате.
                    </p>
                  </div>
                </>
              )}
            </StepShell>
          )}

          {step === 'PROFIT' && (
            <StepShell
              icon={<BarChart3 className="w-7 h-7" />}
              title="Где смотреть деньги"
              text="Три места, которые отвечают на главные вопросы."
            >
              <Feature icon={<Wallet className="w-4 h-4" />} title="Доступная прибыль" title2="вкладка «Бюджет»" text="«Доступно до конца месяца»: за вычетом трат, обязательных платежей и отложенного НДС — и сколько это в день." />
              <Feature icon={<FileSignature className="w-4 h-4" />} title="Обязательства и НДС" title2="вкладка «Чеки»" text="НДС к выплате и выданные чеки на предъявителя с остатком долга." />
              <Feature icon={<Settings className="w-4 h-4" />} title="Настройки" title2="шестерёнка справа сверху" text="Валюта, ставка НДС, счета, категории, партнёр, код доступа и резервные копии." />
            </StepShell>
          )}

          {step === 'PARTNER' && (
            <StepShell
              icon={<Users className="w-7 h-7" />}
              title="Общий счёт с партнёром"
              text="Второй участник ведёт тот же профиль: те же счета, категории и бюджеты. Шаг необязательный — можно вернуться к нему в настройках."
            >
              <input
                type="email"
                value={partnerEmail}
                onChange={(e) => setPartnerEmail(e.target.value)}
                placeholder="Email партнёра (необязательно)"
                className={inputClass}
              />
              <input
                type="text"
                value={partnerName}
                onChange={(e) => setPartnerName(e.target.value)}
                placeholder="Как его показывать"
                className={inputClass}
              />

              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3">
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Код приглашения
                </p>
                <p className="text-lg font-black tracking-[0.3em] text-slate-700 dark:text-slate-200">
                  {inviteCode}
                </p>
                <p className="text-[10px] text-slate-400 font-medium leading-relaxed mt-1">
                  Партнёр вводит код на своём устройстве и подключает тот же Google Drive —
                  операции синхронизируются через общую резервную копию.
                </p>
              </div>

              <Toggle
                label="Показывать, кто добавил операцию"
                hint="У каждой операции метка автора — в списке, фильтрах и отчётах"
                value={showAuthor}
                onChange={setShowAuthor}
              />
            </StepShell>
          )}

          {step === 'SECURITY' && (
            <StepShell
              icon={<ShieldCheck className="w-7 h-7" />}
              title="Код доступа"
              text="Необязательная защита входа в приложение на этом устройстве. По умолчанию выключена."
            >
              <Toggle
                label="Защитить приложение кодом"
                hint="4–6 цифр. Код можно сменить или отключить в настройках"
                value={pinEnabled}
                onChange={(value) => {
                  setPinEnabled(value);
                  setError(null);
                }}
              />

              {pinEnabled && (
                <input
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Код из 4–6 цифр"
                  className={`${inputClass} text-lg font-black tracking-[0.3em] text-center`}
                />
              )}

              <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                Если код забыт, его можно сбросить, подтвердив аккаунт профиля
                {session?.email ? ` (${session.email})` : ''} — данные при этом сохраняются.
              </p>
            </StepShell>
          )}

          {step === 'DONE' && (
            <StepShell
              icon={<Check className="w-7 h-7" />}
              title="Всё готово"
              text="Настройки сохранятся, и можно начинать. Всё это меняется в любой момент в настройках."
            >
              <Summary label="Валюта" value={currency} />
              <Summary
                label="НДС"
                value={vatEnabled ? `отделяется, ${rate}%` : 'не отделяется'}
              />
              <Summary label="Код доступа" value={pinEnabled ? 'включён' : 'выключен'} />
              <Summary
                label="Партнёр"
                value={partnerEmail.trim() ? partnerEmail.trim() : 'без партнёра'}
              />
              <Summary label="Автор операции" value={showAuthor ? 'показывать' : 'скрывать'} />
            </StepShell>
          )}
        </div>

        {error && (
          <p className="text-[11px] font-bold text-rose-500 text-center py-2">{error}</p>
        )}

        <div className="pt-6 space-y-2">
          {step === 'DONE' ? (
            <PrimaryButton onClick={finish} variant="success">
              <Check className="w-4 h-4" />
              Начать
            </PrimaryButton>
          ) : (
            <PrimaryButton onClick={next}>
              Далее
              <ArrowRight className="w-4 h-4" />
            </PrimaryButton>
          )}

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={back}
              disabled={stepIndex === 0}
              className="py-2 px-3 text-[11px] font-black text-slate-400 disabled:opacity-0"
            >
              Назад
            </button>
            <button
              type="button"
              onClick={skipAll}
              className="py-2 px-3 text-[11px] font-black text-slate-400"
            >
              Пропустить всё
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepShell({
  icon,
  title,
  text,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="w-14 h-14 rounded-3xl bg-gradient-to-tr from-sky-500 to-cyan-400 text-white flex items-center justify-center shadow-lg shadow-sky-500/25">
        {icon}
      </div>
      <div>
        <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 leading-tight">
          {title}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1.5 leading-relaxed">
          {text}
        </p>
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Feature({
  icon,
  title,
  title2,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  title2?: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
      <span className="w-8 h-8 rounded-xl bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 flex items-center justify-center flex-shrink-0">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-black text-slate-800 dark:text-slate-100">
          {title}
          {title2 && (
            <span className="text-[10px] font-bold text-slate-400"> · {title2}</span>
          )}
        </span>
        <span className="block text-[10.5px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed mt-0.5">
          {text}
        </span>
      </span>
    </div>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="w-full flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 text-left"
    >
      <span className="min-w-0">
        <span className="block text-xs font-black text-slate-700 dark:text-slate-200">{label}</span>
        <span className="block text-[10px] text-slate-400 font-medium leading-relaxed mt-0.5">
          {hint}
        </span>
      </span>
      <span
        className={`w-11 h-6 rounded-full flex items-center px-0.5 transition-colors flex-shrink-0 ${
          value ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
        }`}
      >
        <span
          className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
            value ? 'translate-x-5' : ''
          }`}
        />
      </span>
    </button>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
      <span className="text-[11px] font-bold text-slate-400">{label}</span>
      <span className="text-[11px] font-black text-slate-700 dark:text-slate-200">{value}</span>
    </div>
  );
}
