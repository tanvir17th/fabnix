'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ALL_SHOP_PERMISSIONS } from '@fabnix/shared';
import { useShop } from '@/components/shop-context';
import { Button, Card, Checkbox, ErrorNote, Field, Input, Loading, Modal, Notice, PageHeader, Select, StatusBadge, Tabs, Td, Table } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useAction, useApi } from '@/lib/hooks';

interface Member {
  id: string;
  isOwner: boolean;
  status: string;
  allBranches: boolean;
  user: { id: string; fullName: string; email: string | null; phone: string | null };
  role: { id: string; name: string; presetKey: string | null };
}
interface Role {
  id: string;
  name: string;
  presetKey: string | null;
  isOwnerRole: boolean;
  permissions: Array<{ permissionCode: string }>;
  _count: { members: number };
}

const GROUPS = Array.from(new Set(ALL_SHOP_PERMISSIONS.map((p) => p.split('.')[0]!)));

/** §A1.2 staff under the Shopkeeper account: invitations, presets, granular permissions. */
export default function StaffPage() {
  const t = useTranslations('staff');
  const tp = useTranslations('permissions');
  const tc = useTranslations('common');
  const { shopId, can, access } = useShop();
  const { call } = useAuth();
  const manage = can('staff.manage');
  const [tab, setTab] = useState<'members' | 'roles'>('members');
  const members = useApi<Member[]>(`/shops/${shopId}/members`);
  const roles = useApi<Role[]>(`/shops/${shopId}/roles`);
  const [invite, setInvite] = useState({ contact: '', roleId: '' });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invited, setInvited] = useState(false);
  const sendInvite = useAction(async () => {
    const contact = invite.contact.trim();
    await call(`/shops/${shopId}/invitations`, { method: 'POST', body: { roleId: invite.roleId, ...(contact.includes('@') ? { email: contact } : { phone: contact }) } });
    setInvited(true);
  });
  const updateMember = useAction(async (id: string, body: Record<string, unknown>) => {
    await call(`/shops/${shopId}/members/${id}`, { method: 'PATCH', body });
    await members.reload();
  });
  const [editing, setEditing] = useState<{ id?: string; name: string; permissions: Set<string> } | null>(null);
  const saveRole = useAction(async () => {
    const body = { name: editing!.name, permissions: [...editing!.permissions] };
    if (editing!.id) await call(`/shops/${shopId}/roles/${editing!.id}`, { method: 'PATCH', body });
    else await call(`/shops/${shopId}/roles`, { method: 'POST', body });
    setEditing(null);
    await roles.reload();
  });
  const assignable = (roles.data ?? []).filter((r) => !r.isOwnerRole);
  const roleName = (r: { name: string; presetKey: string | null }) => (r.presetKey && t.has(`presets.${r.presetKey}`) ? t(`presets.${r.presetKey}`) : r.name);
  const mine = new Set(access.permissions);

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} actions={manage && <Button variant="accent" onClick={() => { setInvited(false); setInviteOpen(true); }}>{t('invite')}</Button>} />
      <Tabs value={tab} onChange={setTab} items={[{ value: 'members', label: t('members') }, { value: 'roles', label: t('roles') }]} />
      <ErrorNote error={updateMember.error} className="mb-3" />
      {tab === 'members' ? (
        !members.data ? (
          <Loading />
        ) : (
          <Table head={[t('name'), t('contact'), t('role'), t('status'), '']}>
            {members.data.map((m) => (
              <tr key={m.id}>
                <Td className="font-medium">{m.user.fullName}</Td>
                <Td className="text-sm text-muted">{m.user.email ?? m.user.phone}</Td>
                <Td>
                  {m.isOwner || !manage ? (
                    m.isOwner ? t('owner') : roleName(m.role)
                  ) : (
                    <Select aria-label={t('role')} value={m.role.id} onChange={(e) => void updateMember.run(m.id, { roleId: e.target.value })} className="h-8 w-44">
                      {assignable.map((r) => (
                        <option key={r.id} value={r.id}>
                          {roleName(r)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Td>
                <Td>
                  <StatusBadge status={m.status} />
                </Td>
                <Td>
                  {manage && !m.isOwner && (
                    <Button size="sm" variant="ghost" onClick={() => void updateMember.run(m.id, { status: m.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })}>
                      {m.status === 'ACTIVE' ? t('suspend') : t('reactivate')}
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )
      ) : !roles.data ? (
        <Loading />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {roles.data.map((r) => (
            <Card
              key={r.id}
              title={r.isOwnerRole ? t('owner') : roleName(r)}
              actions={
                manage &&
                !r.isOwnerRole && (
                  <Button size="sm" variant="secondary" onClick={() => setEditing({ id: r.id, name: r.name, permissions: new Set(r.permissions.map((p) => p.permissionCode)) })}>
                    {tc('edit')}
                  </Button>
                )
              }
            >
              <p className="mb-2 text-xs text-muted">{t('memberCount', { count: r._count.members })}</p>
              <p className="text-sm">{r.isOwnerRole ? t('allPermissions') : r.permissions.map((p) => tp(p.permissionCode)).join(' · ')}</p>
            </Card>
          ))}
          {manage && (
            <button className="rounded-lg border border-dashed border-line p-6 text-sm text-muted hover:border-accent" onClick={() => setEditing({ name: '', permissions: new Set() })}>
              + {t('newRole')}
            </button>
          )}
        </div>
      )}

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title={t('invite')}
        footer={
          !invited && (
            <Button pending={sendInvite.pending} disabled={!invite.contact || !invite.roleId} onClick={() => void sendInvite.run()}>
              {t('send')}
            </Button>
          )
        }
      >
        {invited ? (
          <Notice tone="success">{t('invited', { contact: invite.contact })}</Notice>
        ) : (
          <div className="flex flex-col gap-3">
            <Field label={t('contact')} hint={t('contactHint')}>{(id) => <Input id={id} value={invite.contact} onChange={(e) => setInvite((s) => ({ ...s, contact: e.target.value }))} />}</Field>
            <Field label={t('role')}>
              {(id) => (
                <Select id={id} value={invite.roleId} onChange={(e) => setInvite((s) => ({ ...s, roleId: e.target.value }))}>
                  <option value="">—</option>
                  {assignable.map((r) => (
                    <option key={r.id} value={r.id}>
                      {roleName(r)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <ErrorNote error={sendInvite.error} />
          </div>
        )}
      </Modal>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? t('editRole') : t('newRole')}
        wide
        footer={
          <Button pending={saveRole.pending} disabled={!editing?.name.trim()} onClick={() => void saveRole.run()}>
            {tc('save')}
          </Button>
        }
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <Field label={t('roleName')}>{(id) => <Input id={id} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />}</Field>
            <p className="text-xs text-muted">{t('escalationHint')}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {GROUPS.map((g) => (
                <fieldset key={g} className="rounded-md border border-line p-3">
                  <legend className="px-1 text-xs font-semibold uppercase text-muted">{tp(`group.${g}`)}</legend>
                  <div className="flex flex-col gap-1">
                    {ALL_SHOP_PERMISSIONS.filter((p) => p.startsWith(`${g}.`)).map((p) => (
                      <Checkbox
                        key={p}
                        label={tp(p)}
                        checked={editing.permissions.has(p)}
                        disabled={!access.isOwner && !mine.has(p)}
                        onChange={(v) => {
                          const next = new Set(editing.permissions);
                          if (v) next.add(p);
                          else next.delete(p);
                          setEditing({ ...editing, permissions: next });
                        }}
                      />
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
            <ErrorNote error={saveRole.error} />
          </div>
        )}
      </Modal>
    </>
  );
}
