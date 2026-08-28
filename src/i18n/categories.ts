import { FinanceCategory } from '@/types';
import { Language } from './dictionary';

type Entry = Record<Language, string>;

/**
 * Names of the categories the app ships with. They live in the database as
 * Russian strings, so a translation is applied only while the row still carries
 * that exact default — the moment a user renames a category, their wording wins
 * in every language.
 */
const CATEGORY_NAMES: Record<string, Entry> = {
  'cat-kids': { ru: 'Дети', he: 'ילדים', uk: 'Діти', en: 'Kids' },
  'cat-home': { ru: 'Дом/уют', he: 'בית ונוחות', uk: 'Дім/затишок', en: 'Home' },
  'cat-selfcare': { ru: 'Забота о себе', he: 'טיפוח אישי', uk: 'Турбота про себе', en: 'Self-care' },
  'cat-health': { ru: 'Здоровье', he: 'בריאות', uk: "Здоров'я", en: 'Health' },
  'cat-sport': { ru: 'Спорт', he: 'ספורט', uk: 'Спорт', en: 'Sport' },
  'cat-cafe': { ru: 'Кафе и рестораны', he: 'בתי קפה ומסעדות', uk: 'Кафе й ресторани', en: 'Cafés & restaurants' },
  'cat-groceries': { ru: 'Продукты', he: 'מזון', uk: 'Продукти', en: 'Groceries' },
  'cat-groceries_super': { ru: 'Супермаркет', he: 'סופרמרקט', uk: 'Супермаркет', en: 'Supermarket' },
  'cat-groceries_market': { ru: 'Рынок', he: 'שוק', uk: 'Ринок', en: 'Market' },
  'cat-utilities': { ru: 'Коммуналка', he: 'חשבונות בית', uk: 'Комуналка', en: 'Utilities' },
  'cat-car': { ru: 'Машина', he: 'רכב', uk: 'Автомобіль', en: 'Car' },
  'cat-car_fuel': { ru: 'Бензин', he: 'דלק', uk: 'Пальне', en: 'Fuel' },
  'cat-car_service': { ru: 'Сервис и ремонт', he: 'טיפולים ותיקונים', uk: 'Сервіс і ремонт', en: 'Service & repairs' },
  'cat-car_insurance': { ru: 'Страховка', he: 'ביטוח', uk: 'Страховка', en: 'Insurance' },
  'cat-transport': { ru: 'Транспорт', he: 'תחבורה', uk: 'Транспорт', en: 'Transport' },
  'cat-education': { ru: 'Образование', he: 'לימודים', uk: 'Освіта', en: 'Education' },
  'cat-fees': { ru: 'Платежи, комиссии', he: 'תשלומים ועמלות', uk: 'Платежі, комісії', en: 'Fees & payments' },
  'cat-gifts': { ru: 'Подарки', he: 'מתנות', uk: 'Подарунки', en: 'Gifts' },
  'cat-subscriptions': { ru: 'Подписки', he: 'מנויים', uk: 'Підписки', en: 'Subscriptions' },
  'cat-investments': { ru: 'Инвестиции', he: 'השקעות', uk: 'Інвестиції', en: 'Investments' },
  'cat-investments_market': { ru: 'Акции и фонды', he: 'מניות וקרנות', uk: 'Акції та фонди', en: 'Stocks & funds' },
  'cat-investments_pension': { ru: 'Пенсия и накопления', he: 'פנסיה וחיסכון', uk: 'Пенсія та заощадження', en: 'Pension & savings' },
  'cat-investments_crypto': { ru: 'Криптовалюта', he: 'קריפטו', uk: 'Криптовалюта', en: 'Crypto' },
  'cat-shopping': { ru: 'Покупки', he: 'קניות', uk: 'Покупки', en: 'Shopping' },
  'cat-clothing': { ru: 'Одежда', he: 'ביגוד', uk: 'Одяг', en: 'Clothing' },
  'cat-clothing_shoes': { ru: 'Обувь', he: 'הנעלה', uk: 'Взуття', en: 'Shoes' },
  'cat-clothing_kids': { ru: 'Детская одежда', he: 'ביגוד ילדים', uk: 'Дитячий одяг', en: "Kids' clothing" },
  'cat-clothing_accessories': { ru: 'Аксессуары', he: 'אקססוריז', uk: 'Аксесуари', en: 'Accessories' },
  'cat-travel': { ru: 'Путешествия', he: 'נסיעות', uk: 'Подорожі', en: 'Travel' },
  'cat-entertainment': { ru: 'Развлечения', he: 'בידור', uk: 'Розваги', en: 'Entertainment' },
  'cat-leisure': { ru: 'Досуг', he: 'פנאי', uk: 'Дозвілля', en: 'Leisure' },
  'cat-family': { ru: 'Семья', he: 'משפחה', uk: "Сім'я", en: 'Family' },
  'cat-adjustment': { ru: 'Корректировка', he: 'תיקון יתרה', uk: 'Коригування', en: 'Adjustment' },
  'cat-other_expense': { ru: 'Другое', he: 'אחר', uk: 'Інше', en: 'Other' },

  'cat-salary': { ru: 'Зарплата', he: 'משכורת', uk: 'Зарплата', en: 'Salary' },
  'cat-gift_income': { ru: 'Подарок', he: 'מתנה', uk: 'Подарунок', en: 'Gift' },
  'cat-deposit_interest': { ru: 'Проценты по вкладам', he: 'ריבית על פיקדונות', uk: 'Відсотки за вкладами', en: 'Interest' },
  'cat-obligation_settlement': {
    ru: 'Погашение расписки/чека',
    he: 'פירעון שטר/צ׳ק',
    uk: 'Погашення розписки/чека',
    en: 'Note/cheque settlement',
  },
  'cat-other_income': { ru: 'Другое', he: 'אחר', uk: 'Інше', en: 'Other' },
};

/** Default account names are seeded in Russian for the same reason. */
const ACCOUNT_NAMES: Record<string, Entry> = {
  'acc-cash': { ru: 'Наличные', he: 'מזומן', uk: 'Готівка', en: 'Cash' },
  'acc-card': { ru: 'Основная карта', he: 'כרטיס ראשי', uk: 'Основна картка', en: 'Main card' },
};

function localize(
  table: Record<string, Entry>,
  id: string,
  currentName: string,
  language: Language
): string {
  const entry = table[id];
  if (!entry) return currentName;
  // Renamed by the user — their wording stands in every language.
  if (currentName !== entry.ru) return currentName;
  return entry[language] || currentName;
}

export function categoryName(category: FinanceCategory, language: Language): string {
  return localize(CATEGORY_NAMES, category.id, category.name, language);
}

export function categoryNameById(
  id: string | undefined,
  categories: FinanceCategory[],
  language: Language,
  fallback = ''
): string {
  const category = categories.find((c) => c.id === id);
  return category ? categoryName(category, language) : fallback;
}

export function accountName(account: { id: string; name: string }, language: Language): string {
  return localize(ACCOUNT_NAMES, account.id, account.name, language);
}


const ACCOUNT_KIND_LABELS: Record<string, Entry> = {
  CASH: { ru: 'Наличные', he: 'מזומן', uk: 'Готівка', en: 'Cash' },
  CARD: { ru: 'Карта', he: 'כרטיס', uk: 'Картка', en: 'Card' },
  BANK: { ru: 'Счёт в банке', he: 'חשבון בנק', uk: 'Рахунок у банку', en: 'Bank account' },
  SAVINGS: { ru: 'Накопления', he: 'חיסכון', uk: 'Заощадження', en: 'Savings' },
};

export function accountKindLabel(kind: string, language: Language): string {
  return ACCOUNT_KIND_LABELS[kind]?.[language] || kind;
}
