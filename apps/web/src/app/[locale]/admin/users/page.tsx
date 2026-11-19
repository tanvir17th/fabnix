'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, ErrorNote, Input, Loading, PageHeader, ReasonDialog, Select, StatusBadge, Td, Table } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useFormat } from '@/lib/format';
import { useAction, useApi, useDebounced } from '@/lib/hooks';
import type { Page } from '@/lib/api';

interface UserRow {
  id: string;
  type: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: string;
  suspendedReason: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  _count: { memberships: number; orders: number };
}

/** A1.1 Customer & Shopkeeper account control. Secrets are never returned by the API. */
export default function AdminUsers() {
  const t = useTranslations('admin.users');
  const tu = useTranslations('admin.dashboard.userType');
  const tc = useTranslations('common');
  const f = useFormat();
  const { call, user } = useAuth();
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const users = useApi<Page<UserRow>>(`/admin/users?limit=50${type ? `&type=${type}` : ''}${dq ? `&q=${encodeURIComponent(dq)}` : ''}`);
  const [target, setTarget] = useState<UserRow | null>(null);
  const act = useAction(async (reason: string) => {
    await call(`/admin/users/${target!.id}/status`, { method: 'PATCH', body: { status: target!.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED', reason } });
    setTarget(null);
    await users.reload();
  });
  return (
    <>
      <PageHeader title={t('title')} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input type="search" placeholder={t('search')} aria-label={t('search')} value={q} onChange={(e) => setQ(e.target.value)} className="w-72" />
        <Select aria-label={t('type')} value={type} onChange={(e) => setType(e.target.value)} className="w-48">
          <option value="">{t('allTypes')}</option>
          {['CUSTOMER', 'SHOPKEEPER', 'SUPER_ADMIN'].map((x) => (
            <option key={x} value={x}>
              {tu(x)}
            </option>
          ))}
        </Select>
      </div>
      <ErrorNote error={users.error} />
      {!users.data ? (
        <Loading />
      ) : (
        <Table head={[t('name'), t('type'), t('contact'), t('status'), t('lastLogin'), '']} empty={!users.data.items.length}>
          {users.data.items.map((u) => (
            <tr key={u.id}>
              <Td className="font-medium">{u.fullName}</Td>
              <Td>{tu(u.type)}</Td>
              <Td className="text-sm text-muted">{u.email ?? u.phone}</Td>
              <Td>
                <StatusBadge status={u.status} />
                {u.suspendedReason && <span className="block text-xs text-muted">{u.suspendedReason}</span>}
              </Td>
              <Td className="text-xs">{f.date(u.lastLoginAt, true)}</Td>
              <Td>
                {u.id !== user?.id && u.type !== 'SUPER_ADMIN' && (
                  <Button size="sm" variant={u.status === 'SUSPENDED' ? 'secondary' : 'danger'} onClick={() => setTarget(u)}>
                    {u.status === 'SUSPENDED' ? t('reactivate') : t('suspend')}
                  </Button>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <ReasonDialog
        open={!!target}
        title={`${target?.fullName ?? ''} — ${target?.status === 'SUSPENDED' ? t('reactivate') : t('suspend')}`}
        confirmLabel={tc('confirm')}
        minLength={5}
        danger={target?.status !== 'SUSPENDED'}
        onClose={() => setTarget(null)}
        onConfirm={(r) => void act.run(r)}
        pending={act.pending}
        error={act.error}
      />
    </>
  );
}
