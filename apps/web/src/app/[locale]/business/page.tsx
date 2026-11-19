'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Wordmark } from '@/components/brand';
import { LanguageSwitcher } from '@/components/language-switcher';
import { UserMenu } from '@/components/shells';
import { Button, Card, EmptyState, ErrorNote, Field, Input, Loading, StatusBadge } from '@/components/ui';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth';
import { useAction, useApi } from '@/lib/hooks';

interface Membership {
  shop: { id: string; name: string; code: string; status: string };
  role: { name: string; presetKey: string | null };
  isOwner: boolean;
}

/** Shop picker + onboarding (FR-008). Staff join through invitations (FR-063). */
export default function BusinessHome() {
  const t = useTranslations('business');
  const locale = useLocale() as 'bn' | 'en';
  const router = useRouter();
  const { call } = useAuth();
  const shops = useApi<Membership[]>('/users/me/shops');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const create = useAction(async () => {
    const shop = await call<{ id: string }>('/shops', { method: 'POST', body: { name, defaultLanguage: locale, ...(phone ? { phone } : {}), ...(city ? { city } : {}) } });
    router.push(`/business/${shop.id}/settings?onboarding=1`);
  });

  useEffect(() => {
    if (shops.data?.length === 1 && !new URLSearchParams(window.location.search).has('pick')) router.replace(`/business/${shops.data[0]!.shop.id}`);
  }, [shops.data, router]);

  return (
    <div className="min-h-dvh">
      <header className="flex h-14 items-center justify-between border-b border-line px-4">
        <Link href="/">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <UserMenu />
        </div>
      </header>
      <main className="mx-auto grid max-w-4xl gap-6 px-4 py-10 md:grid-cols-2">
        <Card title={t('yourShops')}>
          {shops.loading ? (
            <Loading />
          ) : !shops.data?.length ? (
            <EmptyState title={t('noShops')}>{t('noShopsHint')}</EmptyState>
          ) : (
            <ul className="flex flex-col gap-2">
              {shops.data.map((m) => (
                <li key={m.shop.id}>
                  <Link href={`/business/${m.shop.id}`} className="flex items-center justify-between rounded-md border border-line p-3 hover:border-accent">
                    <span>
                      <span className="font-medium">{m.shop.name}</span>
                      <span className="block text-xs text-muted">{m.isOwner ? t('owner') : m.role.name}</span>
                    </span>
                    <StatusBadge status={m.shop.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/business/invitations" className="mt-4 block text-sm text-accent-ink underline">
            {t('haveInvitation')}
          </Link>
        </Card>
        <Card title={t('createShop')}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void create.run();
            }}
          >
            <Field label={t('shopName')}>{(id) => <Input id={id} required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
            <Field label={t('phone')}>{(id) => <Input id={id} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" />}</Field>
            <Field label={t('city')}>{(id) => <Input id={id} value={city} onChange={(e) => setCity(e.target.value)} />}</Field>
            <ErrorNote error={create.error} />
            <Button type="submit" pending={create.pending}>
              {t('createShop')}
            </Button>
            <p className="text-xs text-muted">{t('createHint')}</p>
          </form>
        </Card>
      </main>
    </div>
  );
}
