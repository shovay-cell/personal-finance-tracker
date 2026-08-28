'use client';

/**
 * "Is the app unlocked right now" — module state on purpose: it dies with the
 * page, so reopening or reloading asks for the PIN again, while setting a PIN
 * from inside the app does not lock the user out of the screen they are on.
 */
let unlocked = false;
const listeners = new Set<() => void>();

export function isSessionUnlocked(): boolean {
  return unlocked;
}

export function markSessionUnlocked(): void {
  if (unlocked) return;
  unlocked = true;
  listeners.forEach((listener) => listener());
}

export function lockSession(): void {
  unlocked = false;
  listeners.forEach((listener) => listener());
}

export function subscribeSessionLock(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
