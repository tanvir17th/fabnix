'use client';

import { useLocale, useTranslations } from 'next-intl';
import { use, useMemo, useState } from 'react';
import { D } from '@fabnix/shared';
import { RequireUser } from '@/components/shells';
import { useMeasurementText } from '@/components/measurement';
import { Button, Card, ErrorNote, Field, Input, Loading, Notice, Textarea } from '@/components/ui';
import { Link, useRouter } from '@/i18n/navigation';
import { newIdempotencyKey } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFormat } from '@/lib/format';
import { usePaymentMethodLabel } from '@/lib/payment-label';
import { useAction, useApi } from '@/lib/hooks';
import type { StoreProfile } from '../page';
import type { CartView } from '../cart/page';

/** Checkout (FR-102…FR-106): review exact totals, then submit idempotently. */
function Checkout({ slug }: { slug: string }) {
  const methodLabel = usePaymentMethodLabel();
  const t = useTranslations('checkout');
  const f = useFormat();
  const mtext = useMeasurementText();
  const locale = useLocale() as 'bn' | 'en';
  const router = useRouter();
  const { call, user } = useAuth();
  const store = useApi<StoreProfile>(`/public/shops/${slug}`, { auth: false });
  const cart = useApi<CartView>(`/me/carts/${slug}`);
  const [deliveryId, setDeliveryId] = useState<string>('');
  const [methodId, setMethodId] = useState<string>('');
  const [form, setForm] = useState({ recipientName: user?.fullName ?? '', recipientPhone: user?.phone ?? '', recipientEmail: user?.email ?? '', addressLine: '', area: '', city: '', district: '', deliveryInstructions: '' });
  // One key per reviewed submission: retries of the same submit reuse it (AC-020).
  const [idemKey, setIdemKey] = useState(newIdempotencyKey);

  const delivery = store.data?.deliveryOptions.find((d) => d.id === (deliveryId || store.data?.deliveryOptions[0]?.id));
  const method = store.data?.paymentMethods.find((m) => m.id === (methodId || store.data?.paymentMethods[0]?.id));
  const fee = useMemo(() => {
    if (!delivery || !cart.data) return D(0);
    if (delivery.chargeType === 'FREE_OVER_THRESHOLD' && delivery.freeOverAmount && D(cart.data.itemsTotal).greaterThanOrEqualTo(delivery.freeOverAmount)) return D(0);
    return D(delivery.flatFee);
  }, [delivery, cart.data]);
  const total = cart.data ? D(cart.data.itemsTotal).plus(fee).toFixed(2) : '0';

  const place = useAction(async () => {
    const order = await call<{ id: string }>(`/me/carts/${slug}/checkout`, {
      method: 'POST',
      idempotencyKey: idemKey,
      body: {
        deliveryOptionId: delivery!.id,
        paymentMethodId: method!.id,
        ...Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim() !== '')),
        invoiceLanguage: locale,
        expectedTotal: total,
      },
    });
    router.replace(`/account/orders/${order.id}?placed=1`);
  });

  const onError = place.error?.code === 'CART_CHANGED';
  if (!store.data || !cart.data) return <Loading />;
  if (!cart.data.items.length) return <Notice>{t('empty')}</Notice>;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((s) => ({ ...s, [k]: e.target.value }));
  const home = delivery?.method === 'HOME_DELIVERY';

  return (
    <form
      className="grid gap-6 lg:grid-cols-[1fr_360px]"
      onSubmit={(e) => {
        e.preventDefault();
        void place.run();
      }}
    >
      <div className="flex flex-col gap-6">
        <Card title={t('delivery')}>
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">{t('delivery')}</legend>
            {store.data.deliveryOptions.map((d) => (
              <label key={d.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-line p-3 has-[:checked]:border-accent">
                <span className="flex items-center gap-2">
                  <input type="radio" name="delivery" checked={delivery?.id === d.id} onChange={() => setDeliveryId(d.id)} className="accent-[var(--accent-ink)]" />
                  <span>
                    <span className="font-medium">{d.name}</span>
                    {d.estimatedDaysMax != null && <span className="block text-xs text-muted">{t('eta', { min: d.estimatedDaysMin ?? 0, max: d.estimatedDaysMax })}</span>}
                  </span>
                </span>
                <span className="tabular">{Number(d.flatFee) ? f.money(d.flatFee, store.data!.currency) : t('free')}</span>
              </label>
            ))}
          </fieldset>
        </Card>
        <Card title={t('contact')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('name')}>{(id) => <Input id={id} required value={form.recipientName} onChange={set('recipientName')} autoComplete="name" />}</Field>
            <Field label={t('phone')}>{(id) => <Input id={id} required type="tel" value={form.recipientPhone} onChange={set('recipientPhone')} autoComplete="tel" placeholder="01XXXXXXXXX" />}</Field>
            <Field label={t('email')} className="sm:col-span-2">
              {(id) => <Input id={id} type="email" value={form.recipientEmail} onChange={set('recipientEmail')} autoComplete="email" />}
            </Field>
            {home && (
              <>
                <Field label={t('address')} className="sm:col-span-2">
                  {(id) => <Input id={id} required value={form.addressLine} onChange={set('addressLine')} autoComplete="street-address" />}
                </Field>
                <Field label={t('area')}>{(id) => <Input id={id} value={form.area} onChange={set('area')} />}</Field>
                <Field label={t('city')}>{(id) => <Input id={id} value={form.city} onChange={set('city')} autoComplete="address-level2" />}</Field>
              </>
            )}
            <Field label={t('instructions')} className="sm:col-span-2">
              {(id) => <Textarea id={id} value={form.deliveryInstructions} onChange={set('deliveryInstructions')} />}
            </Field>
          </div>
        </Card>
        <Card title={t('payment')}>
          <div className="flex flex-col gap-2">
            {store.data.paymentMethods.map((m) => (
              <label key={m.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-line p-3 has-[:checked]:border-accent">
                <input type="radio" name="method" checked={method?.id === m.id} onChange={() => setMethodId(m.id)} className="mt-1 accent-[var(--accent-ink)]" />
                <span>
                  <span className="font-medium">{methodLabel(m)}</span>
                  {m.instructions && <span className="block text-xs text-muted">{m.instructions}</span>}
                </span>
              </label>
            ))}
          </div>
        </Card>
      </div>

      <Card title={t('review')} className="h-fit lg:sticky lg:top-20">
        <ul className="flex flex-col gap-2 text-sm">
          {cart.data.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3">
              <span>
                {i.product.name}
                <span className="block text-xs text-muted">
                  {mtext(i.entered, i.pieces)}
                </span>
              </span>
              <span className="tabular">{f.money(i.lineTotal, cart.data!.currency)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 flex flex-col gap-1 border-t border-line pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">{t('subtotal')}</dt>
            <dd className="tabular">{f.money(cart.data.itemsTotal, cart.data.currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">{t('deliveryFee')}</dt>
            <dd className="tabular">{f.money(fee.toFixed(2), cart.data.currency)}</dd>
          </div>
          <div className="mt-2 flex justify-between text-lg font-semibold">
            <dt>{t('total')}</dt>
            <dd className="tabular" data-testid="checkout-total">
              {f.money(total, cart.data.currency)}
            </dd>
          </div>
        </dl>
        <ErrorNote error={place.error} className="mt-3" />
        {onError && (
          <Button
            type="button"
            variant="secondary"
            className="mt-2 w-full"
            onClick={() => {
              setIdemKey(newIdempotencyKey());
              place.setError(null);
              void cart.reload();
            }}
          >
            {t('reviewAgain')}
          </Button>
        )}
        <Button type="submit" size="lg" variant="accent" className="mt-4 w-full" pending={place.pending} disabled={!delivery || !method || onError}>
          {t('place')}
        </Button>
        <p className="mt-2 text-xs text-muted">{t('confirmNote')}</p>
        <Link href={`/shop/${slug}/cart`} className="mt-2 block text-center text-sm text-muted hover:text-fg">
          {t('backToCart')}
        </Link>
      </Card>
    </form>
  );
}

export default function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const t = useTranslations('checkout');
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">{t('title')}</h1>
      <RequireUser type="CUSTOMER">
        <Checkout slug={slug} />
      </RequireUser>
    </>
  );
}
