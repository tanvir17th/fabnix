#!/usr/bin/env node
/**
 * NFR-L10N-004 / §5.2 guard — fails CI when:
 *   1. bn and en catalogs do not have identical key sets (parity);
 *   2. a static t('key') used in src/ is missing from the catalogs;
 *   3. an API error code, permission, order/payment status or stock movement
 *      type has no translation (so every server code renders in both languages).
 * Usage: node scripts/check-i18n.mjs [--list-missing]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const shared = require('@fabnix/shared');

const load = (l) => JSON.parse(readFileSync(join(root, 'messages', `${l}.json`), 'utf8'));
const flatten = (obj, prefix = '', out = new Map()) => {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, key, out);
    else out.set(key, v);
  }
  return out;
};
const en = flatten(load('en'));
const bn = flatten(load('bn'));
const problems = [];

// 1. parity
for (const k of en.keys()) if (!bn.has(k)) problems.push(`bn missing: ${k}`);
for (const k of bn.keys()) if (!en.has(k)) problems.push(`en missing: ${k}`);
for (const [k, v] of bn) if (typeof v === 'string' && !v.trim()) problems.push(`bn empty: ${k}`);

// 2. static keys used in source
const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|mts)$/.test(f)) files.push(p);
  }
};
walk(join(root, 'src'));
const used = new Set();
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  // Each t(...) call resolves to the NEAREST preceding declaration of that variable.
  const decls = [...src.matchAll(/const (\w+) = (?:useTranslations|await getTranslations)\((?:'([\w.]*)'|\{[^}]*namespace: '([\w.]*)'[^}]*\})?\)/g)].map((m) => ({
    name: m[1],
    ns: m[2] ?? m[3] ?? '',
    at: m.index,
  }));
  for (const name of new Set(decls.map((d) => d.name))) {
    const re = new RegExp(`\\b${name}\\(\\s*'([\\w.]+)'`, 'g');
    for (const m of src.matchAll(re)) {
      const decl = decls.filter((d) => d.name === name && d.at < m.index).pop();
      if (!decl) continue;
      used.add(decl.ns ? `${decl.ns}.${m[1]}` : m[1]);
    }
  }
}
const has = (key) => en.has(key) || [...en.keys()].some((k) => k.startsWith(`${key}.`));
for (const k of used) if (!has(k)) problems.push(`used but undefined: ${k}`);

// 3. server codes must be translatable
for (const code of Object.values(shared.ErrorCode)) if (!en.has(`errors.${code}`)) problems.push(`error code untranslated: ${code}`);
for (const p of shared.ALL_SHOP_PERMISSIONS) if (!en.has(`permissions.${p}`)) problems.push(`permission untranslated: ${p}`);
for (const g of new Set(shared.ALL_SHOP_PERMISSIONS.map((p) => p.split('.')[0]))) if (!en.has(`permissions.group.${g}`)) problems.push(`permission group untranslated: ${g}`);
const statuses = ['PENDING_CONFIRMATION', 'CONFIRMED', 'REJECTED', 'PROCESSING', 'READY_FOR_PICKUP', 'DISPATCHED', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'UNPAID', 'PENDING', 'PARTIALLY_PAID', 'PAID', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'];
for (const s of statuses) if (!en.has(`status.${s}`)) problems.push(`status untranslated: ${s}`);
for (const m of Object.values(shared.StockMovementType)) if (!en.has(`movement.${m}`)) problems.push(`movement untranslated: ${m}`);

if (problems.length) {
  console.error(`i18n check failed (${problems.length}):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`i18n OK — ${en.size} keys in bn & en, ${used.size} static usages verified, all server codes translated.`);
