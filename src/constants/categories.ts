import {
  Baby,
  Home,
  Sparkles,
  HeartPulse,
  Dumbbell,
  UtensilsCrossed,
  ShoppingBasket,
  Plug,
  Car,
  Bus,
  GraduationCap,
  Receipt,
  Gift,
  Repeat,
  ShoppingBag,
  Shirt,
  Plane,
  Clapperboard,
  Palette,
  Users,
  SlidersHorizontal,
  CircleDashed,
  Wallet,
  Landmark,
  PiggyBank,
  FileCheck2,
  Banknote,
  Building2,
  ShieldCheck,
  HardHat,
  UserRound,
  CreditCard,
  type LucideIcon,
} from 'lucide-react';
import {
  CurrencyCode,
  CurrencyDefinition,
  FinanceCategory,
  PayeeKind,
  TransactionKind,
} from '@/types';

export const CURRENCIES: Record<CurrencyCode, CurrencyDefinition> = {
  ILS: { code: 'ILS', symbol: '₪', name: 'Шекель' },
  USD: { code: 'USD', symbol: '$', name: 'Доллар США' },
  EUR: { code: 'EUR', symbol: '€', name: 'Евро' },
};

export const CURRENCY_LIST: CurrencyDefinition[] = [
  CURRENCIES.ILS,
  CURRENCIES.USD,
  CURRENCIES.EUR,
];

/** Fallback rates (1 unit of key = N ILS) used until the user edits them. */
export const DEFAULT_EXCHANGE_RATES: Record<CurrencyCode, number> = {
  ILS: 1,
  USD: 3.7,
  EUR: 4.0,
};

/**
 * Icon registry — categories persist the icon *name* so a custom category
 * created by the user survives a backup/restore round trip.
 */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Baby,
  Home,
  Sparkles,
  HeartPulse,
  Dumbbell,
  UtensilsCrossed,
  ShoppingBasket,
  Plug,
  Car,
  Bus,
  GraduationCap,
  Receipt,
  Gift,
  Repeat,
  ShoppingBag,
  Shirt,
  Plane,
  Clapperboard,
  Palette,
  Users,
  SlidersHorizontal,
  CircleDashed,
  Wallet,
  Landmark,
  PiggyBank,
  FileCheck2,
  Banknote,
  Building2,
  ShieldCheck,
  HardHat,
  UserRound,
  CreditCard,
};

export function getCategoryIcon(iconName: string): LucideIcon {
  return CATEGORY_ICONS[iconName] || CircleDashed;
}

/** Palette offered when creating or recolouring a category. */
export const CATEGORY_COLORS = [
  '#F43F5E',
  '#EC4899',
  '#A855F7',
  '#6366F1',
  '#3B82F6',
  '#0EA5E9',
  '#06B6D4',
  '#14B8A6',
  '#10B981',
  '#84CC16',
  '#EAB308',
  '#F59E0B',
  '#F97316',
  '#78716C',
  '#64748B',
];

interface CategorySeed {
  key: string;
  name: string;
  iconName: string;
  colorHex: string;
  /** Pinned position; defaults to the seed's index in the list. */
  order?: number;
  children?: { key: string; name: string }[];
}

const EXPENSE_SEEDS: CategorySeed[] = [
  { key: 'kids', name: 'Дети', iconName: 'Baby', colorHex: '#EC4899' },
  { key: 'home', name: 'Дом/уют', iconName: 'Home', colorHex: '#A855F7' },
  { key: 'selfcare', name: 'Забота о себе', iconName: 'Sparkles', colorHex: '#F43F5E' },
  { key: 'health', name: 'Здоровье', iconName: 'HeartPulse', colorHex: '#EF4444' },
  { key: 'sport', name: 'Спорт', iconName: 'Dumbbell', colorHex: '#10B981' },
  {
    key: 'cafe',
    name: 'Кафе и рестораны',
    iconName: 'UtensilsCrossed',
    colorHex: '#F97316',
  },
  {
    key: 'groceries',
    name: 'Продукты',
    iconName: 'ShoppingBasket',
    colorHex: '#84CC16',
    children: [
      { key: 'groceries_super', name: 'Супермаркет' },
      { key: 'groceries_market', name: 'Рынок' },
    ],
  },
  { key: 'utilities', name: 'Коммуналка', iconName: 'Plug', colorHex: '#0EA5E9' },
  {
    key: 'car',
    name: 'Машина',
    iconName: 'Car',
    colorHex: '#64748B',
    children: [
      { key: 'car_fuel', name: 'Бензин' },
      { key: 'car_service', name: 'Сервис и ремонт' },
      { key: 'car_insurance', name: 'Страховка' },
    ],
  },
  { key: 'transport', name: 'Транспорт', iconName: 'Bus', colorHex: '#3B82F6' },
  { key: 'education', name: 'Образование', iconName: 'GraduationCap', colorHex: '#6366F1' },
  { key: 'fees', name: 'Платежи, комиссии', iconName: 'Receipt', colorHex: '#78716C' },
  { key: 'gifts', name: 'Подарки', iconName: 'Gift', colorHex: '#F43F5E' },
  { key: 'subscriptions', name: 'Подписки', iconName: 'Repeat', colorHex: '#8B5CF6' },
  { key: 'shopping', name: 'Покупки', iconName: 'ShoppingBag', colorHex: '#EAB308' },
  {
    key: 'clothing',
    name: 'Одежда',
    iconName: 'Shirt',
    colorHex: '#F472B6',
    order: 155,
    children: [
      { key: 'clothing_shoes', name: 'Обувь' },
      { key: 'clothing_kids', name: 'Детская одежда' },
      { key: 'clothing_accessories', name: 'Аксессуары' },
    ],
  },
  { key: 'travel', name: 'Путешествия', iconName: 'Plane', colorHex: '#06B6D4' },
  { key: 'entertainment', name: 'Развлечения', iconName: 'Clapperboard', colorHex: '#D946EF' },
  { key: 'leisure', name: 'Досуг', iconName: 'Palette', colorHex: '#F59E0B' },
  { key: 'family', name: 'Семья', iconName: 'Users', colorHex: '#14B8A6' },
  {
    key: 'adjustment',
    name: 'Корректировка',
    iconName: 'SlidersHorizontal',
    colorHex: '#94A3B8',
  },
  { key: 'other_expense', name: 'Другое', iconName: 'CircleDashed', colorHex: '#64748B' },
];

const INCOME_SEEDS: CategorySeed[] = [
  { key: 'salary', name: 'Зарплата', iconName: 'Wallet', colorHex: '#10B981' },
  { key: 'gift_income', name: 'Подарок', iconName: 'Gift', colorHex: '#EC4899' },
  { key: 'deposit_interest', name: 'Проценты по вкладам', iconName: 'PiggyBank', colorHex: '#0EA5E9' },
  {
    key: 'obligation_settlement',
    name: 'Погашение расписки/чека',
    iconName: 'FileCheck2',
    colorHex: '#8B5CF6',
  },
  { key: 'other_income', name: 'Другое', iconName: 'Banknote', colorHex: '#64748B' },
];

/** Stable id for the income category that bearer-cheque settlements post to. */
export const OBLIGATION_INCOME_CATEGORY_ID = 'cat-obligation_settlement';
export const ADJUSTMENT_CATEGORY_ID = 'cat-adjustment';
export const FALLBACK_EXPENSE_CATEGORY_ID = 'cat-other_expense';
export const FALLBACK_INCOME_CATEGORY_ID = 'cat-other_income';

function buildSeedCategories(seeds: CategorySeed[], kind: TransactionKind): FinanceCategory[] {
  const now = new Date().toISOString();
  const out: FinanceCategory[] = [];
  seeds.forEach((seed, index) => {
    const id = `cat-${seed.key}`;
    out.push({
      id,
      name: seed.name,
      kind,
      iconName: seed.iconName,
      colorHex: seed.colorHex,
      isSystem: true,
      isHidden: false,
      sortOrder: seed.order ?? index * 10,
      createdAt: now,
    });
    (seed.children || []).forEach((child, childIndex) => {
      out.push({
        id: `cat-${child.key}`,
        name: child.name,
        kind,
        iconName: seed.iconName,
        colorHex: seed.colorHex,
        parentId: id,
        isSystem: true,
        isHidden: false,
        sortOrder: (seed.order ?? index * 10) + childIndex + 1,
        createdAt: now,
      });
    });
  });
  return out;
}

export function buildDefaultCategories(): FinanceCategory[] {
  return [
    ...buildSeedCategories(EXPENSE_SEEDS, 'EXPENSE'),
    ...buildSeedCategories(INCOME_SEEDS, 'INCOME'),
  ];
}

export const PAYEE_KIND_OPTIONS: {
  kind: PayeeKind;
  label: string;
  iconName: string;
}[] = [
  { kind: 'LANDLORD', label: 'Арендодатель (аренда жилья)', iconName: 'Building2' },
  { kind: 'TAX_AUTHORITY', label: 'Налоговое управление', iconName: 'Landmark' },
  { kind: 'INSURANCE', label: 'Страховая компания', iconName: 'ShieldCheck' },
  { kind: 'CONTRACTOR', label: 'Подрядчик', iconName: 'HardHat' },
  { kind: 'THIRD_PARTY', label: 'Третье лицо', iconName: 'UserRound' },
  { kind: 'CUSTOM', label: 'Другое (свой вариант)', iconName: 'CircleDashed' },
];

export function payeeKindLabel(kind: PayeeKind): string {
  return PAYEE_KIND_OPTIONS.find((o) => o.kind === kind)?.label || 'Другое';
}

export const ACCOUNT_KIND_LABELS: Record<string, string> = {
  CASH: 'Наличные',
  CARD: 'Карта',
  BANK: 'Счёт в банке',
  SAVINGS: 'Накопления',
};

export const ACCOUNT_KIND_ICONS: Record<string, string> = {
  CASH: 'Banknote',
  CARD: 'CreditCard',
  BANK: 'Landmark',
  SAVINGS: 'PiggyBank',
};

export const MEMBER_COLORS = ['#0EA5E9', '#F97316', '#8B5CF6', '#10B981'];

/**
 * Keyword → category key map used by the voice parser. Kept next to the seeds
 * so a renamed category still resolves through its stable key.
 */
export const VOICE_CATEGORY_KEYWORDS: { categoryKey: string; words: string[] }[] = [
  { categoryKey: 'cafe', words: ['кафе', 'ресторан', 'кофе', 'обед', 'ужин', 'бар', 'cafe', 'restaurant', 'coffee', 'קפה', 'מסעדה'] },
  { categoryKey: 'groceries', words: ['продукт', 'магазин', 'супермаркет', 'еда', 'рынок', 'grocer', 'supermarket', 'food', 'סופר', 'מכולת'] },
  { categoryKey: 'transport', words: ['транспорт', 'автобус', 'такси', 'метро', 'поезд', 'taxi', 'bus', 'train', 'אוטובוס', 'מונית'] },
  { categoryKey: 'car', words: ['бензин', 'заправк', 'машин', 'парковк', 'fuel', 'gas', 'parking', 'דלק', 'חניה'] },
  { categoryKey: 'health', words: ['аптек', 'врач', 'лекарств', 'здоров', 'pharmacy', 'doctor', 'health', 'בית מרקחת', 'רופא'] },
  { categoryKey: 'sport', words: ['спорт', 'зал', 'фитнес', 'бассейн', 'gym', 'sport', 'חדר כושר'] },
  { categoryKey: 'utilities', words: ['коммуналк', 'электричеств', 'вода', 'газ', 'интернет', 'utility', 'electric', 'חשמל', 'ארנונה'] },
  { categoryKey: 'kids', words: ['дет', 'садик', 'школ', 'ребен', 'kids', 'child', 'ילד', 'גן'] },
  { categoryKey: 'entertainment', words: ['развлеч', 'кино', 'театр', 'концерт', 'cinema', 'movie', 'קולנוע'] },
  { categoryKey: 'clothing', words: ['одежд', 'обув', 'куртк', 'плать', 'джинс', 'clothes', 'shoes', 'בגדים', 'נעליים'] },
  { categoryKey: 'shopping', words: ['покупк', 'shopping', 'קניות'] },
  { categoryKey: 'travel', words: ['путешеств', 'отпуск', 'билет', 'отель', 'travel', 'hotel', 'flight', 'טיסה', 'מלון'] },
  { categoryKey: 'subscriptions', words: ['подписк', 'netflix', 'spotify', 'subscription', 'מנוי'] },
  { categoryKey: 'education', words: ['образован', 'курс', 'учеб', 'книг', 'education', 'course', 'לימודים'] },
  { categoryKey: 'gifts', words: ['подар', 'gift', 'מתנה'] },
  { categoryKey: 'home', words: ['дом', 'уют', 'мебель', 'ремонт', 'home', 'furniture', 'בית'] },
  { categoryKey: 'salary', words: ['зарплат', 'salary', 'аванс', 'משכורת'] },
  { categoryKey: 'deposit_interest', words: ['процент', 'вклад', 'interest', 'ריבית'] },
];

/** Merchant/receipt hints the receipt parser maps onto a category key. */
export const RECEIPT_CATEGORY_HINTS: { categoryKey: string; words: string[] }[] = [
  { categoryKey: 'groceries', words: ['супер', 'super', 'market', 'שופרסל', 'רמי לוי', 'ויקטורי', 'yohananof', 'grocery', 'продукты'] },
  { categoryKey: 'cafe', words: ['cafe', 'кафе', 'restaurant', 'ресторан', 'pizza', 'burger', 'קפה', 'מסעדה'] },
  { categoryKey: 'car', words: ['paz', 'delek', 'sonol', 'fuel', 'бензин', 'дор алон', 'דלק', 'פז'] },
  { categoryKey: 'health', words: ['pharm', 'аптек', 'super-pharm', 'сперфарм', 'clalit', 'maccabi', 'בית מרקחת', 'סופר פארם'] },
  { categoryKey: 'utilities', words: ['electric', 'חשמל', 'water', 'мэй', 'arnona', 'ארנונה', 'bezeq', 'hot', 'partner'] },
  { categoryKey: 'clothing', words: ['fashion', 'zara', 'castro', 'renuar', 'fox', 'одежд', 'h&m', 'shoes'] },
  { categoryKey: 'shopping', words: ['ikea', 'ace', 'покупк'] },
  { categoryKey: 'transport', words: ['rav kav', 'רב קו', 'egged', 'dan', 'такси', 'gett', 'yango'] },
];
