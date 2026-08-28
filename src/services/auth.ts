'use client';

import { AuthProvider, AuthSession } from '@/types';
import { GOOGLE_OAUTH_CLIENT_ID } from './backup/google-drive';

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

/**
 * Identity is local: the app has no server, so a session records **who is using
 * this device** — for author labels, the Drive backup account and partner
 * invitations. It is not a security boundary; local data is guarded by the
 * optional PIN and by the device itself.
 */
function loadGisScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('Только в браузере'));
    if ((window as any).google?.accounts?.id) return resolve();

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Не удалось загрузить Google Identity Services')));
      return;
    }

    const script = document.createElement('script');
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Не удалось загрузить Google Identity Services'));
    document.head.appendChild(script);
  });
}

/** Reads the profile claims out of a Google ID token (base64url JSON payload). */
function decodeIdToken(credential: string): {
  email?: string;
  name?: string;
  picture?: string;
} {
  const payload = credential.split('.')[1];
  if (!payload) return {};
  const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(decodeURIComponent(escape(json)));
}

export function isGoogleSignInAvailable(): boolean {
  return Boolean(GOOGLE_OAUTH_CLIENT_ID.trim());
}

export async function signInWithGoogle(): Promise<
  { success: true; session: AuthSession } | { success: false; error: string }
> {
  const clientId = GOOGLE_OAUTH_CLIENT_ID.trim();
  if (!clientId) {
    return {
      success: false,
      error:
        'Вход через Google не настроен: в проекте нет NEXT_PUBLIC_GOOGLE_CLIENT_ID. Войдите по email или добавьте переменную и передеплойте.',
    };
  }

  try {
    await loadGisScript();
  } catch (err: any) {
    return { success: false, error: err.message || 'Google Identity Services недоступен' };
  }

  return new Promise((resolve) => {
    const google = (window as any).google;

    // A silent prompt can be suppressed by the browser with no callback at all;
    // the timeout turns that dead end into an explanation.
    const timeout = setTimeout(() => {
      resolve({
        success: false,
        error:
          'Окно Google не открылось. Разрешите всплывающие окна и сторонние cookie для этого сайта — или войдите по email.',
      });
    }, 60000);

    try {
      google.accounts.id.initialize({
        client_id: clientId,
        callback: (response: any) => {
          clearTimeout(timeout);
          if (!response?.credential) {
            resolve({ success: false, error: 'Google не вернул данные входа' });
            return;
          }

          const claims = decodeIdToken(response.credential);
          if (!claims.email) {
            resolve({ success: false, error: 'Google не сообщил email аккаунта' });
            return;
          }

          resolve({
            success: true,
            session: {
              provider: 'GOOGLE',
              email: claims.email,
              displayName: claims.name || claims.email.split('@')[0],
              pictureUrl: claims.picture,
              signedInAt: new Date().toISOString(),
            },
          });
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      google.accounts.id.prompt((notification: any) => {
        if (notification?.isNotDisplayed?.() || notification?.isSkippedMoment?.()) {
          clearTimeout(timeout);
          resolve({
            success: false,
            error:
              'Google не показал окно входа: проверьте, что домен приложения добавлен в «Authorized JavaScript origins», и что не блокируются сторонние cookie.',
          });
        }
      });
    } catch (err: any) {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message || 'Ошибка запуска входа через Google' });
    }
  });
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function signInWithEmail(
  email: string,
  displayName?: string
): { success: true; session: AuthSession } | { success: false; error: string } {
  const trimmed = email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(trimmed)) {
    return { success: false, error: 'Введите корректный email' };
  }

  return {
    success: true,
    session: {
      provider: 'EMAIL' as AuthProvider,
      email: trimmed,
      displayName: displayName?.trim() || trimmed.split('@')[0],
      signedInAt: new Date().toISOString(),
    },
  };
}
