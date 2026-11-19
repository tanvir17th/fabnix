'use client';

import { useTranslations } from 'next-intl';
import { RequireUser } from '@/components/shells';
import { EmptyState, ErrorNote, Loading, StatusBadge, Td, Table } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { useFormat } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { Page } from '@/lib/api';

interface OrderRow {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  total: string;
  currency: string;
  placedAt: string;
  storefront: { slug: string; displayName: string };
  _count: { items: number };
}

/** FR-131 customer order history. */
function Orders() {
  const t = useTranslations('account');
  const f = useFormat();
  const orders = useApi<Page<OrderRow>>('/me/orders?limit=50');
  if (orders.error) return <ErrorNote error={orders.error} />;
  if (!orders.data) return <Loading />;
  if (!orders.data.items.length) return <EmptyState title={t('noOrders')} />;
  return (
    <Table head={[t('order'), t('shop'), t('date'), t('status'), t('payment'), t('total')]}>
      {orders.data.items.map((o) => (
        <tr key={o.id}>
          <Td>
            <Link href={`/account/orders/${o.id}`} className="font-medium text-accent-ink hover:underline">
              {o.orderNumber}
            </Link>
          </Td>
          <Td>{o.storefront.displayName}</Td>
          <Td>{f.date(o.placedAt)}</Td>
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
  );
}

export default function OrdersPage() {
  const t = useTranslations('account');
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">{t('myOrders')}</h1>
      <RequireUser type="CUSTOMER">
        <Orders />
      </RequireUser>
    </>
  );
}
