'use client';

import { useTranslations } from 'next-intl';
import { use } from 'react';
import { RequireUser } from '@/components/shells';
import { Button, Card, EmptyState, ErrorNote, Loading, Notice, Td, Table } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth';
import { useFormat } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';
import { useMeasurementText, useUnitLabel } from '@/components/measurement';

export interface CartView {
  id: string;
  currency: string;
  orderable: boolean;
  items: Array<{
    id: string;
    product: { id: string; slug: string; name: string; thumbnailUrl: string | null };
    entered: unknown;
    enteredDisplay: string | null;
    pieces: number;
    lengthInches: string;
    priceUnitCode: string;
    unitRate: string;
    lineTotal: string;
    priceChanged: boolean;
    problem: string | null;
  }>;
  itemsTotal: string;
  hasChanges: boolean;
}

function Cart({ slug }: { slug: string }) {
  const t = useTranslations('cart');
  const tErr = useTranslations('errors');
  const f = useFormat();
  const unitLabel = useUnitLabel();
  const mtext = useMeasurementText();
  const { call } = useAuth();
  const cart = useApi<CartView>(`/me/carts/${slug}`);
  const remove = useAction(async (itemId: string) => cart.setData(await call<CartView>(`/me/carts/${slug}/items/${itemId}`, { method: 'DELETE' })));
  const setPieces = useAction(async (itemId: string, pieces: number) => cart.setData(await call<CartView>(`/me/carts/${slug}/items/${itemId}`, { method: 'PATCH', body: { pieces } })));

  if (cart.error) return <ErrorNote error={cart.error} />;
  if (!cart.data) return <Loading />;
  const c = cart.data;
  if (!c.items.length)
    return (
      <EmptyState title={t('empty')}>
        <Link href={`/shop/${slug}`} className="text-accent-ink underline">
          {t('continue')}
        </Link>
      </EmptyState>
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-3">
        {c.hasChanges && <Notice tone="warning">{t('changed')}</Notice>}
        <ErrorNote error={remove.error ?? setPieces.error} />
        <Table head={[t('product'), t('length'), t('pieces'), t('rate'), t('total'), '']}>
          {c.items.map((i) => (
            <tr key={i.id} className={i.problem ? 'opacity-60' : undefined}>
              <Td>
                <Link href={`/shop/${slug}/p/${i.product.slug}`} className="font-medium hover:text-accent-ink">
                  {i.product.name}
                </Link>
                {i.problem && <p className="text-xs text-danger">{tErr.has(i.problem) ? tErr(i.problem) : i.problem}</p>}
                {i.priceChanged && <p className="text-xs text-warning">{t('priceChanged')}</p>}
              </Td>
              <Td className="tabular">
                {mtext(i.entered) || `${f.number(i.lengthInches, 2)}″`}
                <span className="block text-xs text-muted">{f.yards(i.lengthInches)} {unitLabel({ code: 'YARD' })}</span>
              </Td>
              <Td>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="secondary" aria-label={t('less')} disabled={i.pieces <= 1} onClick={() => void setPieces.run(i.id, i.pieces - 1)}>
                    −
                  </Button>
                  <span className="w-6 text-center tabular">{f.digits(i.pieces)}</span>
                  <Button size="sm" variant="secondary" aria-label={t('more')} onClick={() => void setPieces.run(i.id, i.pieces + 1)}>
                    +
                  </Button>
                </div>
              </Td>
              <Td className="tabular">
                {f.money(i.unitRate, c.currency)} / {unitLabel({ code: i.priceUnitCode })}
              </Td>
              <Td className="font-medium tabular">{f.money(i.lineTotal, c.currency)}</Td>
              <Td>
                <Button size="sm" variant="ghost" onClick={() => void remove.run(i.id)}>
                  {t('remove')}
                </Button>
              </Td>
            </tr>
          ))}
        </Table>
      </div>
      <Card title={t('summary')}>
        <dl className="flex justify-between text-lg font-semibold">
          <dt>{t('itemsTotal')}</dt>
          <dd className="tabular">{f.money(c.itemsTotal, c.currency)}</dd>
        </dl>
        <p className="mt-1 text-xs text-muted">{t('deliveryLater')}</p>
        {!c.orderable && <Notice tone="warning">{t('notAccepting')}</Notice>}
        <Link href={`/shop/${slug}/checkout`} aria-disabled={!c.orderable} className={!c.orderable ? 'pointer-events-none' : undefined}>
          <Button size="lg" className="mt-4 w-full" disabled={!c.orderable}>
            {t('checkout')}
          </Button>
        </Link>
      </Card>
    </div>
  );
}

export default function CartPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const t = useTranslations('cart');
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">{t('title')}</h1>
      <RequireUser type="CUSTOMER">
        <Cart slug={slug} />
      </RequireUser>
    </>
  );
}
