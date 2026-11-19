import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { readPgState, STATE_FILE } from './pg-state';

export default async function globalTeardown(): Promise<void> {
  const state = readPgState();
  if (state.dataDir && state.pgBin) {
    try {
      execFileSync(join(state.pgBin, 'pg_ctl'), ['-D', state.dataDir, '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore' });
    } finally {
      rmSync(state.dataDir, { recursive: true, force: true });
    }
  }
  rmSync(STATE_FILE, { force: true });
}
