import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface PgState {
  adminUrl: string;
  templateDb: string;
  dataDir?: string;
  pgBin?: string;
}

export const STATE_FILE = join(__dirname, '..', '..', '.tmp', 'test-pg.json');

export function readPgState(): PgState {
  if (!existsSync(STATE_FILE)) throw new Error('Test Postgres not initialised — run via jest integration project');
  return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as PgState;
}
