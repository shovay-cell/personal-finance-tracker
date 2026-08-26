/**
 * Domain model for the personal / family finance tracker.
 *
 * Everything is stored locally in IndexedDB; the Google Drive backup and the
 * Gemini receipt scan are the only two places data ever leaves the device.
 */

export type TransactionKind = 'EXPENSE' | 'INCOME';

export type CurrencyCode = 'ILS' | 'USD' | 'EUR';

export interface CurrencyDefinition {
  code: CurrencyCode;
  symbol: string;
  name: string;
}

export type AccountKind = 'CASH' | 'CARD' | 'BANK' | 'SAVINGS';

export interface FinanceAccount {
  id: string;
  name: string; // "Наличные", "Visa 4242", "Банк Леуми"
  kind: AccountKind;
  currency: CurrencyCode;
  openingBalance: number; // balance at the moment the account was created
  colorHex: string;
  isArchived: boolean;
  createdAt: string;
}

/**
 * A category is a flat record: a subcategory is just a category carrying a
 * parentId. Keeping one table avoids a second lookup on every transaction row.
 */
export interface FinanceCategory {
  id: string;
  name: string;
  kind: TransactionKind;
  /** lucide-react icon name, resolved through CATEGORY_ICONS */
  iconName: string;
  colorHex: string;
  parentId?: string;
  isSystem: boolean; // shipped default — can be hidden but not deleted
  isHidden: boolean; // hidden default categories stay out of pickers and reports filters
  sortOrder: number;
  createdAt: string;
}

/** Which fields of an AI-parsed receipt the model was not confident about. */
export type ReceiptFieldFlag = 'amount' | 'date' | 'merchant' | 'category' | 'currency';

export interface ReceiptLineItem {
  name: string;
  quantity?: number;
  price?: number;
}

export interface ReceiptScanMeta {
  merchant?: string;
  lineItems?: ReceiptLineItem[];
  rawText?: string;
  /** Fields the user still has to confirm — highlighted in the form, never auto-saved. */
  uncertainFields: ReceiptFieldFlag[];
  modelConfidence?: number; // 0..1 as reported by the model
  scannedAt: string;
}

/** One slice of a receipt split across categories (70% продукты / 30% химия). */
export interface TransactionSplit {
  categoryId: string;
  subcategoryId?: string;
  /** Amount in the transaction's own currency; slices must sum to `amount`. */
  amount: number;
  note?: string;
}

export interface Transaction {
  id: string;
  kind: TransactionKind;
  amount: number; // always positive; `kind` carries the sign
  currency: CurrencyCode;
  /** amount converted into the profile's base currency at the time of saving */
  baseAmount: number;
  exchangeRate: number; // 1 unit of `currency` in base currency
  /** Primary category; with splits it is the largest slice, kept for list rows. */
  categoryId: string;
  subcategoryId?: string;
  /** Present when the receipt was divided between categories. */
  splits?: TransactionSplit[];
  accountId: string;
  date: string; // YYYY-MM-DD
  note?: string;
  merchant?: string;
  /** data URL of the stored receipt photo (compressed) */
  receiptPhoto?: string;
  receiptScan?: ReceiptScanMeta;
  /** member id of whoever entered it — shown in lists and reports */
  authorId: string;
  /** set when the transaction was materialised from a planned payment */
  plannedPaymentId?: string;
  /** set when the transaction settles a bearer cheque obligation */
  obligationId?: string;
  source: 'MANUAL' | 'RECEIPT_SCAN' | 'VOICE' | 'PLANNED';
  createdAt: string;
  updatedAt: string;
}

export type RecurrenceKind =
  | 'ONCE'
  | 'WEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'SEMIANNUAL'
  | 'YEARLY'
  | 'CUSTOM_DAYS';

/**
 * What a scheduled entry represents. All three share the same recurrence engine
 * and book the same kind of transaction; the split only drives grouping and the
 * "постоянные траты" totals.
 */
export type PlanKind = 'PAYMENT' | 'SUBSCRIPTION' | 'INVESTMENT';

export interface PlannedPayment {
  id: string;
  title: string;
  /** Missing on rows written before subscriptions existed — treat as PAYMENT. */
  planKind?: PlanKind;
  /** Service or broker name, shown instead of a bare category for subscriptions. */
  provider?: string;
  kind: TransactionKind;
  amount: number;
  currency: CurrencyCode;
  categoryId: string;
  accountId: string;
  recurrence: RecurrenceKind;
  /** interval in days when recurrence is CUSTOM_DAYS */
  intervalDays?: number;
  /** next date the payment is due, YYYY-MM-DD */
  nextDueDate: string;
  /** stop generating occurrences after this date */
  endDate?: string;
  remindDaysBefore: number;
  /** true → create the transaction silently, false → ask the user to confirm */
  autoCreate: boolean;
  isActive: boolean;
  note?: string;
  lastRunDate?: string;
  createdAt: string;
}

/** One recurring entry with its cost normalised to a month and a year. */
export interface RecurringCostRow {
  payment: PlannedPayment;
  monthlyBase: number;
  yearlyBase: number;
}

export interface RecurringTotals {
  monthly: number;
  yearly: number;
  rows: RecurringCostRow[];
}

export type ObligationStatus = 'ISSUED' | 'PARTIALLY_SETTLED' | 'SETTLED' | 'OVERDUE';

/** Preset "issued to / issued for" buckets, plus a free-text CUSTOM option. */
export type PayeeKind =
  | 'LANDLORD'
  | 'TAX_AUTHORITY'
  | 'INSURANCE'
  | 'CONTRACTOR'
  | 'THIRD_PARTY'
  | 'CUSTOM';

export interface ObligationSettlement {
  id: string;
  obligationId: string;
  amount: number;
  currency: CurrencyCode;
  date: string; // YYYY-MM-DD
  /** photo of the supporting document that closes part of the obligation */
  documentPhoto?: string;
  receiptScan?: ReceiptScanMeta;
  note?: string;
  transactionId?: string;
  authorId: string;
  createdAt: string;
}

/** A bearer cheque / promissory note the user issued: an open liability. */
export interface Obligation {
  id: string;
  amount: number;
  currency: CurrencyCode;
  issueDate: string; // YYYY-MM-DD
  /** optional planned closing date — drives the OVERDUE status */
  dueDate?: string;
  payeeKind: PayeeKind;
  /** free-text payee when payeeKind is CUSTOM, or a refinement of the preset */
  payeeLabel: string;
  /** photo of the issued cheque / receipt itself */
  documentPhoto?: string;
  note?: string;
  status: ObligationStatus;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ObligationWithBalance {
  obligation: Obligation;
  settlements: ObligationSettlement[];
  settledAmount: number;
  outstandingAmount: number;
  status: ObligationStatus;
}

/**
 * A budget row is either the whole-month envelope (categoryId null) or a
 * per-category limit. `memberId` scopes it to one spouse; null = shared.
 */
export interface Budget {
  id: string;
  /** YYYY-MM the budget applies to */
  month: string;
  categoryId?: string;
  memberId?: string;
  limitAmount: number;
  currency: CurrencyCode;
  /** carry the unspent remainder into next month's limit */
  rolloverEnabled: boolean;
  /** amount carried in from the previous month; negative after an overspend */
  carriedOver: number;
  /** month the carry-over came from — guards against applying it twice */
  rolloverAppliedFrom?: string;
  createdAt: string;
}

/** «Доступно до конца месяца»: what is left once commitments are set aside. */
export interface SafeToSpend {
  /** Budget or income the calculation starts from. */
  planned: number;
  spent: number;
  /** Recurring payments still due before the month ends. */
  upcomingCommitted: number;
  available: number;
  daysLeft: number;
  perDay: number;
  /** How `planned` was derived, so the UI can explain the number. */
  basis: 'BUDGET' | 'INCOME' | 'NONE';
}

export interface ForecastPoint {
  date: string; // YYYY-MM-DD
  balance: number;
  /** Scheduled movements landing on this date. */
  events: ForecastEvent[];
}

export interface ForecastEvent {
  date: string;
  title: string;
  amount: number; // positive income, negative expense
  planKind: PlanKind;
  categoryId: string;
}

export interface CashFlowForecast {
  startBalance: number;
  points: ForecastPoint[];
  minimum: { date: string; balance: number };
  /** First day the projected balance goes negative, if any. */
  shortfallDate?: string;
  totalIncome: number;
  totalExpense: number;
}

export interface PacingPoint {
  day: number;
  current?: number;
  previous: number;
}

export interface PacingComparison {
  currentTotal: number;
  previousTotal: number;
  /** Positive = spending faster than the previous month by this share. */
  deltaShare: number;
  dayOfMonth: number;
  points: PacingPoint[];
  previousMonthTotal: number;
}

export interface BudgetProgress {
  budget: Budget;
  categoryName: string;
  spent: number;
  effectiveLimit: number; // limitAmount + carriedOver
  percent: number;
  level: 'OK' | 'WARNING' | 'EXCEEDED';
  remaining: number;
}

export type MemberRole = 'OWNER' | 'FULL' | 'VIEWER';

/** One of the (up to two) people sharing a single financial profile. */
export interface ProfileMember {
  id: string;
  displayName: string;
  email?: string;
  colorHex: string;
  role: MemberRole;
  isCurrentDevice: boolean;
  /** notify this member about large transactions and limit breaches */
  notifyOnLargeTransactions: boolean;
  largeTransactionThreshold: number;
  joinedAt: string;
}

export type SpeechLocale = 'ru-RU' | 'he-IL' | 'en-US';

export interface FinanceSettings {
  id: 'default'; // singleton row
  baseCurrency: CurrencyCode;
  /** manual rates: 1 unit of the key currency expressed in baseCurrency */
  exchangeRates: Record<CurrencyCode, number>;
  ratesUpdatedAt?: string;
  /** invite code a second device redeems to join this profile */
  inviteCode?: string;
  profileName: string;
  speechLocale: SpeechLocale;
  budgetRolloverEnabled: boolean;
  notifyAtPercent: number[]; // e.g. [80, 100]
  plannedPaymentAutoCreate: boolean;
  geminiApiKey?: string;
  lastBackupDate?: string;
  updatedAt: string;
}

export interface ParsedReceiptResult {
  amount?: number;
  currency?: CurrencyCode;
  date?: string; // YYYY-MM-DD
  merchant?: string;
  suggestedCategoryName?: string;
  lineItems: ReceiptLineItem[];
  rawText?: string;
  uncertainFields: ReceiptFieldFlag[];
  modelConfidence?: number;
}

/** One recognised row of a photographed bank statement. */
export interface ParsedStatementRow {
  date?: string;
  amount?: number;
  currency?: CurrencyCode;
  kind: TransactionKind;
  description?: string;
  suggestedCategoryName?: string;
  uncertainFields: ReceiptFieldFlag[];
}

export interface ParsedStatement {
  rows: ParsedStatementRow[];
  rawText?: string;
  modelConfidence?: number;
}

export interface ParsedVoiceResult {
  kind: TransactionKind;
  amount?: number;
  currency?: CurrencyCode;
  categoryId?: string;
  categoryName?: string;
  date: string;
  note?: string;
  transcript: string;
  uncertainFields: ReceiptFieldFlag[];
}

export interface CategoryBreakdownRow {
  categoryId: string;
  categoryName: string;
  colorHex: string;
  iconName: string;
  total: number;
  share: number; // 0..1 of the period total
  transactionCount: number;
}

export interface MonthlyPoint {
  month: string; // YYYY-MM
  expense: number;
  income: number;
}

export interface FinanceBackupPayload {
  version: number;
  appName: 'FinTrack';
  exportedAt: string;
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  transactions: Transaction[];
  plannedPayments: PlannedPayment[];
  obligations: Obligation[];
  obligationSettlements: ObligationSettlement[];
  budgets: Budget[];
  members: ProfileMember[];
  settings: FinanceSettings | null;
}

/** File entry returned by the Drive `appDataFolder` listing. */
export interface GoogleDriveBackupFile {
  id: string;
  name: string;
  size?: string;
  createdTime: string;
  modifiedTime: string;
}
