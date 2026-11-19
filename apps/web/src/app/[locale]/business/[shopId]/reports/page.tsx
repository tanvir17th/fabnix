'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useShop } from '@/components/shop-context';
import { Button, Card, ErrorNote, Field, Input, Loading, PageHeader, Stat, Td, Table } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useFormat } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';

interface SalesReport {
  currency: string;
  totals: { count: number; gross: string; discounts: string; tax: string; net: string; paid: string; due: string };
  pos: Array<{ day: string; count: number; gross: string; discounts: string; tax: string; net: string; paid: string; due: string }>;
  online: Array<{ day: string; count: number; net: string }>;
  topProducts: Array<{ productId: string; name: string; inches: string; revenue: string }>;
  paymentMethods: Array<{ method: string; total: string }>;
  cashiers: Array<{ userId: string; name: string; count: number; net: string }>;
}
interface Profit {
  revenue: string;
  costOfGoodsSold: string;
  grossProfit: string;
  expenses: string;
  netProfit: string;
  grossMarginPercent: string;
  basisKeys: string[];
}
interface ExpenseReport {
  items: Array<{ categoryId: string; name: string; nameKey: string | null; total: string; count: number }>;
  total: string;
}

const local = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(d);

/** §11 reports: sales, product performance, payment mix, expenses, profit estimate; FR-070 CSV export. */
export default function ReportsPage() {
  const t = useTranslations('reports');
  const tk = useTranslations();
  const tm = useTranslations('paymentType');
  const f = useFormat();
  const { shopId } = useShop();
  const { call } = useAuth();
  const [from, setFrom] = useState(() => local(new Date(Date.now() - 29 * 86_400_000)));
  const [to, setTo] = useState(() => local());
  const range = `from=${from}&to=${to}`;
  const sales = useApi<SalesReport>(`/shops/${shopId}/reports/sales?${range}`);
  const profit = useApi<Profit>(`/shops/${shopId}/reports/profit?${range}`);
  const expenses = useApi<ExpenseReport>(`/shops/${shopId}/reports/expenses?${range}`);
  const exportCsv = useAction(async () => {
    const res = await call<Response>(`/shops/${shopId}/reports/sales?${range}&format=csv`, { raw: true });
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: `fabnix-sales-${from}-${to}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  });
  const cur = sales.data?.currency ?? 'BDT';
  const max = Math.max(1, ...(sales.data?.pos ?? []).map((d) => Number(d.net)));

  return (
    <>
      <PageHeader
        title={t('title')}
        actions={
          <Button variant="secondary" pending={exportCsv.pending} onClick={() => void exportCsv.run()}>
            {t('exportCsv')}
          </Button>
        }
      />
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <Field label={t('from')}>{(id) => <Input id={id} type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <Field label={t('to')}>{(id) => <Input id={id} type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />}</Field>
      </div>
      <ErrorNote error={sales.error ?? profit.error ?? exportCsv.error} />
      {!sales.data || !profit.data ? (
        <Loading />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t('netSales')} value={f.money(sales.data.totals.net, cur)} hint={t('invoices', { count: sales.data.totals.count })} />
            <Stat label={t('collected')} value={f.money(sales.data.totals.paid, cur)} tone="accent" />
            <Stat label={t('due')} value={f.money(sales.data.totals.due, cur)} tone={Number(sales.data.totals.due) > 0 ? 'danger' : undefined} />
            <Stat label={t('netProfit')} value={f.money(profit.data.netProfit, cur)} hint={t('margin', { pct: f.number(profit.data.grossMarginPercent) })} tone={Number(profit.data.netProfit) < 0 ? 'danger' : 'accent'} />
          </div>

          <Card title={t('daily')}>
            {sales.data.pos.length === 0 ? (
              <p className="text-sm text-muted">{t('noData')}</p>
            ) : (
              <>
                <div className="mb-4 flex h-32 items-end gap-1" role="img" aria-label={t('daily')}>
                  {sales.data.pos.map((d) => (
                    <div key={d.day} className="flex-1 rounded-t bg-accent" style={{ height: `${Math.max(2, (Number(d.net) / max) * 120)}px` }} title={`${d.day}: ${d.net}`} />
                  ))}
                </div>
                <Table head={[t('day'), t('count'), t('gross'), t('discounts'), t('tax'), t('net'), t('paid'), t('due')]}>
                  {sales.data.pos.map((d) => (
                    <tr key={d.day}>
                      <Td>{f.date(d.day)}</Td>
                      <Td className="tabular">{f.digits(d.count)}</Td>
                      <Td className="tabular">{f.money(d.gross, cur)}</Td>
                      <Td className="tabular">{f.money(d.discounts, cur)}</Td>
                      <Td className="tabular">{f.money(d.tax, cur)}</Td>
                      <Td className="tabular font-medium">{f.money(d.net, cur)}</Td>
                      <Td className="tabular">{f.money(d.paid, cur)}</Td>
                      <Td className="tabular">{f.money(d.due, cur)}</Td>
                    </tr>
                  ))}
                </Table>
              </>
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title={t('topProducts')}>
              <Table head={[t('product'), t('yardsSold'), t('revenue')]} empty={!sales.data.topProducts.length}>
                {sales.data.topProducts.map((p) => (
                  <tr key={p.productId}>
                    <Td>{p.name}</Td>
                    <Td className="tabular">{f.yards(p.inches)}</Td>
                    <Td className="tabular">{f.money(p.revenue, cur)}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
            <Card title={t('paymentMix')}>
              <Table head={[t('method'), t('amount')]} empty={!sales.data.paymentMethods.length}>
                {sales.data.paymentMethods.map((m) => (
                  <tr key={m.method}>
                    <Td>{tm.has(m.method) ? tm(m.method) : m.method}</Td>
                    <Td className="tabular">{f.money(m.total, cur)}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
            <Card title={t('byCashier')}>
              <Table head={[t('cashier'), t('count'), t('net')]} empty={!sales.data.cashiers.length}>
                {sales.data.cashiers.map((c) => (
                  <tr key={c.userId}>
                    <Td>{c.name}</Td>
                    <Td className="tabular">{f.digits(c.count)}</Td>
                    <Td className="tabular">{f.money(c.net, cur)}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
            <Card title={t('expenses')}>
              <Table head={[t('category'), t('amount')]}>
                {(expenses.data?.items ?? []).filter((e) => Number(e.total) > 0).map((e) => (
                  <tr key={e.categoryId}>
                    <Td>{e.nameKey && tk.has(e.nameKey) ? tk(e.nameKey) : e.name}</Td>
                    <Td className="tabular">{f.money(e.total, cur)}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
          </div>

          <Card title={t('profitTitle')}>
            <dl className="grid max-w-md grid-cols-2 gap-y-1 text-sm">
              <dt className="text-muted">{t('revenue')}</dt>
              <dd className="text-right tabular">{f.money(profit.data.revenue, cur)}</dd>
              <dt className="text-muted">{t('cogs')}</dt>
              <dd className="text-right tabular">−{f.money(profit.data.costOfGoodsSold, cur)}</dd>
              <dt className="font-medium">{t('grossProfit')}</dt>
              <dd className="text-right font-medium tabular">{f.money(profit.data.grossProfit, cur)}</dd>
              <dt className="text-muted">{t('expenses')}</dt>
              <dd className="text-right tabular">−{f.money(profit.data.expenses, cur)}</dd>
              <dt className="font-semibold">{t('netProfit')}</dt>
              <dd className="text-right font-semibold tabular">{f.money(profit.data.netProfit, cur)}</dd>
            </dl>
            <ul className="mt-4 list-disc pl-5 text-xs text-muted">
              {profit.data.basisKeys.map((k) => (
                <li key={k}>{tk(k)}</li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
