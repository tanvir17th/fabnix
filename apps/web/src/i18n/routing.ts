import { defineRouting } from 'next-intl/routing';

/** Bangla first (primary market), English second (NFR-L10N-001). */
export const routing = defineRouting({
  locales: ['bn', 'en'],
  defaultLocale: 'bn',
  localePrefix: 'always',
});

export type Locale = (typeof routing.locales)[number];
