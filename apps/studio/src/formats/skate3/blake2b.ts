// SPDX-License-Identifier: GPL-3.0-or-later
// BLAKE2b (RFC 7693), unkeyed, any digest size 1..64. 64-bit words as (lo, hi) uint32 pairs.
// Used for the stable ids skate4to3 derives (sk3/assemble.py h64/h32 and texture content keys).

const IV = new Uint32Array([
  0xF3BCC908, 0x6A09E667, 0x84CAA73B, 0xBB67AE85, 0xFE94F82B, 0x3C6EF372, 0x5F1D36F1, 0xA54FF53A,
  0xADE682D1, 0x510E527F, 0x2B3E6C1F, 0x9B05688C, 0xFB41BD6B, 0x1F83D9AB, 0x137E2179, 0x5BE0CD19]);
const SIGMA = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
  [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4], [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
  [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13], [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
  [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11], [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
  [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5], [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0]];

const v = new Uint32Array(32), m = new Uint32Array(32);

function add64(a: number, b: number) {               // v[a] += v[b]
  const lo = v[a] + v[b];
  v[a + 1] = v[a + 1] + v[b + 1] + (lo / 0x100000000 | 0);
  v[a] = lo;
}
function add64m(a: number, lo0: number, hi0: number) {
  const lo = v[a] + lo0;
  v[a + 1] = v[a + 1] + hi0 + (lo / 0x100000000 | 0);
  v[a] = lo;
}
function G(a: number, b: number, c: number, d: number, x: number, y: number) {
  add64(a, b); add64m(a, m[x], m[x + 1]);
  let lo = v[d] ^ v[a], hi = v[d + 1] ^ v[a + 1];
  v[d] = hi; v[d + 1] = lo;                                       // rotr 32
  add64(c, d);
  lo = v[b] ^ v[c]; hi = v[b + 1] ^ v[c + 1];
  v[b] = (lo >>> 24) ^ (hi << 8); v[b + 1] = (hi >>> 24) ^ (lo << 8);   // rotr 24
  add64(a, b); add64m(a, m[y], m[y + 1]);
  lo = v[d] ^ v[a]; hi = v[d + 1] ^ v[a + 1];
  v[d] = (lo >>> 16) ^ (hi << 16); v[d + 1] = (hi >>> 16) ^ (lo << 16); // rotr 16
  add64(c, d);
  lo = v[b] ^ v[c]; hi = v[b + 1] ^ v[c + 1];
  v[b] = (hi >>> 31) ^ (lo << 1); v[b + 1] = (lo >>> 31) ^ (hi << 1);   // rotr 63
}

function compress(h: Uint32Array, block: Uint8Array, t: number, last: boolean) {
  for (let i = 0; i < 16; i++) { v[i] = h[i]; v[i + 16] = IV[i]; }
  v[24] ^= t >>> 0; v[25] ^= (t / 0x100000000) >>> 0;
  if (last) { v[28] = ~v[28]; v[29] = ~v[29]; }
  for (let i = 0; i < 32; i++) m[i] = block[4 * i] | (block[4 * i + 1] << 8) | (block[4 * i + 2] << 16) | (block[4 * i + 3] << 24);
  for (let r = 0; r < 12; r++) {
    const s = SIGMA[r % 10];
    G(0, 8, 16, 24, s[0] * 2, s[1] * 2); G(2, 10, 18, 26, s[2] * 2, s[3] * 2);
    G(4, 12, 20, 28, s[4] * 2, s[5] * 2); G(6, 14, 22, 30, s[6] * 2, s[7] * 2);
    G(0, 10, 20, 30, s[8] * 2, s[9] * 2); G(2, 12, 22, 24, s[10] * 2, s[11] * 2);
    G(4, 14, 16, 26, s[12] * 2, s[13] * 2); G(6, 8, 18, 28, s[14] * 2, s[15] * 2);
  }
  for (let i = 0; i < 16; i++) h[i] ^= v[i] ^ v[i + 16];
}

export function blake2b(data: Uint8Array, outLen = 64): Uint8Array {
  const h = new Uint32Array(IV);
  h[0] ^= 0x01010000 ^ outLen;
  const block = new Uint8Array(128);
  let t = 0, p = 0;
  while (data.length - p > 128) {
    t += 128;
    compress(h, data.subarray(p, p + 128), t, false);
    p += 128;
  }
  block.fill(0);
  block.set(data.subarray(p));
  t += data.length - p;
  compress(h, block, t, true);
  const out = new Uint8Array(outLen);
  for (let i = 0; i < outLen; i++) out[i] = h[i >> 2] >>> (8 * (i & 3));
  return out;
}

const enc = new TextEncoder();
const hexOf = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** Python's str() of a part as sk3/assemble.py joins them: ints and strings only. */
function joinParts(parts: (string | number | bigint)[]): Uint8Array {
  return enc.encode(parts.map((x) => String(x)).join('|'));
}

/** sk3/assemble.py h64: stable 62-bit id (bit 62 = texture low-res flag, bit 63 kept clear). */
export function h64(...parts: (string | number | bigint)[]): bigint {
  const d = blake2b(joinParts(parts), 8);
  return BigInt('0x' + hexOf(d)) & 0x3FFFFFFFFFFFFFFFn;
}

/** sk3/assemble.py h32 (never 0). */
export function h32(...parts: (string | number | bigint)[]): number {
  const d = blake2b(joinParts(parts), 4);
  return (((d[0] << 24) | (d[1] << 16) | (d[2] << 8) | d[3]) >>> 0) || 1;
}

export const hex16 = (x: bigint) => x.toString(16).padStart(16, '0');

/** sk3/assemble.py tile_texture_id. */
export function tileTextureId(base: bigint, x: number, z: number): bigint {
  return h64('tile-tex', hex16(base), x, z);
}

export function contentKey(data: Uint8Array): string {
  return hexOf(blake2b(data, 16));
}
