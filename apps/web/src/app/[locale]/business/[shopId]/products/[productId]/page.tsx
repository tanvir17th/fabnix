'use client';

import { useTranslations } from 'next-intl';
import { use, useEffect, useRef, useState } from 'react';
import { useShop } from '@/components/shop-context';
import { Button, Card, Checkbox, ErrorNote, Field, Input, Loading, Notice, PageHeader, Select, StatusBadge, Textarea } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useAction, useApi } from '@/lib/hooks';
import { useUnitLabel } from '@/components/measurement';
import { useFormat } from '@/lib/format';

interface ProductImage {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  altText: string | null;
  sortOrder: number;
  width: number;
  height: number;
}
interface Product {
  id: string;
  name: string;
  slug: string;
  sku: string;
  barcode: string | null;
  description: string | null;
  categoryId: string | null;
  fabricType: string | null;
  brand: string | null;
  color: string | null;
  colorHex: string | null;
  pattern: string | null;
  material: string | null;
  widthInches: string | null;
  priceUnitCode: string;
  sellingRate: string;
  purchaseRate: string | null;
  taxRate: string | null;
  lowStockThresholdInches: string | null;
  minOrderInches: string | null;
  status: string;
  availableInPos: boolean;
  isPublishedOnline: boolean;
  moderationStatus: string;
  moderationReason: string | null;
  images: ProductImage[];
  inventory: Array<{ branch: { id: string; name: string }; onHandInches: string; reservedInches: string; availableInches: string }>;
}

const EDITABLE = ['name', 'slug', 'sku', 'barcode', 'description', 'fabricType', 'brand', 'color', 'colorHex', 'pattern', 'material', 'widthInches', 'priceUnitCode', 'sellingRate', 'purchaseRate', 'taxRate', 'lowStockThresholdInches', 'minOrderInches', 'categoryId'] as const;
type FormState = Record<(typeof EDITABLE)[number], string>;

/** FR-020…FR-025 product editor + FR-091/092 photo manager + FR-094 online publishing. */
export default function ProductEditor({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = use(params);
  const t = useTranslations('products');
  const tc = useTranslations('common');
  const f = useFormat();
  const unitLabel = useUnitLabel();
  const { shopId, can } = useShop();
  const { call } = useAuth();
  const product = useApi<Product>(`/shops/${shopId}/products/${productId}`);
  const categories = useApi<Array<{ id: string; name: string }>>(`/shops/${shopId}/categories`);
  const [form, setForm] = useState<FormState | null>(null);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const editable = can('catalog.manage');

  useEffect(() => {
    if (product.data) setForm(Object.fromEntries(EDITABLE.map((k) => [k, (product.data as unknown as Record<string, string | null>)[k] ?? ''])) as FormState);
  }, [product.data]);

  const save = useAction(async () => {
    const body: Record<string, unknown> = {};
    for (const k of EDITABLE) {
      const v = form![k].trim();
      const nullable = ['categoryId', 'taxRate', 'lowStockThresholdInches', 'minOrderInches'].includes(k);
      if (v) body[k] = v;
      else if (nullable) body[k] = null;
    }
    await call(`/shops/${shopId}/products/${productId}`, { method: 'PATCH', body });
    setSaved(true);
    await product.reload();
  });
  const patchStatus = useAction(async (body: Record<string, unknown>) => {
    await call(`/shops/${shopId}/products/${productId}`, { method: 'PATCH', body });
    await product.reload();
  });
  const publish = useAction(async (published: boolean) => {
    await call(`/shops/${shopId}/products/${productId}/publication`, { method: 'PUT', body: { published } });
    await product.reload();
  });
  const upload = useAction(async (files: FileList) => {
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append('file', file);
      await call(`/shops/${shopId}/products/${productId}/images`, { method: 'POST', body: fd });
    }
    if (fileRef.current) fileRef.current.value = '';
    await product.reload();
  });
  const reorder = useAction(async (ids: string[]) => {
    await call(`/shops/${shopId}/products/${productId}/images-order`, { method: 'PUT', body: { imageIds: ids } });
    await product.reload();
  });
  const removeImage = useAction(async (imageId: string) => {
    await call(`/shops/${shopId}/products/${productId}/images/${imageId}`, { method: 'DELETE' });
    await product.reload();
  });
  const setAlt = useAction(async (imageId: string, altText: string) => {
    await call(`/shops/${shopId}/products/${productId}/images/${imageId}`, { method: 'PATCH', body: { altText: altText || null } });
  });

  if (product.error) return <ErrorNote error={product.error} />;
  if (!product.data || !form) return <Loading />;
  const p = product.data;
  const images = [...p.images].sort((a, b) => a.sortOrder - b.sortOrder);
  const move = (idx: number, dir: -1 | 1) => {
    const ids = images.map((i) => i.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j]!, ids[idx]!];
    void reorder.run(ids);
  };
  const input = (k: keyof FormState, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (id: string) => (
    <Input id={id} disabled={!editable} value={form[k]} onChange={(e) => { setSaved(false); setForm((s) => ({ ...s!, [k]: e.target.value })); }} {...props} />
  );

  return (
    <>
      <PageHeader
        title={p.name}
        subtitle={
          <span className="inline-flex gap-2">
            <StatusBadge status={p.status} />
            <StatusBadge status={p.moderationStatus !== 'VISIBLE' ? p.moderationStatus : p.isPublishedOnline ? 'PUBLISHED' : 'UNPUBLISHED'} />
          </span>
        }
        actions={
          <>
            {can('catalog.publish') && p.status === 'ACTIVE' && (
              <Button variant={p.isPublishedOnline ? 'secondary' : 'accent'} pending={publish.pending} onClick={() => void publish.run(!p.isPublishedOnline)}>
                {p.isPublishedOnline ? t('unpublish') : t('publish')}
              </Button>
            )}
            {editable && p.status !== 'ARCHIVED' && (
              <Button variant="ghost" onClick={() => void patchStatus.run({ status: p.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}>
                {p.status === 'ACTIVE' ? t('deactivate') : t('activate')}
              </Button>
            )}
          </>
        }
      />
      <ErrorNote error={publish.error ?? patchStatus.error} className="mb-4" />
      {p.moderationStatus !== 'VISIBLE' && <Notice tone="warning">{t('moderated', { reason: p.moderationReason ?? '' })}</Notice>}

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card title={t('details')}>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save.run();
            }}
          >
            <Field label={t('name')} className="sm:col-span-2">{input('name', { required: true })}</Field>
            <Field label={t('sku')}>{input('sku', { required: true })}</Field>
            <Field label={t('barcode')}>{input('barcode')}</Field>
            <Field label={t('slug')} hint={t('slugHint')}>{input('slug')}</Field>
            <Field label={t('category')}>
              {(id) => (
                <Select id={id} disabled={!editable} value={form.categoryId} onChange={(e) => setForm((s) => ({ ...s!, categoryId: e.target.value }))}>
                  <option value="">—</option>
                  {categories.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('price')}>{input('sellingRate', { inputMode: 'decimal', required: true })}</Field>
            <Field label={t('priceUnit')}>
              {(id) => (
                <Select id={id} disabled={!editable} value={form.priceUnitCode} onChange={(e) => setForm((s) => ({ ...s!, priceUnitCode: e.target.value }))}>
                  {['YARD', 'METRE', 'GIRA', 'INCH'].map((u) => (
                    <option key={u} value={u}>
                      {unitLabel({ code: u })}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('purchaseRate')}>{input('purchaseRate', { inputMode: 'decimal' })}</Field>
            <Field label={t('taxRate')} hint={t('taxRateHint')}>{input('taxRate', { inputMode: 'decimal' })}</Field>
            <Field label={t('fabricType')}>{input('fabricType')}</Field>
            <Field label={t('material')}>{input('material')}</Field>
            <Field label={t('color')}>{input('color')}</Field>
            <Field label={t('colorHex')}>{input('colorHex', { placeholder: '#1E3A8A' })}</Field>
            <Field label={t('pattern')}>{input('pattern')}</Field>
            <Field label={t('brand')}>{input('brand')}</Field>
            <Field label={t('width')}>{input('widthInches', { inputMode: 'decimal' })}</Field>
            <Field label={t('lowStock')} hint={t('inchesHint')}>{input('lowStockThresholdInches', { inputMode: 'decimal' })}</Field>
            <Field label={t('minOrder')} hint={t('inchesHint')}>{input('minOrderInches', { inputMode: 'decimal' })}</Field>
            <Field label={t('description')} className="sm:col-span-2">
              {(id) => <Textarea id={id} disabled={!editable} rows={5} value={form.description} onChange={(e) => setForm((s) => ({ ...s!, description: e.target.value }))} />}
            </Field>
            {editable && (
              <div className="flex items-center gap-3 sm:col-span-2">
                <Checkbox label={t('availableInPos')} checked={p.availableInPos} onChange={(v) => void patchStatus.run({ availableInPos: v })} />
              </div>
            )}
            <ErrorNote error={save.error} className="sm:col-span-2" />
            {saved && <Notice tone="success">{tc('saved')}</Notice>}
            {editable && (
              <Button type="submit" pending={save.pending} className="sm:col-span-2 sm:w-fit">
                {tc('save')}
              </Button>
            )}
          </form>
        </Card>

        <div className="flex flex-col gap-6">
          <Card title={t('photos')}>
            <p className="mb-3 text-xs text-muted">{t('photosHint')}</p>
            <ul className="grid grid-cols-2 gap-3">
              {images.map((im, idx) => (
                <li key={im.id} className="overflow-hidden rounded-md border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.thumbnailUrl ?? im.url} alt={im.altText ?? ''} className="aspect-square w-full object-cover" />
                  {editable && (
                    <div className="flex flex-col gap-1 p-2">
                      <Input aria-label={t('altText')} placeholder={t('altText')} defaultValue={im.altText ?? ''} className="h-8 text-xs" onBlur={(e) => void setAlt.run(im.id, e.target.value)} />
                      <div className="flex justify-between">
                        <Button size="sm" variant="ghost" aria-label={t('moveEarlier')} disabled={idx === 0} onClick={() => move(idx, -1)}>
                          ←
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void removeImage.run(im.id)}>
                          {t('removePhoto')}
                        </Button>
                        <Button size="sm" variant="ghost" aria-label={t('moveLater')} disabled={idx === images.length - 1} onClick={() => move(idx, 1)}>
                          →
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {editable && (
              <>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple className="sr-only" id="photo-upload" onChange={(e) => e.target.files?.length && void upload.run(e.target.files)} />
                <label htmlFor="photo-upload" className="mt-3 inline-flex h-10 cursor-pointer items-center rounded-md border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2">
                  {upload.pending ? tc('uploading') : t('addPhotos')}
                </label>
              </>
            )}
            <ErrorNote error={upload.error ?? reorder.error ?? removeImage.error} className="mt-2" />
          </Card>
          <Card title={t('stock')}>
            <ul className="flex flex-col gap-1 text-sm">
              {p.inventory.map((r) => (
                <li key={r.branch.id} className="flex justify-between">
                  <span>{r.branch.name}</span>
                  <span className="tabular">
                    {f.yards(r.availableInches)} {unitLabel({ code: 'YARD' })}
                    {Number(r.reservedInches) > 0 && <span className="text-xs text-muted"> ({t('reserved', { yards: f.yards(r.reservedInches) })})</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
