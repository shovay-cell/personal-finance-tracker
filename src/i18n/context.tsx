'use client';

import React, { createContext, useContext, useEffect, useMemo } from 'react';
import {
  DICTIONARY,
  Language,
  TranslationKey,
  isRtl,
  translate,
} from './dictionary';

interface LanguageContextValue {
  language: Language;
  t: (key: TranslationKey) => string;
  rtl: boolean;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'ru',
  t: (key) => translate('ru', key),
  rtl: false,
});

/**
 * Puts the chosen language on the document itself — `lang` for screen readers
 * and hyphenation, `dir` so Hebrew flips the whole layout instead of leaving
 * mirrored text inside a left-to-right shell.
 */
export function LanguageProvider({
  language,
  children,
}: {
  language: Language;
  children: React.ReactNode;
}) {
  const rtl = isRtl(language);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = language;
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
  }, [language, rtl]);

  const value = useMemo<LanguageContextValue>(
    () => ({ language, rtl, t: (key: TranslationKey) => translate(language, key) }),
    [language, rtl]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useT() {
  return useContext(LanguageContext);
}

export { DICTIONARY };
export type { Language, TranslationKey };
