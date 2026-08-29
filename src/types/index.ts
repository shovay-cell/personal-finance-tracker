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
  /** set when the transaction was materialised from a plan (recurring fire or a paid occurrence) */
  planId?: string;
  /** set when the transaction settles a bearer cheque obligation */
  obligationId?: string;
  /** VAT separated from this income and owed to the tax authority */
  vatAmount?: number;
  /** VAT rate applied, kept so a later rate change cannot rewrite history */
  vatRate?: number;
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
 * @deprecated Superseded by `Plan` (scheduleType: RECURRING). Kept only so the
 * one-time migration and Drive backups taken before it can still be read.
 */
export type PlanKind = 'PAYMENT' | 'SUBSCRIPTION' | 'INVESTMENT';

/** Simple "every N days/weeks/months/years" rule set from the expense form. */
export type RecurrenceUnit = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';

/** @deprecated Superseded by `Plan` (scheduleType: RECURRING). See the note there. */
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
  /** «Повторять каждый N <unit>» — takes precedence over `recurrence` when set */
  intervalUnit?: RecurrenceUnit;
  intervalCount?: number;
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

/** @deprecated Superseded by `PlanCostRow`. */
export interface RecurringCostRow {
  payment: PlannedPayment;
  monthlyBase: number;
  yearlyBase: number;
}

/** @deprecated Superseded by `PlanTotals`. */
export interface RecurringTotals {
  monthly: number;
  yearly: number;
  rows: RecurringCostRow[];
}

/**
 * @deprecated Superseded by `Plan.planType` (scheduleType: FIXED_SCHEDULE).
 * Kept only so the one-time migration and old Drive backups can still be read.
 */
export type DebtKind = 'INSTALLMENT' | 'TAX' | 'LOAN' | 'CHEQUE';

/**
 * @deprecated Superseded by `Plan` (scheduleType: FIXED_SCHEDULE). See the note there.
 */
export interface DebtPlan {
  id: string;
  kind: DebtKind;
  title: string;
  merchant?: string;
  totalAmount: number;
  currency: CurrencyCode;
  categoryId: string;
  accountId: string;
  /** Date of the purchase / assessment. */
  startDate: string;
  note?: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

/** @deprecated Superseded by `PlanOccurrence`. */
export interface DebtInstallment {
  id: string;
  debtId: string;
  /** 1-based position in the schedule. */
  index: number;
  dueDate: string;
  amount: number;
  currency: CurrencyCode;
  isPaid: boolean;
  paidDate?: string;
  /** Expense created when the payment was marked paid. */
  transactionId?: string;
}

// ------------------------------------------------------------------ plans
//
// A `Plan` is every "known future expense/income" in one place: a
// subscription that repeats forever, or a purchase/tax/loan paid off in a
// fixed number of instalments. "Планы", "Долги", "Подписки", "Кредиты",
// "Рассрочки", "Налоги" in the UI are filters over `planType`+`scheduleType`
// on this one table, not separate entities.
//
// `scheduleType` picks which half of the fields on `Plan` apply:
//  - RECURRING drives `nextDueDate` forward virtually on each fire — no
//    stored occurrence rows, same as the old PlannedPayment.
//  - FIXED_SCHEDULE is backed by real `PlanOccurrence` rows, one per
//    payment, because each needs its own due date/amount/paid state/
//    transaction link that can't be derived from a rule.
//
// `Obligation` (bearer notes issued to someone else, settled whenever they
// are presented, partial settlements allowed) and `BearerCheque` (the
// user's own postdated cheques, issued→cleared/cancelled) stay separate
// entities on purpose — different real-world settlement mechanics, not a
// schedule variant of this one.

export type PlanScheduleType = 'RECURRING' | 'FIXED_SCHEDULE';

export type PlanType =
  | 'SUBSCRIPTION'
  | 'PAYMENT'
  | 'INVESTMENT'
  | 'INSTALLMENT'
  | 'TAX'
  | 'LOAN'
  | 'CHEQUE';

export type PlanStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface Plan {
  id: string;
  planType: PlanType;
  scheduleType: PlanScheduleType;
  status: PlanStatus;
  title: string;
  /** Service or broker name, shown instead of a bare category for subscriptions. */
  provider?: string;
  merchant?: string;
  kind: TransactionKind;
  /** RECURRING: amount per occurrence. FIXED_SCHEDULE: total amount financed. */
  amount: number;
  currency: CurrencyCode;
  categoryId: string;
  accountId: string;
  /** Purchase/assessment date for FIXED_SCHEDULE; first-due seed for RECURRING. */
  startDate: string;

  // --- RECURRING only ---
  recurrence?: RecurrenceKind;
  /** interval in days when recurrence is CUSTOM_DAYS */
  intervalDays?: number;
  /** «Повторять каждый N <unit>» — takes precedence over `recurrence` when set */
  intervalUnit?: RecurrenceUnit;
  intervalCount?: number;
  /** next date the payment is due, YYYY-MM-DD — virtual, no stored occurrence */
  nextDueDate?: string;
  /** stop generating occurrences after this date */
  endDate?: string;
  remindDaysBefore?: number;
  /** true → create the transaction silently, false → ask the user to confirm */
  autoCreate?: boolean;
  lastRunDate?: string;

  // --- FIXED_SCHEDULE only, denormalised for cheap list rendering ---
  /** Total number of scheduled payments. */
  occurrencesCount?: number;
  /** How many of those are already paid. */
  occurrencesPaid?: number;
  /** Sum of unpaid occurrences, in the plan's own currency. */
  outstandingAmount?: number;

  note?: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

/** One scheduled payment of a FIXED_SCHEDULE plan. */
export interface PlanOccurrence {
  id: string;
  planId: string;
  /** 1-based position in the schedule. */
  index: number;
  dueDate: string;
  amount: number;
  currency: CurrencyCode;
  isPaid: boolean;
  paidDate?: string;
  /** Expense created when the payment was marked paid. */
  transactionId?: string;
}

export interface PlanWithSchedule {
  plan: Plan;
  occurrences: PlanOccurrence[];
  paidAmount: number;
  outstandingAmount: number;
  paidCount: number;
  totalCount: number;
  nextOccurrence?: PlanOccurrence;
  isOverdue: boolean;
}

export interface PlanState {
  plan: Plan;
  daysUntilDue: number; // negative when overdue
  isOverdue: boolean;
  isDueToday: boolean;
  isWithinReminderWindow: boolean;
}

/** One recurring plan with its cost normalised to a month and a year. */
export interface PlanCostRow {
  plan: Plan;
  monthlyBase: number;
  yearlyBase: number;
}

export interface PlanTotals {
  monthly: number;
  yearly: number;
  rows: PlanCostRow[];
}

/** One month of the upcoming-liabilities timeline. */
export interface UpcomingMonth {
  month: string; // YYYY-MM
  total: number;
  items: UpcomingItem[];
}

export interface UpcomingItem {
  id: string;
  date: string;
  title: string;
  amount: number;
  source: 'VAT' | 'CHEQUE' | 'INSTALLMENT' | 'TAX' | 'LOAN' | 'PLANNED' | 'BEARER_CHEQUE';
  isOverdue: boolean;
}

/**
 * A postdated cheque issued from one of the user's own accounts: money that
 * will leave on a known future date, not today. Picking the «Чеки на
 * предъявителя» category in the expense form creates one of these instead of
 * an ordinary transaction; clearing it later is what turns it into one.
 * Distinct from `Obligation` (a bearer note handed to someone else, settled
 * whenever they present it) — this is a cheque drawn on the user's own
 * account with a specific expected debit date.
 */
export type BearerChequeStatus = 'ISSUED' | 'CLEARED' | 'CANCELLED';

export interface BearerCheque {
  id: string;
  payee: string;
  chequeNumber?: string;
  amount: number;
  currency: CurrencyCode;
  categoryId: string;
  accountId: string;
  issueDate: string;
  dueDate: string;
  status: BearerChequeStatus;
  note?: string;
  authorId: string;
  /** Expense created once the cheque actually clears. */
  transactionId?: string;
  createdAt: string;
  updatedAt: string;
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

export type SpeechLocale = 'ru-RU' | 'he-IL' | 'uk-UA' | 'en-US';

/** Interface language; Hebrew also switches the layout to right-to-left. */
export type UiLanguage = 'ru' | 'he' | 'uk' | 'en';

export type AuthProvider = 'GOOGLE' | 'EMAIL';

/** Who is using the app on this device. Identity is local: there is no server. */
export interface AuthSession {
  provider: AuthProvider;
  email: string;
  displayName: string;
  pictureUrl?: string;
  signedInAt: string;
}

/** A VAT remittance that clears part of the accrued liability. */
export interface VatPayment {
  id: string;
  amount: number;
  currency: CurrencyCode;
  date: string; // YYYY-MM-DD
  periodFrom?: string;
  periodTo?: string;
  note?: string;
  /** Expense transaction created alongside the remittance. */
  transactionId?: string;
  createdAt: string;
}

export interface VatSummary {
  rate: number;
  /** VAT set aside from income, in base currency. */
  accrued: number;
  paid: number;
  outstanding: number;
  /** Income net of the VAT that was set aside. */
  netIncome: number;
  grossIncome: number;
  incomeCount: number;
}

export interface FinanceSettings {
  id: 'default'; // singleton row
  baseCurrency: CurrencyCode;
  /** manual rates: 1 unit of the key currency expressed in baseCurrency */
  exchangeRates: Record<CurrencyCode, number>;
  ratesUpdatedAt?: string;
  /** invite code a second device redeems to join this profile */
  inviteCode?: string;
  profileName: string;
  language: UiLanguage;
  speechLocale: SpeechLocale;
  budgetRolloverEnabled: boolean;
  notifyAtPercent: number[]; // e.g. [80, 100]
  plannedPaymentAutoCreate: boolean;
  geminiApiKey?: string;
  lastBackupDate?: string;

  /** Set once the first-run wizard has been completed or skipped. */
  onboardingCompleted?: boolean;
  /** Signed-in identity; absent means the login screen is shown. */
  session?: AuthSession;

  /** Business VAT: separated from income the moment it is booked. */
  vatEnabled: boolean;
  /** Percent, e.g. 18 for Israel. */
  vatRate: number;
  /** Pre-tick «отделить НДС» on new income. */
  vatSeparateByDefault: boolean;

  /** Author labels on operations — on by default for a shared profile. */
  showTransactionAuthor: boolean;

  /** Optional local PIN lock; off until the user turns it on. */
  pinEnabled: boolean;
  /** SHA-256 of salt + PIN — the PIN itself is never stored. */
  pinHash?: string;
  pinSalt?: string;

  /** Daily Drive auto-backup; on by default, so absent means enabled. */
  autoBackupEnabled?: boolean;

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
  /** Friendly label of the device that created this copy, e.g. "MacBook". */
  deviceName?: string;
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  transactions: Transaction[];
  plans: Plan[];
  planOccurrences: PlanOccurrence[];
  /** @deprecated Pre-migration shape — only present in a backup taken before the Plan merge. */
  plannedPayments?: PlannedPayment[];
  /** @deprecated Pre-migration shape — only present in a backup taken before the Plan merge. */
  debts?: DebtPlan[];
  /** @deprecated Pre-migration shape — only present in a backup taken before the Plan merge. */
  debtInstallments?: DebtInstallment[];
  obligations: Obligation[];
  obligationSettlements: ObligationSettlement[];
  budgets: Budget[];
  members: ProfileMember[];
  vatPayments?: VatPayment[];
  bearerCheques?: BearerCheque[];
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
