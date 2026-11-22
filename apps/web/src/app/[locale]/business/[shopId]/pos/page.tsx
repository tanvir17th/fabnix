'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useRef, useState } from 'react';
import { D, DomainError, MeasurementComponent, calculateInvoice, sum } from '@fabnix/shared';
import { LengthSummary, MeasurementInput, UnitOption, evaluate, useUnitLabel } from '@/components/measurement';
import { useShop } from '@/components/shop-context';
import { Button, Card, ErrorNote, Field, Input, Loading, Notice, PageHeader, Select } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { ApiError, Page, newIdempotencyKey } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFormat } from '@/lib/format';
import { useAction, useApi, useDebounced } from '@/lib/hooks';
import { usePaymentMethodLabel } from '@/lib/payment-label';

interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  priceUnitCode: string;
  sellingRate: string;
  taxRate: string | null;
  status: string;
  availableInPos: boolean;
  thumbnailUrl: string | null;
}
interface Unit extends UnitOption {
  isActive: boolean;
  enabledForPos: boolean;
}
interface Line {
  key: string;
  product: Product;
  components: MeasurementComponent[];
  pieces: number;
  discountType: 'NONE' | 'PERCENT' | 'FIXED';
  discountValue: string;
  overrideRate: string;
  overrideReason: string;
}
interface Customer {
  id: string;
  name: string;
  phone: string | null;
  balanceDue: string;
}
interface Method {
  id: string;
  type: string;
  label: string;
  isActive: boolean;
  availableInPos: boolean;
}

/** POS counter (FR-035…FR-042): fast fabric sale with live calculation preview (FR-018). */
export default function PosPage() {
  const t = useTranslations('pos');
  const tErr = useTranslations('errors');
  const f = useFormat();
  const unitLabel = useUnitLabel();
  const methodLabel = usePaymentMethodLabel();
  const { shopId, access, base, can } = useShop();
  const { call } = useAuth();
  const currency = access.shop.currency;

  const units = useApi<Unit[]>(`/shops/${shopId}/units`);
  const methods = useApi<Method[]>(`/shops/${shopId}/payment-methods`);
  const branches = useApi<Array<{ id: string; name: string; status: string; isDefault: boolean }>>(`/shops/${shopId}/branches`);
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 200);
  const results = useApi<Page<Product>>(dq.length >= 1 ? `/shops/${shopId}/products?status=ACTIVE&limit=8&q=${encodeURIComponent(dq)}` : null);

  const [lines, setLines] = useState<Line[]>([]);
  const [branchId, setBranchId] = useState('');
  const [invoiceDiscount, setInvoiceDiscount] = useState('');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [custQ, setCustQ] = useState('');
  const dcq = useDebounced(custQ, 250);
  const customers = useApi<Page<Customer>>(dcq.length >= 2 && !customer ? `/shops/${shopId}/customers?limit=6&q=${encodeURIComponent(dcq)}` : null);
  const [payments, setPayments] = useState<Array<{ methodId: string; amount: string; reference: string }>>([]);
  const [dueMode, setDueMode] = useState(false);
  const customerInput = useRef<HTMLInputElement>(null);
  const [invoiceLanguage, setInvoiceLanguage] = useState<'bn' | 'en'>(access.pos.defaultInvoiceLanguage);
  const [idemKey, setIdemKey] = useState(newIdempotencyKey);
  const [done, setDone] = useState<{ id: string; invoiceNumber: string; grandTotal: string; dueAmount: string } | null>(null);

  const posUnits = useMemo(() => (units.data ?? []).filter((u) => u.isActive && u.enabledForPos), [units.data]);
  const allUnits = useMemo(() => (units.data ?? []).filter((u) => u.isActive), [units.data]);
  const branch = branchId || branches.data?.find((b) => b.isDefault)?.id || branches.data?.[0]?.id || '';
  const posMethods = (methods.data ?? []).filter((m) => m.isActive && m.availableInPos);

  /** Same engine + policy the server applies; the server recomputes and is authoritative. */
  const preview = useMemo(() => {
    const evaluated = lines.map((l) => ({ line: l, m: evaluate(l.components, posUnits) }));
    try {
      const valid = evaluated.filter((e) => e.m.inches);
      const priced = calculateInvoice({
        lines: valid.map(({ line, m }) => {
          const unit = allUnits.find((u) => u.code === line.product.priceUnitCode);
          if (!unit) throw new DomainError('UNIT_NOT_AVAILABLE', { unit: line.product.priceUnitCode });
          return {
            lengthInches: m.inches!,
            pieces: line.pieces,
            priceUnitInches: unit.inchesPerUnit,
            unitRate: line.overrideRate && D(line.overrideRate.replace(',', '.') || '0').greaterThanOrEqualTo(0) ? line.overrideRate : line.product.sellingRate,
            discount: line.discountType !== 'NONE' && line.discountValue ? { type: line.discountType, value: line.discountValue } : undefined,
            taxRate: line.product.taxRate ?? access.pos.defaultTaxRate,
          };
        }),
        invoiceDiscount: invoiceDiscount ? { type: 'FIXED', value: invoiceDiscount } : undefined,
        policy: access.pos,
      });
      const byKey = new Map(valid.map((v, i) => [v.line.key, priced.lines[i]!]));
      return { invoice: priced, byKey, evaluated, error: null as string | null };
    } catch (e) {
      return { invoice: null, byKey: new Map(), evaluated, error: e instanceof DomainError ? e.code : 'INTERNAL' };
    }
  }, [lines, posUnits, allUnits, invoiceDiscount, access.pos]);

  const grand = preview.invoice?.grandTotal ?? '0.00';
  const paid = sum(payments.map((p) => (p.amount && /^\d+(\.\d{1,2})?$/.test(p.amount) ? p.amount : '0')));
  const due = D(grand).minus(paid);
  const hasDue = due.greaterThan(0) && lines.length > 0;
  // Mirrors the shop's payment settings; the server enforces them too.
  const dueBlocked = hasDue && (D(paid).isZero() ? !access.pos.allowDueSales : !access.pos.allowPartialPayment);
  const canMarkDue = lines.length > 0 && D(grand).greaterThan(0) && (D(paid).greaterThan(0) && due.greaterThan(0) ? access.pos.allowPartialPayment : access.pos.allowDueSales);
  const dueActive = dueMode && hasDue;
  const needsCustomer = hasDue && !customer && !dueBlocked && (dueMode || D(paid).greaterThan(0));

  const focusCustomer = () => {
    const el = customerInput.current;
    el?.focus();
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  /** Keeps money already entered and leaves the rest as due; a fully paid draft becomes a full-due sale. */
  const sellOnDue = () => {
    setPayments((ps) => (due.greaterThan(0) ? ps.filter((p) => p.amount && Number(p.amount) > 0) : []));
    setDueMode(true);
    if (!customer) focusCustomer();
  };

  const addProduct = (p: Product) => {
    setLines((ls) => [...ls, { key: newIdempotencyKey(), product: p, components: [], pieces: 1, discountType: 'NONE', discountValue: '', overrideRate: '', overrideReason: '' }]);
    setQ('');
    setDone(null);
  };
  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = useAction(async () => {
    const sale = await call<{ id: string; invoiceNumber: string; grandTotal: string; dueAmount: string }>(`/shops/${shopId}/sales`, {
      method: 'POST',
      idempotencyKey: idemKey,
      body: {
        branchId: branch,
        customerId: customer?.id,
        invoiceLanguage,
        items: lines.map((l) => ({
          productId: l.product.id,
          measurement: evaluate(l.components, posUnits).components,
          pieces: l.pieces,
          ...(l.discountType !== 'NONE' && l.discountValue ? { discount: { type: l.discountType, value: l.discountValue } } : {}),
          ...(l.overrideRate ? { rateOverride: { unitRate: l.overrideRate, reason: l.overrideReason } } : {}),
        })),
        ...(invoiceDiscount ? { invoiceDiscount: { type: 'FIXED', value: invoiceDiscount } } : {}),
        payments: payments.filter((p) => p.amount && Number(p.amount) > 0).map((p) => ({ paymentMethodId: p.methodId, amount: p.amount, ...(p.reference ? { reference: p.reference } : {}) })),
      },
    });
    setDone(sale);
    setLines([]);
    setPayments([]);
    setDueMode(false);
    setCustomer(null);
    setInvoiceDiscount('');
    setIdemKey(newIdempotencyKey());
  });

  const addCustomer = useAction(async () => {
    const phone = /^[0-9+০-৯\s-]{8,}$/.test(custQ) ? custQ : undefined;
    const c = await call<Customer>(`/shops/${shopId}/customers`, { method: 'POST', body: { name: phone ? t('walkIn') : custQ, ...(phone ? { phone } : {}) } });
    setCustomer(c);
    setCustQ('');
  });

  if (!units.data || !methods.data || !branches.data) return <Loading />;
  const invalidLines = preview.evaluated.some((e) => !e.m.inches || e.m.error);
  const overrideMissingReason = lines.some((l) => l.overrideRate && l.overrideReason.trim().length < 3);

  return (
    <>
      <PageHeader
        title={t('title')}
        actions={
          <>
            {branches.data.length > 1 && (
              <Select aria-label={t('branch')} value={branch} onChange={(e) => setBranchId(e.target.value)} className="w-44">
                {branches.data.filter((b) => b.status === 'ACTIVE').map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            )}
            <Select aria-label={t('invoiceLanguage')} value={invoiceLanguage} onChange={(e) => setInvoiceLanguage(e.target.value as 'bn' | 'en')} className="w-40">
              <option value="bn">{t('invoiceIn', { lang: 'বাংলা' })}</option>
              <option value="en">{t('invoiceIn', { lang: 'English' })}</option>
            </Select>
          </>
        }
      />
      {done && (
        <div className="mb-4">
          <Notice tone="success">
            {t('saleDone', { number: done.invoiceNumber, total: f.money(done.grandTotal, currency) })}{' '}
            <Link href={`${base}/sales/${done.id}`} className="font-medium underline">
              {t('viewInvoice')}
            </Link>
          </Notice>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-4">
          <div className="relative">
            <Input autoFocus type="search" placeholder={t('searchProduct')} aria-label={t('searchProduct')} value={q} onChange={(e) => setQ(e.target.value)} className="h-12 text-base" />
            {q && results.data && (
              <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-line bg-surface shadow-lg" role="listbox">
                {results.data.items.filter((p) => p.availableInPos).map((p) => (
                  <li key={p.id}>
                    <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-surface-2" onClick={() => addProduct(p)}>
                      <span>
                        <span className="font-medium">{p.name}</span> <span className="text-xs text-muted">{p.sku}</span>
                      </span>
                      <span className="tabular text-sm">
                        {f.money(p.sellingRate, currency)}/{unitLabel({ code: p.priceUnitCode })}
                      </span>
                    </button>
                  </li>
                ))}
                {results.data.items.length === 0 && <li className="px-3 py-2 text-sm text-muted">{t('noMatch')}</li>}
              </ul>
            )}
          </div>

          {lines.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line p-10 text-center text-muted">{t('emptyCart')}</div>
          ) : (
            lines.map((l, idx) => {
              const ev = preview.evaluated.find((e) => e.line.key === l.key)!.m;
              const priced = preview.byKey.get(l.key);
              return (
                <Card
                  key={l.key}
                  title={
                    <span>
                      {idx + 1}. {l.product.name} <span className="text-xs font-normal text-muted">{l.product.sku}</span>
                    </span>
                  }
                  actions={
                    <Button size="sm" variant="ghost" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                      {t('remove')}
                    </Button>
                  }
                >
                  <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                    <div className="flex flex-col gap-2">
                      <MeasurementInput units={posUnits} value={l.components} onChange={(c) => update(l.key, { components: c })} quickEntry idPrefix={`l${idx}`} />
                      {ev.error && <p className="text-xs text-danger">{tErr(ev.error)}</p>}
                      <LengthSummary inches={ev.inches} units={posUnits} pieces={l.pieces} />
                      <div className="flex flex-wrap items-end gap-3">
                        <Field label={t('pieces')}>
                          {(id) => <Input id={id} type="number" min={1} className="w-20" value={l.pieces} onChange={(e) => update(l.key, { pieces: Math.max(1, Number.parseInt(e.target.value || '1', 10)) })} />}
                        </Field>
                        {can('pos.discount.apply') && (
                          <Field label={t('discount')}>
                            {(id) => (
                              <div className="flex gap-1">
                                <Select aria-label={t('discountType')} className="w-24" value={l.discountType} onChange={(e) => update(l.key, { discountType: e.target.value as Line['discountType'] })}>
                                  <option value="NONE">—</option>
                                  <option value="PERCENT">%</option>
                                  <option value="FIXED">৳</option>
                                </Select>
                                <Input id={id} inputMode="decimal" className="w-20" disabled={l.discountType === 'NONE'} value={l.discountValue} onChange={(e) => update(l.key, { discountValue: e.target.value })} />
                              </div>
                            )}
                          </Field>
                        )}
                        {can('pos.price.override') && (
                          <>
                            <Field label={t('overrideRate')}>
                              {(id) => <Input id={id} inputMode="decimal" className="w-24" placeholder={l.product.sellingRate} value={l.overrideRate} onChange={(e) => update(l.key, { overrideRate: e.target.value })} />}
                            </Field>
                            {l.overrideRate && (
                              <Field label={t('overrideReason')}>
                                {(id) => <Input id={id} className="w-48" value={l.overrideReason} onChange={(e) => update(l.key, { overrideReason: e.target.value })} />}
                              </Field>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <dl className="min-w-44 text-right text-sm">
                      <dt className="text-muted">{t('rate')}</dt>
                      <dd className="tabular">
                        {f.money(priced?.unitRate ?? l.product.sellingRate, currency)} / {unitLabel({ code: l.product.priceUnitCode })}
                      </dd>
                      {priced && (
                        <>
                          <dt className="mt-1 text-muted">{t('quantity')}</dt>
                          <dd className="tabular">{f.number(priced.quantity, 4)}</dd>
                          {Number(priced.discountAmount) > 0 && (
                            <>
                              <dt className="mt-1 text-muted">{t('discount')}</dt>
                              <dd className="tabular">−{f.money(priced.discountAmount, currency)}</dd>
                            </>
                          )}
                          <dt className="mt-1 text-muted">{t('lineTotal')}</dt>
                          <dd className="text-lg font-semibold tabular">{f.money(priced.lineTotal, currency)}</dd>
                        </>
                      )}
                    </dl>
                  </div>
                </Card>
              );
            })
          )}
        </div>

        <div className="flex flex-col gap-4 xl:sticky xl:top-20 xl:h-fit">
          <div className={needsCustomer ? 'rounded-lg ring-2 ring-warning ring-offset-2 ring-offset-bg' : undefined}>
          <Card title={t('customer')}>
            {customer ? (
              <div className="flex items-center justify-between">
                <span>
                  <span className="font-medium">{customer.name}</span>
                  <span className="block text-xs text-muted">
                    {customer.phone} · {t('dueBalance', { amount: f.money(customer.balanceDue, currency) })}
                  </span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => setCustomer(null)}>
                  {t('change')}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Input ref={customerInput} placeholder={t('customerSearch')} aria-label={t('customerSearch')} value={custQ} onChange={(e) => setCustQ(e.target.value)} />
                {customers.data?.items.map((c) => (
                  <button key={c.id} type="button" className="rounded-md border border-line px-3 py-1.5 text-left text-sm hover:border-accent" onClick={() => setCustomer(c)}>
                    {c.name} <span className="text-xs text-muted">{c.phone}</span>
                  </button>
                ))}
                {custQ.length >= 2 && can('customers.manage') && (
                  <Button size="sm" variant="secondary" pending={addCustomer.pending} onClick={() => void addCustomer.run()}>
                    + {t('newCustomer', { name: custQ })}
                  </Button>
                )}
                <ErrorNote error={addCustomer.error} />
                <p className={`text-xs ${needsCustomer ? 'font-medium text-warning' : 'text-muted'}`}>{needsCustomer ? t('dueCustomerHint') : t('walkInHint')}</p>
              </div>
            )}
          </Card>
          </div>

          <Card title={t('payment')}>
            <dl className="flex flex-col gap-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">{t('subtotal')}</dt>
                <dd className="tabular">{f.money(preview.invoice?.subtotal ?? '0', currency)}</dd>
              </div>
              {Number(preview.invoice?.lineDiscountTotal ?? 0) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted">{t('lineDiscounts')}</dt>
                  <dd className="tabular">−{f.money(preview.invoice!.lineDiscountTotal, currency)}</dd>
                </div>
              )}
              {can('pos.discount.apply') && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted">{t('invoiceDiscount')}</dt>
                  <dd>
                    <Input inputMode="decimal" aria-label={t('invoiceDiscount')} className="h-8 w-24 text-right" value={invoiceDiscount} onChange={(e) => setInvoiceDiscount(e.target.value)} placeholder="0" />
                  </dd>
                </div>
              )}
              {Number(preview.invoice?.taxTotal ?? 0) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted">{t('tax')}</dt>
                  <dd className="tabular">{f.money(preview.invoice!.taxTotal, currency)}</dd>
                </div>
              )}
              {Number(preview.invoice?.roundingAdjustment ?? 0) !== 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted">{t('rounding')}</dt>
                  <dd className="tabular">{f.money(preview.invoice!.roundingAdjustment, currency)}</dd>
                </div>
              )}
              <div className="mt-2 flex justify-between border-t border-line pt-2 text-xl font-semibold">
                <dt>{t('total')}</dt>
                <dd className="tabular" data-testid="pos-total">
                  {f.money(grand, currency)}
                </dd>
              </div>
            </dl>
            {preview.error && <ErrorNote error={new ApiError(422, preview.error)} className="mt-2" />}

            <div className="mt-4 flex flex-col gap-2">
              {payments.map((p, i) => (
                <div key={i} className="flex gap-1">
                  <Select aria-label={t('method')} value={p.methodId} onChange={(e) => setPayments((ps) => ps.map((x, j) => (j === i ? { ...x, methodId: e.target.value } : x)))} className="w-36">
                    {posMethods.map((m) => (
                      <option key={m.id} value={m.id}>
                        {methodLabel(m)}
                      </option>
                    ))}
                  </Select>
                  <Input inputMode="decimal" aria-label={t('amount')} value={p.amount} onChange={(e) => setPayments((ps) => ps.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} className="w-28 text-right" />
                  <Button size="sm" variant="ghost" aria-label={t('remove')} onClick={() => setPayments((ps) => ps.filter((_, j) => j !== i))}>
                    ✕
                  </Button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" disabled={!posMethods.length} onClick={() => {
                    setDueMode(false);
                    setPayments((ps) => [...ps, { methodId: posMethods[0]!.id, amount: due.greaterThan(0) ? due.toFixed(2) : '', reference: '' }]);
                  }}>
                  + {t('addPayment')}
                </Button>
                <Button size="sm" variant="secondary" disabled={!posMethods.length || !preview.invoice} onClick={() => {
                    setDueMode(false);
                    setPayments([{ methodId: posMethods[0]!.id, amount: grand, reference: '' }]);
                  }}>
                  {t('payFull')}
                </Button>
                <Button size="sm" variant={dueActive ? 'accent' : 'secondary'} aria-pressed={dueActive} disabled={!canMarkDue} title={t('sellOnDueHint')} onClick={sellOnDue}>
                  {t('sellOnDue')}
                </Button>
              </div>
              <p className={`text-sm tabular ${due.greaterThan(0) ? 'text-warning' : 'text-muted'}`}>
                {due.isNegative() ? t('overpaid') : t('due', { amount: f.money(due.toFixed(2), currency) })}
              </p>
              {dueBlocked && <p className="text-xs text-danger">{tErr('PARTIAL_PAYMENT_NOT_ALLOWED')}</p>}
              {hasDue && !dueBlocked && !customer && (
                <p className="text-xs text-danger">
                  {tErr('DUE_REQUIRES_CUSTOMER')}{' '}
                  <button type="button" className="font-medium underline" onClick={focusCustomer}>
                    {t('selectCustomer')}
                  </button>
                </p>
              )}
              {hasDue && !dueBlocked && customer && <p className="text-xs text-muted">{t('dueToCustomer', { amount: f.money(due.toFixed(2), currency), name: customer.name })}</p>}
            </div>

            <ErrorNote error={submit.error} className="mt-3" />
            <Button
              size="lg"
              variant="accent"
              className="mt-4 w-full"
              pending={submit.pending}
              disabled={!lines.length || invalidLines || !!preview.error || due.isNegative() || overrideMissingReason || dueBlocked || (due.greaterThan(0) && !customer)}
              onClick={() => void submit.run()}
            >
              {t('complete')}
            </Button>
          </Card>
        </div>
      </div>
    </>
  );
}
