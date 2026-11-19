'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useShop } from '@/components/shop-context';
import { Button, Card, ErrorNote, Field, Input, Loading, Notice, PageHeader, Select, StatusBadge, Td, Table, Textarea } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth';
import { useFormat } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';

interface Storefront {
  id: string;
  slug: string;
  displayName: string;
  tagline: string | null;
  description: string | null;
  contactPhone: string | null;
  addressLine: string | null;
  deliveryInfo: string | null;
  returnPolicy: string | null;
  stockVisibility: string;
  minOrderAmount: string | null;
  isEnabled: boolean;
  status: string;
  acceptingOrders: boolean;
  adminSuspended: boolean;
  adminSuspendReason: string | null;
}
interface DeliveryOption {
  id: string;
  method: 'HOME_DELIVERY' | 'PICKUP';
  name: string;
  chargeType: string;
  flatFee: string;
  freeOverAmount: string | null;
  isActive: boolean;
}

const FIELDS = ['slug', 'displayName', 'tagline', 'contactPhone', 'addressLine', 'minOrderAmount'] as const;
const LONG = ['description', 'deliveryInfo', 'returnPolicy'] as const;
type Form = Record<(typeof FIELDS)[number] | (typeof LONG)[number] | 'stockVisibility', string>;

/** FR-086…FR-090 storefront activation, profile, URL, visibility, delivery & policies. */
export default function OnlineStorePage() {
  const t = useTranslations('store.admin');
  const ts = useTranslations('store');
  const tc = useTranslations('common');
  const f = useFormat();
  const { shopId, access } = useShop();
  const { call } = useAuth();
  const sf = useApi<Storefront | null>(`/shops/${shopId}/storefront`);
  const delivery = useApi<DeliveryOption[]>(`/shops/${shopId}/storefront/delivery-options`);
  const [form, setForm] = useState<Form | null>(null);
  const [saved, setSaved] = useState(false);
  const [opt, setOpt] = useState({ method: 'HOME_DELIVERY', name: '', flatFee: '0', chargeType: 'FLAT', freeOverAmount: '' });

  useEffect(() => {
    if (sf.loading) return;
    const s = sf.data;
    setForm({
      slug: s?.slug ?? '',
      displayName: s?.displayName ?? access.shop.name,
      tagline: s?.tagline ?? '',
      contactPhone: s?.contactPhone ?? '',
      addressLine: s?.addressLine ?? '',
      minOrderAmount: s?.minOrderAmount ?? '',
      description: s?.description ?? '',
      deliveryInfo: s?.deliveryInfo ?? '',
      returnPolicy: s?.returnPolicy ?? '',
      stockVisibility: s?.stockVisibility ?? 'STATUS_ONLY',
    });
  }, [sf.data, sf.loading, access.shop.name]);

  const save = useAction(async () => {
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(form!)) body[k] = v.trim() ? v.trim() : sf.data && k !== 'slug' && k !== 'displayName' ? null : undefined;
    sf.setData(await call<Storefront>(`/shops/${shopId}/storefront`, { method: 'PUT', body }));
    setSaved(true);
  });
  const visibility = useAction(async (action: string) => sf.setData(await call<Storefront>(`/shops/${shopId}/storefront/visibility`, { method: 'POST', body: { action } })));
  const addOption = useAction(async () => {
    await call(`/shops/${shopId}/storefront/delivery-options`, { method: 'POST', body: { ...opt, ...(opt.freeOverAmount ? {} : { freeOverAmount: undefined }) } });
    setOpt({ method: 'HOME_DELIVERY', name: '', flatFee: '0', chargeType: 'FLAT', freeOverAmount: '' });
    await delivery.reload();
  });
  const toggleOption = useAction(async (o: DeliveryOption) => {
    await call(`/shops/${shopId}/storefront/delivery-options/${o.id}`, { method: 'PATCH', body: { isActive: !o.isActive } });
    await delivery.reload();
  });

  if (sf.loading || !form) return <Loading />;
  const s = sf.data;
  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={s ? <span className="inline-flex items-center gap-2"><StatusBadge status={s.isEnabled ? s.status : 'UNPUBLISHED'} /> fabnix.com/shop/{s.slug}</span> : t('notCreated')}
        actions={
          s && (
            <>
              <Link href={`/shop/${s.slug}`} className="inline-flex h-10 items-center rounded-md border border-line px-4 text-sm">
                {t('view')}
              </Link>
              {!s.isEnabled ? (
                <Button variant="secondary" pending={visibility.pending} onClick={() => void visibility.run('ENABLE')}>
                  {t('enable')}
                </Button>
              ) : (
                <>
                  {s.status !== 'PUBLISHED' && (
                    <Button variant="accent" pending={visibility.pending} onClick={() => void visibility.run('PUBLISH')}>
                      {t('publish')}
                    </Button>
                  )}
                  {s.status === 'PUBLISHED' && (
                    <Button variant="secondary" onClick={() => void visibility.run('PAUSE')}>
                      {t('pause')}
                    </Button>
                  )}
                  {s.status !== 'UNPUBLISHED' && (
                    <Button variant="ghost" onClick={() => void visibility.run('UNPUBLISH')}>
                      {t('unpublish')}
                    </Button>
                  )}
                </>
              )}
            </>
          )
        }
      />
      <ErrorNote error={visibility.error} className="mb-4" />
      {s?.adminSuspended && <Notice tone="warning">{t('suspended', { reason: s.adminSuspendReason ?? '' })}</Notice>}
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_400px]">
        <Card title={t('profile')}>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save.run();
            }}
          >
            {FIELDS.map((k) => (
              <Field key={k} label={t(`field.${k}`)} hint={k === 'slug' ? t('slugHint') : undefined}>
                {(id) => <Input id={id} required={k === 'slug' || k === 'displayName'} value={form[k]} onChange={(e) => { setSaved(false); setForm({ ...form, [k]: e.target.value }); }} />}
              </Field>
            ))}
            <Field label={t('field.stockVisibility')}>
              {(id) => (
                <Select id={id} value={form.stockVisibility} onChange={(e) => setForm({ ...form, stockVisibility: e.target.value })}>
                  {['HIDE', 'STATUS_ONLY', 'EXACT'].map((v) => (
                    <option key={v} value={v}>
                      {t(`visibility.${v}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {LONG.map((k) => (
              <Field key={k} label={t(`field.${k}`)} className="sm:col-span-2">
                {(id) => <Textarea id={id} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />}
              </Field>
            ))}
            <ErrorNote error={save.error} className="sm:col-span-2" />
            {saved && <Notice tone="success">{tc('saved')}</Notice>}
            <Button type="submit" pending={save.pending} className="sm:w-fit">
              {s ? tc('save') : t('create')}
            </Button>
          </form>
        </Card>
        <Card title={t('delivery')}>
          {!s ? (
            <p className="text-sm text-muted">{t('createFirst')}</p>
          ) : (
            <>
              <Table head={[t('option'), t('fee'), '']} empty={!delivery.data?.length}>
                {delivery.data?.map((o) => (
                  <tr key={o.id} className={o.isActive ? undefined : 'opacity-50'}>
                    <Td>
                      {o.name}
                      <span className="block text-xs text-muted">{ts(`deliveryMethod.${o.method}`)}</span>
                    </Td>
                    <Td className="tabular">
                      {f.money(o.flatFee, access.shop.currency)}
                      {o.freeOverAmount && <span className="block text-xs text-muted">{t('freeOver', { amount: f.money(o.freeOverAmount, access.shop.currency) })}</span>}
                    </Td>
                    <Td>
                      <Button size="sm" variant="ghost" onClick={() => void toggleOption.run(o)}>
                        {o.isActive ? t('disable') : t('enable')}
                      </Button>
                    </Td>
                  </tr>
                ))}
              </Table>
              <form
                className="mt-4 grid gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void addOption.run();
                }}
              >
                <Select aria-label={t('method')} value={opt.method} onChange={(e) => setOpt({ ...opt, method: e.target.value })}>
                  <option value="HOME_DELIVERY">{ts('deliveryMethod.HOME_DELIVERY')}</option>
                  <option value="PICKUP">{ts('deliveryMethod.PICKUP')}</option>
                </Select>
                <Input aria-label={t('option')} placeholder={t('optionName')} required value={opt.name} onChange={(e) => setOpt({ ...opt, name: e.target.value })} />
                <div className="flex gap-2">
                  <Input aria-label={t('fee')} inputMode="decimal" value={opt.flatFee} onChange={(e) => setOpt({ ...opt, flatFee: e.target.value })} />
                  <Input
                    aria-label={t('freeOverLabel')}
                    placeholder={t('freeOverLabel')}
                    inputMode="decimal"
                    value={opt.freeOverAmount}
                    onChange={(e) => setOpt({ ...opt, freeOverAmount: e.target.value, chargeType: e.target.value ? 'FREE_OVER_THRESHOLD' : 'FLAT' })}
                  />
                </div>
                <ErrorNote error={addOption.error ?? toggleOption.error} />
                <Button type="submit" variant="secondary" pending={addOption.pending}>
                  + {t('addOption')}
                </Button>
              </form>
              <p className="mt-4 text-xs text-muted">{t('paymentHint')}</p>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
