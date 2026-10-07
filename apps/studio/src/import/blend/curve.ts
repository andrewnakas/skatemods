// Legacy Curve datablocks (Curve / Nurb / BPoint / BezTriple) -> world-space polylines.

import type { Vec3 } from '../../ir';
import type { StructView } from './file';
import { applyPoint, conv } from './geometry';

const CU_POLY = 0, CU_BEZIER = 1, CU_NURBS = 4;
const CU_NURB_CYCLIC = 1;

export interface CurvePolyline {
  points: Vec3[];
  closed: boolean;
  kind: 'poly' | 'bezier' | 'nurbs';
}

function bez(p0: number[], p1: number[], p2: number[], p3: number[], t: number): number[] {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [0, 1, 2].map((i) => a * p0[i] + b * p1[i] + c * p2[i] + d * p3[i]);
}

/**
 * Reads every spline of a Curve. Points are in game space, transformed by `world`
 * (the object's Blender-space world matrix). Bezier splines are sampled with the
 * spline's resolution like Blender does; NURBS splines use their control points.
 */
export function readCurve(cu: StructView, world: ArrayLike<number>, warn: (s: string) => void, label: string): CurvePolyline[] {
  const F = cu.file;
  const out: CurvePolyline[] = [];
  const toGame = (p: number[]): Vec3 => conv(applyPoint(world, p[0], p[1], p[2]));
  for (const nu of cu.list('nurb', 'Nurb')) {
    const type = nu.num('type');
    const n = nu.num('pntsu');
    const closed = (nu.num('flagu') & CU_NURB_CYCLIC) !== 0;
    if (n <= 0) continue;
    if (type === CU_BEZIER) {
      const r = F.resolve(nu.ptr('bezt'), nu.scope);
      const st = F.struct('BezTriple');
      if (!r || !st) continue;
      const knots: number[][][] = [];
      for (let i = 0; i < n; i++) {
        const v = F.viewBlock(r.block, 'BezTriple', r.offset + i * st.size);
        if (!v || v.offset + st.size > r.block.offset + r.block.len) break;
        const vec = v.nums('vec'); // [handle_left, co, handle_right] x xyz
        knots.push([vec.slice(0, 3), vec.slice(3, 6), vec.slice(6, 9)]);
      }
      const res = Math.max(1, nu.num('resolu') || cu.num('resolu') || 12);
      const pts: Vec3[] = [];
      const segs = closed ? knots.length : knots.length - 1;
      for (let s = 0; s < segs; s++) {
        const a = knots[s], b = knots[(s + 1) % knots.length];
        for (let k = 0; k < res; k++) pts.push(toGame(bez(a[1], a[2], b[0], b[1], k / res)));
      }
      if (!closed && knots.length) pts.push(toGame(knots[knots.length - 1][1]));
      out.push({ points: pts, closed, kind: 'bezier' });
    } else {
      const r = F.resolve(nu.ptr('bp'), nu.scope);
      const st = F.struct('BPoint');
      if (!r || !st) continue;
      const pts: Vec3[] = [];
      for (let i = 0; i < n; i++) {
        const v = F.viewBlock(r.block, 'BPoint', r.offset + i * st.size);
        if (!v || v.offset + st.size > r.block.offset + r.block.len) break;
        pts.push(toGame(v.nums('vec')));
      }
      if (type === CU_NURBS) warn(`${label}: NURBS spline exported as its control points`);
      else if (type !== CU_POLY) warn(`${label}: unknown spline type ${type}, control points used`);
      out.push({ points: pts, closed, kind: type === CU_NURBS ? 'nurbs' : 'poly' });
    }
  }
  return out;
}
