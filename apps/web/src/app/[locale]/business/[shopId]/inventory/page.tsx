'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { MeasurementComponent } from '@fabnix/shared';
import { LengthSummary, MeasurementInput, evaluate, useUnitLabel } from '@/components/measurement';
import { useShop } from '@/components/shop-context';
import { Button, Checkbox, ErrorNote, Field, Input, Loading, Modal, PageHeader, Select, Td, Table, Textarea, Badge } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth';
import { useFormat } from '@/lib/format';
import { useAction, useApi, useDebounced } from '@/lib/hooks';
import type { Page } from '@/lib/api';

interface Row {
  id: string;
  branch: { id: string; name: string };
  product: { id: string; name: string; sku: string };
  onHandInches: string;
  reservedInches: string;
  availableInches: string;
  lowStockThresholdInches: string;
  lowStock: boolean;
  /** Unit purchase price per `priceUnitCode` (e.g. per yard); null = not set on the product. */
  purchasePrice: string | null;
  priceUnitCode: string;
  /** On hand × purchase price (server-computed, exact decimals); null when no purchase price. */
  valuation: string | null;
}
interface Movement {
  id: string;
  type: string;
  deltaOnHandInches: string;
  deltaReservedInches: string;
  onHandAfterInches: string;
  reservedAfterInches: string;
  reason: string | null;
  actorType: string;
  createdAt: string;
}

/** FR-026…FR-032 stock on hand, opening stock, adjustments, append-only ledger. */
export default function InventoryPage() {
  const t = useTranslations('inventory');
  const tm = useTranslations('movement');
  const tc = useTranslations('common');
  const f = useFormat();
  const unitLabel = useUnitLabel();
  const { shopId, can, access, base } = useShop();
  const { call } = useAuth();
  const [q, setQ] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const dq = useDebounced(q);
  const list = useApi<Page<Row>>(`/shops/${shopId}/inventory?limit=100${dq ? `&q=${encodeURIComponent(dq)}` : ''}${lowOnly ? '&lowStockOnly=true' : ''}`);
  const units = useApi<Array<{ code: string; symbol: string; name: string; inchesPerUnit: string; isActive: boolean }>>(`/shops/${shopId}/units`);
  const [ledgerFor, setLedgerFor] = useState<Row | null>(null);
  const ledger = useApi<Page<Movement>>(ledgerFor ? `/shops/${shopId}/inventory/products/${ledgerFor.product.id}/ledger?branchId=${ledgerFor.branch.id}&limit=50` : null);
  const [adjustFor, setAdjustFor] = useState<{ row: Row; mode: 'opening' | 'adjust' } | null>(null);
  const [type, setType] = useState<'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'DAMAGE_OUT'>('ADJUSTMENT_IN');
  const [components, setComponents] = useState<MeasurementComponent[]>([]);
  const [reason, setReason] = useState('');
  const activeUnits = (units.data ?? []).filter((u) => u.isActive);
  const measured = evaluate(components, activeUnits);

  useEffect(() => {
    const pid = new URLSearchParams(window.location.search).get('productId');
    if (pid && list.data) {
      const row = list.data.items.find((r) => r.product.id === pid);
      if (row) setLedgerFor(row);
    }
  }, [list.data]);

  const submit = useAction(async () => {
    const row = adjustFor!.row;
    const body = { branchId: row.branch.id, productId: row.product.id, measurement: measured.components };
    if (adjustFor!.mode === 'opening') await call(`/shops/${shopId}/inventory/opening`, { method: 'POST', body });
    else await call(`/shops/${shopId}/inventory/adjustments`, { method: 'POST', body: { ...body, type, reason } });
    setAdjustFor(null);
    setComponents([]);
    setReason('');
    await list.reload();
  });

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Input type="search" placeholder={t('search')} aria-label={t('search')} value={q} onChange={(e) => setQ(e.target.value)} className="w-72" />
        <Checkbox label={t('lowOnly')} checked={lowOnly} onChange={setLowOnly} />
      </div>
      <ErrorNote error={list.error} />
      {!list.data ? (
        <Loading />
      ) : (
        <Table head={[t('product'), t('branch'), t('onHand'), t('reserved'), t('available'), t('purchasePrice'), t('valuation'), '']} empty={!list.data.items.length}>
          {list.data.items.map((r) => (
            <tr key={r.id}>
              <Td>
                <span className="font-medium">{r.product.name}</span> <span className="text-xs text-muted">{r.product.sku}</span>
                {r.lowStock && (
                  <span className="ml-2">
                    <Badge tone="warning">{t('low')}</Badge>
                  </span>
                )}
              </Td>
              <Td>{r.branch.name}</Td>
              <Td className="tabular">{f.yards(r.onHandInches)} {unitLabel({ code: 'YARD' })}</Td>
              <Td className="tabular text-muted">{f.yards(r.reservedInches)}</Td>
              <Td className={`tabular font-medium ${r.lowStock ? 'text-warning' : ''}`}>{f.yards(r.availableInches)}</Td>
              <Td className="tabular whitespace-nowrap">
                {r.purchasePrice ? (
                  <>
                    {f.money(r.purchasePrice, access.shop.currency)}
                    <span className="text-xs text-muted"> / {unitLabel({ code: r.priceUnitCode })}</span>
                  </>
                ) : can('catalog.manage') ? (
                  <Link href={`${base}/products/${r.product.id}`} className="text-xs text-accent-ink underline">
                    {t('setPurchasePrice')}
                  </Link>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </Td>
              <Td className="tabular whitespace-nowrap" title={r.valuation ? undefined : t('noPurchasePrice')}>
                {r.valuation ? f.money(r.valuation, access.shop.currency) : <span className="text-muted">—</span>}
              </Td>
              <Td>
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setLedgerFor(r)}>
                    {t('ledger')}
                  </Button>
                  {can('inventory.opening') && Number(r.onHandInches) === 0 && (
                    <Button size="sm" variant="secondary" onClick={() => setAdjustFor({ row: r, mode: 'opening' })}>
                      {t('opening')}
                    </Button>
                  )}
                  {can('inventory.adjust') && (
                    <Button size="sm" variant="secondary" onClick={() => setAdjustFor({ row: r, mode: 'adjust' })}>
                      {t('adjust')}
                    </Button>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={!!ledgerFor} onClose={() => setLedgerFor(null)} title={t('ledgerTitle', { product: ledgerFor?.product.name ?? '' })} wide>
        {!ledger.data ? (
          <Loading />
        ) : (
          <Table head={[t('when'), t('type'), t('changeOnHand'), t('changeReserved'), t('balance'), t('reason')]} empty={!ledger.data.items.length}>
            {ledger.data.items.map((m) => (
              <tr key={m.id}>
                <Td className="whitespace-nowrap text-xs">{f.date(m.createdAt, true)}</Td>
                <Td>{tm(m.type)}</Td>
                <Td className={`tabular ${Number(m.deltaOnHandInches) < 0 ? 'text-danger' : 'text-success'}`}>{Number(m.deltaOnHandInches) ? `${f.number(m.deltaOnHandInches, 2)}″` : ''}</Td>
                <Td className="tabular text-muted">{Number(m.deltaReservedInches) ? `${f.number(m.deltaReservedInches, 2)}″` : ''}</Td>
                <Td className="tabular">
                  {f.yards(m.onHandAfterInches)} / {f.yards(m.reservedAfterInches)}
                </Td>
                <Td className="text-xs">{m.reason}</Td>
              </tr>
            ))}
          </Table>
        )}
        <p className="mt-3 text-xs text-muted">{t('ledgerNote')}</p>
      </Modal>

      <Modal
        open={!!adjustFor}
        onClose={() => setAdjustFor(null)}
        title={adjustFor?.mode === 'opening' ? t('opening') : t('adjust')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdjustFor(null)}>
              {tc('cancel')}
            </Button>
            <Button pending={submit.pending} disabled={!measured.inches || (adjustFor?.mode === 'adjust' && reason.trim().length < 3)} onClick={() => void submit.run()}>
              {tc('save')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">
            {adjustFor?.row.product.name} · {adjustFor?.row.branch.name}
          </p>
          {adjustFor?.mode === 'adjust' && (
            <Field label={t('type')}>
              {(id) => (
                <Select id={id} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                  {(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE_OUT'] as const).map((x) => (
                    <option key={x} value={x}>
                      {tm(x)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <MeasurementInput units={activeUnits} value={components} onChange={setComponents} quickEntry idPrefix="adj" />
          <LengthSummary inches={measured.inches} units={activeUnits} />
          {adjustFor?.mode === 'adjust' && <Field label={t('reason')}>{(id) => <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>}
          <ErrorNote error={submit.error} />
        </div>
      </Modal>
    </>
  );
}
