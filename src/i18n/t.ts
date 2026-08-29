import { TranslationKey, translate } from './dictionary';
import { getActiveLanguage } from './runtime';

/**
 * Translation outside React: services and formatters have no context above
 * them, so they read the language the provider published.
 */
export function tr(key: TranslationKey): string {
  return translate(getActiveLanguage(), key);
}
