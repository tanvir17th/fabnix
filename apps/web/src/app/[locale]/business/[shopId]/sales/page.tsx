'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useShop } from '@/components/shop-context';
import { Button, ErrorNote, Input, Loading, PageHeader, Select, StatusBadge, Td, Table } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { useFormat } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { Page } from '@/lib/api';

interface SaleRow {
  id: string;
  invoiceNumber: string;
  soldAt: string;
  status: string;
  paymentStatus: string;
  grandTotal: string;
  dueAmount: string;
  currency: string;
  customer: { name: string } | null;
  cashier: { fullName: string };
  _count: { items: number };
}

/** FR-067 sales history with filters; cashiers see their own only (server-enforced). */
export default function SalesPage() {
  const t = useTranslations('sales');
  const f = useFormat();
  const { shopId, base } = useShop();
  const [status, setStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [invoice, setInvoice] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const qs = new URLSearchParams({ limit: '25', ...(status ? { status } : {}), ...(paymentStatus ? { paymentStatus } : {}), ...(invoice ? { invoiceNumber: invoice } : {}), ...(cursor ? { cursor } : {}) });
  const sales = useApi<Page<SaleRow>>(`/shops/${shopId}/sales?${qs}`);

  return (
    <>
      <PageHeader
        title={t('title')}
        actions={
          <Link href={`${base}/pos`}>
            <Button variant="accent">{t('newSale')}</Button>
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input placeholder={t('invoiceNumber')} aria-label={t('invoiceNumber')} value={invoice} onChange={(e) => { setCursor(null); setInvoice(e.target.value.trim()); }} className="w-52" />
        <Select aria-label={t('status')} value={status} onChange={(e) => { setCursor(null); setStatus(e.target.value); }} className="w-44">
          <option value="">{t('allStatuses')}</option>
          {['COMPLETED', 'CANCELLED'].map((s) => (
            <option key={s} value={s}>
              {t(`statusLabel.${s}`)}
            </option>
          ))}
        </Select>
        <Select aria-label={t('payment')} value={paymentStatus} onChange={(e) => { setCursor(null); setPaymentStatus(e.target.value); }} className="w-44">
          <option value="">{t('allPayments')}</option>
          {['PAID', 'PARTIALLY_PAID', 'UNPAID', 'REFUNDED'].map((s) => (
            <option key={s} value={s}>
              {t(`statusLabel.${s}`)}
            </option>
          ))}
        </Select>
      </div>
      <ErrorNote error={sales.error} />
      {!sales.data ? (
        <Loading />
      ) : (
        <>
          <Table head={[t('invoice'), t('date'), t('customer'), t('cashier'), t('status'), t('total'), t('due')]} empty={!sales.data.items.length}>
            {sales.data.items.map((s) => (
              <tr key={s.id}>
                <Td>
                  <Link href={`${base}/sales/${s.id}`} className="font-medium text-accent-ink hover:underline">
                    {s.invoiceNumber}
                  </Link>
                </Td>
                <Td>{f.date(s.soldAt, true)}</Td>
                <Td>{s.customer?.name ?? '—'}</Td>
                <Td>{s.cashier.fullName}</Td>
                <Td>
                  <div className="flex gap-1">
                    <StatusBadge status={s.status} />
                    <StatusBadge status={s.paymentStatus} />
                  </div>
                </Td>
                <Td className="tabular">{f.money(s.grandTotal, s.currency)}</Td>
                <Td className={`tabular ${Number(s.dueAmount) > 0 ? 'text-warning' : ''}`}>{f.money(s.dueAmount, s.currency)}</Td>
              </tr>
            ))}
          </Table>
          {sales.data.nextCursor && (
            <div className="mt-4 text-center">
              <Button variant="secondary" onClick={() => setCursor(sales.data!.nextCursor)}>
                {t('next')}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
