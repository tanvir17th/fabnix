'use client';

import { useTranslations } from 'next-intl';
import { use, useState } from 'react';
import { D } from '@fabnix/shared';
import { InvoiceData, InvoiceDocument } from '@/components/invoice';
import { useShop } from '@/components/shop-context';
import { Button, Card, ErrorNote, Field, Input, Loading, Modal, PageHeader, ReasonDialog, Select, StatusBadge } from '@/components/ui';
import { newIdempotencyKey } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useApi } from '@/lib/hooks';
import { usePaymentMethodLabel } from '@/lib/payment-label';

/** Invoice view/print (FR-047/048), due collection (FR-052) and cancellation (AC-009). */
export default function SaleDetailPage({ params }: { params: Promise<{ saleId: string }> }) {
  const methodLabel = usePaymentMethodLabel();
  const { saleId } = use(params);
  const t = useTranslations('sales');
  const tc = useTranslations('common');
  const { shopId, can, access } = useShop();
  const { call } = useAuth();
  const [lang, setLang] = useState<'bn' | 'en' | null>(null);
  const invoice = useApi<InvoiceData>(`/shops/${shopId}/sales/${saleId}/invoice`);
  const methods = useApi<Array<{ id: string; type: string; label: string; isActive: boolean; availableInPos: boolean }>>(`/shops/${shopId}/payment-methods`);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payment, setPayment] = useState({ methodId: '', amount: '', reference: '' });
  const [payKey, setPayKey] = useState(newIdempotencyKey);

  const cancel = useAction(async (reason: string) => {
    await call(`/shops/${shopId}/sales/${saleId}/cancel`, { method: 'POST', body: { reason } });
    setCancelOpen(false);
    await invoice.reload();
  });
  const collect = useAction(async () => {
    const methodId = payment.methodId || methods.data?.find((m) => m.isActive && m.availableInPos)?.id;
    await call(`/shops/${shopId}/sales/${saleId}/payments`, { method: 'POST', idempotencyKey: payKey, body: { paymentMethodId: methodId, amount: payment.amount, ...(payment.reference ? { reference: payment.reference } : {}) } });
    setPayOpen(false);
    setPayKey(newIdempotencyKey());
    await invoice.reload();
  });

  if (invoice.error) return <ErrorNote error={invoice.error} />;
  if (!invoice.data) return <Loading />;
  const inv = invoice.data;
  const shown = lang ?? inv.language;
  const due = D(inv.totals.dueAmount);

  return (
    <>
      <div className="no-print">
        <PageHeader
          title={inv.invoiceNumber}
          subtitle={
            <span className="inline-flex gap-1">
              <StatusBadge status={inv.status} />
              <StatusBadge status={inv.paymentStatus} />
            </span>
          }
          actions={
            <>
              <Select aria-label={t('invoiceLanguage')} value={shown} onChange={(e) => setLang(e.target.value as 'bn' | 'en')} className="w-32">
                <option value="bn">বাংলা</option>
                <option value="en">English</option>
              </Select>
              <Button variant="secondary" onClick={() => window.print()}>
                {t('print')}
              </Button>
              {due.greaterThan(0) && can('payments.collect') && inv.status === 'COMPLETED' && (
                <Button
                  variant="accent"
                  onClick={() => {
                    setPayment({ methodId: '', amount: due.toFixed(2), reference: '' });
                    setPayOpen(true);
                  }}
                >
                  {t('collectDue')}
                </Button>
              )}
              {inv.status === 'COMPLETED' && can('sales.cancel') && (
                <Button variant="danger" onClick={() => setCancelOpen(true)}>
                  {t('cancelSale')}
                </Button>
              )}
            </>
          }
        />
        <ErrorNote error={cancel.error} />
      </div>
      <InvoiceDocument data={inv} lang={shown} />
      <ReasonDialog open={cancelOpen} title={t('cancelSale')} confirmLabel={t('cancelSale')} onClose={() => setCancelOpen(false)} onConfirm={(r) => void cancel.run(r)} pending={cancel.pending} error={cancel.error} />
      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title={t('collectDue')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button pending={collect.pending} onClick={() => void collect.run()}>
              {t('record')}
            </Button>
          </>
        }
      >
        <Card>
          <div className="flex flex-col gap-3">
            <Field label={t('method')}>
              {(id) => (
                <Select id={id} value={payment.methodId} onChange={(e) => setPayment((p) => ({ ...p, methodId: e.target.value }))}>
                  {methods.data?.filter((m) => m.isActive && m.availableInPos).map((m) => (
                    <option key={m.id} value={m.id}>
                      {methodLabel(m)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('amount')} hint={t('dueHint', { amount: due.toFixed(2), currency: access.shop.currency })}>
              {(id) => <Input id={id} inputMode="decimal" value={payment.amount} onChange={(e) => setPayment((p) => ({ ...p, amount: e.target.value }))} />}
            </Field>
            <Field label={t('reference')}>{(id) => <Input id={id} value={payment.reference} onChange={(e) => setPayment((p) => ({ ...p, reference: e.target.value }))} />}</Field>
            <ErrorNote error={collect.error} />
          </div>
        </Card>
      </Modal>
    </>
  );
}
