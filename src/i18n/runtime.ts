import { Language } from './dictionary';

/**
 * The language currently displayed, kept outside React so pure formatters
 * (dates, month names) can localise without every call site threading a
 * parameter through. The provider is the only writer.
 */
let activeLanguage: Language = 'ru';

export function setActiveLanguage(language: Language): void {
  activeLanguage = language;
}

export function getActiveLanguage(): Language {
  return activeLanguage;
}

const MONTHS: Record<Language, string[]> = {
  ru: ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'],
  uk: ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'],
  en: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  he: ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'],
};

const SHORT_MONTHS: Record<Language, string[]> = {
  ru: ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'],
  uk: ['січ','лют','бер','кві','тра','чер','лип','сер','вер','жов','лис','гру'],
  en: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  he: ['ינו','פבר','מרץ','אפר','מאי','יונ','יול','אוג','ספט','אוק','נוב','דצמ'],
};

const RELATIVE: Record<Language, { today: string; yesterday: string }> = {
  ru: { today: 'Сегодня', yesterday: 'Вчера' },
  uk: { today: 'Сьогодні', yesterday: 'Вчора' },
  en: { today: 'Today', yesterday: 'Yesterday' },
  he: { today: 'היום', yesterday: 'אתמול' },
};

export function monthNames(): string[] {
  return MONTHS[activeLanguage];
}

export function shortMonthNames(): string[] {
  return SHORT_MONTHS[activeLanguage];
}

export function relativeDayNames() {
  return RELATIVE[activeLanguage];
}

/** Number locale that matches the interface language. */
export function numberLocale(): string {
  return { ru: 'ru-RU', uk: 'uk-UA', en: 'en-US', he: 'he-IL' }[activeLanguage];
}
