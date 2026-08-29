'use client';

import React, { useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Languages,
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
import { LANGUAGES, SPEECH_LOCALE_BY_LANGUAGE } from '@/i18n/dictionary';
import { useT } from '@/i18n/context';
import { createSalt, hashPin, isValidPin } from '@/services/security/pin';
import { vatFromGross, netFromGross } from '@/services/vat';
import { formatMoney } from '@/services/analytics';
import { JoinProfileModal } from './join-profile-modal';
import { PrimaryButton, inputClass } from './ui';

type StepId = 'LANGUAGE' | 'INTRO' | 'MONEY' | 'VAT' | 'PROFIT' | 'PARTNER' | 'SECURITY' | 'DONE';

const STEPS: StepId[] = [
  'LANGUAGE',
  'INTRO',
  'MONEY',
  'VAT',
  'PROFIT',
  'PARTNER',
  'SECURITY',
  'DONE',
];

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
  onFinish: (message?: string) => void;
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
  const { t, language } = useT();
  const [isJoining, setIsJoining] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);

  const next = () => setStepIndex((index) => Math.min(index + 1, STEPS.length - 1));
  const back = () => setStepIndex((index) => Math.max(index - 1, 0));

  const finish = async () => {
    if (pinEnabled && !isValidPin(pin)) {
      setError(t('ob.pinError'));
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
          {step === 'LANGUAGE' && (
            <StepShell
              icon={<Languages className="w-7 h-7" />}
              title={t('settings.language')}
              text={t('settings.languageHint')}
            >
              <div className="grid grid-cols-2 gap-2">
                {LANGUAGES.map((option) => (
                  <button
                    key={option.code}
                    type="button"
                    onClick={() =>
                      // Applied at once: the remaining steps should already be in
                      // the language the user just picked.
                      saveFinanceSettings({
                        language: option.code,
                        speechLocale: SPEECH_LOCALE_BY_LANGUAGE[option.code] as any,
                      })
                    }
                    className={`py-3 rounded-2xl text-sm font-black border transition-all ${
                      language === option.code
                        ? 'bg-sky-500 text-white border-transparent shadow-md shadow-sky-500/25'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {option.nativeLabel}
                  </button>
                ))}
              </div>

              <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                {t('ob.languageLater')}
              </p>
            </StepShell>
          )}

          {step === 'INTRO' && (
            <StepShell
              icon={<Wallet className="w-7 h-7" />}
              title={`${t('onboarding.hello')}${session?.displayName ? `, ${session.displayName}` : ''}!`}
              text={t('onboarding.introText')}
            >
              <Feature icon={<ScanLine className="w-4 h-4" />} title={t('ob.featureScan')} text={t('ob.featureScanText')} />
              <Feature icon={<Mic className="w-4 h-4" />} title={t('ob.featureVoice')} text={t('ob.featureVoiceText')} />
              <Feature icon={<BarChart3 className="w-4 h-4" />} title={t('ob.featureReports')} text={t('ob.featureReportsText')} />

              <button
                type="button"
                onClick={() => setIsJoining(true)}
                className="w-full py-3 rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 text-[11px] font-black flex items-center justify-center gap-1.5"
              >
                <Users className="w-3.5 h-3.5" />
                {t('onboarding.haveCode')}
              </button>
            </StepShell>
          )}

          {step === 'MONEY' && (
            <StepShell
              icon={<Coins className="w-7 h-7" />}
              title={t('ob.moneyTitle')}
              text={t('ob.moneyText')}
            >
              <Feature icon={<span className="font-black text-rose-500">−</span>} title={t('common.expense')} title2={t('ob.expenseTab')} text={t('ob.expenseText')} />
              <Feature icon={<span className="font-black text-emerald-500">+</span>} title={t('common.income')} title2={t('ob.incomeTab')} text={t('ob.incomeText')} />

              <div className="pt-2">
                <p className="text-[11px] font-black uppercase tracking-wide text-slate-400 mb-2">
                  {t('ob.defaultCurrency')}
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
              title={t('ob.vatTitle')}
              text={t('ob.vatText')}
            >
              <Toggle
                label={t('ob.vatToggle')}
                hint={t('ob.vatToggleHint')}
                value={vatEnabled}
                onChange={setVatEnabled}
              />

              {vatEnabled && (
                <>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wide text-slate-400 mb-1.5">
                      {t('settings.vatRate')}
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
                      {t('ob.vatExample')} {formatMoney(1000, currency)}
                    </p>
                    <div className="flex justify-between text-[11px] font-bold">
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {t('ob.yourProfit')}: {formatMoney(netFromGross(1000, rate), currency)}
                      </span>
                      <span className="text-amber-600 dark:text-amber-400">
                        НДС: {formatMoney(vatFromGross(1000, rate), currency)}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                      {t('ob.vatNote')}
                    </p>
                  </div>
                </>
              )}
            </StepShell>
          )}

          {step === 'PROFIT' && (
            <StepShell
              icon={<BarChart3 className="w-7 h-7" />}
              title={t('ob.whereTitle')}
              text={t('ob.whereText')}
            >
              <Feature icon={<Wallet className="w-4 h-4" />} title={t('ob.availableProfit')} title2={t('ob.budgetTab')} text={t('ob.availableText')} />
              <Feature icon={<FileSignature className="w-4 h-4" />} title={t('ob.debtsAndVat')} title2={t('ob.debtsTab')} text={t('ob.debtsText')} />
              <Feature icon={<Settings className="w-4 h-4" />} title={t('nav.settings')} title2={t('ob.settingsWhere')} text={t('ob.settingsText')} />
            </StepShell>
          )}

          {step === 'PARTNER' && (
            <StepShell
              icon={<Users className="w-7 h-7" />}
              title={t('ob.partnerTitle')}
              text={t('ob.partnerText')}
            >
              <input
                type="email"
                value={partnerEmail}
                onChange={(e) => setPartnerEmail(e.target.value)}
                placeholder={t('ob.partnerEmail')}
                className={inputClass}
              />
              <input
                type="text"
                value={partnerName}
                onChange={(e) => setPartnerName(e.target.value)}
                placeholder={t('ob.partnerName')}
                className={inputClass}
              />

              <button
                type="button"
                onClick={() => setIsJoining(true)}
                className="w-full py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-black"
              >
                {t('ob.joinInstead')}
              </button>

              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3">
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                  {t('ob.inviteCode')}
                </p>
                <p className="text-lg font-black tracking-[0.3em] text-slate-700 dark:text-slate-200">
                  {inviteCode}
                </p>
                <p className="text-[10px] text-slate-400 font-medium leading-relaxed mt-1">
                  {t('ob.inviteHint')}
                </p>
              </div>

              <Toggle
                label={t('ob.showAuthor')}
                hint={t('ob.showAuthorHint')}
                value={showAuthor}
                onChange={setShowAuthor}
              />
            </StepShell>
          )}

          {step === 'SECURITY' && (
            <StepShell
              icon={<ShieldCheck className="w-7 h-7" />}
              title={t('ob.securityTitle')}
              text={t('ob.securityText')}
            >
              <Toggle
                label={t('ob.pinToggle')}
                hint={t('ob.pinToggleHint')}
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
                  placeholder={t('ob.pinPlaceholder')}
                  className={`${inputClass} text-lg font-black tracking-[0.3em] text-center`}
                />
              )}

              <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                {t('ob.pinRecovery')}
                {session?.email ? ` (${session.email})` : ''}.
              </p>
            </StepShell>
          )}

          {step === 'DONE' && (
            <StepShell
              icon={<Check className="w-7 h-7" />}
              title={t('ob.doneTitle')}
              text={t('ob.doneText')}
            >
              <Summary label={t('ob.summaryCurrency')} value={currency} />
              <Summary
                label={t('ob.summaryVat')}
                value={vatEnabled ? `${t('ob.summaryVatOn')}, ${rate}%` : t('ob.summaryVatOff')}
              />
              <Summary label={t('ob.summaryPin')} value={pinEnabled ? t('ob.on') : t('ob.off')} />
              <Summary
                label={t('ob.summaryPartner')}
                value={partnerEmail.trim() ? partnerEmail.trim() : t('ob.noPartner')}
              />
              <Summary label={t('ob.summaryAuthor')} value={showAuthor ? t('ob.show') : t('ob.hide')} />
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
              {t('onboarding.start')}
            </PrimaryButton>
          ) : (
            <PrimaryButton onClick={next}>
              {t('common.next')}
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
              {t('common.back')}
            </button>
            <button
              type="button"
              onClick={skipAll}
              className="py-2 px-3 text-[11px] font-black text-slate-400"
            >
              {t('common.skip')}
            </button>
          </div>
        </div>
      </div>

      {isJoining && (
        <JoinProfileModal
          session={session}
          // The wizard steps back only when the join screen is dismissed, so its
          // final confirmation is actually seen instead of flashing past.
          onClose={() => setIsJoining(false)}
          onJoined={(profileName) => {
            if (hasJoined) return;
            setHasJoined(true);
            onFinish(`Вы в профиле «${profileName}»`);
          }}
        />
      )}
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
