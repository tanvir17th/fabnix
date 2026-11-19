'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { D, DomainError, MeasurementComponent, UnitDefinition, equivalents, parseMeasurementText, toInches } from '@fabnix/shared';
import { useFormat } from '@/lib/format';
import { Button, Input, Select, cx } from './ui';

export interface UnitOption {
  code: string;
  symbol: string;
  name?: string;
  inchesPerUnit: string;
  kind?: UnitDefinition['kind'];
}

export function toDefs(units: UnitOption[]): UnitDefinition[] {
  return units.map((u) => ({ code: u.code, symbol: u.symbol, name: u.name, inchesPerUnit: u.inchesPerUnit, kind: u.kind ?? (['YARD', 'INCH', 'METRE', 'GIRA'].includes(u.code) ? (u.code as UnitDefinition['kind']) : u.code === 'CM' ? 'CENTIMETRE' : 'CUSTOM') }));
}

export function useUnitLabel() {
  const t = useTranslations('units');
  return (u: { code: string; name?: string; symbol?: string }) => (t.has(u.code) ? t(u.code) : (u.name ?? u.symbol ?? u.code));
}

/** Stored components → text in the reader's language, e.g. "৫ গজ ৪ গিরা" (never the server's English symbols). */
export function useMeasurementText() {
  const label = useUnitLabel();
  const f = useFormat();
  return (components: unknown, pieces = 1) => {
    if (!Array.isArray(components)) return '';
    const text = (components as MeasurementComponent[]).map((c) => `${f.number(c.value, 2)} ${label({ code: c.unit })}`).join(' ');
    return pieces > 1 ? `${text} × ${f.digits(pieces)}` : text;
  };
}

export interface MeasurementValue {
  components: MeasurementComponent[];
  inches: string | null;
  error: string | null;
}

/** Client-side, decimal-safe preview with the same engine the server uses. */
export function evaluate(components: MeasurementComponent[], units: UnitOption[]): MeasurementValue {
  const filled = components.filter((c) => c.value.trim() !== '');
  if (!filled.length) return { components: filled, inches: null, error: null };
  try {
    return { components: filled, inches: toInches(filled, toDefs(units)).inches.toFixed(4), error: null };
  } catch (e) {
    return { components: filled, inches: null, error: e instanceof DomainError ? e.code : 'MEASUREMENT_INVALID_VALUE' };
  }
}

function defaultRows(units: UnitOption[]): MeasurementComponent[] {
  const has = (c: string) => units.some((u) => u.code === c);
  const first = has('YARD') ? 'YARD' : (units[0]?.code ?? 'YARD');
  const second = has('GIRA') ? 'GIRA' : has('INCH') ? 'INCH' : null;
  return [{ unit: first, value: '' }, ...(second ? [{ unit: second, value: '' }] : [])];
}

/**
 * Mixed-unit entry (FR-014): e.g. [5] yd + [4] gira. Optional quick text
 * ("5 yd 4 gira", "৫ গজ ৪ গিরা") parsed by the shared parser.
 */
export function MeasurementInput({
  units,
  value,
  onChange,
  quickEntry = false,
  compact = false,
  idPrefix = 'm',
}: {
  units: UnitOption[];
  value: MeasurementComponent[];
  onChange: (v: MeasurementComponent[]) => void;
  quickEntry?: boolean;
  compact?: boolean;
  idPrefix?: string;
}) {
  const t = useTranslations('measure');
  const label = useUnitLabel();
  const [text, setText] = useState('');
  const [textError, setTextError] = useState<string | null>(null);
  const tErr = useTranslations('errors');
  const rows = value.length ? value : defaultRows(units);

  const update = (i: number, patch: Partial<MeasurementComponent>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const used = new Set(rows.map((r) => r.unit));
  const free = units.filter((u) => !used.has(u.code));

  return (
    <div className="flex flex-col gap-2">
      {quickEntry && (
        <div>
          <Input
            aria-label={t('quick')}
            placeholder={t('quickPlaceholder')}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (!e.target.value.trim()) return setTextError(null);
              try {
                const parsed = parseMeasurementText(e.target.value, toDefs(units), 'YARD');
                setTextError(null);
                onChange(parsed);
              } catch (err) {
                setTextError(err instanceof DomainError ? err.code : 'MEASUREMENT_UNPARSEABLE');
              }
            }}
          />
          {textError && <p className="mt-1 text-xs text-danger">{tErr(textError)}</p>}
        </div>
      )}
      <div className={cx('flex flex-wrap items-center gap-2', compact && 'gap-1')}>
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-1">
            <Input
              id={`${idPrefix}-${i}`}
              aria-label={label(units.find((u) => u.code === r.unit) ?? { code: r.unit })}
              inputMode="decimal"
              className={compact ? 'w-16' : 'w-20'}
              value={r.value}
              placeholder="0"
              onChange={(e) => update(i, { value: e.target.value.replace(',', '.') })}
            />
            <Select aria-label={t('unit')} className={compact ? 'w-24' : 'w-28'} value={r.unit} onChange={(e) => update(i, { unit: e.target.value })}>
              {units
                .filter((u) => u.code === r.unit || !used.has(u.code))
                .map((u) => (
                  <option key={u.code} value={u.code}>
                    {label(u)}
                  </option>
                ))}
            </Select>
            {rows.length > 1 && (
              <button type="button" className="rounded px-1 text-muted hover:text-danger" aria-label={t('removeUnit')} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                ✕
              </button>
            )}
          </div>
        ))}
        {free.length > 0 && rows.length < 3 && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange([...rows, { unit: free[0]!.code, value: '' }])}>
            + {t('addUnit')}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Normalized length + equivalents (FR-015, FR-018). */
export function LengthSummary({ inches, units, pieces = 1 }: { inches: string | null; units: UnitOption[]; pieces?: number }) {
  const t = useTranslations('measure');
  const f = useFormat();
  const label = useUnitLabel();
  const total = useMemo(() => (inches ? D(inches).times(Math.max(1, pieces)).toFixed(4) : null), [inches, pieces]);
  const eq = useMemo(() => {
    if (!total) return [];
    try {
      return equivalents(total, toDefs(units), 2);
    } catch {
      return [];
    }
  }, [total, units]);
  if (!total) return null;
  return (
    <div className="rounded-md bg-surface-2 px-3 py-2 text-sm">
      <p>
        <span className="text-muted">{t('normalized')}: </span>
        <span className="font-medium tabular">
          {f.number(total, 4)} {t('inchesShort')}
        </span>
      </p>
      <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
        {eq.map((e) => (
          <span key={e.unit} className="tabular">
            {f.number(e.value)} {label({ code: e.unit, symbol: e.symbol })}
          </span>
        ))}
      </p>
    </div>
  );
}
