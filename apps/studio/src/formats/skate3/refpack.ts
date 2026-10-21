// SPDX-License-Identifier: GPL-3.0-or-later
// RefPack (EA "QFS") LZ, the compression inside Xbox 360 .xsf section payloads; port of
// skate4to3 sk3/refpack.py (byte-identical compressor: same greedy parse, same encoder).
//
//   0xxxxxxx b1            run 0-3, copy 3-10   from 1-1024 back
//   10xxxxxx b1 b2         run 0-3, copy 4-67   from 1-16384 back
//   110xxxxx b1 b2 b3      run 0-3, copy 5-1028 from 1-131072 back
//   111xxxxx (< 0xFC)      run 4-112 literals (multiple of 4)
//   111111xx               run 0-3 literals, end of stream
import { ByteWriter } from './bytes_util.ts';

export const MAX_DIST = 0x20000;
export const MAX_LEN = 1028;
export const TAIL = 4;   // EA never copies into the last four bytes

export function looksLike(b: Uint8Array): boolean {
  return b.length >= 5 && b[1] === 0xFB && (b[0] & 0x3E) === 0x10;
}

export function decompress(src: Uint8Array): Uint8Array {
  const flags = src[0];
  if (src[1] !== 0xFB) throw new Error('not a RefPack stream');
  let p = 2;
  const width = flags & 0x01 ? 4 : 3;
  if (flags & 0x80) p += width;
  let size = 0;
  for (let i = 0; i < width; i++) size = size * 256 + src[p + i];
  p += width;
  const out = new Uint8Array(size);
  let o = 0;
  for (;;) {
    const b0 = src[p++];
    let run: number, dist: number, ln: number;
    if (b0 < 0x80) {
      const b1 = src[p++];
      run = b0 & 3; dist = ((b0 & 0x60) << 3) + b1 + 1; ln = ((b0 >> 2) & 7) + 3;
    } else if (b0 < 0xC0) {
      const b1 = src[p], b2 = src[p + 1]; p += 2;
      run = b1 >> 6; dist = ((b1 & 0x3F) << 8) + b2 + 1; ln = (b0 & 0x3F) + 4;
    } else if (b0 < 0xE0) {
      const b1 = src[p], b2 = src[p + 1], b3 = src[p + 2]; p += 3;
      run = b0 & 3; dist = ((b0 & 0x10) << 12) + (b1 << 8) + b2 + 1; ln = ((b0 & 0x0C) << 6) + b3 + 5;
    } else if (b0 < 0xFC) {
      run = ((b0 & 0x1F) + 1) << 2; dist = 0; ln = 0;
    } else {
      run = b0 & 3; dist = 0; ln = 0;
    }
    if (run) {
      if (o + run > size) throw new Error('RefPack: output overrun');
      out.set(src.subarray(p, p + run), o);
      p += run; o += run;
    }
    if (ln) {
      const s = o - dist;
      if (s < 0 || o + ln > size) throw new Error('RefPack: bad copy');
      for (let i = 0; i < ln; i++) out[o + i] = out[s + i];
      o += ln;
    }
    if (b0 >= 0xFC) break;
  }
  if (o !== size) throw new Error(`RefPack produced ${o} bytes, header said ${size}`);
  return out;
}

/** Opcode bytes needed for a copy, or 0 when no opcode can encode it. */
function cost(ln: number, dist: number): number {
  if (ln <= 10 && dist <= 1024) return 2;
  if (ln >= 4 && ln <= 67 && dist <= 16384) return 3;
  if (ln >= 5 && dist <= MAX_DIST) return 4;
  return 0;
}

export type Match = [pos: number, len: number, dist: number];

/** Greedy match list (same rule as sk3/refpack.py parse). `depth` > 0 caps candidates per position. */
export function parse(src: Uint8Array, depth = 0): Match[] {
  const n = src.length;
  const head = new Map<number, number>();
  const prev = new Int32Array(n).fill(-1);
  const out: Match[] = [];
  const key = (j: number) => (src[j] << 16) | (src[j + 1] << 8) | src[j + 2];
  const insert = (j: number) => {
    if (j + 3 <= n) {
      const k = key(j);
      const h = head.get(k);
      prev[j] = h === undefined ? -1 : h;
      head.set(k, j);
    }
  };
  let i = 0;
  while (i < n) {
    let bestLen = 0, bestDist = 0, bestScore = 0;
    if (i + 3 <= n - TAIL) {
      const h = head.get(key(i));
      let c = h === undefined ? -1 : h;
      const mx = Math.min(MAX_LEN, n - TAIL - i);
      let tried = 0;
      while (c >= 0) {
        const dist = i - c;
        if (dist > MAX_DIST) break;
        let ub: number;
        if (dist <= 1024) ub = Math.max(Math.min(mx, 10) - 2, Math.min(mx, 67) - 3, mx - 4);
        else if (dist <= 16384) ub = Math.max(Math.min(mx, 67) - 3, mx - 4);
        else ub = mx - 4;
        if (bestScore > ub || (bestScore === ub && bestLen >= mx)) break;
        let ln = 3;
        while (ln < mx && src[c + ln] === src[i + ln]) ln++;
        const cs = cost(ln, dist);
        if (cs) {
          const s = ln - cs;
          if (s > bestScore || (s === bestScore && ln > bestLen)) { bestLen = ln; bestDist = dist; bestScore = s; }
        }
        tried++;
        if (depth && tried >= depth) break;
        c = prev[c];
      }
    }
    if (bestScore > 0) {
      out.push([i, bestLen, bestDist]);
      for (let k = 0; k < bestLen; k++) insert(i + k);
      i += bestLen;
    } else {
      insert(i);
      i++;
    }
  }
  return out;
}

/** Serialise a match list: 112-byte literal runs, the last 0-3 literals ride on the next opcode. */
export function encode(src: Uint8Array, matches: readonly Match[]): Uint8Array {
  const n = src.length;
  const out = new ByteWriter(n + (n >> 4) + 16);
  if (n >= 1 << 24) out.u8(0x11).u8(0xFB).u32(n);
  else out.u8(0x10).u8(0xFB).u8(n >> 16).u8(n >> 8).u8(n);
  let lit = 0;
  const literals = (frm: number, to: number): [number, number] => {
    const cnt = to - frm;
    let bulk = cnt - (cnt & 3);
    let p = frm;
    while (bulk) {
      const take = Math.min(112, bulk);
      out.u8(0xE0 + (take >> 2) - 1);
      out.bytes(src.subarray(p, p + take));
      p += take;
      bulk -= take;
    }
    return [p, cnt & 3];
  };
  for (const [pos, ln, dist] of matches) {
    const [p, run] = literals(lit, pos);
    const d = dist - 1;
    if (ln <= 10 && dist <= 1024) {
      out.u8(((d >> 3) & 0x60) | ((ln - 3) << 2) | run);
      out.u8(d & 0xFF);
    } else if (ln >= 4 && ln <= 67 && dist <= 16384) {
      out.u8(0x80 | (ln - 4));
      out.u8((run << 6) | (d >> 8));
      out.u8(d & 0xFF);
    } else {
      const l = ln - 5;
      out.u8(0xC0 | ((d >> 12) & 0x10) | ((l >> 6) & 0x0C) | run);
      out.u8((d >> 8) & 0xFF);
      out.u8(d & 0xFF);
      out.u8(l & 0xFF);
    }
    out.bytes(src.subarray(p, p + run));
    lit = pos + ln;
  }
  const [p, run] = literals(lit, n);
  out.u8(0xFC + run);
  out.bytes(src.subarray(p, p + run));
  return out.finish();
}

export function compress(src: Uint8Array, depth = 0): Uint8Array {
  return encode(src, parse(src, depth));
}
