'use client';

import { useTranslations } from 'next-intl';
import { RequireUser, WorkspaceShell } from '@/components/shells';

/** Super Admin console (§A7 Super Admin navigation). */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('admin.nav');
  const nav = [
    { href: '/admin', label: t('dashboard') },
    { href: '/admin/shops', label: t('shops') },
    { href: '/admin/users', label: t('users') },
    { href: '/admin/products', label: t('moderation') },
    { href: '/admin/plans', label: t('plans') },
    { href: '/admin/audit', label: t('audit') },
  ];
  return (
    <RequireUser type="SUPER_ADMIN">
      <WorkspaceShell title={t('title')} nav={nav}>
        {children}
      </WorkspaceShell>
    </RequireUser>
  );
}
