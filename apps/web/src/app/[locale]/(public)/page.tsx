'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FnMark } from '@/components/brand';
import { EmptyState, Input, Loading, StatusBadge, ErrorNote } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { useApi, useDebounced } from '@/lib/hooks';
import type { Page } from '@/lib/api';

interface ShopCard {
  slug: string;
  displayName: string;
  tagline: string | null;
  address: string | null;
  status: string;
  logoUrl: string | null;
  productCount: number;
}

/** Shop discovery (§A7 "Discover Shops"). */
export default function HomePage() {
  const t = useTranslations('home');
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const shops = useApi<Page<ShopCard>>(`/public/shops?limit=24${dq ? `&q=${encodeURIComponent(dq)}` : ''}`, { auth: false });

  return (
    <div className="flex flex-col gap-10">
      <section className="grid items-center gap-8 rounded-xl border border-line bg-surface px-6 py-12 md:grid-cols-[1fr_auto] md:px-12">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent-ink">{t('eyebrow')}</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight md:text-5xl">{t('headline')}</h1>
          <p className="mt-4 max-w-xl text-muted">{t('subhead')}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="#shops" className="inline-flex h-12 items-center rounded-md bg-fg px-6 font-medium text-bg">
              {t('browse')}
            </Link>
            <Link href="/register?portal=business" className="inline-flex h-12 items-center rounded-md border border-line px-6 font-medium">
              {t('openShop')}
            </Link>
          </div>
        </div>
        <FnMark size={180} className="hidden text-fg md:block" />
      </section>

      <section id="shops" aria-labelledby="shops-title">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2 id="shops-title" className="text-xl font-semibold">
            {t('shopsTitle')}
          </h2>
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchShops')} aria-label={t('searchShops')} className="sm:w-80" />
        </div>
        <ErrorNote error={shops.error} />
        {shops.loading && !shops.data ? (
          <Loading />
        ) : !shops.data?.items.length ? (
          <EmptyState title={t('noShops')} />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shops.data.items.map((s) => (
              <li key={s.slug}>
                <Link href={`/shop/${s.slug}`} className="flex h-full flex-col gap-2 rounded-lg border border-line bg-surface p-5 transition hover:border-accent">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-lg font-semibold">{s.displayName}</span>
                    {s.status === 'PAUSED' && <StatusBadge status="PAUSED" />}
                  </div>
                  {s.tagline && <p className="text-sm text-muted">{s.tagline}</p>}
                  <p className="mt-auto text-xs text-muted">
                    {t('productCount', { count: s.productCount })}
                    {s.address ? ` · ${s.address}` : ''}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
