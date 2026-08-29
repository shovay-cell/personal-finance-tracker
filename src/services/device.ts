'use client';

/**
 * A friendly label for this browser/device — shown next to sync and backup
 * timestamps so "last copy in Drive" reads as "MacBook, 18:08" rather than an
 * anonymous file name. Auto-guessed from the user agent, editable by the user,
 * and stored per-device: it deliberately does not travel through sync, the
 * same way a hostname is not something one device can set for another.
 */
const DEVICE_NAME_KEY = 'fintrack_device_name';

function guessDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Device';
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Device';
}

export function getDeviceName(): string {
  if (typeof window === 'undefined') return 'Device';
  return localStorage.getItem(DEVICE_NAME_KEY) || guessDeviceName();
}

export function setDeviceName(name: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = name.trim();
  if (trimmed) localStorage.setItem(DEVICE_NAME_KEY, trimmed);
  else localStorage.removeItem(DEVICE_NAME_KEY);
}
