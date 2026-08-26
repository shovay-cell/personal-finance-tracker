import Dexie, { Table } from 'dexie';
import {
  Budget,
  CurrencyCode,
  FinanceAccount,
  FinanceBackupPayload,
  FinanceCategory,
  FinanceSettings,
  Obligation,
  ObligationSettlement,
  ObligationStatus,
  PlannedPayment,
  ProfileMember,
  Transaction,
  TransactionSplit,
} from '@/types';
import {
  buildDefaultCategories,
  DEFAULT_EXCHANGE_RATES,
  MEMBER_COLORS,
} from '@/constants/categories';

const CURRENT_MEMBER_KEY = 'fintrack_current_member_id';

export class FinanceDatabase extends Dexie {
  accounts!: Table<FinanceAccount, string>;
  categories!: Table<FinanceCategory, string>;
  transactions!: Table<Transaction, string>;
  plannedPayments!: Table<PlannedPayment, string>;
  obligations!: Table<Obligation, string>;
  obligationSettlements!: Table<ObligationSettlement, string>;
  budgets!: Table<Budget, string>;
  members!: Table<ProfileMember, string>;
  settings!: Table<FinanceSettings, string>;

  constructor() {
    super('FinTrack_Local_v1');
    this.version(1).stores({
      accounts: 'id, name, kind, currency, isArchived',
      categories: 'id, kind, parentId, isHidden, sortOrder',
      transactions: 'id, kind, date, categoryId, subcategoryId, accountId, authorId, obligationId, plannedPaymentId',
      plannedPayments: 'id, nextDueDate, isActive, categoryId, kind',
      obligations: 'id, status, issueDate, dueDate, payeeKind',
      obligationSettlements: 'id, obligationId, date',
      budgets: 'id, month, categoryId, memberId',
      members: 'id, email, role',
      settings: 'id',
    });
  }
}

export const financeDb = new FinanceDatabase();

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Id of the member using this device — persisted so author tags stay stable. */
export function getCurrentMemberId(): string {
  if (typeof window === 'undefined') return 'member-owner';
  return localStorage.getItem(CURRENT_MEMBER_KEY) || 'member-owner';
}

export function setCurrentMemberId(id: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CURRENT_MEMBER_KEY, id);
}

export const DEFAULT_SETTINGS: FinanceSettings = {
  id: 'default',
  baseCurrency: 'ILS',
  exchangeRates: { ...DEFAULT_EXCHANGE_RATES },
  profileName: 'Семейный бюджет',
  speechLocale: 'ru-RU',
  budgetRolloverEnabled: false,
  notifyAtPercent: [80, 100],
  plannedPaymentAutoCreate: false,
  updatedAt: new Date().toISOString(),
};

export async function initializeFinanceDb(): Promise<void> {
  const now = new Date().toISOString();

  // Add every default category that is missing — on a fresh database that seeds
  // the whole list, and on an existing one it back-fills categories shipped in a
  // later version. Only absent ids are written, so renamed, recoloured or hidden
  // categories the user already has are left exactly as they are.
  const defaultCategories = buildDefaultCategories();
  const existingCategoryIds = new Set(await financeDb.categories.toCollection().primaryKeys());
  const missingCategories = defaultCategories.filter((c) => !existingCategoryIds.has(c.id));
  if (missingCategories.length > 0) {
    await financeDb.categories.bulkPut(missingCategories);
  }

  if ((await financeDb.accounts.count()) === 0) {
    await financeDb.accounts.bulkPut([
      {
        id: 'acc-cash',
        name: 'Наличные',
        kind: 'CASH',
        currency: 'ILS',
        openingBalance: 0,
        colorHex: '#10B981',
        isArchived: false,
        createdAt: now,
      },
      {
        id: 'acc-card',
        name: 'Основная карта',
        kind: 'CARD',
        currency: 'ILS',
        openingBalance: 0,
        colorHex: '#0EA5E9',
        isArchived: false,
        createdAt: now,
      },
    ]);
  }

  if ((await financeDb.members.count()) === 0) {
    await financeDb.members.put({
      id: 'member-owner',
      displayName: 'Я',
      colorHex: MEMBER_COLORS[0],
      role: 'OWNER',
      isCurrentDevice: true,
      notifyOnLargeTransactions: true,
      largeTransactionThreshold: 500,
      joinedAt: now,
    });
    setCurrentMemberId('member-owner');
  }

  if (!(await financeDb.settings.get('default'))) {
    await financeDb.settings.put({ ...DEFAULT_SETTINGS, updatedAt: now });
  }
}

// ---------------------------------------------------------------- settings

export async function getFinanceSettings(): Promise<FinanceSettings> {
  return (await financeDb.settings.get('default')) || DEFAULT_SETTINGS;
}

export async function saveFinanceSettings(patch: Partial<FinanceSettings>): Promise<void> {
  const current = await getFinanceSettings();
  await financeDb.settings.put({
    ...current,
    ...patch,
    id: 'default',
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Converts `amount` from `currency` into the profile base currency using the
 * manually maintained rate table. Returns both the converted value and the rate
 * so a transaction keeps the rate it was booked at.
 */
export function convertToBase(
  amount: number,
  currency: CurrencyCode,
  settings: Pick<FinanceSettings, 'baseCurrency' | 'exchangeRates'>
): { baseAmount: number; exchangeRate: number } {
  if (currency === settings.baseCurrency) {
    return { baseAmount: amount, exchangeRate: 1 };
  }
  const rateToIls = settings.exchangeRates[currency] ?? DEFAULT_EXCHANGE_RATES[currency] ?? 1;
  const baseRateToIls =
    settings.exchangeRates[settings.baseCurrency] ??
    DEFAULT_EXCHANGE_RATES[settings.baseCurrency] ??
    1;
  const exchangeRate = rateToIls / baseRateToIls;
  return { baseAmount: Math.round(amount * exchangeRate * 100) / 100, exchangeRate };
}

// ------------------------------------------------------------ transactions

export type NewTransactionInput = Omit<
  Transaction,
  'id' | 'createdAt' | 'updatedAt' | 'baseAmount' | 'exchangeRate' | 'authorId'
> & { authorId?: string };

/**
 * Slices must add up to the transaction total, otherwise reports would quietly
 * lose or invent money. The last slice absorbs rounding.
 */
export function normalizeSplits(
  amount: number,
  splits?: TransactionSplit[]
): TransactionSplit[] | undefined {
  if (!splits || splits.length === 0) return undefined;

  const cleaned = splits.filter((part) => part.categoryId && part.amount > 0);
  if (cleaned.length < 2) return undefined;

  const sum = cleaned.reduce((total, part) => total + part.amount, 0);
  const drift = Math.round((amount - sum) * 100) / 100;
  if (drift !== 0) {
    cleaned[cleaned.length - 1] = {
      ...cleaned[cleaned.length - 1],
      amount: Math.round((cleaned[cleaned.length - 1].amount + drift) * 100) / 100,
    };
  }

  return cleaned;
}

export async function addTransaction(input: NewTransactionInput): Promise<Transaction> {
  const settings = await getFinanceSettings();
  const { baseAmount, exchangeRate } = convertToBase(input.amount, input.currency, settings);
  const now = new Date().toISOString();

  const splits = normalizeSplits(input.amount, input.splits);

  const tx: Transaction = {
    ...input,
    splits,
    // With a split the biggest slice represents the operation in lists.
    categoryId: splits
      ? [...splits].sort((a, b) => b.amount - a.amount)[0].categoryId
      : input.categoryId,
    authorId: input.authorId || getCurrentMemberId(),
    id: newId('tx'),
    baseAmount,
    exchangeRate,
    createdAt: now,
    updatedAt: now,
  };
  await financeDb.transactions.put(tx);
  return tx;
}

export async function updateTransaction(
  id: string,
  updates: Partial<Transaction>
): Promise<void> {
  const existing = await financeDb.transactions.get(id);
  if (!existing) return;

  let recalculated: Partial<Transaction> = {};
  if (updates.amount !== undefined || updates.currency !== undefined) {
    const settings = await getFinanceSettings();
    const { baseAmount, exchangeRate } = convertToBase(
      updates.amount ?? existing.amount,
      updates.currency ?? existing.currency,
      settings
    );
    recalculated = { baseAmount, exchangeRate };
  }

  const nextAmount = updates.amount ?? existing.amount;
  const splitPatch =
    'splits' in updates
      ? (() => {
          const splits = normalizeSplits(nextAmount, updates.splits ?? undefined);
          return {
            splits,
            categoryId: splits
              ? [...splits].sort((a, b) => b.amount - a.amount)[0].categoryId
              : updates.categoryId ?? existing.categoryId,
          };
        })()
      : {};

  await financeDb.transactions.update(id, {
    ...updates,
    ...recalculated,
    ...splitPatch,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteTransaction(id: string): Promise<void> {
  const tx = await financeDb.transactions.get(id);
  await financeDb.transactions.delete(id);

  // A transaction created by settling a bearer cheque owns its settlement row:
  // drop it too, otherwise the obligation would stay short-paid on paper only.
  if (tx?.obligationId) {
    const linked = await financeDb.obligationSettlements
      .where('obligationId')
      .equals(tx.obligationId)
      .toArray();
    for (const s of linked.filter((s) => s.transactionId === id)) {
      await financeDb.obligationSettlements.delete(s.id);
    }
    await recomputeObligationStatus(tx.obligationId);
  }
}

// --------------------------------------------------------------- accounts

export async function addAccount(
  input: Omit<FinanceAccount, 'id' | 'createdAt'>
): Promise<FinanceAccount> {
  const account: FinanceAccount = {
    ...input,
    id: newId('acc'),
    createdAt: new Date().toISOString(),
  };
  await financeDb.accounts.put(account);
  return account;
}

export async function updateAccount(id: string, updates: Partial<FinanceAccount>): Promise<void> {
  await financeDb.accounts.update(id, updates);
}

export async function deleteAccount(id: string): Promise<void> {
  const used = await financeDb.transactions.where('accountId').equals(id).count();
  if (used > 0) {
    // Keep history intact — archive instead of orphaning transactions.
    await financeDb.accounts.update(id, { isArchived: true });
    return;
  }
  await financeDb.accounts.delete(id);
}

/** Opening balance plus every income minus every expense booked on the account. */
export function computeAccountBalance(
  account: FinanceAccount,
  transactions: Transaction[]
): number {
  return transactions
    .filter((t) => t.accountId === account.id)
    .reduce(
      (sum, t) => sum + (t.kind === 'INCOME' ? t.amount : -t.amount),
      account.openingBalance
    );
}

// ------------------------------------------------------------- categories

export async function addCategory(
  input: Omit<FinanceCategory, 'id' | 'createdAt' | 'isSystem' | 'isHidden' | 'sortOrder'> &
    Partial<Pick<FinanceCategory, 'sortOrder'>>
): Promise<FinanceCategory> {
  const category: FinanceCategory = {
    isSystem: false,
    isHidden: false,
    sortOrder: input.sortOrder ?? 9000,
    ...input,
    id: newId('cat'),
    createdAt: new Date().toISOString(),
  };
  await financeDb.categories.put(category);
  return category;
}

export async function updateCategory(
  id: string,
  updates: Partial<FinanceCategory>
): Promise<void> {
  await financeDb.categories.update(id, updates);
}

/**
 * System categories can only be hidden. A user category is deletable only when
 * nothing references it; otherwise it is hidden so reports keep their labels.
 */
export async function deleteCategory(id: string): Promise<{ deleted: boolean; reason?: string }> {
  const category = await financeDb.categories.get(id);
  if (!category) return { deleted: false, reason: 'Категория не найдена' };

  if (category.isSystem) {
    await financeDb.categories.update(id, { isHidden: true });
    return { deleted: false, reason: 'Системная категория скрыта, а не удалена' };
  }

  const inUse =
    (await financeDb.transactions.where('categoryId').equals(id).count()) +
    (await financeDb.transactions.where('subcategoryId').equals(id).count());

  if (inUse > 0) {
    await financeDb.categories.update(id, { isHidden: true });
    return { deleted: false, reason: `Категория используется в ${inUse} операциях — скрыта` };
  }

  const children = await financeDb.categories.where('parentId').equals(id).toArray();
  for (const child of children) {
    await financeDb.categories.delete(child.id);
  }
  await financeDb.categories.delete(id);
  return { deleted: true };
}

// --------------------------------------------------------- planned payments

export async function addPlannedPayment(
  input: Omit<PlannedPayment, 'id' | 'createdAt'>
): Promise<PlannedPayment> {
  const planned: PlannedPayment = {
    ...input,
    id: newId('plan'),
    createdAt: new Date().toISOString(),
  };
  await financeDb.plannedPayments.put(planned);
  return planned;
}

export async function updatePlannedPayment(
  id: string,
  updates: Partial<PlannedPayment>
): Promise<void> {
  await financeDb.plannedPayments.update(id, updates);
}

export async function deletePlannedPayment(id: string): Promise<void> {
  await financeDb.plannedPayments.delete(id);
}

// ------------------------------------------------------------- obligations

export async function addObligation(
  input: Omit<Obligation, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'authorId'> &
    Partial<Pick<Obligation, 'authorId'>>
): Promise<Obligation> {
  const now = new Date().toISOString();
  const obligation: Obligation = {
    ...input,
    authorId: input.authorId || getCurrentMemberId(),
    id: newId('obl'),
    status: 'ISSUED',
    createdAt: now,
    updatedAt: now,
  };
  await financeDb.obligations.put(obligation);
  return obligation;
}

export async function updateObligation(
  id: string,
  updates: Partial<Obligation>
): Promise<void> {
  await financeDb.obligations.update(id, { ...updates, updatedAt: new Date().toISOString() });
  await recomputeObligationStatus(id);
}

export async function deleteObligation(id: string): Promise<void> {
  const settlements = await financeDb.obligationSettlements
    .where('obligationId')
    .equals(id)
    .toArray();
  for (const s of settlements) {
    await financeDb.obligationSettlements.delete(s.id);
  }
  await financeDb.obligations.delete(id);
}

export function computeObligationStatus(
  obligation: Obligation,
  settledAmount: number,
  today = todayIso()
): ObligationStatus {
  const outstanding = Math.round((obligation.amount - settledAmount) * 100) / 100;
  if (outstanding <= 0.009) return 'SETTLED';
  if (obligation.dueDate && obligation.dueDate < today) return 'OVERDUE';
  if (settledAmount > 0) return 'PARTIALLY_SETTLED';
  return 'ISSUED';
}

export async function recomputeObligationStatus(obligationId: string): Promise<void> {
  const obligation = await financeDb.obligations.get(obligationId);
  if (!obligation) return;

  const settlements = await financeDb.obligationSettlements
    .where('obligationId')
    .equals(obligationId)
    .toArray();
  const settled = settlements.reduce((sum, s) => sum + s.amount, 0);
  const status = computeObligationStatus(obligation, settled);

  if (status !== obligation.status) {
    await financeDb.obligations.update(obligationId, {
      status,
      updatedAt: new Date().toISOString(),
    });
  }
}

export async function addObligationSettlement(
  input: Omit<ObligationSettlement, 'id' | 'createdAt' | 'authorId'> &
    Partial<Pick<ObligationSettlement, 'authorId'>>
): Promise<ObligationSettlement> {
  const settlement: ObligationSettlement = {
    ...input,
    authorId: input.authorId || getCurrentMemberId(),
    id: newId('set'),
    createdAt: new Date().toISOString(),
  };
  await financeDb.obligationSettlements.put(settlement);
  await recomputeObligationStatus(input.obligationId);
  return settlement;
}

export async function deleteObligationSettlement(id: string): Promise<void> {
  const settlement = await financeDb.obligationSettlements.get(id);
  if (!settlement) return;
  await financeDb.obligationSettlements.delete(id);
  if (settlement.transactionId) {
    await financeDb.transactions.delete(settlement.transactionId);
  }
  await recomputeObligationStatus(settlement.obligationId);
}

/** Re-evaluates OVERDUE on app start — a due date can lapse while the app is closed. */
export async function refreshObligationStatuses(): Promise<void> {
  const obligations = await financeDb.obligations.toArray();
  for (const o of obligations) {
    if (o.status === 'SETTLED') continue;
    await recomputeObligationStatus(o.id);
  }
}

// ----------------------------------------------------------------- budgets

export async function upsertBudget(
  input: Omit<Budget, 'id' | 'createdAt'> & Partial<Pick<Budget, 'id'>>
): Promise<Budget> {
  const existing = input.id
    ? await financeDb.budgets.get(input.id)
    : (await financeDb.budgets.where('month').equals(input.month).toArray()).find(
        (b) =>
          (b.categoryId || null) === (input.categoryId || null) &&
          (b.memberId || null) === (input.memberId || null)
      );

  const budget: Budget = {
    ...input,
    id: existing?.id || newId('bud'),
    createdAt: existing?.createdAt || new Date().toISOString(),
  };
  await financeDb.budgets.put(budget);
  return budget;
}

export async function deleteBudget(id: string): Promise<void> {
  await financeDb.budgets.delete(id);
}

// ----------------------------------------------------------------- members

export async function addMember(
  input: Omit<ProfileMember, 'id' | 'joinedAt'>
): Promise<ProfileMember> {
  const member: ProfileMember = {
    ...input,
    id: newId('member'),
    joinedAt: new Date().toISOString(),
  };
  await financeDb.members.put(member);
  return member;
}

export async function updateMember(id: string, updates: Partial<ProfileMember>): Promise<void> {
  await financeDb.members.update(id, updates);
}

export async function deleteMember(id: string): Promise<void> {
  const member = await financeDb.members.get(id);
  if (!member || member.role === 'OWNER') return;
  await financeDb.members.delete(id);
}

// ------------------------------------------------------- backup / restore

export async function exportFinanceDatabaseJson(): Promise<string> {
  const [
    accounts,
    categories,
    transactions,
    plannedPayments,
    obligations,
    obligationSettlements,
    budgets,
    members,
    settings,
  ] = await Promise.all([
    financeDb.accounts.toArray(),
    financeDb.categories.toArray(),
    financeDb.transactions.toArray(),
    financeDb.plannedPayments.toArray(),
    financeDb.obligations.toArray(),
    financeDb.obligationSettlements.toArray(),
    financeDb.budgets.toArray(),
    financeDb.members.toArray(),
    financeDb.settings.get('default'),
  ]);

  const payload: FinanceBackupPayload = {
    version: 1,
    appName: 'FinTrack',
    exportedAt: new Date().toISOString(),
    accounts,
    categories,
    transactions,
    plannedPayments,
    obligations,
    obligationSettlements,
    budgets,
    members,
    settings: settings || null,
  };

  return JSON.stringify(payload, null, 2);
}

export async function importFinanceDatabaseJson(
  jsonString: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const data = JSON.parse(jsonString) as FinanceBackupPayload;
    if (data.appName !== 'FinTrack') {
      return { success: false, error: 'Файл не является бэкапом финансового трекера' };
    }

    await financeDb.transaction(
      'rw',
      [
        financeDb.accounts,
        financeDb.categories,
        financeDb.transactions,
        financeDb.plannedPayments,
        financeDb.obligations,
        financeDb.obligationSettlements,
        financeDb.budgets,
        financeDb.members,
        financeDb.settings,
      ],
      async () => {
        const tables: [Table<any, string>, any[] | undefined][] = [
          [financeDb.accounts, data.accounts],
          [financeDb.categories, data.categories],
          [financeDb.transactions, data.transactions],
          [financeDb.plannedPayments, data.plannedPayments],
          [financeDb.obligations, data.obligations],
          [financeDb.obligationSettlements, data.obligationSettlements],
          [financeDb.budgets, data.budgets],
          [financeDb.members, data.members],
        ];

        for (const [table, rows] of tables) {
          if (!Array.isArray(rows)) continue;
          await table.clear();
          if (rows.length > 0) await table.bulkPut(rows);
        }

        if (data.settings) {
          await financeDb.settings.put({ ...data.settings, id: 'default' });
        }
      }
    );

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Не удалось прочитать файл бэкапа' };
  }
}

/**
 * Merge-import used when a second device pulls the shared family backup: rows
 * are merged by id with last-write-wins on `updatedAt`, so a restore never
 * throws away operations the local device added while offline.
 */
export async function mergeFinanceDatabaseJson(
  jsonString: string
): Promise<{ success: boolean; merged?: number; error?: string }> {
  try {
    const data = JSON.parse(jsonString) as FinanceBackupPayload;
    if (data.appName !== 'FinTrack') {
      return { success: false, error: 'Файл не является бэкапом финансового трекера' };
    }

    let merged = 0;

    const localTransactions = new Map(
      (await financeDb.transactions.toArray()).map((t) => [t.id, t])
    );
    const incoming = (data.transactions || []).filter((remote) => {
      const local = localTransactions.get(remote.id);
      return !local || remote.updatedAt > local.updatedAt;
    });
    if (incoming.length > 0) {
      await financeDb.transactions.bulkPut(incoming);
      merged += incoming.length;
    }

    for (const [table, rows] of [
      [financeDb.accounts, data.accounts],
      [financeDb.categories, data.categories],
      [financeDb.plannedPayments, data.plannedPayments],
      [financeDb.obligations, data.obligations],
      [financeDb.obligationSettlements, data.obligationSettlements],
      [financeDb.budgets, data.budgets],
      [financeDb.members, data.members],
    ] as [Table<any, string>, any[] | undefined][]) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      await table.bulkPut(rows);
      merged += rows.length;
    }

    return { success: true, merged };
  } catch (err: any) {
    return { success: false, error: err.message || 'Не удалось прочитать файл бэкапа' };
  }
}

export async function clearAllFinanceData(): Promise<void> {
  await Promise.all([
    financeDb.transactions.clear(),
    financeDb.plannedPayments.clear(),
    financeDb.obligations.clear(),
    financeDb.obligationSettlements.clear(),
    financeDb.budgets.clear(),
    financeDb.categories.clear(),
    financeDb.accounts.clear(),
    financeDb.members.clear(),
    financeDb.settings.clear(),
  ]);
  await initializeFinanceDb();
}


/**
 * Carries each rollover budget's leftover — or overspend — into the current
 * month. Runs on startup so the user never has to remember to press a button;
 * `rolloverAppliedFrom` makes it idempotent across restarts, and an existing
 * carry is refreshed while the source month is still the previous one, so a
 * late-arriving operation in that month still lands in the carried figure.
 */
export async function applyBudgetRollovers(month = currentMonth()): Promise<number> {
  const previousMonth = shiftMonthKey(month, -1);
  const [budgets, transactions, categories] = await Promise.all([
    financeDb.budgets.toArray(),
    financeDb.transactions.toArray(),
    financeDb.categories.toArray(),
  ]);

  const sources = budgets.filter((b) => b.month === previousMonth && b.rolloverEnabled);
  if (sources.length === 0) return 0;

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const monthPrefix = `${previousMonth}-`;
  let applied = 0;

  for (const source of sources) {
    let spent = 0;

    for (const t of transactions) {
      if (t.kind !== 'EXPENSE' || !t.date.startsWith(monthPrefix)) continue;
      if (source.memberId && t.authorId !== source.memberId) continue;

      const parts =
        t.splits && t.splits.length > 0
          ? t.splits.map((part) => ({
              categoryId: part.categoryId,
              baseAmount:
                (part.amount / t.splits!.reduce((sum, p) => sum + p.amount, 0)) * t.baseAmount,
            }))
          : [{ categoryId: t.categoryId, baseAmount: t.baseAmount }];

      for (const part of parts) {
        if (!source.categoryId) {
          spent += part.baseAmount;
          continue;
        }
        const rootId = categoryById.get(part.categoryId)?.parentId || part.categoryId;
        if (rootId === source.categoryId || part.categoryId === source.categoryId) {
          spent += part.baseAmount;
        }
      }
    }

    const limit = source.limitAmount + source.carriedOver;
    // Negative remainder is intentional: an overspend shrinks the next month.
    const remainder = Math.round((limit - spent) * 100) / 100;

    const target = budgets.find(
      (b) =>
        b.month === month &&
        (b.categoryId || null) === (source.categoryId || null) &&
        (b.memberId || null) === (source.memberId || null)
    );

    if (target && target.rolloverAppliedFrom === previousMonth && target.carriedOver === remainder) {
      continue;
    }

    await upsertBudget({
      id: target?.id,
      month,
      categoryId: source.categoryId,
      memberId: source.memberId,
      limitAmount: target?.limitAmount ?? source.limitAmount,
      currency: target?.currency ?? source.currency,
      rolloverEnabled: true,
      carriedOver: remainder,
      rolloverAppliedFrom: previousMonth,
    });
    applied += 1;
  }

  return applied;
}

function shiftMonthKey(month: string, delta: number): string {
  const [year, mon] = month.split('-').map(Number);
  const date = new Date(year, mon - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
