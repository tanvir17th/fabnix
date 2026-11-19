'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, ErrorNote, Input, Loading, PageHeader, ReasonDialog, Select, StatusBadge } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth';
import { useFormat } from '@/lib/format';
import { useAction, useApi, useDebounced } from '@/lib/hooks';
import type { Page } from '@/lib/api';

interface Listing {
  id: string;
  name: string;
  slug: string;
  sellingRate: string;
  priceUnitCode: string;
  moderationStatus: string;
  moderationReason: string | null;
  thumbnailUrl: string | null;
  shop: { id: string; name: string; storefront: { slug: string } | null };
}

/** FR-098 / FR-133 listing moderation with recorded reason. */
export default function AdminModeration() {
  const t = useTranslations('admin.moderation');
  const tc = useTranslations('common');
  const f = useFormat();
  const { call } = useAuth();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const list = useApi<Page<Listing>>(`/admin/products?limit=48${status ? `&moderationStatus=${status}` : ''}${dq ? `&q=${encodeURIComponent(dq)}` : ''}`);
  const [target, setTarget] = useState<{ item: Listing; to: 'VISIBLE' | 'HIDDEN' | 'REMOVED' } | null>(null);
  const act = useAction(async (reason: string) => {
    await call(`/admin/products/${target!.item.id}/moderation`, { method: 'PATCH', body: { moderationStatus: target!.to, reason } });
    setTarget(null);
    await list.reload();
  });
  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input type="search" placeholder={t('search')} aria-label={t('search')} value={q} onChange={(e) => setQ(e.target.value)} className="w-72" />
        <Select aria-label={t('status')} value={status} onChange={(e) => setStatus(e.target.value)} className="w-44">
          <option value="">{t('all')}</option>
          {['VISIBLE', 'HIDDEN', 'REMOVED'].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>
      <ErrorNote error={list.error} />
      {!list.data ? (
        <Loading />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {list.data.items.map((p) => (
            <li key={p.id} className="overflow-hidden rounded-lg border border-line bg-surface">
              <div className="aspect-square bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.thumbnailUrl && <img src={p.thumbnailUrl} alt={p.name} className="h-full w-full object-cover" />}
              </div>
              <div className="flex flex-col gap-1 p-3 text-sm">
                <span className="font-medium">{p.name}</span>
                <span className="text-xs text-muted">
                  {p.shop.storefront ? <Link href={`/shop/${p.shop.storefront.slug}`} className="text-accent-ink">{p.shop.name}</Link> : p.shop.name} · {f.money(p.sellingRate)}
                </span>
                <StatusBadge status={p.moderationStatus} />
                {p.moderationReason && <span className="text-xs text-muted">{p.moderationReason}</span>}
                <div className="mt-2 flex gap-1">
                  {p.moderationStatus === 'VISIBLE' ? (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => setTarget({ item: p, to: 'HIDDEN' })}>{t('hide')}</Button>
                      <Button size="sm" variant="danger" onClick={() => setTarget({ item: p, to: 'REMOVED' })}>{t('remove')}</Button>
                    </>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => setTarget({ item: p, to: 'VISIBLE' })}>{t('restore')}</Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ReasonDialog open={!!target} title={`${target?.item.name ?? ''} → ${target?.to ?? ''}`} confirmLabel={tc('confirm')} minLength={5} onClose={() => setTarget(null)} onConfirm={(r) => void act.run(r)} pending={act.pending} error={act.error} danger={target?.to !== 'VISIBLE'} />
    </>
  );
}
