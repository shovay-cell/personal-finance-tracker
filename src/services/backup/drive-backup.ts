'use client';

import { FinanceBackupPayload, GoogleDriveBackupFile } from '@/types';
import { tr } from '@/i18n/t';
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
    return { success: false, error: tr('drive.notConnected') };
  }

  try {
    const backupJson = await exportFinanceDatabaseJson();
    const fileName = `${FINANCE_FILE_PREFIX}${new Date().toISOString().replace(/[:.]/g, '-')}.fintrack`;

    const metadata = {
      name: fileName,
      description: tr('drive.backupDescription'),
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
      return {
        success: false,
        error: err.error?.message || `${tr('drive.error')} (${response.status})`,
      };
    }

    const data = await response.json();
    const nowIso = new Date().toISOString();
    setLastBackupTimestamp(nowIso);
    localStorage.setItem(AUTO_BACKUP_KEY, nowIso);
    await saveFinanceSettings({ lastBackupDate: nowIso });

    return { success: true, fileId: data.id };
  } catch (err: any) {
    return { success: false, error: err.message || tr('drive.uploadFailed') };
  }
}

export async function listFinanceBackups(): Promise<{
  success: boolean;
  files?: GoogleDriveBackupFile[];
  error?: string;
}> {
  const { isConnected, accessToken } = getGoogleDriveState();
  if (!isConnected || !accessToken) {
    return { success: false, error: tr('drive.notAuthorized') };
  }

  try {
    const url =
      'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder' +
      '&fields=files(id,name,size,createdTime,modifiedTime)&orderBy=createdTime desc&pageSize=30';

    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        success: false,
        error: err.error?.message || `${tr('drive.listError')} (${res.status})`,
      };
    }

    const data = await res.json();
    return { success: true, files: (data.files || []).filter(isFinanceBackup) };
  } catch (err: any) {
    return { success: false, error: err.message || tr('drive.requestFailed') };
  }
}

async function downloadBackupText(fileId: string): Promise<{ text?: string; error?: string }> {
  const { accessToken } = getGoogleDriveState();
  if (!accessToken) return { error: tr('drive.notAuthorized') };

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { error: `${tr('drive.downloadFailed')} (${res.status})` };
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
    return { success: false, error: tr('drive.noBackups') };
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
    return { success: false, error: tr('drive.noBackups') };
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
      if (!text) return resolve({ success: false, error: tr('drive.emptyFile') });
      resolve(await importFinanceDatabaseJson(text));
    };
    reader.onerror = () => resolve({ success: false, error: tr('drive.readError') });
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


/**
 * Finds the shared profile backup a partner is joining and checks it really is
 * the profile whose code they typed. The code alone carries no data — the
 * operations live in the backup on the shared Google account — so this is the
 * step that both locates the profile and proves the person was invited to it.
 */
export async function fetchProfileBackupByCode(code: string): Promise<{
  success: boolean;
  payload?: FinanceBackupPayload;
  json?: string;
  fileName?: string;
  error?: string;
}> {
  const normalized = code.trim().toUpperCase();
  if (normalized.length < 4) {
    return { success: false, error: tr('drive.enterCode') };
  }

  const list = await listFinanceBackups();
  if (!list.success || !list.files || list.files.length === 0) {
    return {
      success: false,
      error:
        tr('drive.noBackupHere'),
    };
  }

  const { text, error } = await downloadBackupText(list.files[0].id);
  if (!text) return { success: false, error };

  try {
    const payload = JSON.parse(text) as FinanceBackupPayload;
    if (payload.appName !== 'FinTrack') {
      return { success: false, error: tr('drive.notABackupFile') };
    }

    const expected = (payload.settings?.inviteCode || '').trim().toUpperCase();
    if (!expected) {
      return {
        success: false,
        error:
          tr('drive.noCodeYet'),
      };
    }

    if (expected !== normalized) {
      return { success: false, error: tr('drive.codeMismatch') };
    }

    return { success: true, payload, json: text, fileName: list.files[0].name };
  } catch (err: any) {
    return { success: false, error: err.message || tr('drive.readBackupFailed') };
  }
}
