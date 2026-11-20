'use client';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Button, Card, ErrorNote, Field, Input, Notice, PasswordInput } from '@/components/ui';
import { useRouter } from '@/i18n/navigation';
import { apiFetch } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { PORTAL_TYPE, Portal } from '@/lib/portals';

/** FR-003: verified-channel, time-limited reset. */
function ForgotForm() {
  const t = useTranslations('auth');
  const params = useSearchParams();
  const router = useRouter();
  const portal = ((params.get('portal') as Portal) ?? 'customer') as Portal;
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [sent, setSent] = useState(false);
  const request = useAction(async () => {
    await apiFetch('/auth/password/forgot', { method: 'POST', body: { type: PORTAL_TYPE[portal], identifier } });
    setSent(true);
  });
  const reset = useAction(async () => {
    await apiFetch('/auth/password/reset', { method: 'POST', body: { type: PORTAL_TYPE[portal], identifier, code, newPassword } });
    router.replace(`/login?portal=${portal}`);
  });
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-2xl font-semibold">{t('forgotTitle')}</h1>
      <Card>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void (sent ? reset.run() : request.run());
          }}
        >
          <Field label={t('identifier')}>{(id) => <Input id={id} required value={identifier} disabled={sent} onChange={(e) => setIdentifier(e.target.value)} />}</Field>
          {sent && (
            <>
              <Notice tone="success">{t('resetSent')}</Notice>
              <Field label={t('code')}>{(id) => <Input id={id} inputMode="numeric" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} />}</Field>
              <Field label={t('newPassword')} hint={t('passwordHint')}>
                {(id) => <PasswordInput id={id} minLength={8} required autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />}
              </Field>
            </>
          )}
          <ErrorNote error={request.error ?? reset.error} />
          <Button type="submit" size="lg" pending={request.pending || reset.pending}>
            {sent ? t('resetPassword') : t('sendCode')}
          </Button>
        </form>
      </Card>
    </div>
  );
}

export default function ForgotPage() {
  return (
    <Suspense>
      <ForgotForm />
    </Suspense>
  );
}
