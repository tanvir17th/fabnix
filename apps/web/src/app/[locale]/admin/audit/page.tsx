'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AuditTable } from '@/components/audit-table';
import { PageHeader, Tabs } from '@/components/ui';

/** FR-077 / AC-029: immutable privileged-action trail + platform-wide shop activity. */
export default function AdminAuditPage() {
  const t = useTranslations('admin.audit');
  const [kind, setKind] = useState<'admin' | 'shop'>('admin');
  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <Tabs value={kind} onChange={setKind} items={[{ value: 'admin', label: t('admin') }, { value: 'shop', label: t('shop') }]} />
      <AuditTable key={kind} basePath={`/admin/audit-logs?kind=${kind}`} showShop={kind === 'shop'} />
    </>
  );
}
