'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { useAuth, UserType } from '@/lib/auth';
import { FnMark, Wordmark } from './brand';
import { LanguageSwitcher } from './language-switcher';
import { Button, Loading, cx } from './ui';

/** Client-side route guard. UI hiding is convenience only — the API enforces (BR-012). */
export function RequireUser({ type, children }: { type: UserType; children: React.ReactNode }) {
  const { status, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const portal = type === 'CUSTOMER' ? 'customer' : type === 'SHOPKEEPER' ? 'business' : 'admin';
  useEffect(() => {
    if (status === 'anonymous' || (status === 'authenticated' && user?.type !== type)) {
      router.replace(`/login?portal=${portal}&next=${encodeURIComponent(pathname)}`);
    }
  }, [status, user, type, router, pathname, portal]);
  if (status !== 'authenticated' || user?.type !== type) return <Loading />;
  return <>{children}</>;
}

export function UserMenu() {
  const t = useTranslations('nav');
  const { user, status, logout } = useAuth();
  const router = useRouter();
  if (status !== 'authenticated' || !user) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-40 truncate text-sm text-muted sm:inline" title={user.fullName}>
        {user.fullName}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={async () => {
          await logout();
          router.replace('/');
        }}
      >
        {t('logout')}
      </Button>
    </div>
  );
}

/** Public & customer header (§A7 Customer User navigation). */
export function PublicHeader() {
  const t = useTranslations('nav');
  const { user, status } = useAuth();
  return (
    <header className="no-print sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/" aria-label="FABNIX">
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-1 text-sm sm:gap-3">
          <Link href="/" className="hidden rounded px-2 py-1 hover:bg-surface-2 sm:inline">
            {t('discover')}
          </Link>
          {status === 'authenticated' && user?.type === 'CUSTOMER' && (
            <Link href="/account/orders" className="rounded px-2 py-1 hover:bg-surface-2">
              {t('myOrders')}
            </Link>
          )}
          {status === 'authenticated' && user?.type === 'SHOPKEEPER' && (
            <Link href="/business" className="rounded px-2 py-1 hover:bg-surface-2">
              {t('workspace')}
            </Link>
          )}
          {status === 'authenticated' && user?.type === 'SUPER_ADMIN' && (
            <Link href="/admin" className="rounded px-2 py-1 hover:bg-surface-2">
              {t('admin')}
            </Link>
          )}
          {status === 'anonymous' && (
            <>
              <Link href="/login?portal=customer" className="rounded px-2 py-1 hover:bg-surface-2">
                {t('login')}
              </Link>
              <Link href="/register?portal=business" className="hidden rounded px-2 py-1 font-medium text-accent-ink hover:bg-surface-2 md:inline">
                {t('sellOnFabnix')}
              </Link>
            </>
          )}
          <LanguageSwitcher />
          <UserMenu />
        </nav>
      </div>
    </header>
  );
}

export interface NavItem {
  href: string;
  label: string;
  show?: boolean;
  badge?: number;
}

/** Sidebar workspace shell (Shopkeeper & Super Admin). */
export function WorkspaceShell({ title, nav, children, headerExtra }: { title: React.ReactNode; nav: NavItem[]; children: React.ReactNode; headerExtra?: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const t = useTranslations('nav');
  useEffect(() => setOpen(false), [pathname]);
  const items = nav.filter((n) => n.show !== false);
  const active = (href: string) => pathname === href || (href.split('/').length > 3 && pathname.startsWith(`${href}/`));
  return (
    <div className="flex min-h-dvh">
      <aside
        className={cx(
          'no-print fixed inset-y-0 left-0 z-40 w-64 border-r border-line bg-surface transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label={t('menu')}
      >
        <div className="flex h-14 items-center gap-2 border-b border-line px-4">
          <FnMark size={26} />
          <span className="truncate font-semibold">{title}</span>
        </div>
        <nav className="flex flex-col gap-0.5 p-2">
          {items.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active(n.href) ? 'page' : undefined}
              className={cx('flex items-center justify-between rounded-md px-3 py-2 text-sm', active(n.href) ? 'bg-accent-soft font-medium text-accent-ink' : 'text-fg hover:bg-surface-2')}
            >
              {n.label}
              {!!n.badge && <span className="rounded-full bg-accent px-2 text-xs font-semibold text-[#111317]">{n.badge}</span>}
            </Link>
          ))}
        </nav>
      </aside>
      {open && <button className="fixed inset-0 z-30 bg-black/30 lg:hidden" aria-label={t('close')} onClick={() => setOpen(false)} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur">
          <button className="rounded p-2 hover:bg-surface-2 lg:hidden" onClick={() => setOpen(true)} aria-label={t('menu')}>
            ☰
          </button>
          <div className="min-w-0 flex-1">{headerExtra}</div>
          <LanguageSwitcher />
          <UserMenu />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      </div>
    </div>
  );
}
