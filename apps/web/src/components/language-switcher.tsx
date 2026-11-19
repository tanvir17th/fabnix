'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth';
import { cx } from './ui';

/**
 * NFR-L10N-001/010: visible, keyboard/screen-reader accessible switcher that
 * marks the active language. Switching re-renders in place (no logout) and,
 * when signed in, persists the choice to the user's profile (AC-001).
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations('language');
  const router = useRouter();
  const pathname = usePathname();
  const { setLanguage } = useAuth();
  const [pending, start] = useTransition();

  const switchTo = (lang: 'bn' | 'en') => {
    if (lang === locale) return;
    void setLanguage(lang);
    const qs = typeof window !== 'undefined' ? window.location.search : '';
    start(() => router.replace(`${pathname}${qs}`, { locale: lang }));
  };

  return (
    <div role="group" aria-label={t('label')} className={cx('inline-flex rounded-md border border-line bg-surface p-0.5 text-sm', className)} aria-busy={pending || undefined}>
      {(['bn', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={locale === l}
          onClick={() => switchTo(l)}
          className={cx('rounded px-2.5 py-1 font-medium', locale === l ? 'bg-fg text-bg' : 'text-muted hover:text-fg')}
        >
          {l === 'bn' ? 'বাংলা' : 'English'}
        </button>
      ))}
    </div>
  );
}
