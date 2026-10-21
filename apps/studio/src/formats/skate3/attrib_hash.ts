// SPDX-License-Identifier: GPL-3.0-or-later
// Skate 3's 64-bit name hash (vault/AttribSys keys, DepN hashes, locator ids); port of
// skate4to3 sk3/attrib_hash.py. Bob Jenkins' lookup8 hash() with a = b = 0xABCDEF0011223344,
// c = 0x9E3779B97F4A7C13; the result is c. Bytes are hashed as given (no case folding).
import { latin1, M64 } from './bytes_util.ts';

export const INIT_AB = 0xABCDEF0011223344n;
export const INIT_C = 0x9E3779B97F4A7C13n;

function mix(a: bigint, b: bigint, c: bigint): [bigint, bigint, bigint] {
  a = (a - b - c) & M64; a ^= c >> 43n;
  b = (b - c - a) & M64; b ^= (a << 9n) & M64;
  c = (c - a - b) & M64; c ^= b >> 8n;
  a = (a - b - c) & M64; a ^= c >> 38n;
  b = (b - c - a) & M64; b ^= (a << 23n) & M64;
  c = (c - a - b) & M64; c ^= b >> 5n;
  a = (a - b - c) & M64; a ^= c >> 35n;
  b = (b - c - a) & M64; b ^= (a << 49n) & M64;
  c = (c - a - b) & M64; c ^= b >> 11n;
  a = (a - b - c) & M64; a ^= c >> 12n;
  b = (b - c - a) & M64; b ^= (a << 18n) & M64;
  c = (c - a - b) & M64; c ^= b >> 22n;
  return [a, b, c];
}

function le64(k: Uint8Array, i: number): bigint {
  let v = 0n;
  for (let j = 7; j >= 0; j--) v = (v << 8n) | BigInt(k[i + j]);
  return v;
}

/** 64-bit key of a byte string. */
export function hashBytes(k: Uint8Array): bigint {
  const n = k.length;
  let a = INIT_AB, b = INIT_AB, c = INIT_C;
  let i = 0;
  while (n - i >= 24) {
    a = (a + le64(k, i)) & M64;
    b = (b + le64(k, i + 8)) & M64;
    c = (c + le64(k, i + 16)) & M64;
    [a, b, c] = mix(a, b, c);
    i += 24;
  }
  c = (c + BigInt(n)) & M64;
  for (let j = 0; i + j < n; j++) {
    const ch = BigInt(k[i + j]);
    if (j < 8) a = (a + (ch << BigInt(8 * j))) & M64;
    else if (j < 16) b = (b + (ch << BigInt(8 * (j - 8)))) & M64;
    else c = (c + (ch << BigInt(8 * (j - 15)))) & M64;   // c's low byte holds the length
  }
  return mix(a, b, c)[2];
}

const cache = new Map<string, bigint>();

/** 64-bit key of a name (vault record/class/collection, DepN file, locator); latin1 bytes. */
export function attribKey(name: string): bigint {
  let h = cache.get(name);
  if (h === undefined) {
    h = hashBytes(latin1(name));
    if (cache.size > 100000) cache.clear();
    cache.set(name, h);
  }
  return h;
}
