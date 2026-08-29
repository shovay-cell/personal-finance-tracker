'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Cloud,
  CloudUpload,
  Copy,
  Coins,
  Download,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Percent,
  Mic,
  RefreshCw,
  ServerCog,
  Shapes,
  Trash2,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import {
  AccountKind,
  CurrencyCode,
  FinanceAccount,
  FinanceCategory,
  FinanceSettings,
  ProfileMember,
  SpeechLocale,
  Transaction,
  VatSummary,
} from '@/types';
import {
  addAccount,
  addMember,
  clearAllFinanceData,
  computeAccountBalance,
  deleteAccount,
  deleteMember,
  exportFinanceDatabaseJson,
  getCurrentMemberId,
  saveFinanceSettings,
  setCurrentMemberId,
  updateAccount,
  updateMember,
} from '@/lib/db';
import {
  CURRENCY_LIST,
  DEFAULT_EXCHANGE_RATES,
  MEMBER_COLORS,
} from '@/constants/categories';
import { formatMoney } from '@/services/analytics';
import { downloadFinanceBackupFile } from '@/services/export';
import { GOOGLE_OAUTH_CLIENT_ID } from '@/services/backup/google-drive';
import {
  authenticateGoogleDrive,
  disconnectGoogleDrive,
  getGoogleDriveState,
  restoreFinanceFromLocalFile,
  restoreLatestFinanceBackup,
  syncFinanceFromDrive,
  uploadFinanceBackup,
} from '@/services/backup/drive-backup';
import {
  notificationsPermission,
  requestNotificationsPermission,
} from '@/services/notifications';
import { LANGUAGES, SPEECH_LOCALE_BY_LANGUAGE } from '@/i18n/dictionary';
import { useT } from '@/i18n/context';
import { accountKindLabel, accountName } from '@/i18n/categories';
import { numberLocale } from '@/i18n/runtime';
import { CategoryManagerModal } from './category-manager-modal';
import { ManagePinModal } from './pin-lock';
import { JoinProfileModal } from './join-profile-modal';
import {
  Card,
  ColorPicker,
  Field,
  ModalShell,
  PrimaryButton,
  SectionTitle,
  inputClass,
} from './ui';

interface SettingsTabProps {
  settings: FinanceSettings;
  vatSummary?: VatSummary;
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  members: ProfileMember[];
  transactions: Transaction[];
}

export function SettingsTab({
  settings,
  vatSummary,
  categories,
  accounts,
  members,
  transactions,
}: SettingsTabProps) {
  const [showCategories, setShowCategories] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FinanceAccount | 'NEW' | null>(null);
  const [editingMember, setEditingMember] = useState<ProfileMember | 'NEW' | null>(null);
  const [serverKey, setServerKey] = useState<{
    serverKeyConfigured: boolean;
    keyLooksValid: boolean;
    environment: string;
    hint: string;
  } | null>(null);
  const [driveState, setDriveState] = useState(() => ({
    isConnected: false,
    userEmail: null as string | null,
  }));
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; kind: 'ok' | 'error' } | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isManagingPin, setIsManagingPin] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const currentMemberId = getCurrentMemberId();
  const { t, language } = useT();

  useEffect(() => {
    const state = getGoogleDriveState();
    setDriveState({ isConnected: state.isConnected, userEmail: state.userEmail });

    // Asks the deployment itself whether it has a shared key, so a variable that
    // never reached the running build is visible here instead of surfacing as a
    // puzzling scan failure.
    fetch('/api/analyze-receipt')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setServerKey(data))
      .catch(() => setServerKey(null));
  }, []);

  const run = async (key: string, action: () => Promise<{ ok: boolean; text: string }>) => {
    setBusy(key);
    setMessage(null);
    try {
      const result = await action();
      setMessage({ text: result.text, kind: result.ok ? 'ok' : 'error' });
    } catch (err: any) {
      setMessage({ text: err.message || t('st.opError'), kind: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const handleConnectDrive = () =>
    run('connect', async () => {
      const result = await authenticateGoogleDrive();
      const state = getGoogleDriveState();
      setDriveState({ isConnected: state.isConnected, userEmail: state.userEmail });
      return result.success
        ? { ok: true, text: t('st.driveConnected') }
        : { ok: false, text: result.error || t('st.driveConnectFailed') };
    });

  const inviteCode = settings.inviteCode;

  return (
    <div className="space-y-4">
      {message && (
        <div
          className={`p-3 rounded-2xl text-[11px] font-bold text-center ${
            message.kind === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* ------------------------------------------------------- profile */}
      <div>
        <SectionTitle title={t('settings.profile')} />
        <Card className="p-4 space-y-3">
          <Field label={t('settings.language')} hint={t('settings.languageHint')}>
            <div className="grid grid-cols-2 gap-1.5">
              {LANGUAGES.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  onClick={() =>
                    // The dictation language follows the interface: choosing
                    // Hebrew and then dictating in Russian is nobody's intent.
                    saveFinanceSettings({
                      language: option.code,
                      speechLocale: SPEECH_LOCALE_BY_LANGUAGE[option.code] as SpeechLocale,
                    })
                  }
                  className={`py-2.5 rounded-xl text-xs font-black border transition-all ${
                    language === option.code
                      ? 'bg-sky-500 text-white border-transparent'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {option.nativeLabel}
                </button>
              ))}
            </div>
          </Field>

          <Field label={t('settings.profileName')}>
            <input
              type="text"
              value={settings.profileName}
              onChange={(e) => saveFinanceSettings({ profileName: e.target.value })}
              className={inputClass}
            />
          </Field>

          <Field label={t('settings.baseCurrency')} hint={t('settings.baseCurrencyHint')}>
            <div className="flex gap-1.5">
              {CURRENCY_LIST.map((currency) => (
                <button
                  key={currency.code}
                  type="button"
                  onClick={() => saveFinanceSettings({ baseCurrency: currency.code })}
                  className={`flex-1 py-2 rounded-xl text-xs font-black border transition-all ${
                    settings.baseCurrency === currency.code
                      ? 'bg-sky-500 text-white border-transparent'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {currency.symbol} {currency.code}
                </button>
              ))}
            </div>
          </Field>

          <Field
            label={t('settings.rates')}
            hint={t('st.ratesHint')}
          >
            <div className="space-y-2">
              {CURRENCY_LIST.filter((c) => c.code !== 'ILS').map((currency) => (
                <div key={currency.code} className="flex items-center gap-2">
                  <span className="text-xs font-black text-slate-500 w-16">
                    {currency.symbol} {currency.code}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={settings.exchangeRates[currency.code] ?? DEFAULT_EXCHANGE_RATES[currency.code]}
                    onChange={(e) =>
                      saveFinanceSettings({
                        exchangeRates: {
                          ...settings.exchangeRates,
                          [currency.code]: parseFloat(e.target.value) || 0,
                        },
                        ratesUpdatedAt: new Date().toISOString(),
                      })
                    }
                    className={`${inputClass} text-xs`}
                  />
                </div>
              ))}
            </div>
          </Field>

        </Card>
      </div>

      {/* -------------------------------------------------------- account */}
      <div>
        <SectionTitle title={t('settings.account')} />
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-sky-100 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 flex items-center justify-center flex-shrink-0 font-black text-xs">
              {(settings.session?.displayName || '?').slice(0, 2).toUpperCase()}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                {settings.session?.displayName || t('st.notSignedIn')}
              </p>
              <p className="text-[10px] text-slate-400 font-medium truncate">
                {settings.session?.email}
                {settings.session ? ` · ${settings.session.provider === 'GOOGLE' ? 'Google' : 'Email'}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => saveFinanceSettings({ session: undefined })}
              className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-black flex-shrink-0 flex items-center gap-1"
            >
              <LogOut className="w-3 h-3" />
              {t('settings.signOut')}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsManagingPin(true)}
            className="w-full flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 text-left"
          >
            <span className="flex items-start gap-2">
              <Lock className="w-4 h-4 text-slate-400 mt-px flex-shrink-0" />
              <span>
                <span className="block text-xs font-black text-slate-700 dark:text-slate-200">
                  {t('settings.pin')}
                </span>
                <span className="block text-[10px] text-slate-400 font-medium">
                  {settings.pinEnabled ? t('settings.pinOn') : t('settings.pinOff')}
                </span>
              </span>
            </span>
            <span
              className={`px-2 py-1 rounded-lg text-[10px] font-black flex-shrink-0 ${
                settings.pinEnabled
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                  : 'bg-slate-200 text-slate-500 dark:bg-slate-700'
              }`}
            >
              {settings.pinEnabled ? t('st.on') : t('st.off')}
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              saveFinanceSettings({ showTransactionAuthor: !settings.showTransactionAuthor })
            }
            className="w-full flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 text-left"
          >
            <span>
              <span className="block text-xs font-black text-slate-700 dark:text-slate-200">
                {t('settings.showAuthor')}
              </span>
              <span className="block text-[10px] text-slate-400 font-medium">
                {t('st.authorHint')}
              </span>
            </span>
            <span
              className={`w-11 h-6 rounded-full flex items-center px-0.5 transition-colors flex-shrink-0 ${
                settings.showTransactionAuthor ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  settings.showTransactionAuthor ? 'translate-x-5' : ''
                }`}
              />
            </span>
          </button>
        </Card>
      </div>

      {/* ------------------------------------------------------------ VAT */}
      <div>
        <SectionTitle title={t('settings.vat')} />
        <Card className="p-4 space-y-3">
          <button
            type="button"
            onClick={() => saveFinanceSettings({ vatEnabled: !settings.vatEnabled })}
            className="w-full flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 text-left"
          >
            <span>
              <span className="block text-xs font-black text-slate-700 dark:text-slate-200">
                {t('settings.vatSeparate')}
              </span>
              <span className="block text-[10px] text-slate-400 font-medium">
                {t('st.vatToggleHint')}
              </span>
            </span>
            <span
              className={`w-11 h-6 rounded-full flex items-center px-0.5 transition-colors flex-shrink-0 ${
                settings.vatEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  settings.vatEnabled ? 'translate-x-5' : ''
                }`}
              />
            </span>
          </button>

          {settings.vatEnabled && (
            <>
              <Field label={t('settings.vatRate')}>
                <input
                  type="text"
                  inputMode="decimal"
                  value={settings.vatRate}
                  onChange={(e) =>
                    saveFinanceSettings({ vatRate: parseFloat(e.target.value.replace(',', '.')) || 0 })
                  }
                  className={`${inputClass} text-lg font-black`}
                />
              </Field>

              <button
                type="button"
                onClick={() =>
                  saveFinanceSettings({ vatSeparateByDefault: !settings.vatSeparateByDefault })
                }
                className="w-full flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 text-left"
              >
                <span>
                  <span className="block text-xs font-black text-slate-700 dark:text-slate-200">
                    {t('st.vatDefault')}
                  </span>
                  <span className="block text-[10px] text-slate-400 font-medium">
                    {t('st.vatDefaultHint')}
                  </span>
                </span>
                <span
                  className={`w-11 h-6 rounded-full flex items-center px-0.5 transition-colors flex-shrink-0 ${
                    settings.vatSeparateByDefault ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      settings.vatSeparateByDefault ? 'translate-x-5' : ''
                    }`}
                  />
                </span>
              </button>

              {vatSummary && (
                <div className="flex items-start gap-2 p-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400">
                  <Percent className="w-3.5 h-3.5 mt-px flex-shrink-0" />
                  <p className="text-[10.5px] font-bold leading-relaxed">
                    {t('st.vatDue')}: {formatMoney(vatSummary.outstanding, settings.baseCurrency)} ·{' '}
                    {t('st.vatAccrued')} {formatMoney(vatSummary.accrued, settings.baseCurrency)} ·{' '}
                    {t('st.vatPaid')} {formatMoney(vatSummary.paid, settings.baseCurrency)}
                  </p>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      {/* ------------------------------------------------------ accounts */}
      <div>
        <SectionTitle
          title={t('tx.accounts')}
          action={
            <button
              type="button"
              onClick={() => setEditingAccount('NEW')}
              className="text-[10px] font-black text-sky-600 dark:text-sky-400"
            >
              {t('st.addAccount')}
            </button>
          }
        />
        <Card className="divide-y divide-slate-50 dark:divide-slate-800">
          {accounts.map((account) => (
            <button
              key={account.id}
              type="button"
              onClick={() => setEditingAccount(account)}
              className="w-full flex items-center gap-3 p-3 text-left"
            >
              <span
                className="w-2.5 h-9 rounded-full flex-shrink-0"
                style={{ backgroundColor: account.colorHex }}
              />
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                  {accountName(account, language)}
                  {account.isArchived && (
                    <span className="text-[10px] text-slate-400 font-bold"> · {t('st.archived')}</span>
                  )}
                </span>
                <span className="block text-[10px] text-slate-400 font-medium">
                  {accountKindLabel(account.kind, language)} · {account.currency}
                </span>
              </span>
              <span className="text-xs font-black text-slate-700 dark:text-slate-200 tabular-nums">
                {formatMoney(computeAccountBalance(account, transactions), account.currency)}
              </span>
            </button>
          ))}
        </Card>
      </div>

      {/* ---------------------------------------------------- categories */}
      <button
        type="button"
        onClick={() => setShowCategories(true)}
        className="w-full p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 flex items-center gap-3 active:scale-[0.99] transition-transform"
      >
        <span className="w-10 h-10 rounded-2xl bg-violet-100 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 flex items-center justify-center">
          <Shapes className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
        </span>
        <span className="flex-1 text-left">
          <span className="block text-xs font-black text-slate-800 dark:text-slate-100">
            {t('settings.categories')}
          </span>
          <span className="block text-[10px] text-slate-400 font-medium">
            {categories.filter((c) => !c.isHidden).length} {t('st.categoriesHint')}
          </span>
        </span>
      </button>

      {/* -------------------------------------------------- family sync */}
      <div>
        <SectionTitle
          title={t('settings.family')}
          action={
            members.length < 2 ? (
              <button
                type="button"
                onClick={() => setEditingMember('NEW')}
                className="text-[10px] font-black text-sky-600 dark:text-sky-400 flex items-center gap-1"
              >
                <UserPlus className="w-3 h-3" />
                {t('st.invite')}
              </button>
            ) : undefined
          }
        />
        <Card className="p-4 space-y-3">
          {members.map((member) => (
            <div key={member.id} className="flex items-center gap-3">
              <span
                className="w-9 h-9 rounded-2xl flex items-center justify-center text-[11px] font-black text-white flex-shrink-0"
                style={{ backgroundColor: member.colorHex }}
              >
                {member.displayName.slice(0, 2).toUpperCase()}
              </span>
              <button
                type="button"
                onClick={() => setEditingMember(member)}
                className="flex-1 min-w-0 text-left"
              >
                <span className="block text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                  {member.displayName}
                  {member.id === currentMemberId && (
                    <span className="text-[10px] text-sky-500 font-bold"> · {t('st.thisDevice')}</span>
                  )}
                </span>
                <span className="block text-[10px] text-slate-400 font-medium truncate">
                  {member.role === 'OWNER'
                    ? t('st.owner')
                    : member.role === 'VIEWER'
                    ? t('st.viewer')
                    : t('st.fullAccess')}
                  {member.email ? ` · ${member.email}` : ''}
                </span>
              </button>
              {member.id !== currentMemberId && (
                <button
                  type="button"
                  onClick={() => setCurrentMemberId(member.id)}
                  className="text-[10px] font-black text-slate-400 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800"
                >
                  {t('st.itsMe')}
                </button>
              )}
            </div>
          ))}

          <div className="pt-2 border-t border-slate-50 dark:border-slate-800 space-y-2">
            <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
              {t('st.partnerHint')}
            </p>
            <div className="flex gap-2">
              <div className="flex-1 px-3 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800 text-center">
                <span className="text-sm font-black tracking-[0.3em] text-slate-700 dark:text-slate-200">
                  {inviteCode || '— — — —'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
                  saveFinanceSettings({ inviteCode: code });
                }}
                className="px-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500"
                title={t('st.generateCode')}
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              {inviteCode && (
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(inviteCode)}
                  className="px-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500"
                >
                  <Copy className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsJoining(true)}
            className="w-full py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-black flex items-center justify-center gap-1.5"
          >
            <UserPlus className="w-3.5 h-3.5" />
            {t('st.joinByCode')}
          </button>
        </Card>
      </div>

      {/* ------------------------------------------------- notifications */}
      <div>
        <SectionTitle title={t('settings.notifications')} />
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Bell className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-black text-slate-800 dark:text-slate-100">
                {t('st.limitsAndPlans')}
              </p>
              <p className="text-[10px] text-slate-400 font-medium">
                {t('st.limitsHint')}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                run('notify', async () => {
                  const granted = await requestNotificationsPermission();
                  return granted
                    ? { ok: true, text: t('st.notifEnabled') }
                    : { ok: false, text: t('st.notifDenied') };
                })
              }
              className="px-3 py-1.5 rounded-xl bg-sky-500 text-white text-[10px] font-black flex-shrink-0"
            >
              {notificationsPermission() === 'granted' ? t('st.enabled') : t('st.enable')}
            </button>
          </div>

          <button
            type="button"
            onClick={() =>
              saveFinanceSettings({ plannedPaymentAutoCreate: !settings.plannedPaymentAutoCreate })
            }
            className="w-full flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70"
          >
            <span className="text-left">
              <span className="block text-xs font-black text-slate-700 dark:text-slate-200">
                {t('st.autoPlans')}
              </span>
              <span className="block text-[10px] text-slate-400 font-medium">
                {t('st.autoPlansHint')}
              </span>
            </span>
            <span
              className={`w-11 h-6 rounded-full flex items-center px-0.5 transition-colors flex-shrink-0 ${
                settings.plannedPaymentAutoCreate ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  settings.plannedPaymentAutoCreate ? 'translate-x-5' : ''
                }`}
              />
            </span>
          </button>
        </Card>
      </div>

      {/* ---------------------------------------------------------- AI */}
      <div>
        <SectionTitle title={t('settings.ai')} />
        <Card className="p-4 space-y-2">
          {serverKey ? (
            <div
              className={`flex items-start gap-2 p-2.5 rounded-2xl ${
                serverKey.serverKeyConfigured && serverKey.keyLooksValid
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400'
              }`}
            >
              <ServerCog className="w-3.5 h-3.5 mt-px flex-shrink-0" />
              <p className="text-[10.5px] font-bold leading-relaxed">
                {t('st.serverKey')}:{' '}
                {!serverKey.serverKeyConfigured
                  ? t('st.keyNotFound')
                  : serverKey.keyLooksValid
                  ? t('st.keyConfigured')
                  : t('st.keyWrongShape')}
                <span className="font-medium opacity-80"> ({serverKey.environment})</span>
                <br />
                <span className="font-medium">{serverKey.hint}</span>
              </p>
            </div>
          ) : (
            <p className="text-[10.5px] font-bold text-slate-400">
              {t('st.serverKeyChecking')}
            </p>
          )}

          <p className="text-[10px] text-slate-400 font-medium flex items-start gap-1.5">
            <Mic className="w-3 h-3 mt-0.5 flex-shrink-0" />
            {t('st.voiceNote')}
          </p>
        </Card>
      </div>

      {/* ------------------------------------------------------- backup */}
      <div>
        <SectionTitle title={t('settings.backup')} />
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <span
              className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                driveState.isConnected
                  ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
              }`}
            >
              <Cloud className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-slate-800 dark:text-slate-100">
                {driveState.isConnected ? t('st.driveConnected') : t('st.driveNotConnected')}
              </p>
              <p className="text-[10px] text-slate-400 font-medium truncate">
                {driveState.userEmail || t('st.driveFolderHint')}
              </p>
            </div>
            <button
              type="button"
              onClick={
                driveState.isConnected
                  ? () => {
                      disconnectGoogleDrive();
                      setDriveState({ isConnected: false, userEmail: null });
                    }
                  : handleConnectDrive
              }
              className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-black flex-shrink-0"
            >
              {busy === 'connect' ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : driveState.isConnected ? (
                t('st.disconnect')
              ) : (
                t('st.signIn')
              )}
            </button>
          </div>

          {settings.lastBackupDate && (
            <p className="text-[10px] text-slate-400 font-medium">
              {t('st.lastBackup')}: {new Date(settings.lastBackupDate).toLocaleString(numberLocale())}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!driveState.isConnected || busy !== null}
              onClick={() =>
                run('upload', async () => {
                  const result = await uploadFinanceBackup();
                  return result.success
                    ? { ok: true, text: t('st.backupUploaded') }
                    : { ok: false, text: result.error || t('st.uploadError') };
                })
              }
              className="py-2.5 rounded-2xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 text-[11px] font-black flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              {busy === 'upload' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CloudUpload className="w-3.5 h-3.5" />
              )}
              {t('st.upload')}
            </button>

            <button
              type="button"
              disabled={!driveState.isConnected || busy !== null}
              onClick={() =>
                run('sync', async () => {
                  const result = await syncFinanceFromDrive();
                  return result.success
                    ? { ok: true, text: `${t('st.syncedRecords')}: ${result.merged || 0}` }
                    : { ok: false, text: result.error || t('st.syncError') };
                })
              }
              className="py-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-[11px] font-black flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              {busy === 'sync' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {t('st.sync')}
            </button>

            <button
              type="button"
              disabled={!driveState.isConnected || busy !== null}
              onClick={() =>
                run('restore', async () => {
                  const result = await restoreLatestFinanceBackup();
                  return result.success
                    ? { ok: true, text: `${t('st.restoredFrom')} ${result.fileName}` }
                    : { ok: false, text: result.error || t('st.restoreError') };
                })
              }
              className="py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-black flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              {t('st.restore')}
            </button>

            <button
              type="button"
              onClick={() =>
                run('local', async () => {
                  downloadFinanceBackupFile(await exportFinanceDatabaseJson());
                  return { ok: true, text: t('st.backupFileSaved') };
                })
              }
              className="py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-black flex items-center justify-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              {t('st.fileToDevice')}
            </button>
          </div>

          <DriveSetupStatus />

          <label className="block">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wide">
              {t('st.restoreFromFile')}
            </span>
            <input
              type="file"
              accept=".fintrack,application/json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                await run('file-restore', async () => {
                  const result = await restoreFinanceFromLocalFile(file);
                  return result.success
                    ? { ok: true, text: t('st.restoredFromFile') }
                    : { ok: false, text: result.error || t('st.restoreError') };
                });
              }}
              className="mt-1 w-full text-[11px] text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-600 file:text-[11px] file:font-black"
            />
          </label>
        </Card>
      </div>

      {/* --------------------------------------------------- danger zone */}
      <button
        type="button"
        onClick={() => setShowResetConfirm(true)}
        className="w-full py-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-[11px] font-black flex items-center justify-center gap-2"
      >
        <Trash2 className="w-4 h-4" />
        {t('st.deleteAllData')}
      </button>

      {showResetConfirm && (
        <ModalShell
          title={t('st.deleteAllTitle')}
          subtitle={t('st.deleteAllSub')}
          icon={<AlertTriangle className="w-5 h-5" />}
          onClose={() => setShowResetConfirm(false)}
          maxWidthClass="max-w-sm"
          footer={
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-black"
              >
                {t('common.cancel')}
              </button>
              <PrimaryButton
                variant="danger"
                onClick={async () => {
                  await clearAllFinanceData();
                  setShowResetConfirm(false);
                  setMessage({ text: t('st.dataDeleted'), kind: 'ok' });
                }}
              >
                {t('common.delete')}
              </PrimaryButton>
            </div>
          }
        >
          <p className="text-xs text-slate-500 font-medium leading-relaxed">
            {t('st.deleteAllNote')}
          </p>
        </ModalShell>
      )}

      {isJoining && (
        <JoinProfileModal
          session={settings.session}
          onClose={() => setIsJoining(false)}
          onJoined={(name) => setMessage({ text: `«${name}» — ${t('st.profileConnected')}`, kind: 'ok' })}
        />
      )}

      {isManagingPin && (
        <ManagePinModal settings={settings} onClose={() => setIsManagingPin(false)} />
      )}

      {showCategories && (
        <CategoryManagerModal categories={categories} onClose={() => setShowCategories(false)} />
      )}

      {editingAccount && (
        <AccountModal
          account={editingAccount === 'NEW' ? null : editingAccount}
          baseCurrency={settings.baseCurrency}
          onClose={() => setEditingAccount(null)}
        />
      )}

      {editingMember && (
        <MemberModal
          member={editingMember === 'NEW' ? null : editingMember}
          memberCount={members.length}
          onClose={() => setEditingMember(null)}
        />
      )}
    </div>
  );
}

/**
 * Tells the user what this build actually loaded and which exact origin Google
 * has to trust — the two facts that decide whether the Drive popup can open, and
 * the two that are impossible to guess from a failed login.
 */
function DriveSetupStatus() {
  const { t } = useT();
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);

  const clientId = GOOGLE_OAUTH_CLIENT_ID.trim();
  const looksValid = clientId.endsWith('.apps.googleusercontent.com');

  if (clientId && looksValid) {
    return (
      <div className="flex items-start gap-2 p-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400">
        <ServerCog className="w-3.5 h-3.5 mt-px flex-shrink-0" />
        <p className="text-[10.5px] font-bold leading-relaxed break-all">
          {t('st.driveClientLoaded')}: …{clientId.slice(-32)}
          <br />
          <span className="font-medium">
            {origin} — {t('st.driveOriginHint')}
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 p-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400">
      <ServerCog className="w-3.5 h-3.5 mt-px flex-shrink-0" />
      <p className="text-[10.5px] font-bold leading-relaxed break-all">
        {!clientId ? t('st.driveMissing') : t('st.driveWrongId')}
        {origin && (
          <>
            <br />
            <span className="font-medium">
              {t('st.driveOrigin')}: {origin}
            </span>
          </>
        )}
      </p>
    </div>
  );
}

function AccountModal({
  account,
  baseCurrency,
  onClose,
}: {
  account: FinanceAccount | null;
  baseCurrency: CurrencyCode;
  onClose: () => void;
}) {
  const { t, language } = useT();
  const [name, setName] = useState(account?.name || '');
  const [kind, setKind] = useState<AccountKind>(account?.kind || 'CARD');
  const [currency, setCurrency] = useState<CurrencyCode>(account?.currency || baseCurrency);
  const [openingBalance, setOpeningBalance] = useState(String(account?.openingBalance ?? 0));
  const [colorHex, setColorHex] = useState(account?.colorHex || '#0EA5E9');
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) return setError(t('st.enterAccountName'));

    const payload = {
      name: name.trim(),
      kind,
      currency,
      openingBalance: parseFloat(openingBalance.replace(',', '.')) || 0,
      colorHex,
      isArchived: account?.isArchived || false,
    };

    if (account) await updateAccount(account.id, payload);
    else await addAccount(payload);
    onClose();
  };

  return (
    <ModalShell
      title={account ? t('st.account') : t('st.newAccount')}
      icon={<Wallet className="w-5 h-5" />}
      onClose={onClose}
      maxWidthClass="max-w-md"
      footer={
        <div className="space-y-2">
          {error && <p className="text-[11px] font-bold text-rose-500 text-center">{error}</p>}
          <PrimaryButton onClick={handleSave}>{t('common.save')}</PrimaryButton>
          {account && (
            <button
              type="button"
              onClick={async () => {
                await deleteAccount(account.id);
                onClose();
              }}
              className="w-full py-2.5 rounded-2xl text-[11px] font-black text-rose-500 bg-rose-50 dark:bg-rose-950/40"
            >
              {t('st.deleteAccountHint')}
            </button>
          )}
        </div>
      }
    >
      <Field label={t('st.fieldName')}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Visa 4242"
          className={inputClass}
          autoFocus
        />
      </Field>

      <Field label={t('st.fieldAccountKind')}>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as AccountKind)}
          className={inputClass}
        >
          {(['CASH', 'CARD', 'BANK', 'SAVINGS'] as AccountKind[]).map((value) => (
            <option key={value} value={value}>
              {accountKindLabel(value, language)}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t('st.fieldCurrency')}>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
            className={inputClass}
          >
            {CURRENCY_LIST.map((c) => (
              <option key={c.code} value={c.code}>
                {c.symbol} {c.code}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('st.fieldOpeningBalance')}>
          <input
            type="text"
            inputMode="decimal"
            value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label={t('st.fieldColor')}>
        <ColorPicker value={colorHex} onChange={setColorHex} />
      </Field>
    </ModalShell>
  );
}

function MemberModal({
  member,
  memberCount,
  onClose,
}: {
  member: ProfileMember | null;
  memberCount: number;
  onClose: () => void;
}) {
  const { t } = useT();
  const [displayName, setDisplayName] = useState(member?.displayName || '');
  const [email, setEmail] = useState(member?.email || '');
  const [role, setRole] = useState(member?.role || 'FULL');
  const [colorHex, setColorHex] = useState(
    member?.colorHex || MEMBER_COLORS[memberCount % MEMBER_COLORS.length]
  );
  const [notify, setNotify] = useState(member?.notifyOnLargeTransactions ?? true);
  const [threshold, setThreshold] = useState(String(member?.largeTransactionThreshold ?? 500));
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!displayName.trim()) return setError(t('st.enterMemberName'));

    const payload = {
      displayName: displayName.trim(),
      email: email.trim() || undefined,
      role: role as ProfileMember['role'],
      colorHex,
      isCurrentDevice: member?.isCurrentDevice || false,
      notifyOnLargeTransactions: notify,
      largeTransactionThreshold: parseFloat(threshold) || 0,
    };

    if (member) await updateMember(member.id, payload);
    else await addMember(payload);
    onClose();
  };

  return (
    <ModalShell
      title={member ? t('st.member') : t('st.inviteMember')}
      subtitle={member ? undefined : t('st.inviteMemberSub')}
      icon={<Users className="w-5 h-5" />}
      onClose={onClose}
      maxWidthClass="max-w-md"
      footer={
        <div className="space-y-2">
          {error && <p className="text-[11px] font-bold text-rose-500 text-center">{error}</p>}
          <PrimaryButton onClick={handleSave}>{t('common.save')}</PrimaryButton>
          {member && member.role !== 'OWNER' && (
            <button
              type="button"
              onClick={async () => {
                await deleteMember(member.id);
                onClose();
              }}
              className="w-full py-2.5 rounded-2xl text-[11px] font-black text-rose-500 bg-rose-50 dark:bg-rose-950/40"
            >
              {t('st.deleteMember')}
            </button>
          )}
        </div>
      }
    >
      <Field label={t('st.fieldMemberName')}>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={t('st.spousePlaceholder')}
          className={inputClass}
          autoFocus
        />
      </Field>

      <Field label="Email" hint={t('st.emailHint')}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
          className={inputClass}
        />
      </Field>

      <Field label={t('st.fieldRights')}>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as ProfileMember['role'])}
          className={inputClass}
          disabled={member?.role === 'OWNER'}
        >
          <option value="FULL">{t('st.fullAccess')}</option>
          <option value="VIEWER">{t('st.viewer')}</option>
          {member?.role === 'OWNER' && <option value="OWNER">{t('st.owner')}</option>}
        </select>
      </Field>

      <Field label={t('st.fieldAuthorColor')}>
        <ColorPicker value={colorHex} onChange={setColorHex} />
      </Field>

      <button
        type="button"
        onClick={() => setNotify((prev) => !prev)}
        className="w-full flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70"
      >
        <span className="text-left">
          <span className="block text-xs font-black text-slate-700 dark:text-slate-200">
            {t('st.notifyLarge')}
          </span>
          <span className="block text-[10px] text-slate-400 font-medium">
            {t('st.notifyLargeHint')}
          </span>
        </span>
        <span
          className={`w-11 h-6 rounded-full flex items-center px-0.5 transition-colors flex-shrink-0 ${
            notify ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
          }`}
        >
          <span
            className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
              notify ? 'translate-x-5' : ''
            }`}
          />
        </span>
      </button>

      {notify && (
        <Field label={t('st.largeThreshold')}>
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-slate-400" />
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className={inputClass}
            />
          </div>
        </Field>
      )}
    </ModalShell>
  );
}
