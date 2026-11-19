'use client';

import { useTranslations } from 'next-intl';
import { AuditTable } from '@/components/audit-table';
import { useShop } from '@/components/shop-context';
import { PageHeader } from '@/components/ui';

/** FR-084 shop audit log (owners / audit.view). */
export default function ShopAuditPage() {
  const t = useTranslations('audit');
  const { shopId } = useShop();
  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <AuditTable basePath={`/shops/${shopId}/audit-logs`} />
    </>
  );
}
