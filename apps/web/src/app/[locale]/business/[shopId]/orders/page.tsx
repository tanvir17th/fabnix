'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useShop } from '@/components/shop-context';
import { Button, ErrorNote, Input, Loading, PageHeader, StatusBadge, Tabs, Td, Table } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { useApi, useDebounced } from '@/lib/hooks';
import { useFormat } from '@/lib/format';

const STATUSES = ['PENDING_CONFIRMATION', 'CONFIRMED', 'PROCESSING', 'READY_FOR_PICKUP', 'DISPATCHED', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED'] as const;

interface OrderRow {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  total: string;
  currency: string;
  placedAt: string;
  recipientName: string;
  recipientPhone: string;
  paymentMethodType: string;
  _count: { items: number };
}

/** FR-109 online order inbox, FR-117 search/filter. */
export default function OrdersInbox() {
  const t = useTranslations('orders');
  const ts = useTranslations('status');
  const f = useFormat();
  const { shopId, base } = useShop();
  const [status, setStatus] = useState<string>('');
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const dq = useDebounced(q);
  useEffect(() => setStatus(new URLSearchParams(window.location.search).get('status') ?? ''), []);
  const qs = new URLSearchParams({ limit: '25', ...(status ? { status } : {}), ...(dq ? { q: dq } : {}), ...(cursor ? { cursor } : {}) });
  const orders = useApi<{ items: OrderRow[]; nextCursor: string | null; statusCounts: Record<string, number> }>(`/shops/${shopId}/orders?${qs}`);
  const counts = orders.data?.statusCounts ?? {};

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <Tabs
        value={status}
        onChange={(v) => {
          setCursor(null);
          setStatus(v);
        }}
        items={[{ value: '', label: t('all') }, ...STATUSES.map((s) => ({ value: s, label: `${ts(s)}${counts[s] ? ` (${f.digits(counts[s]!)})` : ''}` }))]}
      />
      <Input type="search" placeholder={t('search')} aria-label={t('search')} value={q} onChange={(e) => { setCursor(null); setQ(e.target.value); }} className="mb-4 max-w-sm" />
      <ErrorNote error={orders.error} />
      {!orders.data ? (
        <Loading />
      ) : (
        <>
          <Table head={[t('order'), t('placed'), t('customer'), t('items'), t('status'), t('payment'), t('total')]} empty={!orders.data.items.length}>
            {orders.data.items.map((o) => (
              <tr key={o.id}>
                <Td>
                  <Link href={`${base}/orders/${o.id}`} className="font-medium text-accent-ink hover:underline">
                    {o.orderNumber}
                  </Link>
                </Td>
                <Td>{f.date(o.placedAt, true)}</Td>
                <Td>
                  {o.recipientName}
                  <span className="block text-xs text-muted">{o.recipientPhone}</span>
                </Td>
                <Td className="tabular">{f.digits(o._count.items)}</Td>
                <Td>
                  <StatusBadge status={o.status} />
                </Td>
                <Td>
                  <StatusBadge status={o.paymentStatus} />
                </Td>
                <Td className="tabular">{f.money(o.total, o.currency)}</Td>
              </tr>
            ))}
          </Table>
          {orders.data.nextCursor && (
            <div className="mt-4 text-center">
              <Button variant="secondary" onClick={() => setCursor(orders.data!.nextCursor)}>
                {t('next')}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
