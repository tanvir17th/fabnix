'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useFormat } from '@/lib/format';
import { Button, Input, Loading, Modal, Td, Table, ErrorNote } from './ui';
import { useApi, useDebounced } from '@/lib/hooks';

export interface AuditRow {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
  ipAddress: string | null;
  requestId: string | null;
  actor?: { fullName: string } | null;
  admin?: { fullName: string } | null;
  shop?: { name: string } | null;
}

/** FR-084 audit search (append-only; read-only UI). */
export function AuditTable({ basePath, showShop }: { basePath: string; showShop?: boolean }) {
  const t = useTranslations('audit');
  const ta = useTranslations('auditActions');
  const f = useFormat();
  const [action, setAction] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [open, setOpen] = useState<AuditRow | null>(null);
  const da = useDebounced(action);
  const sep = basePath.includes('?') ? '&' : '?';
  const logs = useApi<{ items: AuditRow[]; nextCursor: string | null }>(`${basePath}${sep}limit=50${da ? `&action=${encodeURIComponent(da)}` : ''}${cursor ? `&cursor=${cursor}` : ''}`);
  return (
    <>
      <Input placeholder={t('filterAction')} aria-label={t('filterAction')} value={action} onChange={(e) => { setCursor(null); setAction(e.target.value); }} className="mb-4 max-w-sm" />
      <ErrorNote error={logs.error} />
      {!logs.data ? (
        <Loading />
      ) : (
        <>
          <Table head={[t('when'), t('actor'), ...(showShop ? [t('shop')] : []), t('action'), t('target'), t('reason')]} empty={!logs.data.items.length}>
            {logs.data.items.map((l) => (
              <tr key={l.id} className="cursor-pointer hover:bg-surface-2" onClick={() => setOpen(l)}>
                <Td className="tabular whitespace-nowrap text-xs">{f.date(l.createdAt, true)}</Td>
                <Td>{l.actor?.fullName ?? l.admin?.fullName ?? t('system')}</Td>
                {showShop && <Td>{l.shop?.name ?? '—'}</Td>}
                <Td>
                  {ta.has(l.action) ? ta(l.action) : l.action}
                  <span className="block font-mono text-[10px] text-muted">{l.action}</span>
                </Td>
                <Td className="text-xs text-muted">{l.targetType}</Td>
                <Td className="text-sm">{l.reason}</Td>
              </tr>
            ))}
          </Table>
          {logs.data.nextCursor && (
            <div className="mt-4 text-center">
              <Button variant="secondary" onClick={() => setCursor(logs.data!.nextCursor)}>
                {t('older')}
              </Button>
            </div>
          )}
        </>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.action ?? ''} wide>
        {open && (
          <div className="grid gap-3 text-xs md:grid-cols-2">
            <p className="md:col-span-2">
              {t('requestId')}: <span className="font-mono">{open.requestId}</span> · IP {open.ipAddress}
            </p>
            <div>
              <p className="mb-1 font-semibold">{t('before')}</p>
              <pre className="max-h-80 overflow-auto rounded bg-surface-2 p-2">{JSON.stringify(open.before, null, 2)}</pre>
            </div>
            <div>
              <p className="mb-1 font-semibold">{t('after')}</p>
              <pre className="max-h-80 overflow-auto rounded bg-surface-2 p-2">{JSON.stringify(open.after, null, 2)}</pre>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
