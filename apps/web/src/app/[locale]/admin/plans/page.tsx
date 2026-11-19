'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, Card, Checkbox, ErrorNote, Field, Input, Loading, Modal, PageHeader, Textarea, Badge } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useFormat } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';

interface Plan {
  id: string;
  code: string;
  nameKey: string;
  currency: string;
  priceMonthly: string;
  priceYearly: string;
  trialDays: number;
  graceDays: number;
  maxUsers: number | null;
  maxBranches: number | null;
  maxProducts: number | null;
  maxImagesPerProduct: number;
  onlineStoreEnabled: boolean;
  isActive: boolean;
  isPublic: boolean;
  _count: { subscriptions: number };
}

const NUM = ['trialDays', 'graceDays', 'maxUsers', 'maxBranches', 'maxProducts', 'maxImagesPerProduct'] as const;

/** FR-074 plans, limits and feature availability (prices pending market validation). */
export default function AdminPlans() {
  const t = useTranslations('admin.plans');
  const tk = useTranslations();
  const tc = useTranslations('common');
  const f = useFormat();
  const { call } = useAuth();
  const plans = useApi<Plan[]>('/admin/plans');
  const [edit, setEdit] = useState<(Plan & { reason: string }) | null>(null);
  const save = useAction(async () => {
    const e = edit!;
    const body: Record<string, unknown> = { reason: e.reason, priceMonthly: e.priceMonthly, priceYearly: e.priceYearly, onlineStoreEnabled: e.onlineStoreEnabled, isActive: e.isActive, isPublic: e.isPublic };
    for (const k of NUM) body[k] = e[k] === null || (e[k] as unknown) === '' ? (k.startsWith('max') && k !== 'maxImagesPerProduct' ? null : undefined) : Number(e[k]);
    await call(`/admin/plans/${e.id}`, { method: 'PATCH', body });
    setEdit(null);
    await plans.reload();
  });
  if (plans.error) return <ErrorNote error={plans.error} />;
  if (!plans.data) return <Loading />;
  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.data.map((p) => (
          <Card key={p.id} title={<span>{tk.has(p.nameKey) ? tk(p.nameKey) : p.code} {!p.isActive && <Badge tone="danger">{t('inactive')}</Badge>}</span>} actions={<Button size="sm" variant="secondary" onClick={() => setEdit({ ...p, reason: '' })}>{tc('edit')}</Button>}>
            <p className="text-2xl font-semibold tabular">{f.money(p.priceMonthly, p.currency)}<span className="text-sm font-normal text-muted"> / {t('month')}</span></p>
            <ul className="mt-3 flex flex-col gap-1 text-sm text-muted">
              <li>{t('users', { n: p.maxUsers ?? '∞' })}</li>
              <li>{t('branches', { n: p.maxBranches ?? '∞' })}</li>
              <li>{t('products', { n: p.maxProducts ?? '∞' })}</li>
              <li>{p.onlineStoreEnabled ? t('withStore') : t('noStore')}</li>
              <li>{t('subscribers', { n: p._count.subscriptions })}</li>
            </ul>
          </Card>
        ))}
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.code ?? ''} footer={<Button pending={save.pending} disabled={(edit?.reason.trim().length ?? 0) < 5} onClick={() => void save.run()}>{tc('save')}</Button>}>
        {edit && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('priceMonthly')}>{(id) => <Input id={id} inputMode="decimal" value={edit.priceMonthly} onChange={(e) => setEdit({ ...edit, priceMonthly: e.target.value })} />}</Field>
            <Field label={t('priceYearly')}>{(id) => <Input id={id} inputMode="decimal" value={edit.priceYearly} onChange={(e) => setEdit({ ...edit, priceYearly: e.target.value })} />}</Field>
            {NUM.map((k) => (
              <Field key={k} label={t(`field.${k}`)} hint={k.startsWith('max') && k !== 'maxImagesPerProduct' ? t('unlimitedHint') : undefined}>
                {(id) => <Input id={id} type="number" min={0} value={edit[k] ?? ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value === '' ? null : Number(e.target.value) })} />}
              </Field>
            ))}
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Checkbox label={t('withStore')} checked={edit.onlineStoreEnabled} onChange={(v) => setEdit({ ...edit, onlineStoreEnabled: v })} />
              <Checkbox label={t('active')} checked={edit.isActive} onChange={(v) => setEdit({ ...edit, isActive: v })} />
              <Checkbox label={t('public')} checked={edit.isPublic} onChange={(v) => setEdit({ ...edit, isPublic: v })} />
            </div>
            <Field label={tc('reason')} className="sm:col-span-2">{(id) => <Textarea id={id} value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} />}</Field>
            <ErrorNote error={save.error} className="sm:col-span-2" />
          </div>
        )}
      </Modal>
    </>
  );
}
