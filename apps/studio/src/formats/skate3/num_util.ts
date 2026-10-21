// SPDX-License-Identifier: GPL-3.0-or-later
// Numeric + byte helpers for the Skate 3 render / texture / collision / spline writers (ports of
// skate4to3 sk3/*_write.py). They reproduce numpy's results bit for bit where the writers need it:
//   - f32(): Math.fround. A float32 numpy op on float32 operands equals fround(double op) for
//     + - * / and sqrt (double has > 2*24+2 mantissa bits, so the double rounding is innocuous).
//   - rint(): np.rint / np.round (round half to even).
//   - halfBits(): numpy's float64 -> float16 cast (correctly rounded from the double, RNE).
// Reduction orders were measured on numpy 2.5.3 (win64): add.reduce over a length-3 axis and
// over a non-contiguous axis is sequential; einsum sums of products are sequential, starting at 0;
// a float32 add.reduce over a contiguous length-16 axis is numpy's 8-way pairwise sum (tree8).

export const f32 = Math.fround;

/** np.rint: round half to even (keeps -0). */
export function rint(x: number): number {
  if (!Number.isFinite(x)) return x;
  const r = Math.round(x);
  if (Math.abs(x % 1) === 0.5) return 2 * Math.round(x / 2);
  return r;
}

/** numpy float32 add.reduce over 16 contiguous values (pairwise_sum, n = 16). */
export function tree8f(x: ArrayLike<number>, o = 0): number {
  const r0 = f32(x[o] + x[o + 8]), r1 = f32(x[o + 1] + x[o + 9]), r2 = f32(x[o + 2] + x[o + 10]);
  const r3 = f32(x[o + 3] + x[o + 11]), r4 = f32(x[o + 4] + x[o + 12]), r5 = f32(x[o + 5] + x[o + 13]);
  const r6 = f32(x[o + 6] + x[o + 14]), r7 = f32(x[o + 7] + x[o + 15]);
  return f32(f32(f32(r0 + r1) + f32(r2 + r3)) + f32(f32(r4 + r5) + f32(r6 + r7)));
}

/** float64 -> IEEE half bits, round to nearest even (numpy astype('f2') from float64). */
export function halfBits(d: number): number {
  if (Number.isNaN(d)) return 0x7E00;
  const sign = d < 0 || Object.is(d, -0) ? 0x8000 : 0;
  const a = Math.abs(d);
  if (a >= 65520) return sign | 0x7C00;          // rounds to inf (65504 + half an ulp, tie -> even = inf)
  if (a < 6.103515625e-05) return sign | rint(a * 16777216);   // subnormal: units of 2^-24 (1024 -> min normal)
  let e = Math.floor(Math.log2(a));
  if (2 ** e > a) e--;
  if (2 ** (e + 1) <= a) e++;
  const mant = rint((a / 2 ** e - 1) * 1024);   // exact in double, then RNE
  return sign | (((e + 15) << 10) + mant);       // a mantissa carry of 1024 bumps the exponent
}

/** int64 -> int16 wrap (numpy astype('>i2')). */
export const wrap16 = (v: number): number => (v << 16) >> 16;

// ---------------------------------------------------------------- big-endian byte building

export function concat(parts: readonly Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** struct.pack('>NI', ...) */
export function u32s(...v: number[]): Uint8Array {
  const b = new Uint8Array(4 * v.length);
  const dv = new DataView(b.buffer);
  v.forEach((x, i) => dv.setUint32(4 * i, x >>> 0));
  return b;
}

/** struct.pack('>Nf', ...) (Python packs the double rounded to float32) */
export function f32s(...v: number[]): Uint8Array {
  const b = new Uint8Array(4 * v.length);
  const dv = new DataView(b.buffer);
  v.forEach((x, i) => dv.setFloat32(4 * i, x));
  return b;
}

/** Fixed-size big-endian buffer with struct.pack_into-style writers. */
export class BE {
  readonly b: Uint8Array;
  readonly dv: DataView;
  constructor(size: number) {
    this.b = new Uint8Array(size);
    this.dv = new DataView(this.b.buffer);
  }
  u8(o: number, v: number) { this.b[o] = v & 0xFF; }
  u16(o: number, ...v: number[]) { v.forEach((x, i) => this.dv.setUint16(o + 2 * i, x & 0xFFFF)); }
  u32(o: number, ...v: number[]) { v.forEach((x, i) => this.dv.setUint32(o + 4 * i, x >>> 0)); }
  i32(o: number, ...v: number[]) { v.forEach((x, i) => this.dv.setInt32(o + 4 * i, x | 0)); }
  f32(o: number, ...v: number[]) { v.forEach((x, i) => this.dv.setFloat32(o + 4 * i, x)); }
  u64(o: number, ...v: bigint[]) { v.forEach((x, i) => this.dv.setBigUint64(o + 8 * i, BigInt.asUintN(64, x))); }
  set(o: number, src: Uint8Array) { this.b.set(src, o); }
}

/** Python `s.encode('latin-1')` (throws past U+00FF). */
export function latin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c > 0xFF) throw new Error(`latin-1: cannot encode U+${c.toString(16)}`);
    out[i] = c;
  }
  return out;
}

export const align = (x: number, a: number): number => Math.ceil(x / a) * a;

/** Python int.bit_length() for non-negative ints < 2^53. */
export function bitLength(v: number): number {
  let n = 0;
  while (v >= 1) { v = Math.floor(v / 2); n++; }
  return n;
}

/** '0x%016x' body of a u64 */
export const hex16 = (v: bigint): string => BigInt.asUintN(64, v).toString(16).padStart(16, '0');

/** np.minimum / np.maximum (NaN propagates; on equality, incl. +-0, the second operand wins) */
export const npMin = (a: number, b: number): number => ((a < b || Number.isNaN(a)) ? a : b);
export const npMax = (a: number, b: number): number => ((a > b || Number.isNaN(a)) ? a : b);
