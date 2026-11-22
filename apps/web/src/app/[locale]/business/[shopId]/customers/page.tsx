'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useShop } from '@/components/shop-context';
import { Button, Checkbox, ErrorNote, Field, Input, Loading, Modal, PageHeader, StatusBadge, Td, Table, Textarea } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth';
import { useFormat } from '@/lib/format';
import { useAction, useApi, useDebounced } from '@/lib/hooks';
import type { Page } from '@/lib/api';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  balanceDue: string;
  userId: string | null;
}
interface CustomerDetail extends Customer {
  addressLine: string | null;
  notes: string | null;
  sales: Array<{ id: string; invoiceNumber: string; soldAt: string; grandTotal: string; dueAmount: string; status: string; paymentStatus: string }>;
  orders: Array<{ id: string; orderNumber: string; placedAt: string; total: string; status: string }>;
}

/** FR-050…FR-052 customer profiles, history and receivables. */
export default function CustomersPage() {
  const t = useTranslations('customers');
  const tc = useTranslations('common');
  const f = useFormat();
  const { shopId, base, can, access } = useShop();
  const { call } = useAuth();
  const [q, setQ] = useState('');
  const [withDue, setWithDue] = useState(false);
  const dq = useDebounced(q);
  const list = useApi<Page<Customer>>(`/shops/${shopId}/customers?limit=50${dq ? `&q=${encodeURIComponent(dq)}` : ''}${withDue ? '&withDue=true' : ''}`);
  const [selected, setSelected] = useState<string | null>(null);
  const detail = useApi<CustomerDetail>(selected ? `/shops/${shopId}/customers/${selected}` : null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', addressLine: '', notes: '' });
  const create = useAction(async () => {
    await call(`/shops/${shopId}/customers`, { method: 'POST', body: Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim())) });
    setCreating(false);
    setForm({ name: '', phone: '', email: '', addressLine: '', notes: '' });
    await list.reload();
  });
  const cur = access.shop.currency;

  return (
    <>
      <PageHeader title={t('title')} actions={can('customers.manage') && <Button variant="accent" onClick={() => setCreating(true)}>{t('new')}</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Input type="search" placeholder={t('search')} aria-label={t('search')} value={q} onChange={(e) => setQ(e.target.value)} className="w-72" />
        <Checkbox label={t('withDue')} checked={withDue} onChange={setWithDue} />
      </div>
      <ErrorNote error={list.error} />
      {!list.data ? (
        <Loading />
      ) : (
        <Table head={[t('name'), t('phone'), t('online'), t('due')]} empty={!list.data.items.length}>
          {list.data.items.map((c) => (
            <tr key={c.id} className="cursor-pointer hover:bg-surface-2" onClick={() => setSelected(c.id)}>
              <Td className="font-medium">{c.name}</Td>
              <Td>{c.phone ?? '—'}</Td>
              <Td>{c.userId ? '✓' : ''}</Td>
              <Td className={`tabular ${Number(c.balanceDue) > 0 ? 'font-medium text-warning' : ''}`}>{f.money(c.balanceDue, cur)}</Td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={detail.data?.name ?? ''} wide>
        {!detail.data ? (
          <Loading />
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              {detail.data.phone} {detail.data.email && `· ${detail.data.email}`} · {t('due')}: <strong>{f.money(detail.data.balanceDue, cur)}</strong>
            </p>
            <h3 className="font-semibold">{t('sales')}</h3>
            <Table head={[t('invoice'), t('date'), t('total'), t('due'), '']} empty={!detail.data.sales.length}>
              {detail.data.sales.map((s) => (
                <tr key={s.id}>
                  <Td>
                    <Link href={`${base}/sales/${s.id}`} className="text-accent-ink">
                      {s.invoiceNumber}
                    </Link>
                  </Td>
                  <Td className="tabular">{f.date(s.soldAt)}</Td>
                  <Td className="tabular">{f.money(s.grandTotal, cur)}</Td>
                  <Td className="tabular">{f.money(s.dueAmount, cur)}</Td>
                  <Td>
                    <StatusBadge status={s.paymentStatus} />
                  </Td>
                </tr>
              ))}
            </Table>
            {detail.data.orders.length > 0 && (
              <>
                <h3 className="font-semibold">{t('orders')}</h3>
                <Table head={[t('order'), t('date'), t('total'), '']}>
                  {detail.data.orders.map((o) => (
                    <tr key={o.id}>
                      <Td>
                        <Link href={`${base}/orders/${o.id}`} className="text-accent-ink">
                          {o.orderNumber}
                        </Link>
                      </Td>
                      <Td className="tabular">{f.date(o.placedAt)}</Td>
                      <Td className="tabular">{f.money(o.total, cur)}</Td>
                      <Td>
                        <StatusBadge status={o.status} />
                      </Td>
                    </tr>
                  ))}
                </Table>
              </>
            )}
          </div>
        )}
      </Modal>
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={t('new')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              {tc('cancel')}
            </Button>
            <Button pending={create.pending} disabled={!form.name.trim()} onClick={() => void create.run()}>
              {tc('create')}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {(['name', 'phone', 'email', 'addressLine'] as const).map((k) => (
            <Field key={k} label={t(k)}>
              {(id) => <Input id={id} value={form[k]} onChange={(e) => setForm((s) => ({ ...s, [k]: e.target.value }))} />}
            </Field>
          ))}
          <Field label={t('notes')} className="sm:col-span-2">
            {(id) => <Textarea id={id} value={form.notes} onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))} />}
          </Field>
          <ErrorNote error={create.error} className="sm:col-span-2" />
        </div>
      </Modal>
    </>
  );
}
