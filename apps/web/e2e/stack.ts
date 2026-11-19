/**
 * Boots an isolated FABNIX stack for E2E: throwaway PostgreSQL cluster →
 * migrations → seeded Super Admin → compiled API (:4000) → `next start` (:3000).
 * Returns a teardown that stops everything.
 */
import { ChildProcess, execFileSync, execSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repo = join(__dirname, '..', '..', '..');
const backend = join(repo, 'apps', 'backend');
const web = join(repo, 'apps', 'web');
export const ADMIN = { email: 'admin@fabnix.local', password: 'E2E-Admin-Password-1' };

function pgBin(): string {
  if (process.env.PG_BIN) return process.env.PG_BIN;
  try {
    return execSync('pg_config --bindir', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    const c = [17, 16, 15].map((v) => `/opt/homebrew/opt/postgresql@${v}/bin`).find((d) => existsSync(join(d, 'initdb')));
    if (!c) throw new Error('PostgreSQL binaries not found (set PG_BIN)');
    return c;
  }
}

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => resolve(p));
    });
  });

async function waitFor(url: string, ms = 60_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

export default async function globalSetup() {
  const bin = pgBin();
  const dataDir = mkdtempSync(join(tmpdir(), 'fabnix-e2e-pg-'));
  const port = await freePort();
  execFileSync(join(bin, 'initdb'), ['-D', dataDir, '-U', 'postgres', '-A', 'trust', '--no-sync'], { stdio: 'ignore' });
  execFileSync(join(bin, 'pg_ctl'), ['-D', dataDir, '-o', `-p ${port} -c unix_socket_directories='' -c listen_addresses=127.0.0.1 -c fsync=off`, '-l', join(dataDir, 'log'), '-w', 'start'], { stdio: 'ignore' });
  execFileSync(join(bin, 'createdb'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', 'fabnix'], { stdio: 'ignore' });
  const DATABASE_URL = `postgresql://postgres@127.0.0.1:${port}/fabnix`;
  const env = { ...process.env, DATABASE_URL };
  execSync('npx prisma migrate deploy', { cwd: backend, env, stdio: 'ignore' });
  execSync('npx tsx src/seed/run-seed.ts', { cwd: backend, env: { ...env, SEED_ADMIN_EMAIL: ADMIN.email, SEED_ADMIN_PASSWORD: ADMIN.password }, stdio: 'ignore' });

  const procs: ChildProcess[] = [];
  procs.push(
    spawn('node', ['dist/main.js'], {
      cwd: backend,
      env: { ...env, NODE_ENV: 'development', PORT: '4000', JWT_ACCESS_SECRET: 'e2e-secret-that-is-long-enough-for-validation-123', COOKIE_SECURE: 'false', AUTH_REQUIRE_VERIFICATION: 'false', STORAGE_LOCAL_DIR: join(dataDir, 'media'), STORAGE_PUBLIC_BASE_URL: 'http://localhost:3000/media', CORS_ORIGINS: 'http://localhost:3000', TRUST_PROXY: 'true', THROTTLE_AUTH_LIMIT: '200' },
      stdio: 'ignore',
    }),
  );
  await waitFor('http://localhost:4000/api/v1/health');
  procs.push(spawn('npx', ['next', 'start', '-p', '3000'], { cwd: web, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, stdio: 'ignore' }));
  await waitFor('http://localhost:3000/bn');

  return async () => {
    for (const p of procs) p.kill('SIGTERM');
    try {
      execFileSync(join(bin, 'pg_ctl'), ['-D', dataDir, '-m', 'immediate', 'stop'], { stdio: 'ignore' });
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  };
}
