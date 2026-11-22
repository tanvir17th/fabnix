'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useShop } from '@/components/shop-context';
import { Button, ErrorNote, Field, Input, Loading, Modal, PageHeader, ReasonDialog, Select, StatusBadge, Stat, Td, Table } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useFormat } from '@/lib/format';
import { usePaymentMethodLabel } from '@/lib/payment-label';
import { useAction, useApi } from '@/lib/hooks';

interface Category {
  id: string;
  name: string;
  nameKey: string | null;
}
interface Expense {
  id: string;
  amount: string;
  expenseDate: string;
  note: string | null;
  status: string;
  category: Category;
  createdBy: { fullName: string };
}

const localToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
const monthStart = () => `${localToday().slice(0, 8)}01`;

/** FR-058/059/062 expenses: record, filter by date, void (never delete). */
export default function ExpensesPage() {
  const methodLabel = usePaymentMethodLabel();
  const t = useTranslations('expenses');
  const tk = useTranslations();
  const tc = useTranslations('common');
  const f = useFormat();
  const { shopId, access } = useShop();
  const { call } = useAuth();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(localToday);
  const categories = useApi<Category[]>(`/shops/${shopId}/expense-categories`);
  const methods = useApi<Array<{ id: string; type: string; label: string; isActive: boolean }>>(`/shops/${shopId}/payment-methods`);
  const list = useApi<{ items: Expense[]; total: string }>(`/shops/${shopId}/expenses?limit=100&from=${from}&to=${to}`);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ categoryId: '', amount: '', expenseDate: localToday(), paymentMethodId: '', note: '' });
  const create = useAction(async () => {
    await call(`/shops/${shopId}/expenses`, { method: 'POST', body: Object.fromEntries(Object.entries(form).filter(([, v]) => v)) });
    setOpen(false);
    setForm((s) => ({ ...s, amount: '', note: '' }));
    await list.reload();
  });
  const [voidFor, setVoidFor] = useState<Expense | null>(null);
  const voidIt = useAction(async (reason: string) => {
    await call(`/shops/${shopId}/expenses/${voidFor!.id}/void`, { method: 'POST', body: { reason } });
    setVoidFor(null);
    await list.reload();
  });
  const catName = (c: Category) => (c.nameKey && tk.has(c.nameKey) ? tk(c.nameKey) : c.name);

  return (
    <>
      <PageHeader title={t('title')} actions={<Button variant="accent" onClick={() => setOpen(true)}>{t('new')}</Button>} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label={t('from')}>{(id) => <Input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <Field label={t('to')}>{(id) => <Input id={id} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
        <div className="min-w-48">
          <Stat label={t('total')} value={f.money(list.data?.total ?? '0', access.shop.currency)} />
        </div>
      </div>
      <ErrorNote error={list.error} />
      {!list.data ? (
        <Loading />
      ) : (
        <Table head={[t('date'), t('category'), t('note'), t('by'), t('amount'), '']} empty={!list.data.items.length}>
          {list.data.items.map((e) => (
            <tr key={e.id} className={e.status !== 'POSTED' ? 'opacity-50' : undefined}>
              <Td className="tabular">{f.date(e.expenseDate)}</Td>
              <Td>{catName(e.category)}</Td>
              <Td className="text-sm">{e.note}</Td>
              <Td className="text-sm text-muted">{e.createdBy.fullName}</Td>
              <Td className="tabular">{f.money(e.amount, access.shop.currency)}</Td>
              <Td>
                {e.status === 'POSTED' ? (
                  <Button size="sm" variant="ghost" onClick={() => setVoidFor(e)}>
                    {t('void')}
                  </Button>
                ) : (
                  <StatusBadge status={e.status} />
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('new')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button pending={create.pending} disabled={!form.categoryId || !form.amount} onClick={() => void create.run()}>
              {tc('save')}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('category')}>
            {(id) => (
              <Select id={id} value={form.categoryId} onChange={(e) => setForm((s) => ({ ...s, categoryId: e.target.value }))}>
                <option value="">—</option>
                {categories.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {catName(c)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('amount')}>{(id) => <Input id={id} inputMode="decimal" value={form.amount} onChange={(e) => setForm((s) => ({ ...s, amount: e.target.value }))} />}</Field>
          <Field label={t('date')}>{(id) => <Input id={id} type="date" value={form.expenseDate} onChange={(e) => setForm((s) => ({ ...s, expenseDate: e.target.value }))} />}</Field>
          <Field label={t('method')}>
            {(id) => (
              <Select id={id} value={form.paymentMethodId} onChange={(e) => setForm((s) => ({ ...s, paymentMethodId: e.target.value }))}>
                <option value="">—</option>
                {methods.data?.filter((m) => m.isActive).map((m) => (
                  <option key={m.id} value={m.id}>
                    {methodLabel(m)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('note')} className="sm:col-span-2">{(id) => <Input id={id} value={form.note} onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))} />}</Field>
          <ErrorNote error={create.error} className="sm:col-span-2" />
        </div>
      </Modal>
      <ReasonDialog open={!!voidFor} title={t('void')} confirmLabel={t('void')} onClose={() => setVoidFor(null)} onConfirm={(r) => void voidIt.run(r)} pending={voidIt.pending} error={voidIt.error} />
    </>
  );
}
