'use client';

import { forwardRef, useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ApiError } from '@/lib/api';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');
export { cx };

// ----------------------------------------------------------------- Button

type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
export const Button = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' | 'lg'; pending?: boolean }>(
  function Button({ variant = 'primary', size = 'md', pending, className, children, disabled, ...rest }, ref) {
    const styles: Record<ButtonVariant, string> = {
      primary: 'bg-fg text-bg hover:opacity-90',
      accent: 'bg-accent text-[#111317] hover:brightness-95',
      secondary: 'bg-surface text-fg border border-line hover:bg-surface-2',
      ghost: 'text-fg hover:bg-surface-2',
      danger: 'bg-danger text-white hover:opacity-90',
    };
    const sizes = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-base' };
    return (
      <button
        ref={ref}
        disabled={disabled || pending}
        aria-busy={pending || undefined}
        className={cx('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-50', styles[variant], sizes[size], className)}
        {...rest}
      >
        {pending && <Spinner className="h-4 w-4" />}
        {children}
      </button>
    );
  },
);

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ----------------------------------------------------------------- Form controls

const control = 'rounded-md border border-line bg-surface px-3 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none disabled:opacity-60';

/** Full width unless the caller sets an explicit width utility (avoids w-full vs w-32 conflicts). */
const width = (className?: string) => (/(^|\s)(w-|min-w-|max-w-)/.test(className ?? '') ? '' : 'w-full');

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(control, width(className), 'h-10', className)} {...rest} />;
});

/** Password field with a show/hide toggle; the toggle is type="button" so it never submits the form. */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>>(function PasswordInput({ className, ...rest }, ref) {
  const t = useTranslations('auth');
  const [visible, setVisible] = useState(false);
  return (
    <div className={cx('relative', width(className))}>
      <input ref={ref} type={visible ? 'text' : 'password'} className={cx(control, 'h-10 w-full pr-10', className)} {...rest} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t('hidePassword') : t('showPassword')}
        aria-pressed={visible}
        aria-controls={rest.id}
        title={visible ? t('hidePassword') : t('showPassword')}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
      >
        {visible ? <EyeIcon /> : <EyeOffIcon />}
      </button>
    </div>
  );
});

function EyeIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.9 3.9M6.6 6.6C3.7 8.5 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3 3 18 18" />
    </svg>
  );
}

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(control, width(className), 'min-h-20 py-2', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cx(control, width(className), 'h-10 pr-8', className)} {...rest}>
      {children}
    </select>
  );
});

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string | null; children: (id: string) => React.ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      {children(id)}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Checkbox({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" className="h-4 w-4 accent-[var(--accent-ink)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

// ----------------------------------------------------------------- Layout bits

export function Card({ children, className, title, actions }: { children: React.ReactNode; className?: string; title?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className={cx('rounded-lg border border-line bg-surface', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: 'accent' | 'danger' }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={cx('mt-1 text-2xl font-semibold tabular', tone === 'accent' && 'text-accent-ink', tone === 'danger' && 'text-danger')}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Loading() {
  const t = useTranslations('common');
  return (
    <div className="flex items-center gap-2 py-10 text-muted" role="status">
      <Spinner /> {t('loading')}
    </div>
  );
}

// ----------------------------------------------------------------- Status badges

const TONES: Record<string, string> = {
  neutral: 'bg-surface-2 text-fg',
  accent: 'bg-accent-soft text-accent-ink',
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
};

export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: keyof typeof TONES }) {
  return <span className={cx('inline-flex items-center rounded px-2 py-0.5 text-xs font-medium', TONES[tone])}>{children}</span>;
}

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  PENDING_CONFIRMATION: 'warning', CONFIRMED: 'accent', PROCESSING: 'accent', READY_FOR_PICKUP: 'accent', DISPATCHED: 'accent',
  DELIVERED: 'success', COMPLETED: 'success', REJECTED: 'danger', CANCELLED: 'danger', PAID: 'success', UNPAID: 'warning',
  PARTIALLY_PAID: 'warning', REFUNDED: 'neutral', PARTIALLY_REFUNDED: 'neutral', ACTIVE: 'success', SUSPENDED: 'danger', CLOSED: 'danger',
  PENDING_APPROVAL: 'warning', PUBLISHED: 'success', UNPUBLISHED: 'neutral', PAUSED: 'warning', VISIBLE: 'success', HIDDEN: 'danger',
  REMOVED: 'danger', POSTED: 'success', REVERSED: 'neutral', TRIALING: 'accent', PAST_DUE: 'warning', IN_STOCK: 'success',
  LOW_STOCK: 'warning', OUT_OF_STOCK: 'danger', PENDING_VERIFICATION: 'warning', INVITED: 'accent',
};

/** Localized status chip — every enum value has a `status.<VALUE>` key. */
export function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('status');
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{t.has(status) ? t(status) : status}</Badge>;
}

// ----------------------------------------------------------------- Errors

/** Renders an API problem in the user's language from its stable code (NFR-L10N-004). */
export function ErrorNote({ error, className }: { error: ApiError | null | undefined; className?: string }) {
  const t = useTranslations('errors');
  if (!error) return null;
  const key = t.has(error.code) ? error.code : 'INTERNAL';
  const params = Object.fromEntries(Object.entries(error.params ?? {}).filter(([, v]) => typeof v === 'string' || typeof v === 'number')) as Record<string, string | number>;
  return (
    <div role="alert" className={cx('rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger', className)}>
      {t(key, params)}
      {error.errors?.length > 0 && <span className="block text-xs opacity-80">{error.errors.map((e) => e.path).filter(Boolean).join(', ')}</span>}
    </div>
  );
}

export function Notice({ children, tone = 'accent' }: { children: React.ReactNode; tone?: 'accent' | 'success' | 'warning' }) {
  return <div className={cx('rounded-md px-3 py-2 text-sm', TONES[tone])}>{children}</div>;
}

// ----------------------------------------------------------------- Modal

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      aria-label={title}
      className={cx('m-auto w-[calc(100%-2rem)] rounded-lg border border-line bg-surface p-0 text-fg backdrop:bg-black/40', wide ? 'max-w-3xl' : 'max-w-lg')}
    >
      {open && (
        <>
          <header className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="font-semibold">{title}</h2>
            <button onClick={onClose} className="rounded p-1 text-muted hover:bg-surface-2" aria-label="✕">
              ✕
            </button>
          </header>
          <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
        </>
      )}
    </dialog>
  );
}

/** Confirm dialog that requires a reason (cancellations, rejections, admin actions). */
export function ReasonDialog({
  open,
  title,
  confirmLabel,
  onClose,
  onConfirm,
  pending,
  error,
  minLength = 3,
  danger = true,
}: {
  open: boolean;
  title: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  pending?: boolean;
  error?: ApiError | null;
  minLength?: number;
  danger?: boolean;
}) {
  const t = useTranslations('common');
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} pending={pending} disabled={reason.trim().length < minLength} onClick={() => onConfirm(reason.trim())}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Field label={t('reason')} hint={t('reasonHint', { min: minLength })}>
        {(id) => <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />}
      </Field>
      <ErrorNote error={error} className="mt-3" />
    </Modal>
  );
}

// ----------------------------------------------------------------- Table

export function Table({ head, children, empty }: { head: React.ReactNode[]; children: React.ReactNode; empty?: boolean }) {
  const t = useTranslations('common');
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line bg-surface-2 text-xs uppercase tracking-wide text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
      {empty && <p className="px-4 py-8 text-center text-sm text-muted">{t('noResults')}</p>}
    </div>
  );
}

export function Td({ children, className, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cx('px-3 py-2 align-middle', className)} {...rest}>
      {children}
    </td>
  );
}

// ----------------------------------------------------------------- Tabs

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: Array<{ value: T; label: React.ReactNode }> }) {
  return (
    <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {items.map((i) => (
        <button
          key={i.value}
          role="tab"
          aria-selected={value === i.value}
          onClick={() => onChange(i.value)}
          className={cx('-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium', value === i.value ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg')}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}
