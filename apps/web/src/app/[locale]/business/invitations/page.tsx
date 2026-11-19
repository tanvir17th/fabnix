'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button, Card, ErrorNote, Field, Input } from '@/components/ui';
import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth';
import { useAction } from '@/lib/hooks';

/** Staff accept an invitation with their own verified account (FR-063, §A1.2). */
export default function AcceptInvitation() {
  const t = useTranslations('business');
  const router = useRouter();
  const { call } = useAuth();
  const [token, setToken] = useState('');
  useEffect(() => setToken(new URLSearchParams(window.location.search).get('token') ?? ''), []);
  const accept = useAction(async () => {
    const r = await call<{ shopId: string }>('/invitations/accept', { method: 'POST', body: { token: token.trim() } });
    router.replace(`/business/${r.shopId}`);
  });
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <Card title={t('acceptInvitation')}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void accept.run();
          }}
        >
          <Field label={t('invitationCode')}>{(id) => <Input id={id} required value={token} onChange={(e) => setToken(e.target.value)} />}</Field>
          <ErrorNote error={accept.error} />
          <Button type="submit" pending={accept.pending}>
            {t('join')}
          </Button>
        </form>
      </Card>
    </main>
  );
}
