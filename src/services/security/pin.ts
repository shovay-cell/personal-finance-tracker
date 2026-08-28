'use client';

/**
 * Local PIN lock. The PIN is never stored — only a salted SHA-256 digest, so a
 * backup file or a look at IndexedDB does not hand over the code. It guards
 * access on this device; it is not encryption of the data itself.
 */

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function createSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  return toHex(await crypto.subtle.digest('SHA-256', data));
}

export async function verifyPin(
  pin: string,
  salt: string | undefined,
  hash: string | undefined
): Promise<boolean> {
  if (!salt || !hash) return false;
  return (await hashPin(pin, salt)) === hash;
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

const ATTEMPTS_KEY = 'fintrack_pin_attempts';

export function getFailedAttempts(): number {
  if (typeof window === 'undefined') return 0;
  return Number(localStorage.getItem(ATTEMPTS_KEY) || 0);
}

export function registerFailedAttempt(): number {
  const next = getFailedAttempts() + 1;
  localStorage.setItem(ATTEMPTS_KEY, String(next));
  return next;
}

export function resetFailedAttempts(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ATTEMPTS_KEY);
}
