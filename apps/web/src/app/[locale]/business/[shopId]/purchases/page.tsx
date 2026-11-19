'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { MeasurementComponent } from '@fabnix/shared';
import { MeasurementInput, evaluate } from '@/components/measurement';
import { useShop } from '@/components/shop-context';
import { Button, Card, ErrorNote, Field, Input, Loading, Modal, PageHeader, ReasonDialog, Select, StatusBadge, Tabs, Td, Table } from '@/components/ui';
import { newIdempotencyKey } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFormat } from '@/lib/format';
import { useAction, useApi, useDebounced } from '@/lib/hooks';
import type { Page } from '@/lib/api';

interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  balancePayable: string;
}
interface Purchase {
  id: string;
  purchaseNumber: string;
  purchaseDate: string;
  status: string;
  paymentStatus: string;
  total: string;
  dueAmount: string;
  supplier: { id: string; name: string };
  _count: { items: number };
}

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());

/** FR-054…FR-057 suppliers, purchases (stock-in with landed cost) and supplier dues. */
export default function PurchasesPage() {
  const t = useTranslations('purchases');
  const tc = useTranslations('common');
  const f = useFormat();
  const { shopId, access } = useShop();
  const { call } = useAuth();
  const cur = access.shop.currency;
  const [tab, setTab] = useState<'purchases' | 'suppliers'>('purchases');
  const purchases = useApi<Page<Purchase>>(`/shops/${shopId}/purchases?limit=50`);
  const suppliers = useApi<Page<Supplier>>(`/shops/${shopId}/suppliers?limit=100`);
  const branches = useApi<Array<{ id: string; name: string; isDefault: boolean }>>(`/shops/${shopId}/branches`);
  const methods = useApi<Array<{ id: string; label: string; isActive: boolean }>>(`/shops/${shopId}/payment-methods`);
  const units = useApi<Array<{ code: string; symbol: string; name: string; inchesPerUnit: string; isActive: boolean }>>(`/shops/${shopId}/units`);
  const activeUnits = (units.data ?? []).filter((u) => u.isActive);

  // ---- new supplier
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [supplier, setSupplier] = useState({ name: '', phone: '', contactPerson: '' });
  const createSupplier = useAction(async () => {
    await call(`/shops/${shopId}/suppliers`, { method: 'POST', body: Object.fromEntries(Object.entries(supplier).filter(([, v]) => v.trim())) });
    setSupplierOpen(false);
    setSupplier({ name: '', phone: '', contactPerson: '' });
    await suppliers.reload();
  });

  // ---- new purchase
  const [open, setOpen] = useState(false);
  const [pq, setPq] = useState('');
  const dpq = useDebounced(pq);
  const productSearch = useApi<Page<{ id: string; name: string; sku: string; purchaseRate: string | null; priceUnitCode: string }>>(dpq ? `/shops/${shopId}/products?limit=6&q=${encodeURIComponent(dpq)}` : null);
  const [draft, setDraft] = useState({ supplierId: '', branchId: '', purchaseDate: today(), supplierInvoiceRef: '', discountAmount: '', otherCharges: '', paid: '', methodId: '' });
  const [items, setItems] = useState<Array<{ productId: string; name: string; priceUnitCode: string; components: MeasurementComponent[]; unitCost: string }>>([]);
  const [key, setKey] = useState(newIdempotencyKey);
  const create = useAction(async () => {
    const branchId = draft.branchId || branches.data?.find((b) => b.isDefault)?.id;
    const methodId = draft.methodId || methods.data?.find((m) => m.isActive)?.id;
    await call(`/shops/${shopId}/purchases`, {
      method: 'POST',
      idempotencyKey: key,
      body: {
        branchId,
        supplierId: draft.supplierId,
        purchaseDate: draft.purchaseDate,
        ...(draft.supplierInvoiceRef ? { supplierInvoiceRef: draft.supplierInvoiceRef } : {}),
        discountAmount: draft.discountAmount || '0',
        otherCharges: draft.otherCharges || '0',
        items: items.map((i) => ({ productId: i.productId, measurement: evaluate(i.components, activeUnits).components, unitCost: i.unitCost })),
        payments: draft.paid && Number(draft.paid) > 0 ? [{ paymentMethodId: methodId, amount: draft.paid }] : [],
      },
    });
    setOpen(false);
    setItems([]);
    setKey(newIdempotencyKey());
    await Promise.all([purchases.reload(), suppliers.reload()]);
  });

  // ---- pay / cancel
  const [payFor, setPayFor] = useState<Purchase | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const pay = useAction(async () => {
    await call(`/shops/${shopId}/purchases/${payFor!.id}/payments`, { method: 'POST', body: { paymentMethodId: methods.data?.find((m) => m.isActive)?.id, amount: payAmount } });
    setPayFor(null);
    await Promise.all([purchases.reload(), suppliers.reload()]);
  });
  const [cancelFor, setCancelFor] = useState<Purchase | null>(null);
  const cancel = useAction(async (reason: string) => {
    await call(`/shops/${shopId}/purchases/${cancelFor!.id}/cancel`, { method: 'POST', body: { reason } });
    setCancelFor(null);
    await purchases.reload();
  });

  const invalid = !draft.supplierId || !items.length || items.some((i) => !evaluate(i.components, activeUnits).inches || !i.unitCost);

  return (
    <>
      <PageHeader
        title={t('title')}
        actions={
          <>
            <Button variant="secondary" onClick={() => setSupplierOpen(true)}>
              {t('newSupplier')}
            </Button>
            <Button variant="accent" onClick={() => setOpen(true)} disabled={!suppliers.data?.items.length}>
              {t('newPurchase')}
            </Button>
          </>
        }
      />
      <Tabs value={tab} onChange={setTab} items={[{ value: 'purchases', label: t('purchases') }, { value: 'suppliers', label: t('suppliers') }]} />
      {tab === 'purchases' ? (
        !purchases.data ? (
          <Loading />
        ) : (
          <Table head={[t('number'), t('date'), t('supplier'), t('status'), t('total'), t('due'), '']} empty={!purchases.data.items.length}>
            {purchases.data.items.map((p) => (
              <tr key={p.id}>
                <Td className="font-medium">{p.purchaseNumber}</Td>
                <Td>{f.date(p.purchaseDate)}</Td>
                <Td>{p.supplier.name}</Td>
                <Td>
                  <div className="flex gap-1">
                    <StatusBadge status={p.status} />
                    <StatusBadge status={p.paymentStatus} />
                  </div>
                </Td>
                <Td className="tabular">{f.money(p.total, cur)}</Td>
                <Td className="tabular">{f.money(p.dueAmount, cur)}</Td>
                <Td>
                  {p.status === 'POSTED' && (
                    <div className="flex justify-end gap-1">
                      {Number(p.dueAmount) > 0 && (
                        <Button size="sm" variant="secondary" onClick={() => { setPayFor(p); setPayAmount(p.dueAmount); }}>
                          {t('pay')}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setCancelFor(p)}>
                        {t('reverse')}
                      </Button>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )
      ) : !suppliers.data ? (
        <Loading />
      ) : (
        <Table head={[t('supplier'), t('phone'), t('payable')]} empty={!suppliers.data.items.length}>
          {suppliers.data.items.map((s) => (
            <tr key={s.id}>
              <Td className="font-medium">{s.name}</Td>
              <Td>{s.phone ?? '—'}</Td>
              <Td className={`tabular ${Number(s.balancePayable) > 0 ? 'text-warning' : ''}`}>{f.money(s.balancePayable, cur)}</Td>
            </tr>
          ))}
        </Table>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('newPurchase')}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button pending={create.pending} disabled={invalid} onClick={() => void create.run()}>
              {t('post')}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('supplier')}>
            {(id) => (
              <Select id={id} value={draft.supplierId} onChange={(e) => setDraft((d) => ({ ...d, supplierId: e.target.value }))}>
                <option value="">—</option>
                {suppliers.data?.items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('date')}>{(id) => <Input id={id} type="date" value={draft.purchaseDate} onChange={(e) => setDraft((d) => ({ ...d, purchaseDate: e.target.value }))} />}</Field>
          <Field label={t('supplierRef')}>{(id) => <Input id={id} value={draft.supplierInvoiceRef} onChange={(e) => setDraft((d) => ({ ...d, supplierInvoiceRef: e.target.value }))} />}</Field>
        </div>
        <div className="relative mt-4">
          <Input placeholder={t('addProduct')} aria-label={t('addProduct')} value={pq} onChange={(e) => setPq(e.target.value)} />
          {pq && productSearch.data && (
            <ul className="absolute z-10 mt-1 w-full rounded-md border border-line bg-surface shadow">
              {productSearch.data.items.map((p) => (
                <li key={p.id}>
                  <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-surface-2" onClick={() => { setItems((xs) => [...xs, { productId: p.id, name: p.name, priceUnitCode: p.priceUnitCode, components: [], unitCost: p.purchaseRate ?? '' }]); setPq(''); }}>
                    {p.name} <span className="text-xs text-muted">{p.sku}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-3 flex flex-col gap-3">
          {items.map((i, idx) => (
            <Card key={idx} title={i.name} actions={<Button size="sm" variant="ghost" onClick={() => setItems((xs) => xs.filter((_, j) => j !== idx))}>{tc('remove')}</Button>}>
              <div className="flex flex-wrap items-end gap-4">
                <MeasurementInput units={activeUnits} value={i.components} onChange={(c) => setItems((xs) => xs.map((x, j) => (j === idx ? { ...x, components: c } : x)))} idPrefix={`pi${idx}`} compact />
                <Field label={t('unitCost', { unit: i.priceUnitCode })}>
                  {(id) => <Input id={id} inputMode="decimal" className="w-28" value={i.unitCost} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === idx ? { ...x, unitCost: e.target.value } : x)))} />}
                </Field>
              </div>
            </Card>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Field label={t('discount')}>{(id) => <Input id={id} inputMode="decimal" value={draft.discountAmount} onChange={(e) => setDraft((d) => ({ ...d, discountAmount: e.target.value }))} />}</Field>
          <Field label={t('otherCharges')} hint={t('landedHint')}>{(id) => <Input id={id} inputMode="decimal" value={draft.otherCharges} onChange={(e) => setDraft((d) => ({ ...d, otherCharges: e.target.value }))} />}</Field>
          <Field label={t('paidNow')}>{(id) => <Input id={id} inputMode="decimal" value={draft.paid} onChange={(e) => setDraft((d) => ({ ...d, paid: e.target.value }))} />}</Field>
        </div>
        <ErrorNote error={create.error} className="mt-3" />
      </Modal>

      <Modal
        open={supplierOpen}
        onClose={() => setSupplierOpen(false)}
        title={t('newSupplier')}
        footer={
          <Button pending={createSupplier.pending} disabled={!supplier.name.trim()} onClick={() => void createSupplier.run()}>
            {tc('create')}
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label={t('supplierName')}>{(id) => <Input id={id} value={supplier.name} onChange={(e) => setSupplier((s) => ({ ...s, name: e.target.value }))} />}</Field>
          <Field label={t('contactPerson')}>{(id) => <Input id={id} value={supplier.contactPerson} onChange={(e) => setSupplier((s) => ({ ...s, contactPerson: e.target.value }))} />}</Field>
          <Field label={t('phone')}>{(id) => <Input id={id} type="tel" value={supplier.phone} onChange={(e) => setSupplier((s) => ({ ...s, phone: e.target.value }))} />}</Field>
          <ErrorNote error={createSupplier.error} />
        </div>
      </Modal>
      <Modal
        open={!!payFor}
        onClose={() => setPayFor(null)}
        title={t('pay')}
        footer={
          <Button pending={pay.pending} onClick={() => void pay.run()}>
            {tc('save')}
          </Button>
        }
      >
        <Field label={t('amount')}>{(id) => <Input id={id} inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />}</Field>
        <ErrorNote error={pay.error} className="mt-2" />
      </Modal>
      <ReasonDialog open={!!cancelFor} title={t('reverse')} confirmLabel={t('reverse')} onClose={() => setCancelFor(null)} onConfirm={(r) => void cancel.run(r)} pending={cancel.pending} error={cancel.error} />
    </>
  );
}
