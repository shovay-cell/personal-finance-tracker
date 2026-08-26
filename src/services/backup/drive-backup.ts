'use client';

import { GoogleDriveBackupFile } from '@/types';
import {
  authenticateGoogleDrive,
  disconnectGoogleDrive,
  getGoogleDriveState,
  setLastBackupTimestamp,
} from './google-drive';
import {
  exportFinanceDatabaseJson,
  importFinanceDatabaseJson,
  mergeFinanceDatabaseJson,
  saveFinanceSettings,
} from '@/lib/db';

/**
 * Backups live in Drive's hidden `appDataFolder`: invisible in the user's Drive
 * UI and reachable only by this app. Both spouses point at the same Google
 * account, which is what makes this one shared restore point rather than two
 * divergent archives.
 */
const FINANCE_FILE_PREFIX = 'FinTrack_Backup_';
const AUTO_BACKUP_KEY = 'fintrack_last_auto_backup';

export { authenticateGoogleDrive, disconnectGoogleDrive, getGoogleDriveState };

function isFinanceBackup(file: GoogleDriveBackupFile): boolean {
  return file.name.startsWith(FINANCE_FILE_PREFIX);
}

export async function uploadFinanceBackup(): Promise<{
  success: boolean;
  fileId?: string;
  error?: string;
}> {
  const { isConnected, accessToken } = getGoogleDriveState();
  if (!isConnected || !accessToken) {
    return { success: false, error: 'Google Drive не подключен. Нажмите «Войти через Google».' };
  }

  try {
    const backupJson = await exportFinanceDatabaseJson();
    const fileName = `${FINANCE_FILE_PREFIX}${new Date().toISOString().replace(/[:.]/g, '-')}.fintrack`;

    const metadata = {
      name: fileName,
      description: 'Резервная копия финансового трекера FinTrack (общая для семейного профиля)',
      parents: ['appDataFolder'],
      mimeType: 'application/json',
    };

    const boundary = '-------fintrack314159265358979';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const body =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      backupJson +
      closeDelimiter;

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { success: false, error: err.error?.message || `Ошибка Google Drive (${response.status})` };
    }

    const data = await response.json();
    const nowIso = new Date().toISOString();
    setLastBackupTimestamp(nowIso);
    localStorage.setItem(AUTO_BACKUP_KEY, nowIso);
    await saveFinanceSettings({ lastBackupDate: nowIso });

    return { success: true, fileId: data.id };
  } catch (err: any) {
    return { success: false, error: err.message || 'Не удалось выгрузить бэкап в Google Drive' };
  }
}

export async function listFinanceBackups(): Promise<{
  success: boolean;
  files?: GoogleDriveBackupFile[];
  error?: string;
}> {
  const { isConnected, accessToken } = getGoogleDriveState();
  if (!isConnected || !accessToken) {
    return { success: false, error: 'Google Drive не авторизован' };
  }

  try {
    const url =
      'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder' +
      '&fields=files(id,name,size,createdTime,modifiedTime)&orderBy=createdTime desc&pageSize=30';

    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, error: err.error?.message || `Ошибка списка файлов (${res.status})` };
    }

    const data = await res.json();
    return { success: true, files: (data.files || []).filter(isFinanceBackup) };
  } catch (err: any) {
    return { success: false, error: err.message || 'Сбой запроса к Google Drive' };
  }
}

async function downloadBackupText(fileId: string): Promise<{ text?: string; error?: string }> {
  const { accessToken } = getGoogleDriveState();
  if (!accessToken) return { error: 'Google Drive не авторизован' };

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { error: `Не удалось скачать файл из Google Drive (${res.status})` };
  return { text: await res.text() };
}

/** Full replace — used when setting the app up on a new device. */
export async function restoreFinanceBackup(
  fileId: string
): Promise<{ success: boolean; error?: string }> {
  const { text, error } = await downloadBackupText(fileId);
  if (!text) return { success: false, error };
  return importFinanceDatabaseJson(text);
}

/**
 * Merge pull — used by the second device of a family profile: newer remote rows
 * win, but operations added locally while offline are preserved.
 */
export async function syncFinanceFromDrive(): Promise<{
  success: boolean;
  merged?: number;
  fileName?: string;
  error?: string;
}> {
  const list = await listFinanceBackups();
  if (!list.success || !list.files || list.files.length === 0) {
    return { success: false, error: 'В Google Drive нет ни одного бэкапа FinTrack' };
  }

  const latest = list.files[0];
  const { text, error } = await downloadBackupText(latest.id);
  if (!text) return { success: false, error };

  const result = await mergeFinanceDatabaseJson(text);
  return { ...result, fileName: latest.name };
}

export async function restoreLatestFinanceBackup(): Promise<{
  success: boolean;
  error?: string;
  fileName?: string;
}> {
  const list = await listFinanceBackups();
  if (!list.success || !list.files || list.files.length === 0) {
    return { success: false, error: 'В Google Drive нет ни одного бэкапа FinTrack' };
  }

  const latest = list.files[0];
  const result = await restoreFinanceBackup(latest.id);
  return { ...result, fileName: latest.name };
}

export async function restoreFinanceFromLocalFile(
  file: File
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      if (!text) return resolve({ success: false, error: 'Файл пуст' });
      resolve(await importFinanceDatabaseJson(text));
    };
    reader.onerror = () => resolve({ success: false, error: 'Ошибка чтения файла' });
    reader.readAsText(file);
  });
}

/**
 * Daily auto-backup: fires at most once per 24h, and only when Drive is already
 * connected, so opening the app never triggers an OAuth popup on its own.
 */
export async function runDailyAutoBackup(): Promise<void> {
  if (typeof window === 'undefined') return;
  const { isConnected } = getGoogleDriveState();
  if (!isConnected) return;

  const last = localStorage.getItem(AUTO_BACKUP_KEY);
  if (last && Date.now() - new Date(last).getTime() < 24 * 60 * 60 * 1000) return;

  await uploadFinanceBackup();
}
