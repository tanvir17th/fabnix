import { createTestApp, TestApp } from './utils/test-app';
import { register } from './utils/fixtures';

/** §10 rate limiting — run with throttling ON (it is skipped in other suites). */
describe('rate limiting', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ NODE_ENV: 'development', THROTTLE_AUTH_LIMIT: '3', TRUST_PROXY: 'true' });
  });
  afterAll(() => t.close());

  const login = (ip: string) =>
    t.api.anon.post('/auth/login', { type: 'CUSTOMER', identifier: 'nobody@example.com', password: 'wrong-password' }, { headers: { 'X-Forwarded-For': ip } });

  it('limits brute-forceable auth endpoints per client IP', async () => {
    for (let i = 0; i < 3; i++) expect((await login('203.0.113.7')).status).toBe(401);
    const blocked = await login('203.0.113.7');
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
    // a different customer behind the same proxy has their own budget
    expect((await login('198.51.100.9')).status).toBe(401);
  });

  it('does not apply the strict limit to session refresh (called on every page load)', async () => {
    const s = await register(t, 'CUSTOMER', 'Busy Shopper');
    void s;
    const results = await Promise.all(
      Array.from({ length: 12 }, () => t.api.anon.post('/auth/refresh', { refreshToken: 'x'.repeat(30) }, { headers: { 'X-Forwarded-For': '192.0.2.44' } })),
    );
    expect(results.every((r) => r.status === 401 && r.body.code === 'REFRESH_TOKEN_INVALID')).toBe(true);
  });
});
