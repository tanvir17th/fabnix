import { createTestApp, TestApp } from './utils/test-app';
import { refreshCookie } from './utils/fixtures';

/** FR-001…FR-004, NFR-L10N-001/002, AC-001 — with verification policy ON. */
describe('auth & sessions', () => {
  let t: TestApp;
  const email = 'rahima@example.com';
  const password = 'Str0ng-Pass-word';

  beforeAll(async () => {
    t = await createTestApp({ AUTH_REQUIRE_VERIFICATION: 'true' });
  });
  afterAll(() => t.close());

  const login = (type = 'CUSTOMER', pw = password, headers?: Record<string, string>) =>
    t.api.anon.post('/auth/login', { type, identifier: email, password: pw }, { headers });

  it('registers, blocks login until the email is verified, then logs in', async () => {
    const reg = await t.api.anon.post('/auth/register', { type: 'CUSTOMER', fullName: 'Rahima Begum', email: 'Rahima@Example.com', password, preferredLanguage: 'bn' });
    expect(reg.status).toBe(201);
    expect(reg.body).toMatchObject({ verificationRequired: true, user: { email, status: 'PENDING_VERIFICATION', preferredLanguage: 'bn' } });
    expect(reg.body.user.passwordHash).toBeUndefined();

    const dup = await t.api.anon.post('/auth/register', { type: 'CUSTOMER', fullName: 'Duplicate Person', email, password });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('ACCOUNT_EXISTS');

    const blocked = await login();
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('ACCOUNT_NOT_VERIFIED');

    const wrong = await t.api.anon.post('/auth/verification/confirm', { type: 'CUSTOMER', identifier: email, code: '000000' });
    expect(wrong.body.code).toBe('INVALID_OR_EXPIRED_CODE');

    const code = t.messaging.lastTo(email, 'auth.email_verify')!.params.code!;
    const ok = await t.api.anon.post('/auth/verification/confirm', { type: 'CUSTOMER', identifier: email, code });
    expect(ok.status).toBe(200);
    // single use
    const again = await t.api.anon.post('/auth/verification/confirm', { type: 'CUSTOMER', identifier: email, code });
    expect(again.body.code).toBe('INVALID_OR_EXPIRED_CODE');

    const res = await login();
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toBeUndefined(); // web: cookie only
    const setCookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('fabnix_rt='))!;
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Path=\/api\/v1\/auth/);
  });

  it('AC-001: switching language applies immediately and persists to the next session', async () => {
    const s1 = await login();
    const me = await t.api.as(s1.body.accessToken).get('/users/me');
    expect(me.body.preferredLanguage).toBe('bn');

    const upd = await t.api.as(s1.body.accessToken).patch('/users/me/preferences', { preferredLanguage: 'en' });
    expect(upd.status).toBe(200);
    expect(upd.body.preferredLanguage).toBe('en');
    // same token keeps working (no logout needed)
    expect((await t.api.as(s1.body.accessToken).get('/users/me')).body.preferredLanguage).toBe('en');

    const s2 = await login();
    expect(s2.body.user.preferredLanguage).toBe('en');
  });

  it('FR-004: rotates refresh tokens and revokes the family on reuse', async () => {
    const res = await login();
    const c1 = refreshCookie(res)!;
    const r1 = await t.api.anon.raw().post('/api/v1/auth/refresh').set('Cookie', c1).send({});
    expect(r1.status).toBe(200);
    const c2 = refreshCookie(r1)!;
    expect(c2).not.toEqual(c1);
    expect((await t.api.as(r1.body.accessToken).get('/users/me')).status).toBe(200);

    const reuse = await t.api.anon.raw().post('/api/v1/auth/refresh').set('Cookie', c1).send({});
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('REFRESH_TOKEN_REUSED');
    // the legitimately rotated token is now dead too (family revoked)
    const after = await t.api.anon.raw().post('/api/v1/auth/refresh').set('Cookie', c2).send({});
    expect(after.status).toBe(401);
  });

  it('native clients receive the refresh token in the body', async () => {
    const res = await login('CUSTOMER', password, { 'X-Fabnix-Client': 'native' });
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(refreshCookie(res)).toBeUndefined();
    const r = await t.api.anon.post('/auth/refresh', { refreshToken: res.body.refreshToken }, { headers: { 'X-Fabnix-Client': 'native' } });
    expect(r.status).toBe(200);
    expect(r.body.refreshToken).not.toEqual(res.body.refreshToken);
  });

  it('logout revokes the session', async () => {
    const res = await login();
    const c = refreshCookie(res)!;
    const out = await t.api.anon.raw().post('/api/v1/auth/logout').set('Cookie', c).send({});
    expect(out.status).toBe(204);
    const r = await t.api.anon.raw().post('/api/v1/auth/refresh').set('Cookie', c).send({});
    expect(r.status).toBe(401);
  });

  it('portals are separate: customer credentials do not work on the shopkeeper portal', async () => {
    const r = await login('SHOPKEEPER');
    expect(r.status).toBe(401);
    expect(r.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('customer tokens cannot reach shopkeeper routes', async () => {
    const s = await login();
    const r = await t.api.as(s.body.accessToken).post('/shops', { name: 'Nope' });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('WRONG_PORTAL');
  });

  it('rejects missing or tampered access tokens', async () => {
    expect((await t.api.anon.get('/users/me')).status).toBe(401);
    const s = await login();
    const tampered = s.body.accessToken.slice(0, -2) + (s.body.accessToken.endsWith('a') ? 'bb' : 'aa');
    const r = await t.api.as(tampered).get('/users/me');
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
    expect(r.headers['content-type']).toMatch(/application\/problem\+json/);
  });

  it('FR-003: password reset via OTP revokes existing sessions', async () => {
    const before = await login();
    const cookie = refreshCookie(before)!;
    const f = await t.api.anon.post('/auth/password/forgot', { type: 'CUSTOMER', identifier: email });
    expect(f.status).toBe(202);
    // unknown accounts get the same response (no enumeration)
    expect((await t.api.anon.post('/auth/password/forgot', { type: 'CUSTOMER', identifier: 'nobody@example.com' })).status).toBe(202);

    const code = t.messaging.lastTo(email, 'auth.password_reset')!.params.code!;
    const newPassword = 'Brand-New-Pass-9';
    const r = await t.api.anon.post('/auth/password/reset', { type: 'CUSTOMER', identifier: email, code, newPassword });
    expect(r.status).toBe(200);
    expect((await t.api.anon.raw().post('/api/v1/auth/refresh').set('Cookie', cookie).send({})).status).toBe(401);
    expect((await login('CUSTOMER', password)).status).toBe(401);
    expect((await login('CUSTOMER', newPassword)).status).toBe(200);
  });

  it('locks the account after 5 failed attempts', async () => {
    await t.api.anon.post('/auth/register', { type: 'SHOPKEEPER', fullName: 'Lock Test', email: 'lock@example.com', password });
    await t.prisma.user.updateMany({ where: { email: 'lock@example.com' }, data: { status: 'ACTIVE' } });
    const attempt = (pw: string) => t.api.anon.post('/auth/login', { type: 'SHOPKEEPER', identifier: 'lock@example.com', password: pw });
    for (let i = 0; i < 4; i++) expect((await attempt('wrong-password')).body.code).toBe('INVALID_CREDENTIALS');
    const fifth = await attempt('wrong-password');
    expect(fifth.status).toBe(423);
    expect(fifth.body.code).toBe('ACCOUNT_LOCKED');
    expect((await attempt(password)).status).toBe(423);
    const audit = await t.prisma.auditLog.count({ where: { action: 'auth.locked' } });
    expect(audit).toBe(1);
  });

  it('returns 400 problem details for invalid bodies', async () => {
    const r = await t.api.anon.post('/auth/register', { type: 'CUSTOMER', fullName: 'A', password: 'short' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_FAILED');
    expect(r.body.errors.map((e: { path: string }) => e.path)).toEqual(expect.arrayContaining(['fullName', 'password']));
  });
});
