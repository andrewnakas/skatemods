// SPDX-License-Identifier: GPL-3.0-or-later
// Skate 3 grind splines: RW4 object type 0xEB0004 in cSim_* arenas. Port of skate4to3 sk3/splines.py
// (layout in its docstring and specs/sk3_collision.md "Grind splines"). Byte-identical encode.

import { npMax, npMin } from './num_util.ts';

export const T_SPLINES = 0xEB0004;
export const SEG = 0x90;

type V3 = [number, number, number];

export interface Segment {
  a: V3; b: V3; c: V3;
  d: V3;            // start point
  bmin: V3; bmax: V3;
  flags: number;
}
export interface Spline { id: bigint; template: bigint; segments: Segment[] }
export interface SplineSet { kind: number; splines: Spline[] }

/** P(t) = ((A t + B) t + C) t + D in float64 */
export function evalSegment(s: Segment, t: number): V3 {
  return [0, 1, 2].map(i => ((s.a[i] * t + s.b[i]) * t + s.c[i]) * t + s.d[i]) as V3;
}

export function parseSplines(d: Uint8Array): SplineSet {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const w0 = dv.getUint32(0), toff = dv.getUint32(8);
  const n = w0 & 0xFFFF;
  const f3 = (o: number): V3 => [dv.getFloat32(o), dv.getFloat32(o + 4), dv.getFloat32(o + 8)];
  const out: Spline[] = [];
  for (let k = 0; k < n; k++) {
    const e = toff + 32 * k;
    const s: Spline = { id: dv.getBigUint64(e), template: dv.getBigUint64(e + 8), segments: [] };
    const first = dv.getUint32(e + 20), last = dv.getUint32(e + 24);
    for (let q = first; q <= last; q += SEG) {
      s.segments.push({ a: f3(q), b: f3(q + 0x10), c: f3(q + 0x20), d: f3(q + 0x30), bmin: f3(q + 0x50),
        bmax: f3(q + 0x60), flags: dv.getUint32(q + 0x78) });
    }
    out.push(s);
  }
  return { kind: w0 >>> 16, splines: out };
}

export function encodeSplines(ss: SplineSet): Uint8Array {
  const n = ss.splines.length;
  const nseg = ss.splines.reduce((a, s) => a + s.segments.length, 0);
  const toff = 0x10, doff = 0x10 + 32 * n;
  const out = new Uint8Array(doff + SEG * nseg);
  const dv = new DataView(out.buffer);
  const f = (o: number, v: readonly number[]) => v.forEach((x, i) => dv.setFloat32(o + 4 * i, x));
  dv.setUint32(0, ((ss.kind << 16) | n) >>> 0);
  dv.setUint32(4, nseg); dv.setUint32(8, toff); dv.setUint32(12, doff);
  let q = doff;
  ss.splines.forEach((s, k) => {
    const first = q;
    for (const g of s.segments) {
      f(q, g.a); f(q + 0x10, g.b); f(q + 0x20, g.c); f(q + 0x30, [...g.d, 1.0]);
      f(q + 0x50, g.bmin); f(q + 0x60, g.bmax);
      dv.setUint32(q + 0x78, g.flags >>> 0);
      q += SEG;
    }
    const e = toff + 32 * k;
    dv.setBigUint64(e, BigInt.asUintN(64, s.id));
    dv.setBigUint64(e + 8, BigInt.asUintN(64, s.template));
    dv.setUint32(e + 16, 0);
    dv.setUint32(e + 20, first);
    dv.setUint32(e + 24, Math.max(first, q - SEG));
    dv.setUint32(e + 28, 0);
  });
  return out;
}

/** the arena subref records retail emits for a spline object: one per table entry */
export function splineSubrefs(objIndex: number, ss: SplineSet): [number, number][] {
  return ss.splines.map((_, k) => [objIndex, 0x10 + 32 * k]);
}

/** retail segment bbox: min / max of the Bezier control points of P(t), as float32 */
export function segmentBbox(a: V3, b: V3, c: V3, d: V3): [V3, V3] {
  const cps = [0, 1, 2].map(i => [d[i], d[i] + c[i] / 3, d[i] + 2 * c[i] / 3 + b[i] / 3, d[i] + c[i] + b[i] + a[i]]);
  const mn = cps.map(r => Math.fround(r.reduce(npMin))) as V3;
  const mx = cps.map(r => Math.fround(r.reduce(npMax))) as V3;
  return [mn, mx];
}

/** a segment from p0 to p1 in the retail straight-rail form (A = -2 dP, B = 3 dP, C = 0) */
export function straightSegment(p0: readonly number[], p1: readonly number[], flags = 0x10): Segment {
  const q0 = p0.map(Math.fround), q1 = p1.map(Math.fround);
  const dp = [0, 1, 2].map(i => q1[i] - q0[i]);
  return {
    a: dp.map(x => Math.fround(-2 * x)) as V3,
    b: dp.map(x => Math.fround(3 * x)) as V3,
    c: [0, 0, 0],
    d: q0 as V3,
    bmin: [0, 1, 2].map(i => npMin(q0[i], q1[i])) as V3,
    bmax: [0, 1, 2].map(i => npMax(q0[i], q1[i])) as V3,
    flags,
  };
}
