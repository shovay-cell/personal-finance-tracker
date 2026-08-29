'use client';

/**
 * Google Identity Services (OAuth 2.0) session handling for the Drive backup.
 *
 * The app asks only for the `drive.appdata` scope: it can read and write files
 * inside its own hidden application folder and nothing else in the user's Drive.
 */

import { tr } from '@/i18n/t';

const CLIENT_ID_KEY = 'fintrack_gdrive_client_id';
const ACCESS_TOKEN_KEY = 'fintrack_gdrive_access_token';
const TOKEN_EXPIRY_KEY = 'fintrack_gdrive_token_expiry';
const USER_EMAIL_KEY = 'fintrack_gdrive_user_email';
const LAST_BACKUP_TIME_KEY = 'fintrack_gdrive_last_backup_time';

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

export const GOOGLE_OAUTH_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

export interface GoogleDriveState {
  isConnected: boolean;
  userEmail: string | null;
  accessToken: string | null;
  lastBackupTime: string | null;
}

export function getGoogleDriveState(): GoogleDriveState {
  if (typeof window === 'undefined') {
    return { isConnected: false, userEmail: null, accessToken: null, lastBackupTime: null };
  }

  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);

  // A GIS access token lives ~1h; treat an expired one as "not connected" so the
  // UI offers a fresh sign-in instead of failing every upload with a 401.
  const isExpired = !expiry || Date.now() > Number(expiry);
  if (!token || isExpired) {
    return {
      isConnected: false,
      userEmail: localStorage.getItem(USER_EMAIL_KEY),
      accessToken: null,
      lastBackupTime: localStorage.getItem(LAST_BACKUP_TIME_KEY),
    };
  }

  return {
    isConnected: true,
    userEmail: localStorage.getItem(USER_EMAIL_KEY),
    accessToken: token,
    lastBackupTime: localStorage.getItem(LAST_BACKUP_TIME_KEY),
  };
}

export function saveGoogleDriveSession(token: string, expiresInSeconds: number, email?: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
  localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + expiresInSeconds * 1000));
  if (email) localStorage.setItem(USER_EMAIL_KEY, email);
}

export function setLastBackupTimestamp(timestampIso: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_BACKUP_TIME_KEY, timestampIso);
}

export function disconnectGoogleDrive() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
  localStorage.removeItem(USER_EMAIL_KEY);
}

export function getCustomClientId(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(CLIENT_ID_KEY) || '';
}

export function setCustomClientId(clientId: string) {
  if (typeof window === 'undefined') return;
  if (clientId.trim()) localStorage.setItem(CLIENT_ID_KEY, clientId.trim());
  else localStorage.removeItem(CLIENT_ID_KEY);
}

function loadGisScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).google?.accounts?.oauth2) return resolve();

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error(tr('svc.gisLoadFailed'))));
      return;
    }

    const script = document.createElement('script');
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(tr('svc.gisLoadFailed')));
    document.head.appendChild(script);
  });
}

async function fetchUserEmail(accessToken: string): Promise<string | undefined> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return undefined;
    const data = await res.json();
    return data.email;
  } catch {
    // The appdata scope alone does not grant userinfo — the email is cosmetic.
    return undefined;
  }
}

export async function authenticateGoogleDrive(
  customClientId?: string
): Promise<{ success: boolean; token?: string; error?: string }> {
  if (typeof window === 'undefined') {
    return { success: false, error: tr('drive.browserOnly') };
  }

  const clientId = (customClientId || getCustomClientId() || GOOGLE_OAUTH_CLIENT_ID).trim();
  if (!clientId) {
    return {
      success: false,
      error:
        tr('drive.notConfigured'),
    };
  }

  if (!clientId.endsWith('.apps.googleusercontent.com')) {
    return {
      success: false,
      error:
        tr('drive.badClientId'),
    };
  }

  try {
    await loadGisScript();
  } catch (err: any) {
    return { success: false, error: err.message || tr('svc.gisUnavailable') };
  }

  return new Promise((resolve) => {
    try {
      const tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        callback: async (response: any) => {
          if (response.error || !response.access_token) {
            resolve({
              success: false,
              error: response.error_description || response.error || tr('drive.noToken'),
            });
            return;
          }

          const email = await fetchUserEmail(response.access_token);
          saveGoogleDriveSession(
            response.access_token,
            Number(response.expires_in) || 3600,
            email
          );
          if (customClientId) setCustomClientId(customClientId);
          resolve({ success: true, token: response.access_token });
        },
      });

      // A blocked popup never calls back at all; without this the button would
      // just spin forever with no explanation.
      const popupTimeout = setTimeout(() => {
        resolve({
          success: false,
          error:
            tr('drive.popupBlocked'),
        });
      }, 60000);

      const originalResolve = resolve;
      resolve = ((value: any) => {
        clearTimeout(popupTimeout);
        originalResolve(value);
      }) as typeof resolve;

      tokenClient.requestAccessToken({ prompt: '' });
    } catch (err: any) {
      resolve({ success: false, error: err.message || tr('drive.oauthStartError') });
    }
  });
}
