'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Button, Card, ErrorNote, Field, Input, Tabs, PasswordInput } from '@/components/ui';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth';
import { PORTAL_HOME, PORTAL_TYPE, Portal } from '@/lib/portals';
import { useAction } from '@/lib/hooks';


/** Separate customer / business / admin portals (one account per user type). */
function LoginForm() {
  const t = useTranslations('auth');
  const locale = useLocale() as 'bn' | 'en';
  const params = useSearchParams();
  const router = useRouter();
  const { login } = useAuth();
  const [portal, setPortal] = useState<Portal>((params.get('portal') as Portal) ?? 'customer');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const next = params.get('next');
  const action = useAction(async () => {
    const user = await login(PORTAL_TYPE[portal], identifier, password);
    // NFR-L10N-002: land directly in the language saved on the account.
    router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : PORTAL_HOME[portal], { locale: user.preferredLanguage ?? locale });
  });

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-2xl font-semibold">{t('loginTitle')}</h1>
      <Tabs<Portal>
        value={portal}
        onChange={setPortal}
        items={[
          { value: 'customer', label: t('portal.customer') },
          { value: 'business', label: t('portal.business') },
          { value: 'admin', label: t('portal.admin') },
        ]}
      />
      <Card>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void action.run();
          }}
        >
          <Field label={t('identifier')} hint={t('identifierHint')}>
            {(id) => <Input id={id} autoComplete="username" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} />}
          </Field>
          <Field label={t('password')}>
            {(id) => <PasswordInput id={id} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
          <ErrorNote error={action.error} />
          {action.error?.code === 'ACCOUNT_NOT_VERIFIED' && (
            <Link className="text-sm text-accent-ink underline" href={`/register?portal=${portal}&verify=${encodeURIComponent(identifier)}`}>
              {t('verifyNow')}
            </Link>
          )}
          <Button type="submit" pending={action.pending} size="lg">
            {t('login')}
          </Button>
          <div className="flex justify-between text-sm">
            <Link href={`/forgot-password?portal=${portal}`} className="text-muted hover:text-fg">
              {t('forgot')}
            </Link>
            {portal !== 'admin' && (
              <Link href={`/register?portal=${portal}`} className="font-medium text-accent-ink">
                {t('createAccount')}
              </Link>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
