// SPDX-License-Identifier: GPL-3.0-or-later
// Golden-data loader for the Skate 3 writer ports. The data comes from skate4to3
// tests/make_ts_golden_arenas.py (Python writers = oracle): <case>.json (inputs + expected sha256 /
// size, raw bytes for small outputs) and <case>.bin (gzip: little-endian arrays the JSON points at).
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GOLDEN = join(dirname(fileURLToPath(import.meta.url)), 'golden', 'arenas');

export interface Expect { label: string; size: number; sha256: string; raw?: string }
export interface GoldenCase { inputs: any; expect: Expect[] }

function resolve(v: any, bin: Uint8Array): any {
  if (Array.isArray(v)) return v.map(x => resolve(x, bin));
  if (v && typeof v === 'object') {
    if ('$u64' in v) return BigInt('0x' + v.$u64);
    if ('$a' in v) {
      const b = bin.slice(v.o, v.o + v.n * ({ f8: 8, i4: 4, u1: 1 } as Record<string, number>)[v.$a]);
      const a = v.$a === 'f8' ? new Float64Array(b.buffer) : v.$a === 'i4' ? new Int32Array(b.buffer) : b;
      (a as any).shape = v.shape;
      return a;
    }
    const o: any = {};
    for (const k of Object.keys(v)) o[k] = resolve(v[k], bin);
    return o;
  }
  return v;
}

export function loadCase(name: string): GoldenCase {
  const j = JSON.parse(readFileSync(join(GOLDEN, `${name}.json`), 'utf8'));
  const bp = join(GOLDEN, `${name}.bin`);
  const bin = existsSync(bp) ? new Uint8Array(gunzipSync(readFileSync(bp))) : new Uint8Array(0);
  return { inputs: resolve(j.inputs, bin), expect: j.expect };
}

/** Real-map cases (a slice of a fan map mod) are kept out of the public repo; tests skip them when absent. */
export function haveCase(name: string): boolean {
  return existsSync(join(GOLDEN, `${name}.json`)) && existsSync(join(GOLDEN, `${name}.bin`));
}

export const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

let pass = 0, fail = 0;

/** compare one output against its expectation; prints the first differing byte when raw exists */
export function check(c: GoldenCase, label: string, got: Uint8Array): boolean {
  const e = c.expect.find(x => x.label === label);
  if (!e) throw new Error(`no expectation ${label}`);
  const ok = got.length === e.size && sha256(got) === e.sha256;
  if (ok) { pass++; console.log(`  ok   ${label} (${got.length} B)`); return true; }
  fail++;
  let where = '';
  if (e.raw) {
    const want = new Uint8Array(readFileSync(join(GOLDEN, e.raw)));
    let k = 0;
    while (k < Math.min(want.length, got.length) && want[k] === got[k]) k++;
    const hx = (b: Uint8Array) => Array.from(b.subarray(k, k + 16)).map(x => x.toString(16).padStart(2, '0')).join(' ');
    where = ` first diff @0x${k.toString(16)}: want ${hx(want)} got ${hx(got)}`;
  }
  console.log(`  FAIL ${label}: ${got.length} B vs ${e.size} B${where}`);
  return false;
}

export function summary(name: string): void {
  console.log(`${name}: ${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}
