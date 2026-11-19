'use client';

import { useTranslations } from 'next-intl';
import { use, useState } from 'react';
import { Button, EmptyState, ErrorNote, Input, Loading, Notice, Select, StatusBadge } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { useFormat } from '@/lib/format';
import { useApi, useDebounced } from '@/lib/hooks';
import { useUnitLabel } from '@/components/measurement';

export interface StoreProfile {
  slug: string;
  displayName: string;
  tagline: string | null;
  description: string | null;
  status: string;
  orderable: boolean;
  currency: string;
  contact: { phone: string | null; whatsapp: string | null; email: string | null; address: string | null };
  deliveryInfo: string | null;
  openingStatusNote: string | null;
  minOrderAmount: string | null;
  policies: { returnPolicy: string | null; terms: string | null };
  categories: Array<{ id: string; name: string; slug: string }>;
  deliveryOptions: Array<{ id: string; method: 'HOME_DELIVERY' | 'PICKUP'; name: string; chargeType: string; flatFee: string; freeOverAmount: string | null; estimatedDaysMin: number | null; estimatedDaysMax: number | null }>;
  paymentMethods: Array<{ id: string; type: string; label: string; instructions: string | null; accountRef: string | null }>;
  units: Array<{ code: string; symbol: string; name: string; inchesPerUnit: string }>;
}

interface ProductCard {
  id: string;
  slug: string;
  name: string;
  color: string | null;
  colorHex: string | null;
  fabricType: string | null;
  priceUnitCode: string;
  price: string;
  thumbnailUrl: string | null;
  availability: { status: string | null; availableInches: string | null };
}

/** Public storefront fabnix.com/shop/<slug> (FR-088, FR-096, AC-017). */
export default function StorefrontPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const t = useTranslations('store');
  const f = useFormat();
  const unitLabel = useUnitLabel();
  const store = useApi<StoreProfile>(`/public/shops/${slug}`, { auth: false });
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('newest');
  const [inStock, setInStock] = useState(false);
  const [limit, setLimit] = useState(24);
  const dq = useDebounced(q);
  const qs = new URLSearchParams({ limit: String(limit), sort, ...(dq ? { q: dq } : {}), ...(category ? { category } : {}), ...(inStock ? { inStock: 'true' } : {}) });
  const products = useApi<{ items: ProductCard[]; total: number; nextCursor: string | null }>(store.data ? `/public/shops/${slug}/products?${qs}` : null, { auth: false });

  if (store.error) return <EmptyState title={t('notFound')} />;
  if (!store.data) return <Loading />;
  const s = store.data;

  return (
    <div className="flex flex-col gap-6">
      <header className="rounded-xl border border-line bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{s.displayName}</h1>
            {s.tagline && <p className="mt-1 text-muted">{s.tagline}</p>}
          </div>
          <Link href={`/shop/${slug}/cart`}>
            <Button variant="secondary">{t('viewCart')}</Button>
          </Link>
        </div>
        {s.description && <p className="mt-4 max-w-3xl whitespace-pre-line text-sm">{s.description}</p>}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
          {s.contact.phone && <span>☎ {s.contact.phone}</span>}
          {s.contact.address && <span>⌂ {s.contact.address}</span>}
          {s.deliveryOptions.map((d) => (
            <span key={d.id}>
              {t(`deliveryMethod.${d.method}`)}: {d.name} — {Number(d.flatFee) ? f.money(d.flatFee, s.currency) : t('free')}
            </span>
          ))}
        </div>
        {!s.orderable && <Notice tone="warning">{t('notAccepting')}</Notice>}
        {s.openingStatusNote && <p className="mt-2 text-sm">{s.openingStatusNote}</p>}
      </header>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <Input type="search" placeholder={t('search')} aria-label={t('search')} value={q} onChange={(e) => setQ(e.target.value)} className="md:max-w-sm" />
        <Select aria-label={t('category')} value={category} onChange={(e) => setCategory(e.target.value)} className="md:w-52">
          <option value="">{t('allCategories')}</option>
          {s.categories.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select aria-label={t('sort')} value={sort} onChange={(e) => setSort(e.target.value)} className="md:w-44">
          {['newest', 'price_asc', 'price_desc', 'name'].map((o) => (
            <option key={o} value={o}>
              {t(`sortBy.${o}`)}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} className="accent-[var(--accent-ink)]" />
          {t('inStockOnly')}
        </label>
      </div>

      <ErrorNote error={products.error} />
      {!products.data ? (
        <Loading />
      ) : !products.data.items.length ? (
        <EmptyState title={t('noProducts')} />
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {products.data.items.map((p) => (
              <li key={p.id}>
                <Link href={`/shop/${slug}/p/${p.slug}`} className="group flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface hover:border-accent">
                  <div className="aspect-square bg-surface-2">
                    {p.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.thumbnailUrl} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full" style={p.colorHex ? { background: p.colorHex } : undefined} aria-hidden />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-3">
                    <span className="font-medium group-hover:text-accent-ink">{p.name}</span>
                    <span className="text-xs text-muted">{[p.fabricType, p.color].filter(Boolean).join(' · ')}</span>
                    <span className="mt-auto flex items-center justify-between gap-2 pt-2">
                      <span className="font-semibold tabular">
                        {f.money(p.price, s.currency)}
                        <span className="text-xs font-normal text-muted"> / {unitLabel({ code: p.priceUnitCode })}</span>
                      </span>
                      {p.availability.status && <StatusBadge status={p.availability.status} />}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {products.data.nextCursor && (
            <div className="text-center">
              <Button variant="secondary" onClick={() => setLimit((l) => Math.min(100, l + 24))}>
                {t('loadMore')}
              </Button>
            </div>
          )}
        </>
      )}

      {(s.policies.returnPolicy || s.deliveryInfo) && (
        <section className="grid gap-4 md:grid-cols-2">
          {s.deliveryInfo && (
            <div className="rounded-lg border border-line bg-surface p-4">
              <h2 className="mb-2 font-semibold">{t('delivery')}</h2>
              <p className="whitespace-pre-line text-sm text-muted">{s.deliveryInfo}</p>
            </div>
          )}
          {s.policies.returnPolicy && (
            <div className="rounded-lg border border-line bg-surface p-4">
              <h2 className="mb-2 font-semibold">{t('returns')}</h2>
              <p className="whitespace-pre-line text-sm text-muted">{s.policies.returnPolicy}</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
