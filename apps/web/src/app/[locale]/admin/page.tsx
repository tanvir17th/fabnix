'use client';

import { useTranslations } from 'next-intl';
import { Card, ErrorNote, Loading, PageHeader, Stat, StatusBadge } from '@/components/ui';
import { useFormat } from '@/lib/format';
import { useApi } from '@/lib/hooks';

interface Stats {
  shopsByStatus: Record<string, number>;
  usersByType: Record<string, number>;
  activeStorefronts: number;
  publishedListings: number;
  orders30d: { count: number; grossOrderValue: string; byStatus: Record<string, number>; daily: Array<{ day: string; count: number; gmv: string }> };
}

/** FR-136 platform commerce metrics. */
export default function AdminDashboard() {
  const t = useTranslations('admin.dashboard');
  const f = useFormat();
  const s = useApi<Stats>('/admin/stats');
  if (s.error) return <ErrorNote error={s.error} />;
  if (!s.data) return <Loading />;
  const x = s.data;
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...x.orders30d.daily.map((d) => Number(d.gmv)));
  return (
    <>
      <PageHeader title={t('title')} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('shops')} value={f.digits(sum(x.shopsByStatus))} hint={t('activeShops', { count: x.shopsByStatus.ACTIVE ?? 0 })} />
        <Stat label={t('storefronts')} value={f.digits(x.activeStorefronts)} hint={t('listings', { count: x.publishedListings })} />
        <Stat label={t('orders30d')} value={f.digits(x.orders30d.count)} />
        <Stat label={t('gov30d')} value={f.money(x.orders30d.grossOrderValue)} tone="accent" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title={t('gmvTrend')} className="lg:col-span-2">
          <div className="flex h-40 items-end gap-1" role="img" aria-label={t('gmvTrend')}>
            {x.orders30d.daily.map((d) => (
              <div key={d.day} className="flex-1 rounded-t bg-accent" style={{ height: `${Math.max(2, (Number(d.gmv) / max) * 140)}px` }} title={`${d.day}: ${d.gmv} (${d.count})`} />
            ))}
          </div>
        </Card>
        <Card title={t('breakdown')}>
          <h3 className="mb-1 text-xs font-semibold uppercase text-muted">{t('shopStatus')}</h3>
          <ul className="mb-3 flex flex-col gap-1 text-sm">
            {Object.entries(x.shopsByStatus).map(([k, v]) => (
              <li key={k} className="flex justify-between"><StatusBadge status={k} /> <span className="tabular">{f.digits(v)}</span></li>
            ))}
          </ul>
          <h3 className="mb-1 text-xs font-semibold uppercase text-muted">{t('users')}</h3>
          <ul className="mb-3 flex flex-col gap-1 text-sm">
            {Object.entries(x.usersByType).map(([k, v]) => (
              <li key={k} className="flex justify-between"><span>{t(`userType.${k}`)}</span> <span className="tabular">{f.digits(v)}</span></li>
            ))}
          </ul>
          <h3 className="mb-1 text-xs font-semibold uppercase text-muted">{t('orderStatus')}</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {Object.entries(x.orders30d.byStatus).map(([k, v]) => (
              <li key={k} className="flex justify-between"><StatusBadge status={k} /> <span className="tabular">{f.digits(v)}</span></li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
