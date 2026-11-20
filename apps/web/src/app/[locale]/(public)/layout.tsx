import { useTranslations } from 'next-intl';
import { PublicHeader } from '@/components/shells';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('common');
  return (
    <>
      <PublicHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
      <footer className="no-print mt-16 border-t border-line py-8 text-center text-xs text-muted">{t('footer')}</footer>
    </>
  );
}
