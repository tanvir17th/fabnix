'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { GIRA_PRESET_SUGGESTIONS, decompose } from '@fabnix/shared';
import { useUnitLabel } from '@/components/measurement';
import { useShop } from '@/components/shop-context';
import { Button, Card, Checkbox, ErrorNote, Field, Input, Loading, Notice, PageHeader, Select, Tabs, Td, Table } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useFormat } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';

interface Unit {
  id: string;
  code: string;
  kind: string;
  name: string;
  symbol: string;
  inchesPerUnit: string;
  version: number;
  isActive: boolean;
  isStandard: boolean;
  enabledForPos: boolean;
  enabledOnline: boolean;
  createdAt: string;
}
type Settings = Record<string, unknown> & {
  taxMode: string;
  defaultTaxRate: string;
  invoicePrefix: string;
  defaultInvoiceLanguage: string;
  allowNegativeStock: boolean;
  reservationTtlMinutes: number;
  stockDeductionMilestone: string;
  allowPartialPayment: boolean;
  allowDueSales: boolean;
  cashRounding: string;
  defaultLowStockInches: string;
  invoiceFooterNote: string | null;
};

/** FR-008/009/011 shop profile & regional/tax/invoice/stock policies, FR-012/013 units & Gira, FR-039 payment methods, FR-010 branches. */
export default function SettingsPage() {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const { can, reload } = useShop();
  const [tab, setTab] = useState<'units' | 'policies' | 'payments' | 'branches'>('units');
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('onboarding')) setTab('units');
  }, []);
  return (
    <>
      <PageHeader title={t('title')} />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'units', label: t('tabs.units') },
          ...(can('shop.settings.view') ? [{ value: 'policies' as const, label: t('tabs.policies') }] : []),
          ...(can('payment_methods.manage') ? [{ value: 'payments' as const, label: t('tabs.payments') }] : []),
          ...(can('branch.manage') ? [{ value: 'branches' as const, label: t('tabs.branches') }] : []),
        ]}
      />
      {tab === 'units' && <UnitsTab />}
      {tab === 'policies' && <PoliciesTab onSaved={reload} />}
      {tab === 'payments' && <PaymentsTab />}
      {tab === 'branches' && <BranchesTab />}
      <span className="sr-only">{tc('loading')}</span>
    </>
  );
}

function UnitsTab() {
  const t = useTranslations('settings.units');
  const f = useFormat();
  const label = useUnitLabel();
  const { shopId, can } = useShop();
  const { call } = useAuth();
  const units = useApi<Unit[]>(`/shops/${shopId}/units?includeInactive=true`);
  const [gira, setGira] = useState('');
  const [custom, setCustom] = useState({ code: '', name: '', symbol: '', inchesPerUnit: '' });
  const manage = can('units.manage');
  const active = (units.data ?? []).filter((u) => u.isActive);
  const giraUnit = active.find((u) => u.code === 'GIRA');
  const history = (units.data ?? []).filter((u) => u.code === 'GIRA').sort((a, b) => b.version - a.version);

  const saveGira = useAction(async () => {
    if (giraUnit) await call(`/shops/${shopId}/units/GIRA/factor`, { method: 'PUT', body: { inchesPerUnit: gira } });
    else await call(`/shops/${shopId}/units`, { method: 'POST', body: { code: 'GIRA', kind: 'GIRA', name: 'Gira', symbol: 'gira', inchesPerUnit: gira } });
    setGira('');
    await units.reload();
  });
  const addCustom = useAction(async () => {
    await call(`/shops/${shopId}/units`, { method: 'POST', body: { ...custom, kind: 'CUSTOM' } });
    setCustom({ code: '', name: '', symbol: '', inchesPerUnit: '' });
    await units.reload();
  });
  const toggle = useAction(async (u: Unit, field: 'enabledForPos' | 'enabledOnline') => {
    await call(`/shops/${shopId}/units/${u.code}`, { method: 'PATCH', body: { [field]: !u[field] } });
    await units.reload();
  });

  if (!units.data) return <Loading />;
  const preview = gira && /^\d+(\.\d{1,8})?$/.test(gira) ? decompose('189', [{ code: 'YARD', kind: 'YARD', symbol: 'yd', inchesPerUnit: '36' }, { code: 'GIRA', kind: 'GIRA', symbol: 'gira', inchesPerUnit: gira }]) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title={t('gira')}>
        {!giraUnit && <Notice tone="warning">{t('giraRequired')}</Notice>}
        {giraUnit && (
          <p className="mb-3 text-sm">
            {t('giraCurrent', { inches: f.number(giraUnit.inchesPerUnit, 4), version: giraUnit.version })}
          </p>
        )}
        {manage && (
          <form
            className="mt-3 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void saveGira.run();
            }}
          >
            <Field label={t('inchesPerGira')} hint={t('giraHint')}>
              {(id) => <Input id={id} inputMode="decimal" required value={gira} onChange={(e) => setGira(e.target.value)} />}
            </Field>
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-muted">{t('suggestions')}:</span>
              {GIRA_PRESET_SUGGESTIONS.map((g) => (
                <Button key={g} type="button" size="sm" variant="secondary" onClick={() => setGira(g)}>
                  {t('presetValue', { inches: g })}
                </Button>
              ))}
            </div>
            {preview && <p className="text-sm text-muted">{t('preview', { result: preview.map((c) => `${c.value} ${label({ code: c.unit })}`).join(' ') })}</p>}
            <ErrorNote error={saveGira.error} />
            <Button type="submit" pending={saveGira.pending} className="w-fit">
              {giraUnit ? t('changeGira') : t('confirmGira')}
            </Button>
            {giraUnit && <p className="text-xs text-muted">{t('versionNote')}</p>}
          </form>
        )}
        {history.length > 1 && (
          <ul className="mt-4 text-xs text-muted">
            {history.map((h) => (
              <li key={h.id}>
                v{h.version}: {h.inchesPerUnit}″ · {f.date(h.createdAt)} {h.isActive ? `(${t('active')})` : ''}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={t('allUnits')}>
        <Table head={[t('unit'), t('factor'), t('pos'), t('online')]}>
          {active.map((u) => (
            <tr key={u.id}>
              <Td>
                {label(u)} <span className="text-xs text-muted">{u.symbol}</span>
              </Td>
              <Td className="tabular">{f.number(u.inchesPerUnit, 4)}″</Td>
              <Td>
                <Checkbox label="" checked={u.enabledForPos} disabled={!manage} onChange={() => void toggle.run(u, 'enabledForPos')} />
              </Td>
              <Td>
                <Checkbox label="" checked={u.enabledOnline} disabled={!manage} onChange={() => void toggle.run(u, 'enabledOnline')} />
              </Td>
            </tr>
          ))}
        </Table>
        <ErrorNote error={toggle.error} className="mt-2" />
        {manage && (
          <form
            className="mt-4 grid grid-cols-2 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void addCustom.run();
            }}
          >
            <Input aria-label={t('code')} placeholder={t('code')} required value={custom.code} onChange={(e) => setCustom({ ...custom, code: e.target.value.toUpperCase() })} />
            <Input aria-label={t('name')} placeholder={t('name')} required value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
            <Input aria-label={t('symbol')} placeholder={t('symbol')} required value={custom.symbol} onChange={(e) => setCustom({ ...custom, symbol: e.target.value })} />
            <Input aria-label={t('factor')} placeholder={t('factor')} inputMode="decimal" required value={custom.inchesPerUnit} onChange={(e) => setCustom({ ...custom, inchesPerUnit: e.target.value })} />
            <ErrorNote error={addCustom.error} className="col-span-2" />
            <Button type="submit" variant="secondary" pending={addCustom.pending} className="col-span-2">
              + {t('addCustom')}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}

function PoliciesTab({ onSaved }: { onSaved: () => Promise<void> }) {
  const t = useTranslations('settings.policies');
  const tc = useTranslations('common');
  const { shopId, can } = useShop();
  const { call } = useAuth();
  const settings = useApi<Settings>(`/shops/${shopId}/settings`);
  const [form, setForm] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => setForm(settings.data ?? null), [settings.data]);
  const save = useAction(async () => {
    const pick = ['taxMode', 'defaultTaxRate', 'invoicePrefix', 'defaultInvoiceLanguage', 'allowNegativeStock', 'reservationTtlMinutes', 'stockDeductionMilestone', 'allowPartialPayment', 'allowDueSales', 'cashRounding', 'defaultLowStockInches', 'invoiceFooterNote'] as const;
    const body = Object.fromEntries(pick.map((k) => [k, k === 'reservationTtlMinutes' ? Number(form![k]) : form![k] === '' ? null : form![k]]));
    settings.setData(await call<Settings>(`/shops/${shopId}/settings`, { method: 'PATCH', body }));
    setSaved(true);
    await onSaved();
  });
  if (!form) return <Loading />;
  const editable = can('shop.settings.manage');
  const sel = (k: keyof Settings, options: string[], ns: string) => (id: string) => (
    <Select id={id} disabled={!editable} value={String(form[k])} onChange={(e) => setForm({ ...form, [k]: e.target.value })}>
      {options.map((o) => (
        <option key={o} value={o}>
          {t(`${ns}.${o}`)}
        </option>
      ))}
    </Select>
  );
  return (
    <Card>
      <form
        className="grid gap-4 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save.run();
        }}
      >
        <Field label={t('taxMode')}>{sel('taxMode', ['NONE', 'EXCLUSIVE', 'INCLUSIVE'], 'tax')}</Field>
        <Field label={t('taxRate')}>{(id) => <Input id={id} disabled={!editable} inputMode="decimal" value={form.defaultTaxRate} onChange={(e) => setForm({ ...form, defaultTaxRate: e.target.value })} />}</Field>
        <Field label={t('cashRounding')}>{sel('cashRounding', ['NONE', 'NEAREST_1', 'NEAREST_5'], 'rounding')}</Field>
        <Field label={t('invoicePrefix')}>{(id) => <Input id={id} disabled={!editable} value={form.invoicePrefix} onChange={(e) => setForm({ ...form, invoicePrefix: e.target.value.toUpperCase() })} />}</Field>
        <Field label={t('invoiceLanguage')}>{sel('defaultInvoiceLanguage', ['bn', 'en'], 'lang')}</Field>
        <Field label={t('lowStock')} hint={t('inchesHint')}>{(id) => <Input id={id} disabled={!editable} inputMode="decimal" value={form.defaultLowStockInches} onChange={(e) => setForm({ ...form, defaultLowStockInches: e.target.value })} />}</Field>
        <Field label={t('milestone')}>{sel('stockDeductionMilestone', ['ON_CONFIRMATION', 'ON_DISPATCH'], 'milestones')}</Field>
        <Field label={t('ttl')} hint={t('ttlHint')}>{(id) => <Input id={id} disabled={!editable} type="number" min={15} max={4320} value={form.reservationTtlMinutes} onChange={(e) => setForm({ ...form, reservationTtlMinutes: Number(e.target.value) })} />}</Field>
        <Field label={t('footer')} className="md:col-span-2">{(id) => <Input id={id} disabled={!editable} value={form.invoiceFooterNote ?? ''} onChange={(e) => setForm({ ...form, invoiceFooterNote: e.target.value })} />}</Field>
        <div className="flex flex-col gap-2 md:col-span-2">
          <Checkbox label={t('allowNegative')} disabled={!editable} checked={form.allowNegativeStock} onChange={(v) => setForm({ ...form, allowNegativeStock: v })} />
          <Checkbox label={t('allowPartial')} disabled={!editable} checked={form.allowPartialPayment} onChange={(v) => setForm({ ...form, allowPartialPayment: v })} />
          <Checkbox label={t('allowDue')} disabled={!editable} checked={form.allowDueSales} onChange={(v) => setForm({ ...form, allowDueSales: v })} />
        </div>
        <ErrorNote error={save.error} className="md:col-span-2" />
        {saved && <Notice tone="success">{tc('saved')}</Notice>}
        {editable && (
          <Button type="submit" pending={save.pending} className="w-fit">
            {tc('save')}
          </Button>
        )}
      </form>
    </Card>
  );
}

function PaymentsTab() {
  const t = useTranslations('settings.payments');
  const tp = useTranslations('paymentType');
  const { shopId } = useShop();
  const { call } = useAuth();
  const methods = useApi<Array<{ id: string; type: string; label: string; instructions: string | null; accountRef: string | null; availableInPos: boolean; availableOnline: boolean; isActive: boolean }>>(`/shops/${shopId}/payment-methods`);
  const [form, setForm] = useState({ type: 'BKASH', label: '', accountRef: '', instructions: '', availableInPos: true, availableOnline: true });
  const add = useAction(async () => {
    await call(`/shops/${shopId}/payment-methods`, { method: 'POST', body: Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '')) });
    setForm({ ...form, label: '', accountRef: '', instructions: '' });
    await methods.reload();
  });
  const patch = useAction(async (id: string, body: Record<string, unknown>) => {
    await call(`/shops/${shopId}/payment-methods/${id}`, { method: 'PATCH', body });
    await methods.reload();
  });
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Table head={[t('label'), t('type'), t('pos'), t('online'), t('active')]}>
        {methods.data?.map((m) => (
          <tr key={m.id}>
            <Td>
              {m.label}
              {m.accountRef && <span className="block text-xs text-muted">{m.accountRef}</span>}
            </Td>
            <Td>{tp.has(m.type) ? tp(m.type) : m.type}</Td>
            <Td><Checkbox label="" checked={m.availableInPos} onChange={(v) => void patch.run(m.id, { availableInPos: v })} /></Td>
            <Td><Checkbox label="" checked={m.availableOnline} onChange={(v) => void patch.run(m.id, { availableOnline: v })} /></Td>
            <Td><Checkbox label="" checked={m.isActive} onChange={(v) => void patch.run(m.id, { isActive: v })} /></Td>
          </tr>
        ))}
      </Table>
      <Card title={t('add')}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void add.run();
          }}
        >
          <Field label={t('type')}>
            {(id) => (
              <Select id={id} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {['CASH', 'CARD', 'BANK_TRANSFER', 'BKASH', 'NAGAD', 'ROCKET', 'CASH_ON_DELIVERY', 'OTHER'].map((x) => (
                  <option key={x} value={x}>
                    {tp(x)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('label')}>{(id) => <Input id={id} required value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />}</Field>
          <Field label={t('accountRef')}>{(id) => <Input id={id} value={form.accountRef} onChange={(e) => setForm({ ...form, accountRef: e.target.value })} />}</Field>
          <Field label={t('instructions')}>{(id) => <Input id={id} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />}</Field>
          <Checkbox label={t('pos')} checked={form.availableInPos} onChange={(v) => setForm({ ...form, availableInPos: v })} />
          <Checkbox label={t('online')} checked={form.availableOnline} onChange={(v) => setForm({ ...form, availableOnline: v })} />
          <ErrorNote error={add.error ?? patch.error} />
          <Button type="submit" pending={add.pending}>
            {t('add')}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function BranchesTab() {
  const t = useTranslations('settings.branches');
  const { shopId } = useShop();
  const { call } = useAuth();
  const branches = useApi<Array<{ id: string; name: string; code: string; status: string; isDefault: boolean }>>(`/shops/${shopId}/branches`);
  const [form, setForm] = useState({ name: '', code: '' });
  const add = useAction(async () => {
    await call(`/shops/${shopId}/branches`, { method: 'POST', body: form });
    setForm({ name: '', code: '' });
    await branches.reload();
  });
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Table head={[t('name'), t('code'), t('status')]}>
        {branches.data?.map((b) => (
          <tr key={b.id}>
            <Td>
              {b.name} {b.isDefault && <span className="text-xs text-muted">({t('default')})</span>}
            </Td>
            <Td>{b.code}</Td>
            <Td>{b.status}</Td>
          </tr>
        ))}
      </Table>
      <Card title={t('add')}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void add.run();
          }}
        >
          <Field label={t('name')}>{(id) => <Input id={id} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
          <Field label={t('code')}>{(id) => <Input id={id} required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />}</Field>
          <ErrorNote error={add.error} />
          <Button type="submit" pending={add.pending}>
            {t('add')}
          </Button>
        </form>
      </Card>
    </div>
  );
}
