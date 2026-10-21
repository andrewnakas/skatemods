// SPDX-License-Identifier: GPL-3.0-or-later
// Golden-fixture helpers for the Skate 3 writer port: fixtures come from skate4to3
// tests/make_ts_golden.py (Python = oracle). Plain node (>= 22.18 / 24, type stripping), no deps.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const GOLDEN = join(dirname(fileURLToPath(import.meta.url)), '..', 'golden', 'sk3');

export function loadBundle(name: string): Map<string, Uint8Array> {
  const b = new Uint8Array(readFileSync(join(GOLDEN, name)));
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (new TextDecoder().decode(b.subarray(0, 4)) !== 'GLD1') throw new Error(`${name}: not a bundle`);
  const n = dv.getUint32(4, true);
  const out = new Map<string, Uint8Array>();
  let p = 8;
  for (let i = 0; i < n; i++) {
    const nl = dv.getUint32(p, true); p += 4;
    const k = new TextDecoder().decode(b.subarray(p, p + nl)); p += nl;
    const dl = dv.getUint32(p, true); p += 4;
    out.set(k, b.slice(p, p + dl)); p += dl;
  }
  return out;
}

export function loadJson<T = any>(name: string): T {
  return JSON.parse(readFileSync(join(GOLDEN, name), 'utf8')) as T;
}

export const haveGolden = (name: string) => existsSync(join(GOLDEN, name));

export function sha256(b: Uint8Array): string {
  return createHash('sha256').update(b).digest('hex');
}

/** Throw with the first differing offset when two byte strings differ. */
export function assertBytes(got: Uint8Array, want: Uint8Array | undefined, what: string): void {
  if (!want) throw new Error(`${what}: no expected bytes`);
  if (got.length === want.length) {
    let i = 0;
    while (i < got.length && got[i] === want[i]) i++;
    if (i === got.length) return;
    throw new Error(`${what}: differs at 0x${i.toString(16)} (len ${got.length})`);
  }
  let i = 0;
  while (i < got.length && i < want.length && got[i] === want[i]) i++;
  throw new Error(`${what}: length ${got.length} != ${want.length}, first difference at 0x${i.toString(16)}`);
}

let passed = 0, failed = 0, skipped = 0;

export async function check(name: string, fn: () => void | string | Promise<void | string>): Promise<void> {
  try {
    const r = await fn();
    if (r === 'skip') { skipped++; console.log(`  skip  ${name}`); return; }
    passed++;
    console.log(`  ok    ${name}${typeof r === 'string' && r ? `  (${r})` : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}: ${(e as Error).message}`);
  }
}

export function summary(label: string): void {
  console.log(`${label}: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  if (failed) process.exitCode = 1;
}
