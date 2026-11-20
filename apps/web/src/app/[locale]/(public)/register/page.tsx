'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Button, Card, ErrorNote, Field, Input, Notice, Tabs, PasswordInput } from '@/components/ui';
import { Link, useRouter } from '@/i18n/navigation';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction } from '@/lib/hooks';
import { PORTAL_HOME, PORTAL_TYPE } from '@/lib/portals';

type Portal = 'customer' | 'business';

function RegisterForm() {
  const t = useTranslations('auth');
  const locale = useLocale() as 'bn' | 'en';
  const params = useSearchParams();
  const router = useRouter();
  const { login } = useAuth();
  const [portal, setPortal] = useState<Portal>(params.get('portal') === 'business' ? 'business' : 'customer');
  const [form, setForm] = useState({ fullName: '', identifier: params.get('verify') ?? '', password: '' });
  const [step, setStep] = useState<'form' | 'verify'>(params.get('verify') ? 'verify' : 'form');
  const [code, setCode] = useState('');
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const isEmail = form.identifier.includes('@');

  const register = useAction(async () => {
    const r = await apiFetch<{ verificationRequired: boolean }>('/auth/register', {
      method: 'POST',
      body: { type: PORTAL_TYPE[portal], fullName: form.fullName, password: form.password, preferredLanguage: locale, ...(isEmail ? { email: form.identifier } : { phone: form.identifier }) },
    });
    if (r.verificationRequired) setStep('verify');
    else {
      await login(PORTAL_TYPE[portal], form.identifier, form.password);
      router.replace(PORTAL_HOME[portal]);
    }
  });

  const verify = useAction(async () => {
    await apiFetch('/auth/verification/confirm', { method: 'POST', body: { type: PORTAL_TYPE[portal], identifier: form.identifier, code } });
    if (form.password) {
      await login(PORTAL_TYPE[portal], form.identifier, form.password);
      router.replace(PORTAL_HOME[portal]);
    } else router.replace(`/login?portal=${portal}`);
  });

  const resend = useAction(() => apiFetch('/auth/verification/request', { method: 'POST', body: { type: PORTAL_TYPE[portal], identifier: form.identifier } }));

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-2xl font-semibold">{step === 'form' ? t('registerTitle') : t('verifyTitle')}</h1>
      {step === 'form' && (
        <Tabs<Portal>
          value={portal}
          onChange={setPortal}
          items={[
            { value: 'customer', label: t('portal.customer') },
            { value: 'business', label: t('portal.business') },
          ]}
        />
      )}
      <Card>
        {step === 'form' ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void register.run();
            }}
          >
            {portal === 'business' && <Notice>{t('businessIntro')}</Notice>}
            <Field label={t('fullName')}>{(id) => <Input id={id} required minLength={2} autoComplete="name" value={form.fullName} onChange={set('fullName')} />}</Field>
            <Field label={t('identifier')} hint={t('identifierHint')}>
              {(id) => <Input id={id} required autoComplete="username" value={form.identifier} onChange={set('identifier')} />}
            </Field>
            <Field label={t('password')} hint={t('passwordHint')}>
              {(id) => <PasswordInput id={id} required minLength={8} autoComplete="new-password" value={form.password} onChange={set('password')} />}
            </Field>
            <ErrorNote error={register.error} />
            <Button type="submit" size="lg" pending={register.pending}>
              {t('createAccount')}
            </Button>
            <p className="text-center text-sm text-muted">
              {t('haveAccount')}{' '}
              <Link href={`/login?portal=${portal}`} className="font-medium text-accent-ink">
                {t('login')}
              </Link>
            </p>
          </form>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void verify.run();
            }}
          >
            <p className="text-sm text-muted">{t('codeSent', { destination: form.identifier })}</p>
            <Field label={t('code')}>
              {(id) => <Input id={id} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} />}
            </Field>
            <ErrorNote error={verify.error ?? resend.error} />
            <Button type="submit" size="lg" pending={verify.pending}>
              {t('verify')}
            </Button>
            <Button type="button" variant="ghost" pending={resend.pending} onClick={() => void resend.run()}>
              {t('resend')}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
