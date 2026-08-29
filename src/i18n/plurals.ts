import { Language } from './dictionary';
import { getActiveLanguage } from './runtime';

/**
 * Nominative forms of the repeat units, as they read in a picker next to a
 * number («каждые 2 недели»). Russian and Ukrainian need three forms; the other
 * two languages fill the table with the singular and the plural.
 */
const UNIT_NOUNS: Record<Language, Record<string, [string, string, string]>> = {
  ru: {
    DAY: ['день', 'дня', 'дней'],
    WEEK: ['неделя', 'недели', 'недель'],
    MONTH: ['месяц', 'месяца', 'месяцев'],
    YEAR: ['год', 'года', 'лет'],
  },
  uk: {
    DAY: ['день', 'дні', 'днів'],
    WEEK: ['тиждень', 'тижні', 'тижнів'],
    MONTH: ['місяць', 'місяці', 'місяців'],
    YEAR: ['рік', 'роки', 'років'],
  },
  en: {
    DAY: ['day', 'days', 'days'],
    WEEK: ['week', 'weeks', 'weeks'],
    MONTH: ['month', 'months', 'months'],
    YEAR: ['year', 'years', 'years'],
  },
  he: {
    DAY: ['יום', 'ימים', 'ימים'],
    WEEK: ['שבוע', 'שבועות', 'שבועות'],
    MONTH: ['חודש', 'חודשים', 'חודשים'],
    YEAR: ['שנה', 'שנים', 'שנים'],
  },
};

/** Picks the form that agrees with `count` in the active language. */
export function unitNoun(unit: string, count: number): string {
  const language = getActiveLanguage();
  const forms = UNIT_NOUNS[language][unit] || UNIT_NOUNS.ru[unit];
  if (language === 'ru' || language === 'uk') {
    const mod10 = Math.abs(count) % 10;
    const mod100 = Math.abs(count) % 100;
    if (mod10 === 1 && mod100 !== 11) return forms[0];
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
    return forms[2];
  }
  return count === 1 ? forms[0] : forms[1];
}
