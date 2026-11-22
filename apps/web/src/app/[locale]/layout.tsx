import type { Metadata, Viewport } from 'next';
import { Noto_Sans_Bengali, Plus_Jakarta_Sans } from 'next/font/google';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { AuthProvider } from '@/lib/auth';
import '../globals.css';

const latin = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-latin', display: 'swap' });
// NFR-L10N-009: Bangla face with correct conjunct shaping. Noto Sans Bengali over Hind Siliguri because its
// digits are equal-width (real tabular columns) and its ১ stays distinct at table sizes on dark backgrounds.
const bangla = Noto_Sans_Bengali({ subsets: ['bengali', 'latin'], weight: ['400', '500', '600', '700'], variable: '--font-bangla', display: 'swap' });

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return {
    title: { default: t('title'), template: `%s · FABNIX` },
    description: t('description'),
    applicationName: 'FABNIX',
    alternates: { languages: { bn: '/bn', en: '/en' } },
  };
}

export const viewport: Viewport = { themeColor: '#F8F7F4', width: 'device-width', initialScale: 1 };

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  return (
    <html lang={locale} className={`${latin.variable} ${bangla.variable}`}>
      <body className="min-h-dvh">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AuthProvider>{children}</AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
