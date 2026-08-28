export type Language = 'ru' | 'he' | 'uk' | 'en';

export const LANGUAGES: { code: Language; label: string; nativeLabel: string; rtl?: boolean }[] = [
  { code: 'ru', label: 'Русский', nativeLabel: 'Русский' },
  { code: 'he', label: 'Иврит', nativeLabel: 'עברית', rtl: true },
  { code: 'uk', label: 'Украинский', nativeLabel: 'Українська' },
  { code: 'en', label: 'Английский', nativeLabel: 'English' },
];

export function isRtl(language: Language): boolean {
  return language === 'he';
}

/** Speech recognition locale that matches the interface language. */
export const SPEECH_LOCALE_BY_LANGUAGE: Record<Language, string> = {
  ru: 'ru-RU',
  he: 'he-IL',
  uk: 'uk-UA',
  en: 'en-US',
};

type Entry = Record<Language, string>;

/**
 * One flat dictionary keyed by a dotted id. Flat on purpose: a missing key is
 * caught by TypeScript at the call site, and adding a language is one column.
 */
export const DICTIONARY = {
  // ------------------------------------------------------------------ shell
  'nav.operations': { ru: 'Операции', he: 'תנועות', uk: 'Операції', en: 'Operations' },
  'nav.budget': { ru: 'Бюджет', he: 'תקציב', uk: 'Бюджет', en: 'Budget' },
  'nav.plans': { ru: 'Планы', he: 'תוכניות', uk: 'Плани', en: 'Plans' },
  'nav.debts': { ru: 'Долги', he: 'חובות', uk: 'Борги', en: 'Debts' },
  'nav.add': { ru: 'Добавить', he: 'הוספה', uk: 'Додати', en: 'Add' },
  'nav.reports': { ru: 'Отчёты', he: 'דוחות', uk: 'Звіти', en: 'Reports' },
  'nav.settings': { ru: 'Настройки', he: 'הגדרות', uk: 'Налаштування', en: 'Settings' },
  'nav.quickAddTitle': {
    ru: 'Быстрый ввод операции',
    he: 'הזנה מהירה של תנועה',
    uk: 'Швидке введення операції',
    en: 'Quick entry',
  },

  // ------------------------------------------------------------------ common
  'common.expense': { ru: 'Расход', he: 'הוצאה', uk: 'Витрата', en: 'Expense' },
  'common.income': { ru: 'Доход', he: 'הכנסה', uk: 'Дохід', en: 'Income' },
  'common.expenses': { ru: 'РАСХОДЫ', he: 'הוצאות', uk: 'ВИТРАТИ', en: 'EXPENSES' },
  'common.incomes': { ru: 'ДОХОДЫ', he: 'הכנסות', uk: 'ДОХОДИ', en: 'INCOME' },
  'common.amount': { ru: 'Сумма', he: 'סכום', uk: 'Сума', en: 'Amount' },
  'common.date': { ru: 'Дата', he: 'תאריך', uk: 'Дата', en: 'Date' },
  'common.category': { ru: 'Категория', he: 'קטגוריה', uk: 'Категорія', en: 'Category' },
  'common.account': { ru: 'Счёт', he: 'חשבון', uk: 'Рахунок', en: 'Account' },
  'common.note': { ru: 'Заметка', he: 'הערה', uk: 'Нотатка', en: 'Note' },
  'common.save': { ru: 'Сохранить', he: 'שמירה', uk: 'Зберегти', en: 'Save' },
  'common.cancel': { ru: 'Отмена', he: 'ביטול', uk: 'Скасувати', en: 'Cancel' },
  'common.delete': { ru: 'Удалить', he: 'מחיקה', uk: 'Видалити', en: 'Delete' },
  'common.next': { ru: 'Далее', he: 'הבא', uk: 'Далі', en: 'Next' },
  'common.back': { ru: 'Назад', he: 'חזרה', uk: 'Назад', en: 'Back' },
  'common.skip': { ru: 'Пропустить всё', he: 'לדלג על הכול', uk: 'Пропустити все', en: 'Skip all' },
  'common.create': { ru: 'Создать', he: 'יצירה', uk: 'Створити', en: 'Create' },
  'common.details': { ru: 'Детали', he: 'פרטים', uk: 'Деталі', en: 'Details' },
  'common.record': { ru: 'Записать', he: 'רישום', uk: 'Записати', en: 'Record' },
  'common.retry': { ru: 'Повторить', he: 'ניסיון נוסף', uk: 'Повторити', en: 'Retry' },
  'common.perDay': { ru: 'в день', he: 'ליום', uk: 'на день', en: 'per day' },
  'common.perMonth': { ru: 'в месяц', he: 'לחודש', uk: 'на місяць', en: 'per month' },
  'common.perYear': { ru: 'в год', he: 'לשנה', uk: 'на рік', en: 'per year' },
  'common.days': { ru: 'дн.', he: 'ימים', uk: 'дн.', en: 'days' },
  'common.today': { ru: 'Сегодня', he: 'היום', uk: 'Сьогодні', en: 'Today' },
  'common.yesterday': { ru: 'Вчера', he: 'אתמול', uk: 'Вчора', en: 'Yesterday' },

  // -------------------------------------------------------------------- auth
  'auth.tagline': {
    ru: 'Доходы и расходы, отделение НДС и совместный счёт с партнёром',
    he: 'הכנסות והוצאות, הפרדת מע״מ וניהול חשבון משותף',
    uk: 'Доходи й витрати, відокремлення ПДВ і спільний рахунок із партнером',
    en: 'Income and expenses, VAT set aside, and a shared account with a partner',
  },
  'auth.google': { ru: 'Войти через Google', he: 'כניסה עם Google', uk: 'Увійти через Google', en: 'Sign in with Google' },
  'auth.email': { ru: 'Продолжить с email', he: 'המשך עם אימייל', uk: 'Продовжити з email', en: 'Continue with email' },
  'auth.continue': { ru: 'Продолжить', he: 'המשך', uk: 'Продовжити', en: 'Continue' },
  'auth.namePlaceholder': {
    ru: 'Как вас показывать (необязательно)',
    he: 'איך להציג אותך (לא חובה)',
    uk: 'Як вас показувати (необовʼязково)',
    en: 'Display name (optional)',
  },
  'auth.googleUnavailable': {
    ru: 'Вход через Google не настроен в этом деплое — доступен вход по email.',
    he: 'כניסה עם Google אינה מוגדרת בגרסה זו — ניתן להיכנס עם אימייל.',
    uk: 'Вхід через Google не налаштований у цьому деплої — доступний вхід за email.',
    en: 'Google sign-in is not configured in this deployment — use email instead.',
  },
  'auth.privacy': {
    ru: 'Данные хранятся на устройстве. Вход нужен, чтобы подписывать операции автором, приглашать партнёра и привязывать резервную копию к вашему Google Drive.',
    he: 'הנתונים נשמרים במכשיר. הכניסה משמשת לסימון מי הזין תנועה, להזמנת שותף ולקישור הגיבוי ל‑Google Drive שלך.',
    uk: 'Дані зберігаються на пристрої. Вхід потрібен, щоб підписувати операції автором, запрошувати партнера та прив’язувати резервну копію до вашого Google Drive.',
    en: 'Data stays on your device. Signing in labels who added each operation, invites a partner and links the backup to your Google Drive.',
  },

  // --------------------------------------------------------------- quick add
  'quick.title': { ru: 'Быстрый ввод', he: 'הזנה מהירה', uk: 'Швидке введення', en: 'Quick entry' },
  'quick.subtitle': {
    ru: 'Сумма и категория — операция записана',
    he: 'סכום וקטגוריה — והתנועה נרשמה',
    uk: 'Сума й категорія — операцію записано',
    en: 'Amount and category — done',
  },
  'quick.manual': { ru: 'Вручную', he: 'ידני', uk: 'Вручну', en: 'Manual' },
  'quick.receipt': { ru: 'Чек', he: 'קבלה', uk: 'Чек', en: 'Receipt' },
  'quick.list': { ru: 'Список', he: 'רשימה', uk: 'Список', en: 'List' },
  'quick.voice': { ru: 'Голос', he: 'קול', uk: 'Голос', en: 'Voice' },
  'quick.photograph': { ru: 'Сфотографировать чек', he: 'צילום קבלה', uk: 'Сфотографувати чек', en: 'Photograph the receipt' },
  'quick.scanning': { ru: 'Gemini распознаёт чек…', he: 'Gemini מזהה את הקבלה…', uk: 'Gemini розпізнає чек…', en: 'Gemini is reading the receipt…' },
  'quick.voicePrompt': {
    ru: 'Нажмите и надиктуйте операцию',
    he: 'לחצו והכתיבו את התנועה',
    uk: 'Натисніть і продиктуйте операцію',
    en: 'Tap and dictate the operation',
  },
  'quick.listening': { ru: 'Говорите…', he: 'דברו…', uk: 'Говоріть…', en: 'Listening…' },

  // ------------------------------------------------------------ transactions
  'tx.searchPlaceholder': {
    ru: 'Поиск по заметке, продавцу, сумме',
    he: 'חיפוש לפי הערה, בית עסק או סכום',
    uk: 'Пошук за нотаткою, продавцем, сумою',
    en: 'Search by note, merchant or amount',
  },
  'tx.accounts': { ru: 'Счета и кошельки', he: 'חשבונות וארנקים', uk: 'Рахунки та гаманці', en: 'Accounts and wallets' },
  'tx.allAuthors': { ru: 'Все авторы', he: 'כל המשתמשים', uk: 'Усі автори', en: 'All authors' },
  'tx.allAccounts': { ru: 'Все счета', he: 'כל החשבונות', uk: 'Усі рахунки', en: 'All accounts' },
  'tx.emptyTitle': { ru: 'Операций пока нет', he: 'אין עדיין תנועות', uk: 'Операцій поки немає', en: 'No operations yet' },
  'tx.emptyText': {
    ru: 'Нажмите «+», чтобы записать трату за пару касаний, сфотографировать чек или надиктовать операцию голосом.',
    he: 'לחצו על «+» כדי לרשום הוצאה בשתי נגיעות, לצלם קבלה או להכתיב תנועה בקול.',
    uk: 'Натисніть «+», щоб записати витрату за пару дотиків, сфотографувати чек або продиктувати операцію голосом.',
    en: 'Tap “+” to record a spend in two taps, photograph a receipt or dictate it.',
  },
  'tx.noDescription': { ru: 'Без описания', he: 'ללא תיאור', uk: 'Без опису', en: 'No description' },

  // ---------------------------------------------------------------- settings
  'settings.profile': { ru: 'Профиль', he: 'פרופיל', uk: 'Профіль', en: 'Profile' },
  'settings.account': { ru: 'Аккаунт', he: 'חשבון משתמש', uk: 'Акаунт', en: 'Account' },
  'settings.language': { ru: 'Язык интерфейса', he: 'שפת הממשק', uk: 'Мова інтерфейсу', en: 'Interface language' },
  'settings.languageHint': {
    ru: 'Меняет язык приложения и язык голосового ввода',
    he: 'משנה את שפת האפליקציה ואת שפת ההכתבה',
    uk: 'Змінює мову застосунку та мову голосового введення',
    en: 'Changes the app language and the voice input language',
  },
  'settings.profileName': { ru: 'Название профиля', he: 'שם הפרופיל', uk: 'Назва профілю', en: 'Profile name' },
  'settings.baseCurrency': { ru: 'Базовая валюта', he: 'מטבע בסיס', uk: 'Базова валюта', en: 'Base currency' },
  'settings.baseCurrencyHint': {
    ru: 'К ней приводятся все суммы в отчётах',
    he: 'כל הסכומים בדוחות מומרים אליו',
    uk: 'До неї зводяться всі суми у звітах',
    en: 'All report amounts are converted to it',
  },
  'settings.rates': { ru: 'Курсы валют', he: 'שערי מטבע', uk: 'Курси валют', en: 'Exchange rates' },
  'settings.vat': { ru: 'НДС', he: 'מע״מ', uk: 'ПДВ', en: 'VAT' },
  'settings.vatSeparate': {
    ru: 'Отделять НДС от доходов',
    he: 'להפריד מע״מ מההכנסות',
    uk: 'Відокремлювати ПДВ від доходів',
    en: 'Set VAT aside from income',
  },
  'settings.vatRate': { ru: 'Ставка НДС, %', he: 'שיעור מע״מ, %', uk: 'Ставка ПДВ, %', en: 'VAT rate, %' },
  'settings.categories': { ru: 'Категории и подкатегории', he: 'קטגוריות ותת‑קטגוריות', uk: 'Категорії та підкатегорії', en: 'Categories and subcategories' },
  'settings.family': { ru: 'Семейный доступ', he: 'גישה משפחתית', uk: 'Сімейний доступ', en: 'Family access' },
  'settings.notifications': { ru: 'Уведомления', he: 'התראות', uk: 'Сповіщення', en: 'Notifications' },
  'settings.ai': { ru: 'ИИ-сканирование чеков', he: 'סריקת קבלות עם AI', uk: 'ШІ-сканування чеків', en: 'AI receipt scanning' },
  'settings.backup': { ru: 'Резервное копирование', he: 'גיבוי', uk: 'Резервне копіювання', en: 'Backup' },
  'settings.pin': { ru: 'Код доступа', he: 'קוד גישה', uk: 'Код доступу', en: 'Passcode' },
  'settings.pinOn': { ru: 'Включён · сменить или отключить', he: 'פעיל · שינוי או ביטול', uk: 'Увімкнено · змінити або вимкнути', en: 'On · change or turn off' },
  'settings.pinOff': {
    ru: 'Выключен · защитить вход в приложение',
    he: 'כבוי · הגנה על הכניסה לאפליקציה',
    uk: 'Вимкнено · захистити вхід у застосунок',
    en: 'Off · protect access to the app',
  },
  'settings.showAuthor': {
    ru: 'Показывать, кто добавил операцию',
    he: 'להציג מי הזין את התנועה',
    uk: 'Показувати, хто додав операцію',
    en: 'Show who added the operation',
  },
  'settings.signOut': { ru: 'Выйти', he: 'יציאה', uk: 'Вийти', en: 'Sign out' },
  'settings.dangerZone': {
    ru: 'Удалить все финансовые данные',
    he: 'מחיקת כל הנתונים הפיננסיים',
    uk: 'Видалити всі фінансові дані',
    en: 'Delete all financial data',
  },

  // -------------------------------------------------------------- onboarding
  'onboarding.hello': { ru: 'Привет', he: 'שלום', uk: 'Привіт', en: 'Hi' },
  'onboarding.introText': {
    ru: 'Коротко покажу, как здесь всё устроено, и сразу настроим главное. Это займёт минуту — любой шаг можно пропустить.',
    he: 'נראה בקצרה איך הכול עובד ונגדיר את העיקר. זה ייקח דקה — אפשר לדלג על כל שלב.',
    uk: 'Коротко покажу, як тут усе влаштовано, і одразу налаштуємо головне. Це займе хвилину — будь-який крок можна пропустити.',
    en: 'A quick tour of how things work, and the essentials set up right away. Takes a minute — any step can be skipped.',
  },
  'onboarding.start': { ru: 'Начать', he: 'להתחיל', uk: 'Почати', en: 'Get started' },
  'onboarding.haveCode': {
    ru: 'У меня есть код приглашения — присоединиться к профилю',
    he: 'יש לי קוד הזמנה — הצטרפות לפרופיל',
    uk: 'У мене є код запрошення — приєднатися до профілю',
    en: 'I have an invite code — join a profile',
  },

  // --------------------------------------------------------------- safe spend
  'safe.title': {
    ru: 'Доступно до конца месяца',
    he: 'זמין עד סוף החודש',
    uk: 'Доступно до кінця місяця',
    en: 'Available until month end',
  },
  'safe.budget': { ru: 'Бюджет', he: 'תקציב', uk: 'Бюджет', en: 'Budget' },
  'safe.spent': { ru: 'Потрачено', he: 'הוצא', uk: 'Витрачено', en: 'Spent' },
  'safe.committed': { ru: 'Обязательно', he: 'התחייבויות', uk: "Обов'язково", en: 'Committed' },

  // --------------------------------------------------------------- form
  'form.newExpense': { ru: 'Новый расход', he: 'הוצאה חדשה', uk: 'Нова витрата', en: 'New expense' },
  'form.newIncome': { ru: 'Новый доход', he: 'הכנסה חדשה', uk: 'Новий дохід', en: 'New income' },
  'form.operation': { ru: 'Операция', he: 'תנועה', uk: 'Операція', en: 'Operation' },
  'form.merchant': { ru: 'Продавец / место', he: 'בית עסק / מקום', uk: 'Продавець / місце', en: 'Merchant / place' },
  'form.subcategory': { ru: 'Подкатегория', he: 'תת‑קטגוריה', uk: 'Підкатегорія', en: 'Subcategory' },
  'form.author': { ru: 'Автор операции', he: 'מי הזין', uk: 'Автор операції', en: 'Added by' },
  'form.receipt': { ru: 'Чек', he: 'קבלה', uk: 'Чек', en: 'Receipt' },
  'form.scanAndRead': { ru: 'Снять и распознать', he: 'צילום וזיהוי', uk: 'Зняти й розпізнати', en: 'Scan & read' },
  'form.file': { ru: 'Файл', he: 'קובץ', uk: 'Файл', en: 'File' },
  'form.saveOperation': { ru: 'Записать операцию', he: 'רישום התנועה', uk: 'Записати операцію', en: 'Save operation' },
  'form.saveChanges': { ru: 'Сохранить изменения', he: 'שמירת שינויים', uk: 'Зберегти зміни', en: 'Save changes' },
  'form.deleteOperation': { ru: 'Удалить операцию', he: 'מחיקת התנועה', uk: 'Видалити операцію', en: 'Delete operation' },
  'form.uncertainHint': {
    ru: 'ИИ не уверен в подсвеченных полях — проверьте их перед сохранением',
    he: 'ה‑AI אינו בטוח בשדות המסומנים — בדקו אותם לפני השמירה',
    uk: 'ШІ не впевнений у підсвічених полях — перевірте їх перед збереженням',
    en: 'The AI is unsure about the highlighted fields — check them before saving',
  },
  'form.splitReceipt': {
    ru: 'Разделить чек между категориями',
    he: 'פיצול הקבלה בין קטגוריות',
    uk: 'Розділити чек між категоріями',
    en: 'Split the receipt between categories',
  },
  'form.repeat': { ru: 'Повторить операцию', he: 'לחזור על התנועה', uk: 'Повторити операцію', en: 'Repeat this operation' },
  'form.repeatHint': {
    ru: 'Расход будет повторяться и попадёт в прогноз бюджета',
    he: 'ההוצאה תחזור על עצמה ותיכנס לתחזית התקציב',
    uk: 'Витрата повторюватиметься й потрапить у прогноз бюджету',
    en: 'The expense will recur and feed the budget forecast',
  },
  'form.repeatEvery': { ru: 'Повторять каждый', he: 'לחזור כל', uk: 'Повторювати кожні', en: 'Repeat every' },
  'form.period': { ru: 'Период', he: 'תדירות', uk: 'Період', en: 'Period' },
  'form.asDebt': {
    ru: 'Оформить как обязательство',
    he: 'לרשום כהתחייבות',
    uk: 'Оформити як зобов’язання',
    en: 'Record as a liability',
  },
  'form.asDebtHint': {
    ru: 'Рассрочка, налог, кредит или чек — попадёт в «Долги», а не в расходы сегодня',
    he: 'תשלומים, מס, הלוואה או צ׳ק — ייכנס ל«חובות» ולא להוצאות של היום',
    uk: 'Розстрочка, податок, кредит або чек — потрапить у «Борги», а не у витрати сьогодні',
    en: 'Instalments, tax, loan or cheque — lands in Debts, not in today’s expenses',
  },
  'form.paymentsCount': { ru: 'Количество платежей', he: 'מספר תשלומים', uk: 'Кількість платежів', en: 'Number of payments' },
  'form.paymentDate': { ru: 'Дата оплаты', he: 'תאריך תשלום', uk: 'Дата оплати', en: 'Payment date' },
  'form.firstPayment': { ru: 'Первый платёж', he: 'תשלום ראשון', uk: 'Перший платіж', en: 'First payment' },
  'form.paymentsEvery': { ru: 'Платежи каждые', he: 'תשלומים כל', uk: 'Платежі кожні', en: 'Payments every' },
  'form.firstPaid': {
    ru: 'Первый платёж оплачен сейчас',
    he: 'התשלום הראשון שולם עכשיו',
    uk: 'Перший платіж сплачено зараз',
    en: 'First payment made now',
  },
  'form.alreadyPaid': { ru: 'Уже оплачено', he: 'כבר שולם', uk: 'Уже сплачено', en: 'Already paid' },
  'form.paidHint': {
    ru: 'Оплаченная часть сразу уйдёт в расходы и выйдет из долга',
    he: 'החלק ששולם ייכנס מיד להוצאות וייצא מהחוב',
    uk: 'Сплачена частина одразу піде у витрати й вийде з боргу',
    en: 'The paid part becomes an expense now and leaves the debt',
  },
  'form.vatSeparate': {
    ru: 'Отделить НДС и отложить в сторону',
    he: 'להפריד מע״מ ולהניח בצד',
    uk: 'Відокремити ПДВ і відкласти',
    en: 'Set VAT aside',
  },
  'form.profit': { ru: 'Прибыль', he: 'רווח', uk: 'Прибуток', en: 'Profit' },
  'form.schedule': { ru: 'График платежей', he: 'לוח תשלומים', uk: 'Графік платежів', en: 'Payment schedule' },

  // --------------------------------------------------------------- debts
  'debts.total': { ru: 'Всего обязательств', he: 'סך ההתחייבויות', uk: 'Усього зобов’язань', en: 'Total owed' },
  'debts.vat': { ru: 'НДС', he: 'מע״מ', uk: 'ПДВ', en: 'VAT' },
  'debts.cheques': { ru: 'Чеки', he: 'צ׳קים', uk: 'Чеки', en: 'Cheques' },
  'debts.installments': { ru: 'Рассрочка', he: 'תשלומים', uk: 'Розстрочка', en: 'Instalments' },
  'debts.taxes': { ru: 'Налоги', he: 'מסים', uk: 'Податки', en: 'Taxes' },
  'debts.loans': { ru: 'Кредиты', he: 'הלוואות', uk: 'Кредити', en: 'Loans' },
  'debts.all': { ru: 'Всё', he: 'הכול', uk: 'Усе', en: 'All' },
  'debts.byMonth': { ru: 'по месяцам', he: 'לפי חודשים', uk: 'за місяцями', en: 'by month' },
  'debts.upcoming': {
    ru: 'Предстоящие платежи по месяцам',
    he: 'תשלומים קרובים לפי חודשים',
    uk: 'Майбутні платежі за місяцями',
    en: 'Upcoming payments by month',
  },
  'debts.paid': { ru: 'Оплачено', he: 'שולם', uk: 'Сплачено', en: 'Paid' },
  'debts.left': { ru: 'осталось', he: 'נותר', uk: 'залишилось', en: 'left' },
  'debts.pay': { ru: 'Оплатить', he: 'לשלם', uk: 'Сплатити', en: 'Pay' },
  'debts.overdue': { ru: 'просрочен платёж', he: 'תשלום באיחור', uk: 'прострочений платіж', en: 'payment overdue' },
  'debts.ofPayments': { ru: 'платежей', he: 'תשלומים', uk: 'платежів', en: 'payments' },
  'debts.deleteDebt': { ru: 'Удалить обязательство', he: 'מחיקת ההתחייבות', uk: 'Видалити зобов’язання', en: 'Delete liability' },

  // -------------------------------------------------------------- budget
  'budget.monthly': { ru: 'Общий бюджет месяца', he: 'תקציב חודשי כולל', uk: 'Загальний бюджет місяця', en: 'Monthly budget' },
  'budget.limits': { ru: 'Лимиты по категориям', he: 'מגבלות לפי קטגוריה', uk: 'Ліміти за категоріями', en: 'Category limits' },
  'budget.pace': { ru: 'Темп трат', he: 'קצב ההוצאות', uk: 'Темп витрат', en: 'Spending pace' },
  'budget.set': { ru: 'Задать', he: 'הגדרה', uk: 'Задати', en: 'Set' },
  'budget.change': { ru: 'Изменить', he: 'שינוי', uk: 'Змінити', en: 'Change' },
  'budget.remaining': { ru: 'Осталось', he: 'נותר', uk: 'Залишилось', en: 'Remaining' },
  'budget.overspent': { ru: 'Перерасход', he: 'חריגה', uk: 'Перевитрата', en: 'Overspent' },

  // --------------------------------------------------------------- plans
  'plans.payments': { ru: 'ПЛАТЕЖИ', he: 'תשלומים', uk: 'ПЛАТЕЖІ', en: 'PAYMENTS' },
  'plans.subscriptions': { ru: 'ПОДПИСКИ', he: 'מנויים', uk: 'ПІДПИСКИ', en: 'SUBSCRIPTIONS' },
  'plans.investments': { ru: 'ИНВЕСТИЦИИ', he: 'השקעות', uk: 'ІНВЕСТИЦІЇ', en: 'INVESTMENTS' },
  'plans.fixedCosts': { ru: 'Постоянные траты', he: 'הוצאות קבועות', uk: 'Постійні витрати', en: 'Fixed costs' },
  'plans.saving': { ru: 'Регулярно откладываю', he: 'חיסכון קבוע', uk: 'Регулярно відкладаю', en: 'Regularly set aside' },
  'plans.calendar': { ru: 'Календарь списаний', he: 'לוח חיובים', uk: 'Календар списань', en: 'Charges calendar' },
  'plans.upcoming': { ru: 'Предстоящие', he: 'קרובים', uk: 'Майбутні', en: 'Upcoming' },
  'plans.active': { ru: 'Активные', he: 'פעילים', uk: 'Активні', en: 'Active' },

  // ------------------------------------------------------------- reports
  'reports.week': { ru: 'Неделя', he: 'שבוע', uk: 'Тиждень', en: 'Week' },
  'reports.month': { ru: 'Месяц', he: 'חודש', uk: 'Місяць', en: 'Month' },
  'reports.quarter': { ru: 'Квартал', he: 'רבעון', uk: 'Квартал', en: 'Quarter' },
  'reports.year': { ru: 'Год', he: 'שנה', uk: 'Рік', en: 'Year' },
  'reports.balance': { ru: 'Баланс', he: 'מאזן', uk: 'Баланс', en: 'Balance' },
  'reports.forecast': { ru: 'Прогноз ликвидности', he: 'תחזית נזילות', uk: 'Прогноз ліквідності', en: 'Cash flow forecast' },
  'reports.dynamics': { ru: 'Динамика по месяцам', he: 'מגמה חודשית', uk: 'Динаміка за місяцями', en: 'Monthly trend' },
  'reports.planFact': { ru: 'План / факт по бюджетам', he: 'תכנון מול ביצוע', uk: 'План / факт за бюджетами', en: 'Budget plan vs actual' },
  'reports.exportCsv': { ru: 'Экспорт CSV', he: 'ייצוא CSV', uk: 'Експорт CSV', en: 'Export CSV' },
  'reports.exportPdf': { ru: 'Отчёт PDF', he: 'דוח PDF', uk: 'Звіт PDF', en: 'PDF report' },
  'safe.setBudgetHint': {
    ru: 'Задайте месячный бюджет — и приложение посчитает дневной лимит с учётом обязательных платежей.',
    he: 'הגדירו תקציב חודשי — האפליקציה תחשב מגבלה יומית בהתחשב בתשלומים הקבועים.',
    uk: 'Задайте місячний бюджет — і застосунок порахує денний ліміт з урахуванням обов’язкових платежів.',
    en: 'Set a monthly budget and the app will work out a daily limit with committed payments deducted.',
  },
  'pace.title': { ru: 'Темп трат', he: 'קצב ההוצאות', uk: 'Темп витрат', en: 'Spending pace' },
  'pace.dayOfMonth': { ru: 'день месяца', he: 'ביום בחודש', uk: 'день місяця', en: 'day of month' },
  'pace.previousSameDay': {
    ru: 'в прошлом месяце к этому дню',
    he: 'בחודש שעבר עד יום זה',
    uk: 'у минулому місяці до цього дня',
    en: 'previous month by this day',
  },
  'pace.currentMonth': { ru: 'Текущий месяц', he: 'החודש הנוכחי', uk: 'Поточний місяць', en: 'This month' },
  'pace.previousMonth': { ru: 'Прошлый', he: 'החודש שעבר', uk: 'Минулий', en: 'Previous' },
  'pace.noData': { ru: 'нет данных', he: 'אין נתונים', uk: 'немає даних', en: 'no data' },
  'debts.emptyUpcoming': {
    ru: 'Предстоящих платежей нет',
    he: 'אין תשלומים קרובים',
    uk: 'Майбутніх платежів немає',
    en: 'No upcoming payments',
  },
  'debts.emptyUpcomingHint': {
    ru: 'Здесь появятся платежи по рассрочкам, чекам с датой закрытия и регулярным списаниям на ближайшие три месяца.',
    he: 'כאן יופיעו תשלומי פריסה, צ׳קים עם תאריך פירעון וחיובים קבועים לשלושת החודשים הקרובים.',
    uk: 'Тут з’являться платежі за розстрочками, чеками з датою закриття та регулярними списаннями на найближчі три місяці.',
    en: 'Instalments, cheques with a due date and recurring charges for the next three months appear here.',
  },
  'safe.hint': {
    ru: 'Обязательные платежи до конца месяца уже вычтены',
    he: 'התשלומים הקבועים עד סוף החודש כבר הופחתו',
    uk: "Обов'язкові платежі до кінця місяця вже відняті",
    en: 'Upcoming committed payments are already deducted',
  },
} as const satisfies Record<string, Entry>;

export type TranslationKey = keyof typeof DICTIONARY;

export function translate(language: Language, key: TranslationKey): string {
  const entry = DICTIONARY[key] as Entry | undefined;
  // Russian is the source language, so it doubles as the fallback for a key that
  // has not been translated yet.
  return entry?.[language] || entry?.ru || key;
}
