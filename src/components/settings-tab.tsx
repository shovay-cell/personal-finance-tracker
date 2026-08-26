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
  ACCOUNT_KIND_LABELS,
  CURRENCY_LIST,
  DEFAULT_EXCHANGE_RATES,
  MEMBER_COLORS,
} from '@/constants/categories';
import { formatMoney } from '@/services/analytics';
import { downloadFinanceBackupFile } from '@/services/export';
import { getCustomClientId, setCustomClientId, GOOGLE_OAUTH_CLIENT_ID } from '@/services/backup/google-drive';
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
import { getStoredGeminiKey, setStoredGeminiKey } from '@/services/ai/receipt-parser';
import { CategoryManagerModal } from './category-manager-modal';
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
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  members: ProfileMember[];
  transactions: Transaction[];
}

export function SettingsTab({
  settings,
  categories,
  accounts,
  members,
  transactions,
}: SettingsTabProps) {
  const [showCategories, setShowCategories] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FinanceAccount | 'NEW' | null>(null);
  const [editingMember, setEditingMember] = useState<ProfileMember | 'NEW' | null>(null);
  const [geminiKey, setGeminiKey] = useState('');
  const [clientId, setClientId] = useState('');
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
  const currentMemberId = getCurrentMemberId();

  useEffect(() => {
    setGeminiKey(getStoredGeminiKey());
    setClientId(getCustomClientId());
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
      setMessage({ text: err.message || 'Ошибка операции', kind: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const handleConnectDrive = () =>
    run('connect', async () => {
      const result = await authenticateGoogleDrive(clientId.trim() || undefined);
      const state = getGoogleDriveState();
      setDriveState({ isConnected: state.isConnected, userEmail: state.userEmail });
      return result.success
        ? { ok: true, text: 'Google Drive подключён' }
        : { ok: false, text: result.error || 'Не удалось подключить Google Drive' };
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
        <SectionTitle title="Профиль" />
        <Card className="p-4 space-y-3">
          <Field label="Название профиля">
            <input
              type="text"
              value={settings.profileName}
              onChange={(e) => saveFinanceSettings({ profileName: e.target.value })}
              className={inputClass}
            />
          </Field>

          <Field label="Базовая валюта" hint="К ней приводятся все суммы в отчётах">
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
            label="Курсы валют"
            hint="1 единица валюты в шекелях. Обновляйте вручную при значимых изменениях."
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

          <Field label="Язык голосового ввода">
            <select
              value={settings.speechLocale}
              onChange={(e) => saveFinanceSettings({ speechLocale: e.target.value as SpeechLocale })}
              className={inputClass}
            >
              <option value="ru-RU">Русский</option>
              <option value="he-IL">עברית</option>
              <option value="en-US">English</option>
            </select>
          </Field>
        </Card>
      </div>

      {/* ------------------------------------------------------ accounts */}
      <div>
        <SectionTitle
          title="Счета и кошельки"
          action={
            <button
              type="button"
              onClick={() => setEditingAccount('NEW')}
              className="text-[10px] font-black text-sky-600 dark:text-sky-400"
            >
              + Добавить
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
                  {account.name}
                  {account.isArchived && (
                    <span className="text-[10px] text-slate-400 font-bold"> · в архиве</span>
                  )}
                </span>
                <span className="block text-[10px] text-slate-400 font-medium">
                  {ACCOUNT_KIND_LABELS[account.kind]} · {account.currency}
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
            Категории и подкатегории
          </span>
          <span className="block text-[10px] text-slate-400 font-medium">
            {categories.filter((c) => !c.isHidden).length} активных · свои цвета и иконки
          </span>
        </span>
      </button>

      {/* -------------------------------------------------- family sync */}
      <div>
        <SectionTitle
          title="Семейный доступ"
          action={
            members.length < 2 ? (
              <button
                type="button"
                onClick={() => setEditingMember('NEW')}
                className="text-[10px] font-black text-sky-600 dark:text-sky-400 flex items-center gap-1"
              >
                <UserPlus className="w-3 h-3" />
                Пригласить
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
                    <span className="text-[10px] text-sky-500 font-bold"> · это устройство</span>
                  )}
                </span>
                <span className="block text-[10px] text-slate-400 font-medium truncate">
                  {member.role === 'OWNER'
                    ? 'Владелец'
                    : member.role === 'VIEWER'
                    ? 'Только просмотр'
                    : 'Полный доступ'}
                  {member.email ? ` · ${member.email}` : ''}
                </span>
              </button>
              {member.id !== currentMemberId && (
                <button
                  type="button"
                  onClick={() => setCurrentMemberId(member.id)}
                  className="text-[10px] font-black text-slate-400 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800"
                >
                  Это я
                </button>
              )}
            </div>
          ))}

          <div className="pt-2 border-t border-slate-50 dark:border-slate-800 space-y-2">
            <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
              Второй участник устанавливает приложение, вводит код приглашения и подключает тот же
              Google Drive — профиль, категории и операции синхронизируются через общий бэкап.
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
                title="Сгенерировать код"
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
        </Card>
      </div>

      {/* ------------------------------------------------- notifications */}
      <div>
        <SectionTitle title="Уведомления" />
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Bell className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-black text-slate-800 dark:text-slate-100">
                Лимиты и плановые платежи
              </p>
              <p className="text-[10px] text-slate-400 font-medium">
                Оповещения при 80% и 100% лимита, напоминания о платежах
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                run('notify', async () => {
                  const granted = await requestNotificationsPermission();
                  return granted
                    ? { ok: true, text: 'Уведомления включены' }
                    : { ok: false, text: 'Разрешение на уведомления не выдано' };
                })
              }
              className="px-3 py-1.5 rounded-xl bg-sky-500 text-white text-[10px] font-black flex-shrink-0"
            >
              {notificationsPermission() === 'granted' ? 'Включены' : 'Включить'}
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
                Плановые платежи — автоматически
              </span>
              <span className="block text-[10px] text-slate-400 font-medium">
                Иначе приложение спросит подтверждение в день платежа
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
        <SectionTitle title="ИИ-сканирование чеков" />
        <Card className="p-4 space-y-2">
          <Field
            label="Личный Gemini API Key"
            hint="Необязательно: без него используется общий ключ приложения на сервере"
          >
            <div className="flex gap-2">
              <input
                type="password"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="AQ.… или AIza…"
                className={`${inputClass} text-xs`}
              />
              <button
                type="button"
                onClick={() => {
                  setStoredGeminiKey(geminiKey);
                  setMessage({ text: 'Ключ сохранён на этом устройстве', kind: 'ok' });
                }}
                className="px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500"
              >
                <KeyRound className="w-4 h-4" />
              </button>
            </div>
          </Field>
          {serverKey && (
            <div
              className={`flex items-start gap-2 p-2.5 rounded-2xl ${
                serverKey.serverKeyConfigured && serverKey.keyLooksValid
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400'
              }`}
            >
              <ServerCog className="w-3.5 h-3.5 mt-px flex-shrink-0" />
              <p className="text-[10.5px] font-bold leading-relaxed">
                Общий ключ на сервере:{' '}
                {!serverKey.serverKeyConfigured
                  ? 'не найден'
                  : serverKey.keyLooksValid
                  ? 'настроен'
                  : 'задан, но не похож на ключ Gemini'}
                <span className="font-medium opacity-80"> ({serverKey.environment})</span>
                <br />
                <span className="font-medium">{serverKey.hint}</span>
              </p>
            </div>
          )}

          <p className="text-[10px] text-slate-400 font-medium flex items-start gap-1.5">
            <Mic className="w-3 h-3 mt-0.5 flex-shrink-0" />
            Голосовой ввод работает офлайн-независимо через распознавание речи браузера и не
            отправляет аудио в Gemini.
          </p>
        </Card>
      </div>

      {/* ------------------------------------------------------- backup */}
      <div>
        <SectionTitle title="Резервное копирование" />
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
                {driveState.isConnected ? 'Google Drive подключён' : 'Google Drive не подключён'}
              </p>
              <p className="text-[10px] text-slate-400 font-medium truncate">
                {driveState.userEmail ||
                  'Бэкап хранится в скрытой служебной папке приложения (appDataFolder)'}
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
                'Отключить'
              ) : (
                'Войти'
              )}
            </button>
          </div>

          {settings.lastBackupDate && (
            <p className="text-[10px] text-slate-400 font-medium">
              Последний бэкап: {new Date(settings.lastBackupDate).toLocaleString('ru-RU')}
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
                    ? { ok: true, text: 'Бэкап выгружен в Google Drive' }
                    : { ok: false, text: result.error || 'Ошибка выгрузки' };
                })
              }
              className="py-2.5 rounded-2xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 text-[11px] font-black flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              {busy === 'upload' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CloudUpload className="w-3.5 h-3.5" />
              )}
              Выгрузить
            </button>

            <button
              type="button"
              disabled={!driveState.isConnected || busy !== null}
              onClick={() =>
                run('sync', async () => {
                  const result = await syncFinanceFromDrive();
                  return result.success
                    ? { ok: true, text: `Синхронизировано записей: ${result.merged || 0}` }
                    : { ok: false, text: result.error || 'Ошибка синхронизации' };
                })
              }
              className="py-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-[11px] font-black flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              {busy === 'sync' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Синхронизировать
            </button>

            <button
              type="button"
              disabled={!driveState.isConnected || busy !== null}
              onClick={() =>
                run('restore', async () => {
                  const result = await restoreLatestFinanceBackup();
                  return result.success
                    ? { ok: true, text: `Восстановлено из ${result.fileName}` }
                    : { ok: false, text: result.error || 'Ошибка восстановления' };
                })
              }
              className="py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-black flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              Восстановить
            </button>

            <button
              type="button"
              onClick={() =>
                run('local', async () => {
                  downloadFinanceBackupFile(await exportFinanceDatabaseJson());
                  return { ok: true, text: 'Файл бэкапа сохранён' };
                })
              }
              className="py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-black flex items-center justify-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Файл на устройство
            </button>
          </div>

          {!GOOGLE_OAUTH_CLIENT_ID && (
            <Field
              label="Google OAuth Client ID"
              hint="Web-клиент из Google Cloud Console со scope drive.appdata. Нужен один раз, хранится на устройстве."
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="…apps.googleusercontent.com"
                  className={`${inputClass} text-xs`}
                />
                <button
                  type="button"
                  onClick={() => {
                    setCustomClientId(clientId);
                    setMessage({ text: 'Client ID сохранён на этом устройстве', kind: 'ok' });
                  }}
                  className="px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500"
                >
                  <KeyRound className="w-4 h-4" />
                </button>
              </div>
            </Field>
          )}

          <label className="block">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wide">
              Восстановить из файла
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
                    ? { ok: true, text: 'Данные восстановлены из файла' }
                    : { ok: false, text: result.error || 'Ошибка восстановления' };
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
        Удалить все финансовые данные
      </button>

      {showResetConfirm && (
        <ModalShell
          title="Удалить все данные?"
          subtitle="Операции, бюджеты, обязательства и счета будут стёрты с этого устройства"
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
                Отмена
              </button>
              <PrimaryButton
                variant="danger"
                onClick={async () => {
                  await clearAllFinanceData();
                  setShowResetConfirm(false);
                  setMessage({ text: 'Данные удалены', kind: 'ok' });
                }}
              >
                Удалить
              </PrimaryButton>
            </div>
          }
        >
          <p className="text-xs text-slate-500 font-medium leading-relaxed">
            Бэкапы в Google Drive не удаляются — данные можно будет восстановить кнопкой
            «Восстановить».
          </p>
        </ModalShell>
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

function AccountModal({
  account,
  baseCurrency,
  onClose,
}: {
  account: FinanceAccount | null;
  baseCurrency: CurrencyCode;
  onClose: () => void;
}) {
  const [name, setName] = useState(account?.name || '');
  const [kind, setKind] = useState<AccountKind>(account?.kind || 'CARD');
  const [currency, setCurrency] = useState<CurrencyCode>(account?.currency || baseCurrency);
  const [openingBalance, setOpeningBalance] = useState(String(account?.openingBalance ?? 0));
  const [colorHex, setColorHex] = useState(account?.colorHex || '#0EA5E9');
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) return setError('Введите название счёта');

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
      title={account ? 'Счёт' : 'Новый счёт'}
      icon={<Wallet className="w-5 h-5" />}
      onClose={onClose}
      maxWidthClass="max-w-md"
      footer={
        <div className="space-y-2">
          {error && <p className="text-[11px] font-bold text-rose-500 text-center">{error}</p>}
          <PrimaryButton onClick={handleSave}>Сохранить</PrimaryButton>
          {account && (
            <button
              type="button"
              onClick={async () => {
                await deleteAccount(account.id);
                onClose();
              }}
              className="w-full py-2.5 rounded-2xl text-[11px] font-black text-rose-500 bg-rose-50 dark:bg-rose-950/40"
            >
              Удалить (или отправить в архив, если есть операции)
            </button>
          )}
        </div>
      }
    >
      <Field label="Название">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Visa 4242"
          className={inputClass}
          autoFocus
        />
      </Field>

      <Field label="Тип счёта">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as AccountKind)}
          className={inputClass}
        >
          {Object.entries(ACCOUNT_KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Валюта">
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
        <Field label="Начальный баланс">
          <input
            type="text"
            inputMode="decimal"
            value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Цвет">
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
    if (!displayName.trim()) return setError('Введите имя участника');

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
      title={member ? 'Участник профиля' : 'Пригласить участника'}
      subtitle={member ? undefined : 'Второй участник видит те же операции, бюджеты и счета'}
      icon={<Users className="w-5 h-5" />}
      onClose={onClose}
      maxWidthClass="max-w-md"
      footer={
        <div className="space-y-2">
          {error && <p className="text-[11px] font-bold text-rose-500 text-center">{error}</p>}
          <PrimaryButton onClick={handleSave}>Сохранить</PrimaryButton>
          {member && member.role !== 'OWNER' && (
            <button
              type="button"
              onClick={async () => {
                await deleteMember(member.id);
                onClose();
              }}
              className="w-full py-2.5 rounded-2xl text-[11px] font-black text-rose-500 bg-rose-50 dark:bg-rose-950/40"
            >
              Удалить участника
            </button>
          )}
        </div>
      }
    >
      <Field label="Имя">
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Супруг(а)"
          className={inputClass}
          autoFocus
        />
      </Field>

      <Field label="Email" hint="Используется для приглашения на второе устройство">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
          className={inputClass}
        />
      </Field>

      <Field label="Права доступа">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as ProfileMember['role'])}
          className={inputClass}
          disabled={member?.role === 'OWNER'}
        >
          <option value="FULL">Полный доступ</option>
          <option value="VIEWER">Только просмотр</option>
          {member?.role === 'OWNER' && <option value="OWNER">Владелец</option>}
        </select>
      </Field>

      <Field label="Цвет метки автора">
        <ColorPicker value={colorHex} onChange={setColorHex} />
      </Field>

      <button
        type="button"
        onClick={() => setNotify((prev) => !prev)}
        className="w-full flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70"
      >
        <span className="text-left">
          <span className="block text-xs font-black text-slate-700 dark:text-slate-200">
            Уведомлять о крупных операциях
          </span>
          <span className="block text-[10px] text-slate-400 font-medium">
            Приходит на устройство этого участника
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
        <Field label="Порог крупной операции">
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
