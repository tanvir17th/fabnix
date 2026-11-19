'use client';

import { useTranslations } from 'next-intl';
import { use, useEffect, useMemo, useState } from 'react';
import type { MeasurementComponent } from '@fabnix/shared';
import { LengthSummary, MeasurementInput, evaluate, useUnitLabel } from '@/components/measurement';
import { Button, Card, EmptyState, ErrorNote, Field, Input, Loading, Notice, StatusBadge } from '@/components/ui';
import { Link, useRouter } from '@/i18n/navigation';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFormat } from '@/lib/format';
import { useAction, useApi, useDebounced } from '@/lib/hooks';

interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: { name: string; slug: string } | null;
  fabricType: string | null;
  color: string | null;
  pattern: string | null;
  material: string | null;
  widthInches: string | null;
  priceUnitCode: string;
  price: string;
  currency: string;
  images: Array<{ id: string; url: string; mediumUrl: string | null; thumbnailUrl: string | null; altText: string | null }>;
  availability: { status: string | null; availableInches: string | null };
  measurement: { units: Array<{ code: string; symbol: string; name: string; inchesPerUnit: string }>; minOrderInches: string | null; orderStepInches: string | null };
  delivery: Array<{ id: string; method: string; name: string; flatFee: string }>;
  deliveryInfo: string | null;
  orderable: boolean;
  shop: { name: string; slug: string };
}

interface Quote {
  enteredDisplay: string;
  lengthInches: string;
  totalLengthInches: string;
  quantity: string;
  unitRate: string;
  grossAmount: string;
  taxAmount: string;
  lineTotal: string;
}

/** FR-097 product page + FR-100/101 live length & Gira price calculator (AC-018). */
export default function ProductPage({ params }: { params: Promise<{ slug: string; productSlug: string }> }) {
  const { slug, productSlug } = use(params);
  const t = useTranslations('product');
  const f = useFormat();
  const unitLabel = useUnitLabel();
  const router = useRouter();
  const { user, status, call } = useAuth();
  const product = useApi<ProductDetail>(`/public/shops/${slug}/products/${productSlug}`, { auth: false });
  const [image, setImage] = useState(0);
  const [components, setComponents] = useState<MeasurementComponent[]>([]);
  const [pieces, setPieces] = useState(1);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<ApiError | null>(null);
  const [added, setAdded] = useState(false);

  const units = product.data?.measurement.units ?? [];
  const local = useMemo(() => evaluate(components, units), [components, units]);
  const debounced = useDebounced(JSON.stringify({ c: local.components, pieces }), 250);

  useEffect(() => {
    setAdded(false);
    if (!local.inches) {
      setQuote(null);
      return;
    }
    const ctrl = new AbortController();
    apiFetch<Quote>(`/public/shops/${slug}/products/${productSlug}/quote`, { method: 'POST', body: { measurement: local.components, pieces }, signal: ctrl.signal })
      .then((q) => {
        setQuote(q);
        setQuoteError(null);
      })
      .catch((e) => {
        if (e instanceof ApiError) {
          setQuote(null);
          setQuoteError(e);
        }
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, slug, productSlug]);

  const add = useAction(async () => {
    if (status !== 'authenticated' || user?.type !== 'CUSTOMER') {
      router.push(`/login?portal=customer&next=${encodeURIComponent(`/shop/${slug}/p/${productSlug}`)}`);
      return;
    }
    await call(`/me/carts/${slug}/items`, { method: 'POST', body: { productId: product.data!.id, measurement: local.components, pieces } });
    setAdded(true);
  });

  if (product.error) return <EmptyState title={t('notFound')} />;
  if (!product.data) return <Loading />;
  const p = product.data;
  const img = p.images[image];

  return (
    <div className="flex flex-col gap-6">
      <nav className="text-sm text-muted" aria-label={t('breadcrumb')}>
        <Link href={`/shop/${slug}`} className="hover:text-fg">
          {p.shop.name}
        </Link>
        {p.category && <> / {p.category.name}</>}
      </nav>
      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-label={t('photos')}>
          <div className="aspect-square overflow-hidden rounded-lg border border-line bg-surface-2">
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img.mediumUrl ?? img.url} alt={img.altText ?? p.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted">{t('noPhoto')}</div>
            )}
          </div>
          {p.images.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {p.images.map((im, i) => (
                <button key={im.id} onClick={() => setImage(i)} aria-label={t('photoN', { n: i + 1 })} aria-pressed={i === image} className={`h-16 w-16 shrink-0 overflow-hidden rounded border ${i === image ? 'border-accent' : 'border-line'}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.thumbnailUrl ?? im.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{p.name}</h1>
            <p className="mt-2 text-2xl font-semibold tabular">
              {f.money(p.price, p.currency)} <span className="text-base font-normal text-muted">/ {unitLabel({ code: p.priceUnitCode })}</span>
            </p>
            {p.availability.status && (
              <p className="mt-2 flex items-center gap-2 text-sm">
                <StatusBadge status={p.availability.status} />
                {p.availability.availableInches && <span className="text-muted">{t('available', { yards: f.yards(p.availability.availableInches) })}</span>}
              </p>
            )}
          </div>

          <Card title={t('calculator')}>
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted">{t('calculatorHint')}</p>
              <MeasurementInput units={units} value={components} onChange={setComponents} idPrefix="buy" />
              <Field label={t('pieces')} hint={t('piecesHint')}>
                {(id) => <Input id={id} type="number" min={1} max={99} value={pieces} onChange={(e) => setPieces(Math.max(1, Number.parseInt(e.target.value || '1', 10)))} className="w-24" />}
              </Field>
              {local.error && <ErrorNote error={new ApiError(422, local.error)} />}
              <LengthSummary inches={local.inches} units={units} pieces={pieces} />
              {quoteError && <ErrorNote error={quoteError} />}
              {quote && (
                <dl className="grid grid-cols-2 gap-y-1 rounded-md border border-line p-3 text-sm">
                  <dt className="text-muted">{t('quantity')}</dt>
                  <dd className="text-right tabular">
                    {f.number(quote.quantity, 4)} {unitLabel({ code: p.priceUnitCode })}
                  </dd>
                  <dt className="text-muted">{t('rate')}</dt>
                  <dd className="text-right tabular">{f.money(quote.unitRate, p.currency)}</dd>
                  {Number(quote.taxAmount) > 0 && (
                    <>
                      <dt className="text-muted">{t('tax')}</dt>
                      <dd className="text-right tabular">{f.money(quote.taxAmount, p.currency)}</dd>
                    </>
                  )}
                  <dt className="font-semibold">{t('estimate')}</dt>
                  <dd className="text-right text-lg font-semibold tabular" data-testid="quote-total">
                    {f.money(quote.lineTotal, p.currency)}
                  </dd>
                </dl>
              )}
              <ErrorNote error={add.error} />
              {added && (
                <Notice tone="success">
                  {t('added')}{' '}
                  <Link href={`/shop/${slug}/cart`} className="font-medium underline">
                    {t('goToCart')}
                  </Link>
                </Notice>
              )}
              <Button size="lg" variant="accent" disabled={!quote || !p.orderable} pending={add.pending} onClick={() => void add.run()}>
                {p.orderable ? t('addToCart') : t('notAccepting')}
              </Button>
            </div>
          </Card>

          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            {(
              [
                ['fabricType', p.fabricType],
                ['material', p.material],
                ['color', p.color],
                ['pattern', p.pattern],
                ['width', p.widthInches ? t('widthValue', { inches: f.number(p.widthInches) }) : null],
                ['minOrder', p.measurement.minOrderInches ? t('yardsValue', { yards: f.yards(p.measurement.minOrderInches) }) : null],
              ] as const
            )
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted">{t(`attr.${k}`)}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
          </dl>
          {p.description && <p className="whitespace-pre-line text-sm">{p.description}</p>}
          {p.deliveryInfo && <p className="text-sm text-muted">{p.deliveryInfo}</p>}
        </section>
      </div>
    </div>
  );
}
