'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useShop } from '@/components/shop-context';
import { Button, ErrorNote, Field, Input, Loading, Modal, PageHeader, Select, StatusBadge, Td, Table } from '@/components/ui';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth';
import { useFormat } from '@/lib/format';
import { useAction, useApi, useDebounced } from '@/lib/hooks';
import { useUnitLabel } from '@/components/measurement';
import type { Page } from '@/lib/api';

interface Product {
  id: string;
  name: string;
  sku: string;
  priceUnitCode: string;
  sellingRate: string;
  status: string;
  isPublishedOnline: boolean;
  moderationStatus: string;
  thumbnailUrl: string | null;
  fabricType: string | null;
  color: string | null;
}

/** FR-020/022 catalogue with search & filters. */
export default function ProductsPage() {
  const t = useTranslations('products');
  const tc = useTranslations('common');
  const f = useFormat();
  const unitLabel = useUnitLabel();
  const router = useRouter();
  const { shopId, base, can, access } = useShop();
  const { call } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const dq = useDebounced(q);
  const products = useApi<Page<Product>>(`/shops/${shopId}/products?limit=25${dq ? `&q=${encodeURIComponent(dq)}` : ''}${status ? `&status=${status}` : ''}${cursor ? `&cursor=${cursor}` : ''}`);
  const categories = useApi<Array<{ id: string; name: string }>>(`/shops/${shopId}/categories`);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', sku: '', sellingRate: '', priceUnitCode: 'YARD', categoryId: '', fabricType: '', color: '' });
  const create = useAction(async () => {
    const p = await call<{ id: string }>(`/shops/${shopId}/products`, {
      method: 'POST',
      body: { ...Object.fromEntries(Object.entries(form).filter(([, v]) => v)), sellingRate: form.sellingRate },
    });
    router.push(`${base}/products/${p.id}`);
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((s) => ({ ...s, [k]: e.target.value }));

  return (
    <>
      <PageHeader title={t('title')} actions={can('catalog.manage') && <Button variant="accent" onClick={() => setOpen(true)}>{t('new')}</Button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input type="search" placeholder={t('search')} aria-label={t('search')} value={q} onChange={(e) => { setCursor(null); setQ(e.target.value); }} className="w-72" />
        <Select aria-label={t('status')} value={status} onChange={(e) => { setCursor(null); setStatus(e.target.value); }} className="w-40">
          <option value="">{t('allActive')}</option>
          {['ACTIVE', 'INACTIVE', 'ARCHIVED'].map((s) => (
            <option key={s} value={s}>
              {t(`statusLabel.${s}`)}
            </option>
          ))}
        </Select>
      </div>
      <ErrorNote error={products.error} />
      {!products.data ? (
        <Loading />
      ) : (
        <>
          <Table head={['', t('name'), t('sku'), t('price'), t('status'), t('online')]} empty={!products.data.items.length}>
            {products.data.items.map((p) => (
              <tr key={p.id}>
                <Td className="w-14">
                  <div className="h-10 w-10 overflow-hidden rounded bg-surface-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {p.thumbnailUrl && <img src={p.thumbnailUrl} alt="" className="h-full w-full object-cover" />}
                  </div>
                </Td>
                <Td>
                  <Link href={`${base}/products/${p.id}`} className="font-medium hover:text-accent-ink">
                    {p.name}
                  </Link>
                  <span className="block text-xs text-muted">{[p.fabricType, p.color].filter(Boolean).join(' · ')}</span>
                </Td>
                <Td className="text-muted">{p.sku}</Td>
                <Td className="tabular">
                  {f.money(p.sellingRate, access.shop.currency)}/{unitLabel({ code: p.priceUnitCode })}
                </Td>
                <Td>
                  <StatusBadge status={p.status} />
                </Td>
                <Td>{p.moderationStatus !== 'VISIBLE' ? <StatusBadge status={p.moderationStatus} /> : <StatusBadge status={p.isPublishedOnline ? 'PUBLISHED' : 'UNPUBLISHED'} />}</Td>
              </tr>
            ))}
          </Table>
          {products.data.nextCursor && (
            <div className="mt-4 text-center">
              <Button variant="secondary" onClick={() => setCursor(products.data!.nextCursor)}>
                {tc('next')}
              </Button>
            </div>
          )}
        </>
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
            <Button pending={create.pending} disabled={!form.name || !form.sku || !form.sellingRate} onClick={() => void create.run()}>
              {tc('create')}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('name')} className="sm:col-span-2">{(id) => <Input id={id} value={form.name} onChange={set('name')} />}</Field>
          <Field label={t('sku')}>{(id) => <Input id={id} value={form.sku} onChange={set('sku')} />}</Field>
          <Field label={t('category')}>
            {(id) => (
              <Select id={id} value={form.categoryId} onChange={set('categoryId')}>
                <option value="">—</option>
                {categories.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('price')}>{(id) => <Input id={id} inputMode="decimal" value={form.sellingRate} onChange={set('sellingRate')} />}</Field>
          <Field label={t('priceUnit')}>
            {(id) => (
              <Select id={id} value={form.priceUnitCode} onChange={set('priceUnitCode')}>
                {['YARD', 'METRE', 'GIRA', 'INCH'].map((u) => (
                  <option key={u} value={u}>
                    {unitLabel({ code: u })}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('fabricType')}>{(id) => <Input id={id} value={form.fabricType} onChange={set('fabricType')} />}</Field>
          <Field label={t('color')}>{(id) => <Input id={id} value={form.color} onChange={set('color')} />}</Field>
          <ErrorNote error={create.error} className="sm:col-span-2" />
        </div>
      </Modal>
    </>
  );
}
