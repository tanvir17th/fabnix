'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, ErrorNote, Field, Input, Loading, Modal, PageHeader, ReasonDialog, Select, StatusBadge, Td, Table, Textarea } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth';
import { useFormat } from '@/lib/format';
import { useAction, useApi, useDebounced } from '@/lib/hooks';
import type { Page } from '@/lib/api';

interface ShopRow {
  id: string;
  name: string;
  code: string;
  status: string;
  createdAt: string;
  subscription: { status: string; plan: { code: string } } | null;
  storefront: { id: string; slug: string; status: string; isEnabled: boolean; adminSuspended: boolean } | null;
  _count: { products: number; members: number; orders: number };
}

type Pending = { kind: 'status'; shop: ShopRow; status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED' } | { kind: 'storefront'; shop: ShopRow; suspended: boolean };

/** FR-073 tenants, FR-132 storefront control, FR-075 subscriptions — every action needs a reason (A1.1). */
export default function AdminShops() {
  const t = useTranslations('admin.shops');
  const tc = useTranslations('common');
  const f = useFormat();
  const { call } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const dq = useDebounced(q);
  const shops = useApi<Page<ShopRow>>(`/admin/shops?limit=50${dq ? `&q=${encodeURIComponent(dq)}` : ''}${status ? `&status=${status}` : ''}`);
  const plans = useApi<Array<{ id: string; code: string }>>('/admin/plans');
  const [pending, setPending] = useState<Pending | null>(null);
  const [subFor, setSubFor] = useState<ShopRow | null>(null);
  const [sub, setSub] = useState({ planId: '', status: '', reason: '' });

  const act = useAction(async (reason: string) => {
    if (!pending) return;
    if (pending.kind === 'status') await call(`/admin/shops/${pending.shop.id}/status`, { method: 'PATCH', body: { status: pending.status, reason } });
    else await call(`/admin/storefronts/${pending.shop.storefront!.id}/suspension`, { method: 'PATCH', body: { suspended: pending.suspended, reason } });
    setPending(null);
    await shops.reload();
  });
  const saveSub = useAction(async () => {
    await call(`/admin/shops/${subFor!.id}/subscription`, { method: 'PATCH', body: Object.fromEntries(Object.entries(sub).filter(([, v]) => v)) });
    setSubFor(null);
    await shops.reload();
  });

  return (
    <>
      <PageHeader title={t('title')} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input type="search" placeholder={t('search')} aria-label={t('search')} value={q} onChange={(e) => setQ(e.target.value)} className="w-72" />
        <Select aria-label={t('status')} value={status} onChange={(e) => setStatus(e.target.value)} className="w-48">
          <option value="">{t('all')}</option>
          {['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'CLOSED'].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>
      <ErrorNote error={shops.error} />
      {!shops.data ? (
        <Loading />
      ) : (
        <Table head={[t('shop'), t('status'), t('plan'), t('storefront'), t('counts'), '']} empty={!shops.data.items.length}>
          {shops.data.items.map((s) => (
            <tr key={s.id}>
              <Td>
                <span className="font-medium">{s.name}</span> <span className="text-xs text-muted">{s.code}</span>
                <span className="block text-xs text-muted">{f.date(s.createdAt)}</span>
              </Td>
              <Td>
                <StatusBadge status={s.status} />
              </Td>
              <Td>
                {s.subscription?.plan.code} {s.subscription && <StatusBadge status={s.subscription.status} />}
              </Td>
              <Td>
                {s.storefront ? (
                  <span className="flex flex-col gap-0.5">
                    <Link href={`/shop/${s.storefront.slug}`} className="text-accent-ink">
                      /{s.storefront.slug}
                    </Link>
                    <StatusBadge status={s.storefront.adminSuspended ? 'SUSPENDED' : s.storefront.status} />
                  </span>
                ) : (
                  '—'
                )}
              </Td>
              <Td className="text-xs text-muted">{t('countsValue', { products: s._count.products, members: s._count.members, orders: s._count.orders })}</Td>
              <Td>
                <div className="flex flex-wrap justify-end gap-1">
                  {s.status !== 'ACTIVE' && (
                    <Button size="sm" variant="secondary" onClick={() => setPending({ kind: 'status', shop: s, status: 'ACTIVE' })}>
                      {s.status === 'PENDING_APPROVAL' ? t('approve') : t('reactivate')}
                    </Button>
                  )}
                  {s.status === 'ACTIVE' && (
                    <Button size="sm" variant="danger" onClick={() => setPending({ kind: 'status', shop: s, status: 'SUSPENDED' })}>
                      {t('suspend')}
                    </Button>
                  )}
                  {s.storefront && (
                    <Button size="sm" variant="ghost" onClick={() => setPending({ kind: 'storefront', shop: s, suspended: !s.storefront!.adminSuspended })}>
                      {s.storefront.adminSuspended ? t('reinstateStore') : t('suspendStore')}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => { setSub({ planId: '', status: '', reason: '' }); setSubFor(s); }}>
                    {t('subscription')}
                  </Button>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <ReasonDialog
        open={!!pending}
        title={pending ? `${pending.shop.name} — ${pending.kind === 'status' ? pending.status : pending.suspended ? t('suspendStore') : t('reinstateStore')}` : ''}
        confirmLabel={tc('confirm')}
        minLength={5}
        danger={pending?.kind === 'status' ? pending.status !== 'ACTIVE' : !!pending?.suspended}
        onClose={() => setPending(null)}
        onConfirm={(r) => void act.run(r)}
        pending={act.pending}
        error={act.error}
      />
      <Modal
        open={!!subFor}
        onClose={() => setSubFor(null)}
        title={`${t('subscription')} — ${subFor?.name ?? ''}`}
        footer={
          <Button pending={saveSub.pending} disabled={sub.reason.trim().length < 5} onClick={() => void saveSub.run()}>
            {tc('save')}
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label={t('plan')}>
            {(id) => (
              <Select id={id} value={sub.planId} onChange={(e) => setSub({ ...sub, planId: e.target.value })}>
                <option value="">{t('keep')}</option>
                {plans.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('status')}>
            {(id) => (
              <Select id={id} value={sub.status} onChange={(e) => setSub({ ...sub, status: e.target.value })}>
                <option value="">{t('keep')}</option>
                {['TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={tc('reason')}>{(id) => <Textarea id={id} value={sub.reason} onChange={(e) => setSub({ ...sub, reason: e.target.value })} />}</Field>
          <ErrorNote error={saveSub.error} />
        </div>
      </Modal>
    </>
  );
}
