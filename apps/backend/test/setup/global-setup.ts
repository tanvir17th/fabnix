/**
 * Integration-test database bootstrap.
 *  • TEST_DATABASE_URL set (CI service container) → use it.
 *  • otherwise start a throwaway local PostgreSQL cluster (initdb + pg_ctl) on a
 *    free port with durability off (fast), TCP only.
 * Then migrate a TEMPLATE database once; every test file clones it
 * (CREATE DATABASE … TEMPLATE) so files run in parallel and fully isolated.
 */
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Client } from 'pg';
import { PgState, STATE_FILE } from './pg-state';

const TEMPLATE = 'fabnix_template';

function findPgBin(): string {
  if (process.env.PG_BIN) return process.env.PG_BIN;
  try {
    const dir = execSync('pg_config --bindir', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (existsSync(join(dir, 'initdb'))) return dir;
  } catch {
    /* not on PATH */
  }
  const candidates = [17, 16, 15].flatMap((v) => [`/opt/homebrew/opt/postgresql@${v}/bin`, `/usr/local/opt/postgresql@${v}/bin`, `/usr/lib/postgresql/${v}/bin`]);
  const found = candidates.find((d) => existsSync(join(d, 'initdb')));
  if (!found) throw new Error('PostgreSQL binaries not found. Set TEST_DATABASE_URL or PG_BIN.');
  return found;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}

export default async function globalSetup(): Promise<void> {
  let state: PgState;
  if (process.env.TEST_DATABASE_URL) {
    state = { adminUrl: process.env.TEST_DATABASE_URL, templateDb: TEMPLATE };
  } else {
    const pgBin = findPgBin();
    const dataDir = mkdtempSync(join(tmpdir(), 'fabnix-pg-'));
    execFileSync(join(pgBin, 'initdb'), ['-D', dataDir, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--no-sync'], { stdio: 'ignore' });
    const port = await freePort();
    const opts = [
      `-p ${port}`,
      `-c unix_socket_directories=''`,
      '-c listen_addresses=127.0.0.1',
      '-c fsync=off',
      '-c synchronous_commit=off',
      '-c full_page_writes=off',
      '-c max_connections=400',
    ].join(' ');
    execFileSync(join(pgBin, 'pg_ctl'), ['-D', dataDir, '-o', opts, '-l', join(dataDir, 'server.log'), '-w', 'start'], { stdio: 'ignore' });
    state = { adminUrl: `postgresql://postgres@127.0.0.1:${port}/postgres`, templateDb: TEMPLATE, dataDir, pgBin };
  }

  const admin = new Client({ connectionString: state.adminUrl });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${TEMPLATE} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEMPLATE}`);
  await admin.end();

  const templateUrl = state.adminUrl.replace(/\/[^/?]*(\?.*)?$/, `/${TEMPLATE}$1`);
  execSync('npx prisma migrate deploy', {
    cwd: join(__dirname, '..', '..'),
    env: { ...process.env, DATABASE_URL: templateUrl },
    stdio: 'ignore',
  });

  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state));
}
