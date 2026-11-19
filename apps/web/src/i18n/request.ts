import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const messages = (await import(`../../messages/${locale}.json`)).default;
  const fallback = locale === 'en' ? messages : (await import('../../messages/en.json')).default;
  return {
    locale,
    messages,
    // §5.2: missing key → English fallback + log for correction.
    getMessageFallback: ({ namespace, key }) => {
      const path = [namespace, key].filter(Boolean).join('.');
      const value = path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], fallback);
      return typeof value === 'string' ? value : path;
    },
    onError: (error) => {
      if (process.env.NODE_ENV !== 'production') console.warn(`[i18n] ${error.message}`);
    },
  };
});
