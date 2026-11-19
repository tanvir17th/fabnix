'use client';

import { useTranslations } from 'next-intl';
import { use, useState } from 'react';
import { D, allowedTransitions, type OrderStatus } from '@fabnix/shared';
import { useShop } from '@/components/shop-context';
import { Button, Card, ErrorNote, Field, Input, Loading, Modal, PageHeader, ReasonDialog, Select, StatusBadge, Textarea } from '@/components/ui';
import { newIdempotencyKey } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFormat } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';
import { useMeasurementText, useUnitLabel } from '@/components/measurement';

interface ShopOrder {
  id: string;
  orderNumber: string;
  invoiceNumber: string | null;
  status: OrderStatus;
  paymentStatus: string;
  paymentMethodType: string;
  currency: string;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  deliveryFee: string;
  total: string;
  paidAmount: string;
  refundedAmount: string;
  placedAt: string;
  recipientName: string;
  recipientPhone: string;
  recipientEmail: string | null;
  addressLine: string | null;
  area: string | null;
  city: string | null;
  deliveryInstructions: string | null;
  deliveryOptionSnapshot: { method: 'HOME_DELIVERY' | 'PICKUP'; name: string };
  stockDeductionMilestone: string;
  rejectionReason: string | null;
  cancelReason: string | null;
  items: Array<{ id: string; productName: string; sku: string; enteredDisplay: string; enteredMeasurement: unknown; pieces: number; quantityInches: string; priceUnitCode: string; unitRate: string; lineTotal: string }>;
  reservations: Array<{ id: string; status: string; expiresAt: string | null }>;
  statusHistory: Array<{ id: string; fromStatus: string | null; toStatus: string; actorType: string; note: string | null; createdAt: string }>;
  notes: Array<{ id: string; visibility: 'INTERNAL' | 'CUSTOMER'; body: string; createdAt: string }>;
  delivery: { provider: string | null; trackingReference: string | null; status: string } | null;
  payments: Array<{ id: string; amount: string; direction: string; methodType: string; receivedAt: string; status: string }>;
  customer: { id: string; name: string; phone: string | null };
}

/** FR-110…FR-116: review, confirm/reject, fulfil, notes, COD/manual payment. */
export default function ShopOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params);
  const t = useTranslations('orders');
  const ts = useTranslations('status');
  const tc = useTranslations('common');
  const f = useFormat();
  const unitLabel = useUnitLabel();
  const mtext = useMeasurementText();
  const { shopId, can } = useShop();
  const { call } = useAuth();
  const order = useApi<ShopOrder>(`/shops/${shopId}/orders/${orderId}`);
  const methods = useApi<Array<{ id: string; label: string; isActive: boolean }>>(`/shops/${shopId}/payment-methods`);
  const [dialog, setDialog] = useState<null | 'reject' | 'cancel'>(null);
  const [statusOpen, setStatusOpen] = useState<OrderStatus | null>(null);
  const [tracking, setTracking] = useState({ provider: '', trackingReference: '', note: '' });
  const [note, setNote] = useState({ body: '', visibility: 'INTERNAL' as 'INTERNAL' | 'CUSTOMER' });
  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({ methodId: '', amount: '', reference: '' });
  const [payKey, setPayKey] = useState(newIdempotencyKey);
  const manage = can('orders.manage');

  const act = useAction(async (path: string, body?: unknown) => {
    order.setData(await call<ShopOrder>(`/shops/${shopId}/orders/${orderId}/${path}`, { method: 'POST', body: body ?? {} }));
    setDialog(null);
    setStatusOpen(null);
  });
  const addNote = useAction(async () => {
    await call(`/shops/${shopId}/orders/${orderId}/notes`, { method: 'POST', body: note });
    setNote({ body: '', visibility: 'INTERNAL' });
    await order.reload();
  });
  const recordPayment = useAction(async () => {
    order.setData(
      await call<ShopOrder>(`/shops/${shopId}/orders/${orderId}/payments`, {
        method: 'POST',
        idempotencyKey: payKey,
        body: { paymentMethodId: pay.methodId || methods.data?.find((m) => m.isActive)?.id, amount: pay.amount, ...(pay.reference ? { reference: pay.reference } : {}) },
      }),
    );
    setPayOpen(false);
    setPayKey(newIdempotencyKey());
  });

  if (order.error) return <ErrorNote error={order.error} />;
  if (!order.data) return <Loading />;
  const o = order.data;
  const method = o.deliveryOptionSnapshot.method;
  const next = allowedTransitions(o.status, 'SHOPKEEPER', method).filter((s) => !['CONFIRMED', 'REJECTED', 'CANCELLED'].includes(s));
  const due = D(o.total).minus(o.paidAmount).plus(o.refundedAmount);
  const hold = o.reservations.find((r) => r.status === 'ACTIVE');

  return (
    <>
      <PageHeader
        title={o.orderNumber}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge status={o.status} />
            <StatusBadge status={o.paymentStatus} />
            {o.invoiceNumber && <span>{t('invoice', { number: o.invoiceNumber })}</span>}
            <span>{f.date(o.placedAt, true)}</span>
          </span>
        }
        actions={
          manage && (
            <>
              {o.status === 'PENDING_CONFIRMATION' && (
                <>
                  <Button variant="accent" pending={act.pending} onClick={() => void act.run('confirm')}>
                    {t('confirm')}
                  </Button>
                  <Button variant="secondary" onClick={() => setDialog('reject')}>
                    {t('reject')}
                  </Button>
                </>
              )}
              {next.map((s) => (
                <Button key={s} variant="primary" onClick={() => (s === 'DISPATCHED' ? setStatusOpen(s) : void act.run('status', { to: s }))}>
                  {t('markAs', { status: ts(s) })}
                </Button>
              ))}
              {allowedTransitions(o.status, 'SHOPKEEPER', method).includes('CANCELLED') && o.status !== 'PENDING_CONFIRMATION' && (
                <Button variant="ghost" onClick={() => setDialog('cancel')}>
                  {t('cancel')}
                </Button>
              )}
            </>
          )
        }
      />
      <ErrorNote error={act.error} className="mb-4" />
      {hold?.expiresAt && o.status === 'PENDING_CONFIRMATION' && <p className="mb-4 text-sm text-warning">{t('holdUntil', { time: f.date(hold.expiresAt, true) })}</p>}
      {(o.rejectionReason || o.cancelReason) && <p className="mb-4 text-sm text-danger">{o.rejectionReason ?? o.cancelReason}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <Card title={t('items')}>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line">
                {o.items.map((i) => (
                  <tr key={i.id}>
                    <td className="py-2">
                      <span className="font-medium">{i.productName}</span> <span className="text-xs text-muted">{i.sku}</span>
                      <span className="block text-xs text-muted">
                        {mtext(i.enteredMeasurement, i.pieces)} = {f.yards(i.quantityInches)} {unitLabel({ code: 'YARD' })} ({f.number(i.quantityInches, 2)}″)
                      </span>
                    </td>
                    <td className="py-2 text-right tabular">
                      {f.money(i.unitRate, o.currency)}/{unitLabel({ code: i.priceUnitCode })}
                    </td>
                    <td className="py-2 text-right font-medium tabular">{f.money(i.lineTotal, o.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="ml-auto mt-3 grid w-64 grid-cols-2 gap-y-1 text-sm">
              <dt className="text-muted">{t('subtotal')}</dt>
              <dd className="text-right tabular">{f.money(o.subtotal, o.currency)}</dd>
              <dt className="text-muted">{t('deliveryFee')}</dt>
              <dd className="text-right tabular">{f.money(o.deliveryFee, o.currency)}</dd>
              <dt className="font-semibold">{t('total')}</dt>
              <dd className="text-right font-semibold tabular">{f.money(o.total, o.currency)}</dd>
              <dt className="text-muted">{t('paid')}</dt>
              <dd className="text-right tabular">{f.money(o.paidAmount, o.currency)}</dd>
            </dl>
            {manage && can('payments.collect') && due.greaterThan(0) && !['PENDING_CONFIRMATION', 'REJECTED', 'CANCELLED'].includes(o.status) && (
              <Button
                size="sm"
                variant="secondary"
                className="mt-3"
                onClick={() => {
                  setPay({ methodId: '', amount: due.toFixed(2), reference: '' });
                  setPayOpen(true);
                }}
              >
                {t('recordPayment')}
              </Button>
            )}
          </Card>

          <Card title={t('notes')}>
            <ul className="mb-3 flex flex-col gap-2 text-sm">
              {o.notes.map((n) => (
                <li key={n.id} className={`rounded-md px-3 py-2 ${n.visibility === 'INTERNAL' ? 'bg-surface-2' : 'bg-accent-soft'}`}>
                  <span className="text-xs font-medium">{t(`visibility.${n.visibility}`)}</span> · <span className="text-xs text-muted">{f.date(n.createdAt, true)}</span>
                  <p>{n.body}</p>
                </li>
              ))}
            </ul>
            {manage && (
              <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void addNote.run();
                }}
              >
                <Textarea aria-label={t('addNote')} placeholder={t('addNote')} value={note.body} onChange={(e) => setNote((n) => ({ ...n, body: e.target.value }))} />
                <div className="flex items-center gap-2">
                  <Select aria-label={t('noteVisibility')} value={note.visibility} onChange={(e) => setNote((n) => ({ ...n, visibility: e.target.value as 'INTERNAL' | 'CUSTOMER' }))} className="w-48">
                    <option value="INTERNAL">{t('visibility.INTERNAL')}</option>
                    <option value="CUSTOMER">{t('visibility.CUSTOMER')}</option>
                  </Select>
                  <Button type="submit" size="sm" disabled={!note.body.trim()} pending={addNote.pending}>
                    {t('save')}
                  </Button>
                </div>
                <ErrorNote error={addNote.error} />
              </form>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card title={t('customer')}>
            <p className="font-medium">{o.recipientName}</p>
            <p className="text-sm">
              <a href={`tel:${o.recipientPhone}`} className="text-accent-ink">
                {o.recipientPhone}
              </a>
            </p>
            {o.recipientEmail && <p className="text-sm text-muted">{o.recipientEmail}</p>}
            <p className="mt-2 text-sm">
              {t(`method.${method}`)}: {o.deliveryOptionSnapshot.name}
            </p>
            {o.addressLine && <p className="text-sm text-muted">{[o.addressLine, o.area, o.city].filter(Boolean).join(', ')}</p>}
            {o.deliveryInstructions && <p className="mt-1 text-sm italic">{o.deliveryInstructions}</p>}
            {o.delivery?.trackingReference && (
              <p className="mt-2 text-sm">
                {t('tracking')}: {o.delivery.provider} {o.delivery.trackingReference}
              </p>
            )}
          </Card>
          <Card title={t('history')}>
            <ol className="flex flex-col gap-2 text-sm">
              {o.statusHistory.map((h) => (
                <li key={h.id}>
                  <span className="font-medium">{ts(h.toStatus)}</span> <span className="text-xs text-muted">· {t(`actor.${h.actorType}`)}</span>
                  <span className="block text-xs text-muted">{f.date(h.createdAt, true)}</span>
                  {h.note && <span className="block text-xs">{h.note}</span>}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-muted">{t(`milestone.${o.stockDeductionMilestone}`)}</p>
          </Card>
        </div>
      </div>

      <ReasonDialog
        open={!!dialog}
        title={dialog === 'reject' ? t('reject') : t('cancel')}
        confirmLabel={dialog === 'reject' ? t('reject') : t('cancel')}
        onClose={() => setDialog(null)}
        onConfirm={(reason) => void act.run(dialog!, { reason })}
        pending={act.pending}
        error={act.error}
      />
      <Modal
        open={!!statusOpen}
        onClose={() => setStatusOpen(null)}
        title={t('markAs', { status: statusOpen ? ts(statusOpen) : '' })}
        footer={
          <>
            <Button variant="secondary" onClick={() => setStatusOpen(null)}>
              {tc('cancel')}
            </Button>
            <Button pending={act.pending} onClick={() => void act.run('status', { to: statusOpen, ...Object.fromEntries(Object.entries(tracking).filter(([, v]) => v)) })}>
              {tc('save')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label={t('provider')}>{(id) => <Input id={id} value={tracking.provider} onChange={(e) => setTracking((x) => ({ ...x, provider: e.target.value }))} placeholder="Pathao, Steadfast…" />}</Field>
          <Field label={t('trackingRef')}>{(id) => <Input id={id} value={tracking.trackingReference} onChange={(e) => setTracking((x) => ({ ...x, trackingReference: e.target.value }))} />}</Field>
          <Field label={t('customerNote')}>{(id) => <Input id={id} value={tracking.note} onChange={(e) => setTracking((x) => ({ ...x, note: e.target.value }))} />}</Field>
          <ErrorNote error={act.error} />
        </div>
      </Modal>
      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title={t('recordPayment')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button pending={recordPayment.pending} onClick={() => void recordPayment.run()}>
              {tc('save')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label={t('paymentMethod')}>
            {(id) => (
              <Select id={id} value={pay.methodId} onChange={(e) => setPay((p) => ({ ...p, methodId: e.target.value }))}>
                {methods.data?.filter((m) => m.isActive).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('amount')}>{(id) => <Input id={id} inputMode="decimal" value={pay.amount} onChange={(e) => setPay((p) => ({ ...p, amount: e.target.value }))} />}</Field>
          <Field label={t('reference')}>{(id) => <Input id={id} value={pay.reference} onChange={(e) => setPay((p) => ({ ...p, reference: e.target.value }))} placeholder="bKash TrxID…" />}</Field>
          <ErrorNote error={recordPayment.error} />
        </div>
      </Modal>
    </>
  );
}
