'use client';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense, use, useState } from 'react';
import { RequireUser } from '@/components/shells';
import { useMeasurementText } from '@/components/measurement';
import { Button, Card, ErrorNote, Loading, Notice, ReasonDialog, StatusBadge } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useFormat } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';

export interface OrderDetail {
  id: string;
  orderNumber: string;
  invoiceNumber: string | null;
  status: string;
  paymentStatus: string;
  paymentMethodType: string;
  currency: string;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  deliveryFee: string;
  total: string;
  paidAmount: string;
  placedAt: string;
  recipientName: string;
  recipientPhone: string;
  addressLine: string | null;
  city: string | null;
  deliveryInstructions: string | null;
  deliveryOptionSnapshot: { method: string; name: string };
  rejectionReason: string | null;
  cancelReason: string | null;
  items: Array<{ id: string; productName: string; enteredDisplay: string; enteredMeasurement: unknown; pieces: number; quantityInches: string; unitRate: string; priceUnitCode: string; lineTotal: string }>;
  statusHistory: Array<{ id: string; toStatus: string; createdAt: string; note: string | null; actorType: string }>;
  notes: Array<{ id: string; body: string; createdAt: string; visibility?: string }>;
  delivery: { provider: string | null; trackingReference: string | null; trackingUrl: string | null } | null;
  storefront?: { slug: string; displayName: string };
}

/** FR-128 order tracking with timestamped history; FR-116 cancellation. */
function OrderView({ orderId }: { orderId: string }) {
  const t = useTranslations('account');
  const ts = useTranslations('status');
  const f = useFormat();
  const mtext = useMeasurementText();
  const params = useSearchParams();
  const { call } = useAuth();
  const order = useApi<OrderDetail>(`/me/orders/${orderId}`);
  const [cancelOpen, setCancelOpen] = useState(false);
  const cancel = useAction(async (reason: string) => {
    order.setData(await call<OrderDetail>(`/me/orders/${orderId}/cancel`, { method: 'POST', body: { reason } }));
    setCancelOpen(false);
  });

  if (order.error) return <ErrorNote error={order.error} />;
  if (!order.data) return <Loading />;
  const o = order.data;
  return (
    <div className="flex flex-col gap-6">
      {params.get('placed') && <Notice tone="success">{t('placed', { number: o.orderNumber })}</Notice>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{o.orderNumber}</h1>
          <p className="text-sm text-muted">
            {o.storefront?.displayName} · {f.date(o.placedAt, true)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={o.status} />
          <StatusBadge status={o.paymentStatus} />
          {o.status === 'PENDING_CONFIRMATION' && (
            <Button variant="secondary" onClick={() => setCancelOpen(true)}>
              {t('cancelOrder')}
            </Button>
          )}
        </div>
      </div>
      {(o.rejectionReason || o.cancelReason) && <Notice tone="warning">{o.rejectionReason ?? o.cancelReason}</Notice>}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card title={t('items')}>
          <ul className="divide-y divide-line">
            {o.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{i.productName}</span>
                  <span className="block text-xs text-muted">
                    {mtext(i.enteredMeasurement, i.pieces)} · {f.money(i.unitRate, o.currency)}
                  </span>
                </span>
                <span className="tabular">{f.money(i.lineTotal, o.currency)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 flex flex-col gap-1 border-t border-line pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">{t('subtotal')}</dt>
              <dd className="tabular">{f.money(o.subtotal, o.currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">{t('deliveryFee')}</dt>
              <dd className="tabular">{f.money(o.deliveryFee, o.currency)}</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>{t('total')}</dt>
              <dd className="tabular">{f.money(o.total, o.currency)}</dd>
            </div>
          </dl>
        </Card>
        <div className="flex flex-col gap-6">
          <Card title={t('tracking')}>
            <ol className="relative flex flex-col gap-4 border-l border-line pl-4" aria-label={t('tracking')}>
              {o.statusHistory.map((h) => (
                <li key={h.id}>
                  <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-accent" aria-hidden />
                  <p className="text-sm font-medium">{ts(h.toStatus)}</p>
                  <p className="text-xs text-muted">{f.date(h.createdAt, true)}</p>
                  {h.note && <p className="text-xs">{h.note}</p>}
                </li>
              ))}
            </ol>
            {o.delivery?.trackingReference && (
              <p className="mt-3 text-sm">
                {t('trackingRef')}: {o.delivery.provider} {o.delivery.trackingReference}
              </p>
            )}
          </Card>
          <Card title={t('deliverTo')}>
            <p className="text-sm">
              {o.recipientName} · {o.recipientPhone}
            </p>
            <p className="text-sm text-muted">{[o.addressLine, o.city].filter(Boolean).join(', ') || o.deliveryOptionSnapshot.name}</p>
          </Card>
          {o.notes.length > 0 && (
            <Card title={t('messages')}>
              {o.notes.map((n) => (
                <p key={n.id} className="text-sm">
                  <span className="text-xs text-muted">{f.date(n.createdAt, true)} · </span>
                  {n.body}
                </p>
              ))}
            </Card>
          )}
        </div>
      </div>
      <ReasonDialog open={cancelOpen} title={t('cancelOrder')} confirmLabel={t('cancelOrder')} onClose={() => setCancelOpen(false)} onConfirm={(r) => void cancel.run(r)} pending={cancel.pending} error={cancel.error} />
    </div>
  );
}

export default function OrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params);
  return (
    <RequireUser type="CUSTOMER">
      <Suspense>
        <OrderView orderId={orderId} />
      </Suspense>
    </RequireUser>
  );
}
