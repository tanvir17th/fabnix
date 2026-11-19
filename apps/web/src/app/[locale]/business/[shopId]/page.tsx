'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useShop } from '@/components/shop-context';
import { Card, ErrorNote, Loading, PageHeader, Stat, Td, Table } from '@/components/ui';
import { Link, useRouter } from '@/i18n/navigation';
import { useFormat } from '@/lib/format';
import { useApi } from '@/lib/hooks';

interface Dashboard {
  currency: string;
  today: { posSalesCount: number; posSalesTotal: string; onlineOrdersCount: number; onlineOrdersTotal: string; collections: string };
  receivables: { total: string; customers: number };
  pendingOrders: number;
  lowStock: Array<{ productId: string; name: string; sku: string; availableInches: string; thresholdInches: string }>;
  trend: Array<{ day: string; total: string; count: number }>;
  activity: Array<{ id: string; action: string; createdAt: string; actor: { fullName: string } | null }>;
}

/** FR-066 dashboard. Staff without reports.view land on POS instead. */
export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const ta = useTranslations('auditActions');
  const f = useFormat();
  const { shopId, base, can } = useShop();
  const router = useRouter();
  const allowed = can('reports.view');
  const d = useApi<Dashboard>(allowed ? `/shops/${shopId}/reports/dashboard` : null);

  useEffect(() => {
    if (!allowed) router.replace(can('pos.sale.create') ? `${base}/pos` : `${base}/products`);
  }, [allowed, can, base, router]);
  if (!allowed) return <Loading />;
  if (d.error) return <ErrorNote error={d.error} />;
  if (!d.data) return <Loading />;
  const x = d.data;
  const max = Math.max(1, ...x.trend.map((p) => Number(p.total)));

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('todaySales')} value={f.money(x.today.posSalesTotal, x.currency)} hint={t('salesCount', { count: x.today.posSalesCount })} />
        <Stat label={t('todayOnline')} value={f.money(x.today.onlineOrdersTotal, x.currency)} hint={t('ordersCount', { count: x.today.onlineOrdersCount })} />
        <Stat label={t('collections')} value={f.money(x.today.collections, x.currency)} tone="accent" />
        <Stat label={t('receivables')} value={f.money(x.receivables.total, x.currency)} hint={t('customersCount', { count: x.receivables.customers })} tone={Number(x.receivables.total) > 0 ? 'danger' : undefined} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title={t('trend')} className="lg:col-span-2">
          <div className="flex h-44 items-end gap-2" role="img" aria-label={t('trend')}>
            {x.trend.map((p) => (
              <div key={p.day} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] text-muted tabular">{Number(p.total) ? f.number(p.total, 0) : ''}</span>
                <div className="w-full rounded-t bg-accent" style={{ height: `${Math.max(2, (Number(p.total) / max) * 120)}px` }} title={`${p.day}: ${p.total}`} />
                <span className="text-[10px] text-muted">{f.date(p.day).replace(/,? ?\d{4}$/, '')}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title={t('pendingOrders')}>
          <p className="text-4xl font-semibold tabular">{f.digits(x.pendingOrders)}</p>
          <Link href={`${base}/orders?status=PENDING_CONFIRMATION`} className="mt-2 inline-block text-sm text-accent-ink underline">
            {t('reviewOrders')}
          </Link>
        </Card>
        <Card title={t('lowStock')} className="lg:col-span-2">
          {x.lowStock.length === 0 ? (
            <p className="text-sm text-muted">{t('noLowStock')}</p>
          ) : (
            <Table head={[t('product'), t('available'), t('threshold')]}>
              {x.lowStock.map((r) => (
                <tr key={r.productId}>
                  <Td>
                    <Link href={`${base}/inventory?productId=${r.productId}`} className="font-medium hover:text-accent-ink">
                      {r.name}
                    </Link>{' '}
                    <span className="text-xs text-muted">{r.sku}</span>
                  </Td>
                  <Td className="tabular text-danger">{t('yards', { value: f.yards(r.availableInches) })}</Td>
                  <Td className="tabular">{t('yards', { value: f.yards(r.thresholdInches) })}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card title={t('activity')}>
          <ul className="flex flex-col gap-2 text-sm">
            {x.activity.map((a) => (
              <li key={a.id}>
                <span className="font-medium">{ta.has(a.action) ? ta(a.action) : a.action}</span>
                <span className="block text-xs text-muted">
                  {a.actor?.fullName ?? '—'} · {f.date(a.createdAt, true)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
