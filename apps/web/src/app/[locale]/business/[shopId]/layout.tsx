'use client';

import { useTranslations } from 'next-intl';
import { use, useMemo } from 'react';
import { NavItem, WorkspaceShell } from '@/components/shells';
import { ShopAccess, ShopProvider } from '@/components/shop-context';
import { EmptyState, Loading, Notice } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { useApi } from '@/lib/hooks';

/** Shopkeeper workspace shell (§A7 Shopkeeper navigation), permission-shaped. */
export default function ShopLayout({ children, params }: { children: React.ReactNode; params: Promise<{ shopId: string }> }) {
  const { shopId } = use(params);
  const t = useTranslations('nav');
  const tb = useTranslations('business');
  const ts = useTranslations('staff');
  const access = useApi<ShopAccess>(`/shops/${shopId}/me`);
  const can = useMemo(() => {
    const set = new Set(access.data?.permissions ?? []);
    return (p: string) => !!access.data?.isOwner || set.has(p);
  }, [access.data]);
  const pending = useApi<{ statusCounts: Record<string, number> }>(access.data && can('orders.view') ? `/shops/${shopId}/orders?limit=1` : null);

  if (access.error) {
    return (
      <div className="p-8">
        <EmptyState title={tb('noAccess')}>
          <Link href="/business?pick=1" className="text-accent-ink underline">
            {tb('yourShops')}
          </Link>
        </EmptyState>
      </div>
    );
  }
  if (!access.data) return <Loading />;
  const base = `/business/${shopId}`;
  const nav: NavItem[] = [
    { href: base, label: t('dashboard'), show: can('reports.view') },
    { href: `${base}/pos`, label: t('pos'), show: can('pos.sale.create') },
    { href: `${base}/orders`, label: t('onlineOrders'), show: can('orders.view'), badge: pending.data?.statusCounts.PENDING_CONFIRMATION },
    { href: `${base}/sales`, label: t('sales'), show: can('sales.view_all') || can('sales.view_own') },
    { href: `${base}/products`, label: t('products'), show: can('catalog.view') },
    { href: `${base}/inventory`, label: t('inventory'), show: can('inventory.view') },
    { href: `${base}/customers`, label: t('customers'), show: can('customers.view') },
    { href: `${base}/purchases`, label: t('purchases'), show: can('purchases.manage') },
    { href: `${base}/expenses`, label: t('expenses'), show: can('expenses.manage') },
    { href: `${base}/reports`, label: t('reports'), show: can('reports.view') },
    { href: `${base}/online-store`, label: t('onlineStore'), show: can('storefront.manage') },
    { href: `${base}/staff`, label: t('staff'), show: can('staff.view') },
    { href: `${base}/settings`, label: t('settings'), show: can('shop.settings.view') || can('units.manage') },
    { href: `${base}/audit`, label: t('audit'), show: can('audit.view') },
  ];
  return (
    <ShopProvider value={{ shopId, access: access.data, base, can, reload: access.reload }}>
      <WorkspaceShell
        title={access.data.shop.name}
        nav={nav}
        headerExtra={
          <Link href="/business?pick=1" className="truncate text-sm text-muted hover:text-fg">
            {access.data.isOwner ? tb('owner') : access.data.role.presetKey && ts.has(`presets.${access.data.role.presetKey}`) ? ts(`presets.${access.data.role.presetKey}`) : access.data.role.name} · {tb('switchShop')}
          </Link>
        }
      >
        {access.data.shop.status !== 'ACTIVE' && (
          <div className="mb-4">
            <Notice tone="warning">{tb(`shopStatus.${access.data.shop.status}`)}</Notice>
          </div>
        )}
        {children}
      </WorkspaceShell>
    </ShopProvider>
  );
}
