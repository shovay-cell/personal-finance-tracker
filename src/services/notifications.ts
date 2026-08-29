'use client';

import { BudgetProgress, Plan, ProfileMember, Transaction } from '@/types';
import { formatMoney } from './analytics';
import { describeRecurrence, planState } from './planned';
import { tr } from '@/i18n/t';

const NOTIFIED_KEY = 'fintrack_notified_keys';

/**
 * Local Notification API rather than FCM: the PWA has no server component, and a
 * push subscription would need one. Each alert fires at most once per key
 * (e.g. "budget-2026-08-cat-groceries-80") so reopening the app stays quiet.
 */
function alreadyNotified(key: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY);
    const keys: string[] = raw ? JSON.parse(raw) : [];
    return keys.includes(key);
  } catch {
    return false;
  }
}

function rememberNotified(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY);
    const keys: string[] = raw ? JSON.parse(raw) : [];
    keys.push(key);
    // Keep the ledger small — only recent keys matter for de-duplication.
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(keys.slice(-300)));
  } catch {
    /* storage full or disabled — notifications simply repeat */
  }
}

export function notificationsPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationsPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

function notify(title: string, body: string, key: string): void {
  if (alreadyNotified(key)) return;
  rememberNotified(key);

  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: '/icon-192.svg', tag: key });
  } catch {
    /* Some mobile browsers only allow notifications from a service worker. */
  }
}

export function checkBudgetAlerts(
  progress: BudgetProgress[],
  thresholds: number[] = [80, 100]
): void {
  for (const item of progress) {
    if (item.effectiveLimit <= 0) continue;

    // Only the highest crossed threshold fires, so 100% doesn't also re-send 80%.
    const crossed = thresholds.filter((t) => item.percent >= t).sort((a, b) => b - a)[0];
    if (!crossed) continue;

    const key = `budget-${item.budget.month}-${item.budget.categoryId || 'total'}-${
      item.budget.memberId || 'shared'
    }-${crossed}`;

    notify(
      crossed >= 100 ? tr('svc.limitReached') : tr('svc.limitClose'),
      `${item.categoryName}: ${formatMoney(item.spent, item.budget.currency)} ${tr(
        'svc.of'
      )} ${formatMoney(
        item.effectiveLimit,
        item.budget.currency
      )} (${item.percent.toFixed(0)}%)`,
      key
    );
  }
}

export function checkPlannedPaymentReminders(plans: Plan[]): void {
  for (const plan of plans) {
    if (plan.scheduleType !== 'RECURRING' || plan.status !== 'ACTIVE' || !plan.nextDueDate) continue;
    const state = planState(plan);

    if (state.isOverdue) {
      notify(
        tr('svc.overduePayment'),
        `${plan.title} — ${formatMoney(plan.amount, plan.currency)}, ${tr(
          'svc.dueWas'
        )} ${plan.nextDueDate}`,
        `planned-overdue-${plan.id}-${plan.nextDueDate}`
      );
      continue;
    }

    if (state.isWithinReminderWindow) {
      notify(
        tr('svc.paymentSoon'),
        `${plan.title} — ${formatMoney(plan.amount, plan.currency)} ${tr('svc.inDays')} ${
          state.daysUntilDue
        } ${tr('svc.daysShort')} (${describeRecurrence(plan)})`,
        `planned-soon-${plan.id}-${plan.nextDueDate}`
      );
    }
  }
}

/** Alerts the partner device about an unusually large operation. */
export function checkLargeTransactionAlert(
  transaction: Transaction,
  members: ProfileMember[],
  currentMemberId: string
): void {
  const watchers = members.filter(
    (m) => m.id !== transaction.authorId && m.notifyOnLargeTransactions
  );
  const watcher = watchers.find((m) => m.id === currentMemberId);
  if (!watcher) return;
  if (transaction.baseAmount < watcher.largeTransactionThreshold) return;

  const author = members.find((m) => m.id === transaction.authorId);
  notify(
    tr('svc.largeOperation'),
    `${author?.displayName || tr('svc.partner')}: ${formatMoney(
      transaction.amount,
      transaction.currency
    )}${
      transaction.merchant ? ` · ${transaction.merchant}` : ''
    }`,
    `large-tx-${transaction.id}`
  );
}
