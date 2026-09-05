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
  TrendingUp,
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
  FileSignature,
  Scale,
  Smartphone,
  Sofa,
  Briefcase,
  type LucideIcon,
} from 'lucide-react';
import {
  CreatableDebtKind,
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
  TrendingUp,
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
  FileSignature,
  Banknote,
  Building2,
  ShieldCheck,
  HardHat,
  UserRound,
  CreditCard,
  Scale,
  Smartphone,
  Sofa,
  Briefcase,
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
  {
    key: 'kids',
    name: 'Дети',
    iconName: 'Baby',
    colorHex: '#EC4899',
    children: [
      { key: 'kids_daycare', name: 'Детский сад' },
      { key: 'kids_school', name: 'Школа' },
      { key: 'kids_clubs', name: 'Кружки' },
      { key: 'kids_toys', name: 'Игрушки' },
      { key: 'kids_health', name: 'Здоровье детей' },
      { key: 'kids_nanny', name: 'Няня' },
      { key: 'kids_other', name: 'Прочее' },
    ],
  },
  {
    key: 'home',
    name: 'Дом/уют',
    iconName: 'Home',
    colorHex: '#A855F7',
    children: [
      { key: 'home_rent', name: 'Аренда' },
      { key: 'home_mortgage', name: 'Ипотека' },
      { key: 'home_repair', name: 'Ремонт' },
      { key: 'home_furniture', name: 'Мебель' },
      { key: 'home_appliances', name: 'Бытовая техника' },
      { key: 'home_supplies', name: 'Хозяйственные товары' },
      { key: 'home_other', name: 'Прочее по жилью' },
    ],
  },
  {
    key: 'selfcare',
    name: 'Забота о себе',
    iconName: 'Sparkles',
    colorHex: '#F43F5E',
    children: [
      { key: 'selfcare_cosmetics', name: 'Косметика' },
      { key: 'selfcare_hairdresser', name: 'Парикмахер' },
      { key: 'selfcare_grooming', name: 'Уход' },
      { key: 'selfcare_other', name: 'Прочее' },
    ],
  },
  {
    key: 'health',
    name: 'Здоровье',
    iconName: 'HeartPulse',
    colorHex: '#EF4444',
    children: [
      { key: 'health_doctor', name: 'Врач' },
      { key: 'health_dental', name: 'Стоматология' },
      { key: 'health_tests', name: 'Анализы' },
      { key: 'health_meds', name: 'Лекарства' },
      { key: 'health_insurance', name: 'Страховка здоровья' },
      { key: 'health_therapy', name: 'Психотерапия' },
      { key: 'health_glasses', name: 'Очки / линзы' },
      { key: 'health_procedures', name: 'Процедуры' },
      { key: 'health_other', name: 'Прочее' },
    ],
  },
  { key: 'sport', name: 'Спорт', iconName: 'Dumbbell', colorHex: '#10B981' },
  {
    key: 'cafe',
    name: 'Кафе и рестораны',
    iconName: 'UtensilsCrossed',
    colorHex: '#F97316',
    children: [
      { key: 'cafe_delivery', name: 'Доставка еды' },
      { key: 'cafe_coffee', name: 'Кофе' },
      { key: 'cafe_snacks', name: 'Перекусы' },
      { key: 'cafe_work', name: 'Еда на работе' },
      { key: 'cafe_other', name: 'Прочее' },
    ],
  },
  {
    key: 'groceries',
    name: 'Продукты',
    iconName: 'ShoppingBasket',
    colorHex: '#84CC16',
    children: [
      { key: 'groceries_super', name: 'Супермаркет' },
      { key: 'groceries_market', name: 'Рынок' },
      { key: 'groceries_produce', name: 'Овощи и фрукты' },
      { key: 'groceries_meat_fish', name: 'Мясо и рыба' },
      { key: 'groceries_dairy', name: 'Молочные продукты' },
      { key: 'groceries_bakery', name: 'Хлеб и выпечка' },
      { key: 'groceries_drinks', name: 'Напитки' },
      { key: 'groceries_snacks', name: 'Сладости и снеки' },
      { key: 'groceries_frozen', name: 'Заморозка' },
      { key: 'groceries_baby', name: 'Детское питание / товары' },
      { key: 'groceries_delivery', name: 'Доставка продуктов' },
      { key: 'groceries_alcohol', name: 'Алкоголь' },
      { key: 'groceries_other', name: 'Другое' },
    ],
  },
  {
    key: 'utilities',
    name: 'Коммуналка',
    iconName: 'Plug',
    colorHex: '#0EA5E9',
    children: [
      { key: 'utilities_electricity', name: 'Электричество' },
      { key: 'utilities_water', name: 'Вода' },
      { key: 'utilities_gas', name: 'Газ' },
      { key: 'utilities_intercom', name: 'Домофон / охрана' },
    ],
  },
  {
    key: 'communication',
    name: 'Связь',
    iconName: 'Smartphone',
    colorHex: '#0369A1',
    children: [
      { key: 'communication_mobile', name: 'Сотовый телефон' },
      { key: 'communication_internet', name: 'Интернет' },
    ],
  },
  {
    key: 'car',
    name: 'Машина',
    iconName: 'Car',
    colorHex: '#64748B',
    children: [
      { key: 'car_fuel', name: 'Бензин' },
      { key: 'car_service', name: 'Сервис и ремонт' },
      { key: 'car_insurance', name: 'Страховка' },
      { key: 'car_wash', name: 'Мойка' },
      { key: 'car_rental', name: 'Аренда авто' },
      { key: 'car_lease', name: 'Лизинг' },
    ],
  },
  {
    key: 'transport',
    name: 'Транспорт',
    iconName: 'Bus',
    colorHex: '#3B82F6',
    children: [
      { key: 'transport_public', name: 'Общественный транспорт' },
      { key: 'transport_taxi', name: 'Такси' },
      { key: 'transport_parking', name: 'Парковка' },
      { key: 'transport_fines', name: 'Штрафы' },
      { key: 'transport_other', name: 'Прочий транспорт' },
    ],
  },
  {
    key: 'education',
    name: 'Образование',
    iconName: 'GraduationCap',
    colorHex: '#6366F1',
    children: [
      { key: 'education_courses', name: 'Курсы' },
      { key: 'education_books', name: 'Книги' },
      { key: 'education_subscriptions', name: 'Подписки для обучения' },
      { key: 'education_tutor', name: 'Репетитор' },
      { key: 'education_languages', name: 'Языки' },
      { key: 'education_professional', name: 'Профессиональное обучение' },
      { key: 'education_conferences', name: 'Конференции' },
      { key: 'education_other', name: 'Прочее обучение' },
    ],
  },
  {
    key: 'fees',
    name: 'Платежи, комиссии',
    iconName: 'Receipt',
    colorHex: '#78716C',
    children: [
      { key: 'fees_penalties', name: 'Штрафы и пени' },
      { key: 'fees_other', name: 'Прочие финансовые операции' },
    ],
  },
  {
    key: 'bearer_cheques',
    name: 'Чеки на предъявителя',
    iconName: 'FileSignature',
    colorHex: '#A855F7',
    order: 137,
  },
  {
    key: 'obligations',
    name: 'Обязательства',
    iconName: 'Scale',
    colorHex: '#7C3AED',
    order: 138,
    children: [
      { key: 'obligations_installment', name: 'Рассрочка' },
      { key: 'obligations_loan', name: 'Кредит' },
      { key: 'obligations_tax', name: 'Налог' },
      { key: 'obligations_debt', name: 'Долг' },
      { key: 'obligations_insurance', name: 'Страховой платёж' },
      { key: 'obligations_contract', name: 'Платёж по договору' },
      { key: 'obligations_legal', name: 'Судебный / юридический платёж' },
      { key: 'obligations_other', name: 'Другое' },
    ],
  },
  {
    key: 'taxes',
    name: 'Налоги',
    iconName: 'Landmark',
    colorHex: '#B45309',
    order: 135,
    children: [
      { key: 'taxes_vat', name: 'НДС' },
      { key: 'taxes_authority', name: 'Налоговая' },
      { key: 'taxes_social', name: 'Социальное страхование' },
      { key: 'taxes_property', name: 'Налог на недвижимость' },
    ],
  },
  { key: 'gifts', name: 'Подарки', iconName: 'Gift', colorHex: '#F43F5E' },
  {
    key: 'subscriptions',
    name: 'Подписки',
    iconName: 'Repeat',
    colorHex: '#8B5CF6',
    children: [
      { key: 'subscriptions_cloud', name: 'Облачные сервисы' },
      { key: 'subscriptions_music', name: 'Музыка' },
      { key: 'subscriptions_video', name: 'Видео' },
      { key: 'subscriptions_software', name: 'Софт' },
      { key: 'subscriptions_ai', name: 'AI-инструменты' },
      { key: 'subscriptions_hosting', name: 'Хостинг / домены' },
      { key: 'subscriptions_banking', name: 'Банковские сервисы' },
      { key: 'subscriptions_other', name: 'Прочие подписки' },
    ],
  },
  {
    key: 'investments',
    name: 'Инвестиции',
    iconName: 'TrendingUp',
    colorHex: '#059669',
    order: 145,
    children: [
      { key: 'investments_market', name: 'Акции и фонды' },
      { key: 'investments_pension', name: 'Пенсия и накопления' },
      { key: 'investments_crypto', name: 'Криптовалюта' },
      { key: 'investments_savings', name: 'Накопления' },
    ],
  },
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
      { key: 'clothing_repair', name: 'Ремонт одежды' },
    ],
  },
  {
    key: 'travel',
    name: 'Путешествия',
    iconName: 'Plane',
    colorHex: '#06B6D4',
    children: [
      { key: 'travel_hotels', name: 'Отели' },
      { key: 'travel_tickets', name: 'Билеты' },
      { key: 'travel_excursions', name: 'Экскурсии' },
    ],
  },
  {
    key: 'entertainment',
    name: 'Развлечения',
    iconName: 'Clapperboard',
    colorHex: '#D946EF',
    children: [
      { key: 'entertainment_movies', name: 'Кино' },
      { key: 'entertainment_theater', name: 'Театр / концерты' },
      { key: 'entertainment_games', name: 'Игры' },
      { key: 'entertainment_other', name: 'Прочий отдых' },
    ],
  },
  {
    key: 'leisure',
    name: 'Досуг',
    iconName: 'Palette',
    colorHex: '#F59E0B',
    children: [{ key: 'leisure_hobby', name: 'Хобби' }],
  },
  { key: 'family', name: 'Семья', iconName: 'Users', colorHex: '#14B8A6' },
  {
    key: 'adjustment',
    name: 'Корректировка',
    iconName: 'SlidersHorizontal',
    colorHex: '#94A3B8',
  },
  { key: 'other_expense', name: 'Другое', iconName: 'CircleDashed', colorHex: '#64748B' },
  {
    key: 'household',
    name: 'Семья и быт',
    iconName: 'Sofa',
    colorHex: '#0D9488',
    children: [
      { key: 'household_shopping', name: 'Бытовые покупки' },
      { key: 'household_cleaning', name: 'Химия и уборка' },
      { key: 'household_services', name: 'Услуги по дому' },
      { key: 'household_laundry', name: 'Прачечная / химчистка' },
      { key: 'household_repair', name: 'Ремонт вещей' },
      { key: 'household_gifts', name: 'Подарки семье' },
      { key: 'household_documents', name: 'Документы' },
      { key: 'household_mail', name: 'Почта и доставки' },
      { key: 'household_other', name: 'Прочее по быту' },
    ],
  },
  {
    key: 'business',
    name: 'Работа и бизнес',
    iconName: 'Briefcase',
    colorHex: '#1D4ED8',
    children: [
      { key: 'business_contractors', name: 'Подрядчики' },
      { key: 'business_payroll', name: 'Зарплаты' },
      { key: 'business_software', name: 'Софт для работы' },
      { key: 'business_ads', name: 'Реклама' },
      { key: 'business_marketing', name: 'Маркетинг' },
      { key: 'business_equipment', name: 'Оборудование' },
      { key: 'business_office_rent', name: 'Аренда офиса' },
      { key: 'business_coworking', name: 'Коворкинг' },
      { key: 'business_accounting', name: 'Бухгалтерия' },
      { key: 'business_legal', name: 'Юридические услуги' },
      { key: 'business_taxes', name: 'Налоги бизнеса' },
      { key: 'business_travel', name: 'Командировки' },
      { key: 'business_training', name: 'Обучение для работы' },
      { key: 'business_other', name: 'Прочие бизнес-расходы' },
    ],
  },
];

const INCOME_SEEDS: CategorySeed[] = [
  {
    key: 'salary',
    name: 'Зарплата',
    iconName: 'Wallet',
    colorHex: '#10B981',
    children: [
      { key: 'salary_advance', name: 'Аванс' },
      { key: 'salary_bonus', name: 'Бонусы' },
      { key: 'salary_freelance', name: 'Фриланс' },
      { key: 'salary_clients', name: 'Клиентские платежи' },
    ],
  },
  { key: 'gift_income', name: 'Подарок', iconName: 'Gift', colorHex: '#EC4899' },
  {
    key: 'deposit_interest',
    name: 'Проценты по вкладам',
    iconName: 'PiggyBank',
    colorHex: '#0EA5E9',
    children: [
      { key: 'deposit_interest_investment', name: 'Инвестиционный доход' },
      { key: 'deposit_interest_rental', name: 'Аренда недвижимости' },
    ],
  },
  {
    key: 'obligation_settlement',
    name: 'Погашение расписки/чека',
    iconName: 'FileCheck2',
    colorHex: '#8B5CF6',
    children: [{ key: 'obligation_settlement_debt_return', name: 'Возврат долга' }],
  },
  {
    key: 'other_income',
    name: 'Другое',
    iconName: 'Banknote',
    colorHex: '#64748B',
    children: [
      { key: 'other_income_cashback', name: 'Кэшбек' },
      { key: 'other_income_refunds', name: 'Возвраты и компенсации' },
    ],
  },
];

/** Stable id for the income category that bearer-cheque settlements post to. */
export const OBLIGATION_INCOME_CATEGORY_ID = 'cat-obligation_settlement';
export const SUBSCRIPTION_CATEGORY_ID = 'cat-subscriptions';
export const INVESTMENT_CATEGORY_ID = 'cat-investments';
export const ADJUSTMENT_CATEGORY_ID = 'cat-adjustment';
export const BEARER_CHEQUE_CATEGORY_ID = 'cat-bearer_cheques';
export const FALLBACK_EXPENSE_CATEGORY_ID = 'cat-other_expense';
export const FALLBACK_INCOME_CATEGORY_ID = 'cat-other_income';

/** The «Обязательства» parent category — picking it (or a child below) opens
 *  the dedicated obligation flow instead of recording a plain expense. */
export const OBLIGATION_CATEGORY_ID = 'cat-obligations';
export const DEBT_KIND_BY_CATEGORY_ID: Record<string, CreatableDebtKind> = {
  'cat-obligations_installment': 'INSTALLMENT',
  'cat-obligations_loan': 'LOAN',
  'cat-obligations_tax': 'TAX',
  'cat-obligations_other': 'OTHER',
};

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
  { categoryKey: 'investments', words: ['инвестиц', 'вложил', 'акци', 'етф', 'etf', 'биржа', 'пенси', 'крипт', 'invest', 'השקעה', 'קרן'] },
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
  { categoryKey: 'subscriptions', words: ['netflix', 'spotify', 'youtube premium', 'icloud', 'google one', 'openai', 'yes', 'hot'] },
  { categoryKey: 'investments', words: ['interactive brokers', 'etoro', 'blink', 'meitav', 'altshuler', 'קרן השתלמות', 'binance'] },
];
