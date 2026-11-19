'use client';

import { D, formatMoney } from '@fabnix/shared';
import bn from '../../messages/bn.json';
import en from '../../messages/en.json';

type Lang = 'bn' | 'en';
const LABELS = { bn: bn.invoiceDoc, en: en.invoiceDoc } as const;

export interface InvoiceData {
  invoiceNumber: string;
  language: Lang;
  issuedAt: string;
  status: string;
  paymentStatus: string;
  currency: string;
  shop: { name: string; legalName?: string | null; phone?: string | null; email?: string | null; addressLine?: string | null; city?: string | null; taxRegistrationNo?: string | null; invoiceFooterNote?: string | null };
  customer: { name: string; phone?: string | null; addressLine?: string | null } | null;
  branch: { name: string };
  cashier: string;
  lines: Array<{ lineNo: number; productName: string; sku: string; measurement: Array<{ unit: string; value: string }>; measurementDisplay: string; pieces: number; priceUnitCode: string; quantity: string; unitRate: string; discountAmount: string; taxAmount: string; lineTotal: string }>;
  totals: { subtotal: string; lineDiscountTotal: string; invoiceDiscountAmount: string; taxTotal: string; roundingAdjustment: string; grandTotal: string; paidAmount: string; refundedAmount: string; dueAmount: string };
  payments: Array<{ methodType: string; direction: string; amount: string; receivedAt: string; status: string }>;
}

/**
 * Printable invoice (FR-046…FR-049). Rendered ONLY from the sale's snapshots;
 * its language is chosen per invoice, independent of the UI (NFR-L10N-006).
 */
export function InvoiceDocument({ data, lang }: { data: InvoiceData; lang: Lang }) {
  const L = LABELS[lang];
  const numberLocale = lang === 'bn' ? 'bn-BD' : 'en-US';
  const money = (v: string) => formatMoney(v, { currency: data.currency, locale: numberLocale });
  const num = (v: string, dp = 2) => new Intl.NumberFormat(numberLocale, { maximumFractionDigits: dp }).format(v as unknown as number);
  const date = new Intl.DateTimeFormat(numberLocale, { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Dhaka' }).format(new Date(data.issuedAt));
  const unit = (code: string) => (L.units as Record<string, string>)[code] ?? code;
  const status = (s: string) => (L.status as Record<string, string>)[s] ?? s;

  return (
    <article lang={lang} className="mx-auto max-w-3xl rounded-lg border border-line bg-white p-8 text-[#111317] print:border-0 print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e4e1da] pb-4">
        <div>
          <h2 className="text-xl font-semibold">{data.shop.name}</h2>
          {data.shop.legalName && <p className="text-sm">{data.shop.legalName}</p>}
          <p className="text-sm text-[#5c5f66]">{[data.shop.addressLine, data.shop.city].filter(Boolean).join(', ')}</p>
          <p className="text-sm text-[#5c5f66]">{[data.shop.phone, data.shop.email].filter(Boolean).join(' · ')}</p>
          {data.shop.taxRegistrationNo && (
            <p className="text-sm">
              {L.taxNo}: {data.shop.taxRegistrationNo}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.2em] text-[#8a6130]">{L.title}</p>
          <p className="text-lg font-semibold">{data.invoiceNumber}</p>
          <p className="text-sm">{date}</p>
          <p className="text-sm">
            {L.branch}: {data.branch.name} · {L.cashier}: {data.cashier}
          </p>
        </div>
      </header>
      <section className="py-3 text-sm">
        <span className="text-[#5c5f66]">{L.billTo}: </span>
        {data.customer ? `${data.customer.name}${data.customer.phone ? ` · ${data.customer.phone}` : ''}` : L.walkIn}
      </section>
      <table className="w-full text-sm">
        <thead className="border-y border-[#e4e1da] text-left text-xs uppercase text-[#5c5f66]">
          <tr>
            <th className="py-2">#</th>
            <th className="py-2">{L.item}</th>
            <th className="py-2">{L.measurement}</th>
            <th className="py-2 text-right">{L.qty}</th>
            <th className="py-2 text-right">{L.rate}</th>
            <th className="py-2 text-right">{L.amount}</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((l) => (
            <tr key={l.lineNo} className="border-b border-[#f1efea] align-top">
              <td className="py-2">{num(String(l.lineNo), 0)}</td>
              <td className="py-2">
                {l.productName}
                <span className="block text-xs text-[#5c5f66]">{l.sku}</span>
              </td>
              <td className="py-2">
                {Array.isArray(l.measurement) ? l.measurement.map((c) => `${num(c.value)} ${unit(c.unit)}`).join(' ') : l.measurementDisplay}
                {l.pieces > 1 && ` × ${num(String(l.pieces), 0)}`}
              </td>
              <td className="py-2 text-right tabular">
                {num(l.quantity, 4)} {unit(l.priceUnitCode)}
              </td>
              <td className="py-2 text-right tabular">{money(l.unitRate)}</td>
              <td className="py-2 text-right tabular">
                {money(l.lineTotal)}
                {Number(l.discountAmount) > 0 && <span className="block text-xs text-[#5c5f66]">−{money(l.discountAmount)}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="ml-auto mt-4 grid w-72 grid-cols-2 gap-y-1 text-sm">
        <dt className="text-[#5c5f66]">{L.subtotal}</dt>
        <dd className="text-right tabular">{money(data.totals.subtotal)}</dd>
        {D(data.totals.lineDiscountTotal).plus(data.totals.invoiceDiscountAmount).greaterThan(0) && (
          <>
            <dt className="text-[#5c5f66]">{L.discount}</dt>
            <dd className="text-right tabular">−{money(D(data.totals.lineDiscountTotal).plus(data.totals.invoiceDiscountAmount).toFixed(2))}</dd>
          </>
        )}
        {Number(data.totals.taxTotal) > 0 && (
          <>
            <dt className="text-[#5c5f66]">{L.tax}</dt>
            <dd className="text-right tabular">{money(data.totals.taxTotal)}</dd>
          </>
        )}
        <dt className="border-t border-[#e4e1da] pt-1 font-semibold">{L.total}</dt>
        <dd className="border-t border-[#e4e1da] pt-1 text-right font-semibold tabular">{money(data.totals.grandTotal)}</dd>
        <dt className="text-[#5c5f66]">{L.paid}</dt>
        <dd className="text-right tabular">{money(data.totals.paidAmount)}</dd>
        {Number(data.totals.refundedAmount) > 0 && (
          <>
            <dt className="text-[#5c5f66]">{L.refunded}</dt>
            <dd className="text-right tabular">{money(data.totals.refundedAmount)}</dd>
          </>
        )}
        <dt className="font-medium">{L.due}</dt>
        <dd className="text-right font-medium tabular">{money(data.totals.dueAmount)}</dd>
        <dt className="text-[#5c5f66]">{L.paymentStatus}</dt>
        <dd className="text-right">{status(data.paymentStatus)}</dd>
      </dl>
      {data.status === 'CANCELLED' && <p className="mt-4 text-center text-sm font-semibold uppercase tracking-widest text-[#b42318]">{L.cancelled}</p>}
      <footer className="mt-8 border-t border-[#e4e1da] pt-3 text-center text-xs text-[#5c5f66]">
        {data.shop.invoiceFooterNote ?? L.thanks} · FABNIX
      </footer>
    </article>
  );
}
