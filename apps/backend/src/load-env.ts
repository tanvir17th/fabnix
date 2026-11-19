import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

/**
 * Loads apps/backend/.env for local development (works from src/ via
 * `nest start` and from dist/). Variables already present in the real
 * environment (Docker, CI, production secrets) always take precedence.
 * Missing file is fine — production configures env vars directly.
 */
export function loadDotEnv(file = join(__dirname, '..', '.env')): void {
  if (!existsSync(file)) return;
  const parsed = parseEnv(readFileSync(file, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();
