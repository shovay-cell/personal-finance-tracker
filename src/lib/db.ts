import Dexie, { Table } from 'dexie';
import { tr } from '@/i18n/t';
import { getDeviceName } from '@/services/device';
import {
  BearerCheque,
  BearerChequeStatus,
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
  VatPayment,
  VatSummary,
  DebtPlan,
  DebtInstallment,
  Plan,
  PlanOccurrence,
  PlanScheduleType,
  PlanStatus,
  PlanType,
  PlanWithSchedule,
  RecurrenceUnit,
} from '@/types';
import {
  buildDefaultCategories,
  DEFAULT_EXCHANGE_RATES,
  MEMBER_COLORS,
} from '@/constants/categories';

const CURRENT_MEMBER_KEY = 'fintrack_current_member_id';

/** Immutable pre-migration copy, written once so the v5 merge can be audited
 *  or replayed even though the legacy tables it was built from are (and stay)
 *  fully intact. See `migratePlannedPaymentsAndDebtsToPlans` below. */
interface PlanMigrationSnapshot {
  id: string;
  createdAt: string;
  plannedPayments: PlannedPayment[];
  debts: DebtPlan[];
  debtInstallments: DebtInstallment[];
}

export class FinanceDatabase extends Dexie {
  accounts!: Table<FinanceAccount, string>;
  categories!: Table<FinanceCategory, string>;
  transactions!: Table<Transaction, string>;
  /** @deprecated frozen at the v5 migration — read-only, kept only as a recovery source. */
  plannedPayments!: Table<PlannedPayment, string>;
  obligations!: Table<Obligation, string>;
  obligationSettlements!: Table<ObligationSettlement, string>;
  budgets!: Table<Budget, string>;
  members!: Table<ProfileMember, string>;
  vatPayments!: Table<VatPayment, string>;
  /** @deprecated frozen at the v5 migration — read-only, kept only as a recovery source. */
  debts!: Table<DebtPlan, string>;
  /** @deprecated frozen at the v5 migration — read-only, kept only as a recovery source. */
  debtInstallments!: Table<DebtInstallment, string>;
  bearerCheques!: Table<BearerCheque, string>;
  plans!: Table<Plan, string>;
  planOccurrences!: Table<PlanOccurrence, string>;
  planMigrationSnapshots!: Table<PlanMigrationSnapshot, string>;
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

    // v2 adds VAT remittances; existing tables carry over untouched.
    this.version(2).stores({
      vatPayments: 'id, date',
    });

    // v3 adds instalment purchases, taxes and loans with their payment schedules.
    this.version(3).stores({
      debts: 'id, kind, startDate',
      debtInstallments: 'id, debtId, dueDate, isPaid',
    });

    // v4 adds postdated cheques issued from the user's own account, tracked as
    // a scheduled future debit rather than an ordinary expense until cleared.
    this.version(4).stores({
      bearerCheques: 'id, status, dueDate, accountId',
    });

    // v5 unifies plannedPayments (recurring) and debts+debtInstallments (fixed
    // schedule) into one `plans`/`planOccurrences` pair — see the comment on
    // `Plan` in @/types for why. `transactions.plannedPaymentId` is renamed to
    // `planId` here too (same values — plans keep the ids of the rows they
    // came from). The legacy tables are intentionally left out of this
    // `stores()` call: Dexie keeps a table's data untouched when a later
    // version doesn't mention it, so plannedPayments/debts/debtInstallments
    // stay exactly as they were — frozen, read-only, never cleared — as a
    // recovery source alongside the explicit snapshot this upgrade writes.
    this.version(5)
      .stores({
        transactions:
          'id, kind, date, categoryId, subcategoryId, accountId, authorId, obligationId, planId',
        plans: 'id, planType, scheduleType, status, nextDueDate, categoryId, accountId',
        planOccurrences: 'id, planId, dueDate, isPaid',
        planMigrationSnapshots: 'id, createdAt',
      })
      .upgrade(async (tx) => {
        await tx.table('transactions').toCollection().modify((t: any) => {
          if (t.plannedPaymentId !== undefined) {
            t.planId = t.plannedPaymentId;
            delete t.plannedPaymentId;
          }
        });
        await migratePlannedPaymentsAndDebtsToPlans(tx);
      });
  }
}

export const financeDb = new FinanceDatabase();

// --------------------------------------------------- plan migration (v5)
//
// Pure transforms shared by the one-time Dexie upgrade above and by
// `importFinanceDatabaseJson`/`mergeFinanceDatabaseJson`, which still need to
// accept a Drive backup taken before this migration existed.

/** RECURRING Plan from a pre-v5 PlannedPayment row (same id, so any
 *  Transaction.planId pointing at it keeps resolving). */
export function planFromLegacyPlannedPayment(p: PlannedPayment): Plan {
  return {
    id: p.id,
    planType: p.planKind || 'PAYMENT',
    scheduleType: 'RECURRING',
    status: p.isActive ? 'ACTIVE' : 'CANCELLED',
    title: p.title,
    provider: p.provider,
    kind: p.kind,
    amount: p.amount,
    currency: p.currency,
    categoryId: p.categoryId,
    accountId: p.accountId,
    // No separate "created on" date existed on the old row — nextDueDate is
    // the closest anchor, and startDate is cosmetic for RECURRING plans.
    startDate: p.nextDueDate,
    recurrence: p.recurrence,
    intervalDays: p.intervalDays,
    intervalUnit: p.intervalUnit,
    intervalCount: p.intervalCount,
    nextDueDate: p.nextDueDate,
    endDate: p.endDate,
    remindDaysBefore: p.remindDaysBefore,
    autoCreate: p.autoCreate,
    lastRunDate: p.lastRunDate,
    note: p.note,
    authorId: getCurrentMemberId(),
    createdAt: p.createdAt,
    updatedAt: p.createdAt,
  };
}

/** FIXED_SCHEDULE Plan + its PlanOccurrences from a pre-v5 DebtPlan row (same ids throughout). */
export function planFromLegacyDebt(
  debt: DebtPlan,
  allInstallments: DebtInstallment[]
): { plan: Plan; occurrences: PlanOccurrence[] } {
  const own = allInstallments
    .filter((i) => i.debtId === debt.id)
    .sort((a, b) => a.index - b.index);
  const paid = own.filter((i) => i.isPaid);
  const paidAmount = Math.round(paid.reduce((sum, i) => sum + i.amount, 0) * 100) / 100;

  const plan: Plan = {
    id: debt.id,
    planType: debt.kind,
    scheduleType: 'FIXED_SCHEDULE',
    status: own.length > 0 && paid.length === own.length ? 'COMPLETED' : 'ACTIVE',
    title: debt.title,
    merchant: debt.merchant,
    kind: 'EXPENSE',
    amount: debt.totalAmount,
    currency: debt.currency,
    categoryId: debt.categoryId,
    accountId: debt.accountId,
    startDate: debt.startDate,
    occurrencesCount: own.length,
    occurrencesPaid: paid.length,
    outstandingAmount: Math.round((debt.totalAmount - paidAmount) * 100) / 100,
    note: debt.note,
    authorId: debt.authorId,
    createdAt: debt.createdAt,
    updatedAt: debt.updatedAt,
  };

  const occurrences: PlanOccurrence[] = own.map((i) => ({
    id: i.id,
    planId: debt.id,
    index: i.index,
    dueDate: i.dueDate,
    amount: i.amount,
    currency: i.currency,
    isPaid: i.isPaid,
    paidDate: i.paidDate,
    transactionId: i.transactionId,
  }));

  return { plan, occurrences };
}

/**
 * Runs once, inside the v5 upgrade transaction: writes an auditable snapshot
 * of the legacy rows (the legacy tables themselves are never touched, so this
 * is belt-and-braces), transforms them into plans/planOccurrences, and
 * verifies the row counts before writing. A mismatch throws, which aborts the
 * whole IndexedDB version-change transaction atomically — nothing gets
 * written and the database stays on the previous version rather than
 * shipping a half-migrated state.
 */
async function migratePlannedPaymentsAndDebtsToPlans(tx: any): Promise<void> {
  const [plannedPayments, debts, debtInstallments] = await Promise.all([
    tx.table('plannedPayments').toArray() as Promise<PlannedPayment[]>,
    tx.table('debts').toArray() as Promise<DebtPlan[]>,
    tx.table('debtInstallments').toArray() as Promise<DebtInstallment[]>,
  ]);

  if (plannedPayments.length === 0 && debts.length === 0) return;

  const snapshot: PlanMigrationSnapshot = {
    id: 'v5-migration',
    createdAt: new Date().toISOString(),
    plannedPayments,
    debts,
    debtInstallments,
  };

  const recurringPlans = plannedPayments.map(planFromLegacyPlannedPayment);
  const fixedSchedule = debts.map((debt) => planFromLegacyDebt(debt, debtInstallments));
  const plans = [...recurringPlans, ...fixedSchedule.map((f) => f.plan)];
  const occurrences = fixedSchedule.flatMap((f) => f.occurrences);

  if (plans.length !== plannedPayments.length + debts.length) {
    throw new Error(
      `Plan migration checksum failed: built ${plans.length} plans from ${
        plannedPayments.length + debts.length
      } legacy rows`
    );
  }
  if (occurrences.length !== debtInstallments.length) {
    throw new Error(
      `Plan migration checksum failed: built ${occurrences.length} occurrences from ${debtInstallments.length} legacy instalments`
    );
  }

  await tx.table('planMigrationSnapshots').put(snapshot);
  if (plans.length > 0) await tx.table('plans').bulkPut(plans);
  if (occurrences.length > 0) await tx.table('planOccurrences').bulkPut(occurrences);
}

/**
 * Recovery path, callable any time: rebuilds `plans`/`planOccurrences` from
 * scratch out of the still-intact legacy tables (the v5 migration never
 * clears plannedPayments/debts/debtInstallments). Only overwrites rows whose
 * id matches a legacy row — plans created after the migration are untouched.
 */
export async function rebuildPlansFromLegacyTables(): Promise<{
  plans: number;
  occurrences: number;
}> {
  const [plannedPayments, debts, debtInstallments] = await Promise.all([
    financeDb.plannedPayments.toArray(),
    financeDb.debts.toArray(),
    financeDb.debtInstallments.toArray(),
  ]);

  const recurringPlans = plannedPayments.map(planFromLegacyPlannedPayment);
  const fixedSchedule = debts.map((debt) => planFromLegacyDebt(debt, debtInstallments));
  const plans = [...recurringPlans, ...fixedSchedule.map((f) => f.plan)];
  const occurrences = fixedSchedule.flatMap((f) => f.occurrences);

  await financeDb.transaction('rw', [financeDb.plans, financeDb.planOccurrences], async () => {
    if (plans.length > 0) await financeDb.plans.bulkPut(plans);
    if (occurrences.length > 0) await financeDb.planOccurrences.bulkPut(occurrences);
  });

  return { plans: plans.length, occurrences: occurrences.length };
}

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
  language: 'ru',
  speechLocale: 'ru-RU',
  budgetRolloverEnabled: false,
  notifyAtPercent: [80, 100],
  plannedPaymentAutoCreate: false,
  vatEnabled: false,
  vatRate: 18,
  vatSeparateByDefault: true,
  showTransactionAuthor: true,
  pinEnabled: false,
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
  if (!category) return { deleted: false, reason: tr('dbx.categoryNotFound') };

  if (category.isSystem) {
    await financeDb.categories.update(id, { isHidden: true });
    return { deleted: false, reason: tr('dbx.systemHidden') };
  }

  const inUse =
    (await financeDb.transactions.where('categoryId').equals(id).count()) +
    (await financeDb.transactions.where('subcategoryId').equals(id).count());

  if (inUse > 0) {
    await financeDb.categories.update(id, { isHidden: true });
    return {
      deleted: false,
      reason: `${tr('dbx.categoryInUseA')} ${inUse} ${tr('dbx.categoryInUseB')}`,
    };
  }

  const children = await financeDb.categories.where('parentId').equals(id).toArray();
  for (const child of children) {
    await financeDb.categories.delete(child.id);
  }
  await financeDb.categories.delete(id);
  return { deleted: true };
}

// ------------------------------------------------------------------ plans
//
// One entry point for every "known future expense/income": a subscription
// that repeats forever (`addRecurringPlan`), or a purchase/tax/loan/cheque
// paid off in a fixed number of instalments (`addFixedSchedulePlan`). See the
// comment on `Plan` in @/types for the full picture — "Планы", "Долги",
// "Подписки", "Кредиты", "Рассрочки", "Налоги" are filters over this one
// table, not separate entities.

export interface NewRecurringPlanInput {
  planType: PlanType;
  title: string;
  provider?: string;
  kind: Transaction['kind'];
  amount: number;
  currency: CurrencyCode;
  categoryId: string;
  accountId: string;
  recurrence: PlannedPayment['recurrence'];
  intervalDays?: number;
  intervalUnit?: RecurrenceUnit;
  intervalCount?: number;
  nextDueDate: string;
  endDate?: string;
  remindDaysBefore: number;
  autoCreate: boolean;
  note?: string;
}

export async function addRecurringPlan(input: NewRecurringPlanInput): Promise<Plan> {
  const now = new Date().toISOString();
  const plan: Plan = {
    ...input,
    id: newId('plan'),
    scheduleType: 'RECURRING',
    status: 'ACTIVE',
    startDate: input.nextDueDate,
    authorId: getCurrentMemberId(),
    createdAt: now,
    updatedAt: now,
  };
  await financeDb.plans.put(plan);
  return plan;
}

export async function updatePlan(id: string, updates: Partial<Plan>): Promise<void> {
  await financeDb.plans.update(id, { ...updates, updatedAt: new Date().toISOString() });
}

export async function cancelPlan(id: string): Promise<void> {
  await financeDb.plans.update(id, { status: 'CANCELLED', updatedAt: new Date().toISOString() });
}

export async function deletePlan(id: string): Promise<void> {
  const occurrences = await financeDb.planOccurrences.where('planId').equals(id).toArray();
  for (const occurrence of occurrences) {
    // Payments already booked stay in history: deleting the plan must not
    // rewrite money that actually left the account.
    await financeDb.planOccurrences.delete(occurrence.id);
  }
  await financeDb.plans.delete(id);
}

// -------------------------------------------------- fixed-schedule plans

export interface NewFixedSchedulePlanInput {
  planType: PlanType;
  title: string;
  merchant?: string;
  totalAmount: number;
  currency: CurrencyCode;
  categoryId: string;
  accountId: string;
  startDate: string;
  /** First payment date; defaults to the purchase date. */
  firstDueDate?: string;
  note?: string;
  paymentsCount: number;
  intervalUnit: RecurrenceUnit;
  intervalCount: number;
  /** Book the first payment as an expense today and mark it paid. */
  firstPaymentPaid: boolean;
}

export async function addFixedSchedulePlan(input: NewFixedSchedulePlanInput): Promise<Plan> {
  const now = new Date().toISOString();
  const plan: Plan = {
    id: newId('debt'),
    planType: input.planType,
    scheduleType: 'FIXED_SCHEDULE',
    status: 'ACTIVE',
    title: input.title,
    merchant: input.merchant,
    kind: 'EXPENSE',
    amount: input.totalAmount,
    currency: input.currency,
    categoryId: input.categoryId,
    accountId: input.accountId,
    startDate: input.startDate,
    occurrencesCount: input.paymentsCount,
    occurrencesPaid: 0,
    outstandingAmount: input.totalAmount,
    note: input.note,
    authorId: getCurrentMemberId(),
    createdAt: now,
    updatedAt: now,
  };
  await financeDb.plans.put(plan);

  const amounts = buildInstallmentAmounts(input.totalAmount, input.paymentsCount);
  const firstDue = input.firstDueDate || input.startDate;
  const occurrences: PlanOccurrence[] = amounts.map((amount, index) => ({
    id: newId('occ'),
    planId: plan.id,
    index: index + 1,
    // A tax or a cheque is usually one payment on a date of its own; an
    // instalment plan walks forward from that same first date.
    dueDate:
      index === 0 ? firstDue : addInterval(firstDue, input.intervalUnit, input.intervalCount * index),
    amount,
    currency: input.currency,
    isPaid: false,
  }));
  await financeDb.planOccurrences.bulkPut(occurrences);

  if (input.firstPaymentPaid && occurrences.length > 0) {
    await payPlanOccurrence(occurrences[0].id);
  }

  return plan;
}

/** Turns one scheduled payment into a real expense, marks it paid, and keeps
 *  the parent plan's cached paid-count/outstanding/status in sync. */
export async function payPlanOccurrence(
  occurrenceId: string,
  paidDate?: string
): Promise<void> {
  const occurrence = await financeDb.planOccurrences.get(occurrenceId);
  if (!occurrence || occurrence.isPaid) return;

  const plan = await financeDb.plans.get(occurrence.planId);
  if (!plan) return;

  const date = paidDate || todayIso();
  const totalCount = await financeDb.planOccurrences.where('planId').equals(plan.id).count();
  const transaction = await addTransaction({
    kind: 'EXPENSE',
    amount: occurrence.amount,
    currency: occurrence.currency,
    categoryId: plan.categoryId,
    accountId: plan.accountId,
    date,
    note: `${plan.title} · ${tr('dbx.payment')} ${occurrence.index}/${totalCount}`,
    merchant: plan.merchant,
    planId: plan.id,
    source: 'MANUAL',
  } as any);

  await financeDb.planOccurrences.update(occurrenceId, {
    isPaid: true,
    paidDate: date,
    transactionId: transaction.id,
  });
  await syncFixedSchedulePlanCache(plan.id);
}

export async function unpayPlanOccurrence(occurrenceId: string): Promise<void> {
  const occurrence = await financeDb.planOccurrences.get(occurrenceId);
  if (!occurrence) return;

  if (occurrence.transactionId) {
    await financeDb.transactions.delete(occurrence.transactionId);
  }
  await financeDb.planOccurrences.update(occurrenceId, {
    isPaid: false,
    paidDate: undefined,
    transactionId: undefined,
  });
  await syncFixedSchedulePlanCache(occurrence.planId);
}

/** Recomputes a FIXED_SCHEDULE plan's cached occurrencesPaid/outstandingAmount/
 *  status from its occurrences. Called after any occurrence changes paid state
 *  so list views can show a total without re-reading every occurrence. */
async function syncFixedSchedulePlanCache(planId: string): Promise<void> {
  const plan = await financeDb.plans.get(planId);
  if (!plan) return;
  const occurrences = await financeDb.planOccurrences.where('planId').equals(planId).toArray();
  const paid = occurrences.filter((o) => o.isPaid);
  const paidAmount = Math.round(paid.reduce((sum, o) => sum + o.amount, 0) * 100) / 100;
  await financeDb.plans.update(planId, {
    occurrencesPaid: paid.length,
    outstandingAmount: Math.round((plan.amount - paidAmount) * 100) / 100,
    status: occurrences.length > 0 && paid.length === occurrences.length ? 'COMPLETED' : 'ACTIVE',
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Live view of a FIXED_SCHEDULE plan's schedule — recomputed from its
 * occurrences rather than trusting the cached fields on `Plan`, so a screen
 * showing one plan's detail always reflects the true current state.
 */
export function describePlan(
  plan: Plan,
  allOccurrences: PlanOccurrence[],
  today = todayIso()
): PlanWithSchedule {
  const own = allOccurrences
    .filter((o) => o.planId === plan.id)
    .sort((a, b) => a.index - b.index);

  const paid = own.filter((o) => o.isPaid);
  const paidAmount = Math.round(paid.reduce((sum, o) => sum + o.amount, 0) * 100) / 100;
  const unpaid = own.filter((o) => !o.isPaid);

  return {
    plan,
    occurrences: own,
    paidAmount,
    outstandingAmount: Math.round((plan.amount - paidAmount) * 100) / 100,
    paidCount: paid.length,
    totalCount: own.length,
    nextOccurrence: unpaid[0],
    isOverdue: unpaid.some((o) => o.dueDate < today),
  };
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
    plans,
    planOccurrences,
    obligations,
    obligationSettlements,
    budgets,
    members,
    vatPayments,
    bearerCheques,
    settings,
  ] = await Promise.all([
    financeDb.accounts.toArray(),
    financeDb.categories.toArray(),
    financeDb.transactions.toArray(),
    financeDb.plans.toArray(),
    financeDb.planOccurrences.toArray(),
    financeDb.obligations.toArray(),
    financeDb.obligationSettlements.toArray(),
    financeDb.budgets.toArray(),
    financeDb.members.toArray(),
    financeDb.vatPayments.toArray(),
    financeDb.bearerCheques.toArray(),
    financeDb.settings.get('default'),
  ]);

  const payload: FinanceBackupPayload = {
    // v2: plannedPayments/debts/debtInstallments are superseded by
    // plans/planOccurrences (see the Plan migration in this file). Old
    // backups (v1) are still readable — importFinanceDatabaseJson/
    // mergeFinanceDatabaseJson transform them on the way in.
    version: 2,
    appName: 'FinTrack',
    exportedAt: new Date().toISOString(),
    deviceName: getDeviceName(),
    accounts,
    categories,
    transactions,
    plans,
    planOccurrences,
    obligations,
    obligationSettlements,
    budgets,
    members,
    vatPayments,
    bearerCheques,
    settings: settings || null,
  };

  return JSON.stringify(payload, null, 2);
}

/** Reads plans/planOccurrences from a backup, transforming a pre-v5 (v1)
 *  payload's plannedPayments/debts/debtInstallments the same way the live
 *  Dexie migration does, so restoring an old backup still works. */
function plansFromBackup(data: FinanceBackupPayload): {
  plans: Plan[];
  planOccurrences: PlanOccurrence[];
} {
  if (data.plans || data.planOccurrences) {
    return { plans: data.plans || [], planOccurrences: data.planOccurrences || [] };
  }
  const legacyInstallments = data.debtInstallments || [];
  const recurringPlans = (data.plannedPayments || []).map(planFromLegacyPlannedPayment);
  const fixedSchedule = (data.debts || []).map((debt) =>
    planFromLegacyDebt(debt, legacyInstallments)
  );
  return {
    plans: [...recurringPlans, ...fixedSchedule.map((f) => f.plan)],
    planOccurrences: fixedSchedule.flatMap((f) => f.occurrences),
  };
}

export async function importFinanceDatabaseJson(
  jsonString: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const data = JSON.parse(jsonString) as FinanceBackupPayload;
    if (data.appName !== 'FinTrack') {
      return { success: false, error: tr('dbx.notABackup') };
    }

    const { plans, planOccurrences } = plansFromBackup(data);

    await financeDb.transaction(
      'rw',
      [
        financeDb.accounts,
        financeDb.categories,
        financeDb.transactions,
        financeDb.plans,
        financeDb.planOccurrences,
        financeDb.obligations,
        financeDb.obligationSettlements,
        financeDb.budgets,
        financeDb.members,
        financeDb.vatPayments,
        financeDb.bearerCheques,
        financeDb.settings,
      ],
      async () => {
        const tables: [Table<any, string>, any[] | undefined][] = [
          [financeDb.accounts, data.accounts],
          [financeDb.categories, data.categories],
          [financeDb.transactions, data.transactions],
          [financeDb.plans, plans],
          [financeDb.planOccurrences, planOccurrences],
          [financeDb.obligations, data.obligations],
          [financeDb.obligationSettlements, data.obligationSettlements],
          [financeDb.budgets, data.budgets],
          [financeDb.members, data.members],
          [financeDb.vatPayments, data.vatPayments],
          [financeDb.bearerCheques, data.bearerCheques],
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
    return { success: false, error: err.message || tr('dbx.readFailed') };
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
      return { success: false, error: tr('dbx.notABackup') };
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

    const { plans, planOccurrences } = plansFromBackup(data);

    for (const [table, rows] of [
      [financeDb.accounts, data.accounts],
      [financeDb.categories, data.categories],
      [financeDb.plans, plans],
      [financeDb.planOccurrences, planOccurrences],
      [financeDb.obligations, data.obligations],
      [financeDb.obligationSettlements, data.obligationSettlements],
      [financeDb.budgets, data.budgets],
      [financeDb.members, data.members],
      [financeDb.vatPayments, data.vatPayments],
      [financeDb.bearerCheques, data.bearerCheques],
    ] as [Table<any, string>, any[] | undefined][]) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      await table.bulkPut(rows);
      merged += rows.length;
    }

    return { success: true, merged };
  } catch (err: any) {
    return { success: false, error: err.message || tr('dbx.readFailed') };
  }
}

export async function clearAllFinanceData(): Promise<void> {
  await Promise.all([
    financeDb.transactions.clear(),
    financeDb.plans.clear(),
    financeDb.planOccurrences.clear(),
    // A full wipe clears the frozen legacy tables too — "delete everything"
    // means everything, not just the tables the app still reads from.
    financeDb.plannedPayments.clear(),
    financeDb.debts.clear(),
    financeDb.debtInstallments.clear(),
    financeDb.planMigrationSnapshots.clear(),
    financeDb.obligations.clear(),
    financeDb.obligationSettlements.clear(),
    financeDb.budgets.clear(),
    financeDb.categories.clear(),
    financeDb.accounts.clear(),
    financeDb.members.clear(),
    financeDb.vatPayments.clear(),
    financeDb.bearerCheques.clear(),
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


// ---------------------------------------------------------------- VAT

export async function addVatPayment(
  input: Omit<VatPayment, 'id' | 'createdAt'>
): Promise<VatPayment> {
  const payment: VatPayment = {
    ...input,
    id: newId('vat'),
    createdAt: new Date().toISOString(),
  };
  await financeDb.vatPayments.put(payment);
  return payment;
}

export async function deleteVatPayment(id: string): Promise<void> {
  const payment = await financeDb.vatPayments.get(id);
  await financeDb.vatPayments.delete(id);
  if (payment?.transactionId) {
    await financeDb.transactions.delete(payment.transactionId);
  }
}

/**
 * VAT owed = what was set aside from income minus what has been remitted.
 * Income is counted net of its own VAT, so "доступная прибыль" never includes
 * money that belongs to the tax authority.
 */
export function summarizeVat(
  transactions: Transaction[],
  vatPayments: VatPayment[],
  rate: number
): VatSummary {
  const incomes = transactions.filter((t) => t.kind === 'INCOME');
  const withVat = incomes.filter((t) => (t.vatAmount || 0) > 0);

  const grossIncome = incomes.reduce((sum, t) => sum + t.baseAmount, 0);
  const accrued = withVat.reduce((sum, t) => {
    // The stored VAT is in the transaction currency; scale it the same way the
    // base amount was scaled so mixed-currency income still adds up.
    const share = t.amount > 0 ? (t.vatAmount || 0) / t.amount : 0;
    return sum + t.baseAmount * share;
  }, 0);
  const paid = vatPayments.reduce((sum, p) => sum + p.amount, 0);

  const round = (value: number) => Math.round(value * 100) / 100;

  return {
    rate,
    accrued: round(accrued),
    paid: round(paid),
    outstanding: round(accrued - paid),
    grossIncome: round(grossIncome),
    netIncome: round(grossIncome - accrued),
    incomeCount: withVat.length,
  };
}


// ------------------------------------------------------------------- debts

function addInterval(dateStr: string, unit: RecurrenceUnit, count: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);

  if (unit === 'DAY') date.setDate(date.getDate() + count);
  else if (unit === 'WEEK') date.setDate(date.getDate() + count * 7);
  else if (unit === 'YEAR') date.setFullYear(date.getFullYear() + count);
  else {
    // Month steps keep the day of month and clamp to shorter months, so a
    // schedule started on the 31st still lands inside February.
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + count);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(day, lastDay));
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

/**
 * Splits a total into `count` payments. Rounding lands on the first payment, so
 * the schedule always adds back up to the purchase price exactly.
 */
export function buildInstallmentAmounts(total: number, count: number): number[] {
  const safeCount = Math.max(1, Math.floor(count));
  const each = Math.floor((total / safeCount) * 100) / 100;
  const amounts = new Array(safeCount).fill(each);
  const drift = Math.round((total - each * safeCount) * 100) / 100;
  amounts[0] = Math.round((amounts[0] + drift) * 100) / 100;
  return amounts;
}

// ------------------------------------------------------ bearer cheques
// A postdated cheque drawn on the user's own account. Picking the «Чеки на
// предъявителя» category books one of these instead of an ordinary expense —
// it only becomes a real transaction once it actually clears, so the amount
// does not hit the ledger before the bank has taken it.

export interface NewBearerChequeInput {
  payee: string;
  chequeNumber?: string;
  amount: number;
  currency: CurrencyCode;
  categoryId: string;
  accountId: string;
  issueDate: string;
  dueDate: string;
  note?: string;
}

export async function addBearerCheque(input: NewBearerChequeInput): Promise<BearerCheque> {
  const now = new Date().toISOString();
  const cheque: BearerCheque = {
    id: newId('cheque'),
    payee: input.payee,
    chequeNumber: input.chequeNumber,
    amount: input.amount,
    currency: input.currency,
    categoryId: input.categoryId,
    accountId: input.accountId,
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    status: 'ISSUED',
    note: input.note,
    authorId: getCurrentMemberId(),
    createdAt: now,
    updatedAt: now,
  };
  await financeDb.bearerCheques.put(cheque);
  return cheque;
}

export async function updateBearerCheque(
  id: string,
  updates: Partial<NewBearerChequeInput>
): Promise<void> {
  await financeDb.bearerCheques.update(id, { ...updates, updatedAt: new Date().toISOString() });
}

/** Marks the cheque cleared and books the expense it represents. */
export async function clearBearerCheque(id: string, clearedDate?: string): Promise<void> {
  const cheque = await financeDb.bearerCheques.get(id);
  if (!cheque || cheque.status !== 'ISSUED') return;

  const date = clearedDate || todayIso();
  const transaction = await addTransaction({
    kind: 'EXPENSE',
    amount: cheque.amount,
    currency: cheque.currency,
    categoryId: cheque.categoryId,
    accountId: cheque.accountId,
    date,
    note: cheque.note || `${tr('bc.chequeNoun')} ${cheque.payee}`,
    merchant: cheque.payee,
    source: 'MANUAL',
  } as any);

  await financeDb.bearerCheques.update(id, {
    status: 'CLEARED' as BearerChequeStatus,
    transactionId: transaction.id,
    updatedAt: new Date().toISOString(),
  });
}

/** Reverts a clearance: deletes the booked expense and reopens the cheque. */
export async function unclearBearerCheque(id: string): Promise<void> {
  const cheque = await financeDb.bearerCheques.get(id);
  if (!cheque || cheque.status !== 'CLEARED') return;

  if (cheque.transactionId) {
    await financeDb.transactions.delete(cheque.transactionId);
  }
  await financeDb.bearerCheques.update(id, {
    status: 'ISSUED' as BearerChequeStatus,
    transactionId: undefined,
    updatedAt: new Date().toISOString(),
  });
}

export async function cancelBearerCheque(id: string): Promise<void> {
  const cheque = await financeDb.bearerCheques.get(id);
  if (!cheque || cheque.status === 'CLEARED') return;
  await financeDb.bearerCheques.update(id, {
    status: 'CANCELLED' as BearerChequeStatus,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteBearerCheque(id: string): Promise<void> {
  const cheque = await financeDb.bearerCheques.get(id);
  if (cheque?.transactionId) {
    await financeDb.transactions.delete(cheque.transactionId);
  }
  await financeDb.bearerCheques.delete(id);
}

