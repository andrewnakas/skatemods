// SPDX-License-Identifier: GPL-3.0-or-later
// Grindable edges -> polylines (port of skate4to3/sk4/grind_edges.py `grind_edges` + `_straighten`).
// A grindable edge is a manifold, convex crease between min and max angle with a standable face and a
// rideable slope; surviving edges are chained into polylines and simplified.

export type Vec3 = [number, number, number];

export interface GrindOptions { minAngle: number; maxAngle: number; upMin: number; maxEdgeSlope: number; minLength: number; maxSplines: number; straighten: number }
const DEFAULTS: GrindOptions = { minAngle: 30, maxAngle: 150, upMin: 0.45, maxEdgeSlope: 0.85, minLength: 1.2, maxSplines: 400, straighten: 0.04 };

/** Merge vertices by position (1 mm grid), first occurrence in sorted-key order as numpy.unique gives. */
function weld(pos: Float32Array, tol = 1e-3): { P: Float64Array; inv: Int32Array } {
  const n = pos.length / 3;
  const keys: [number, number, number, number][] = [];
  // np.round: half to even
  const r = (x: number) => { const f = Math.floor(x), d = x - f; return d > 0.5 ? f + 1 : d < 0.5 ? f : (f % 2 === 0 ? f : f + 1); };
  for (let i = 0; i < n; i++) keys.push([r(pos[3 * i] / tol), r(pos[3 * i + 1] / tol), r(pos[3 * i + 2] / tol), i]);
  keys.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);
  const inv = new Int32Array(n);
  const P: number[] = [];
  let u = -1;
  for (let k = 0; k < keys.length; k++) {
    const [x, y, z, i] = keys[k];
    if (k === 0 || x !== keys[k - 1][0] || y !== keys[k - 1][1] || z !== keys[k - 1][2]) { u++; P.push(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]); }
    inv[i] = u;
  }
  return { P: Float64Array.from(P), inv };
}

function straighten(pts: Vec3[], tol: number): Vec3[] {
  if (pts.length <= 2 || tol <= 0) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    if (j <= i + 1) continue;
    const s = [pts[j][0] - pts[i][0], pts[j][1] - pts[i][1], pts[j][2] - pts[i][2]];
    const L = Math.hypot(s[0], s[1], s[2]);
    if (L < 1e-9) continue;
    const u = [s[0] / L, s[1] / L, s[2] / L];
    let best = -1, bd = -1;
    for (let k = i + 1; k < j; k++) {
      const w = [pts[k][0] - pts[i][0], pts[k][1] - pts[i][1], pts[k][2] - pts[i][2]];
      const t = w[0] * u[0] + w[1] * u[1] + w[2] * u[2];
      const d = Math.hypot(w[0] - t * u[0], w[1] - t * u[1], w[2] - t * u[2]);
      if (d > bd) { bd = d; best = k; }
    }
    if (bd > tol) { keep[best] = 1; stack.push([i, best], [best, j]); }
  }
  return pts.filter((_, k) => keep[k]);
}

/** Grindable polylines of one object, in the space of `pos`. */
export function grindEdges(pos: Float32Array, tris: Uint32Array, o: Partial<GrindOptions> = {}): Vec3[][] {
  const opt = { ...DEFAULTS, ...o };
  if (tris.length < 6 || pos.length < 9) return [];
  const { P, inv } = weld(pos);
  // remap, drop degenerate and duplicate faces (first occurrence kept)
  const seen = new Set<string>();
  const T: number[] = [];
  for (let t = 0; t < tris.length; t += 3) {
    const a = inv[tris[t]], b = inv[tris[t + 1]], c = inv[tris[t + 2]];
    if (a === b || b === c || a === c) continue;
    const k = [a, b, c].sort((x, y) => x - y).join(',');
    if (seen.has(k)) continue;
    seen.add(k);
    T.push(a, b, c);
  }
  const nt = T.length / 3;
  if (nt < 2) return [];
  const fn = new Float64Array(nt * 3);
  for (let f = 0; f < nt; f++) {
    const a = T[3 * f], b = T[3 * f + 1], c = T[3 * f + 2];
    const ux = P[3 * b] - P[3 * a], uy = P[3 * b + 1] - P[3 * a + 1], uz = P[3 * b + 2] - P[3 * a + 2];
    const vx = P[3 * c] - P[3 * a], vy = P[3 * c + 1] - P[3 * a + 1], vz = P[3 * c + 2] - P[3 * a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
    if (l > 1e-12) { fn[3 * f] = nx / l; fn[3 * f + 1] = ny / l; fn[3 * f + 2] = nz / l; }
  }
  // edges keyed low->high; [lo, hi, opposite vertex, face]
  const E: [number, number, number, number][] = [];
  // same order as the numpy concatenation: every face's (0,1) edge, then (1,2), then (2,0)
  for (const [i, j, k] of [[0, 1, 2], [1, 2, 0], [2, 0, 1]]) {
    for (let f = 0; f < nt; f++) {
      const x = T[3 * f + i], y = T[3 * f + j];
      E.push([Math.min(x, y), Math.max(x, y), T[3 * f + k], f]);
    }
  }
  E.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const adj = new Map<number, number[]>();
  const link = (x: number, y: number) => { (adj.get(x) ?? adj.set(x, []).get(x)!).push(y); (adj.get(y) ?? adj.set(y, []).get(y)!).push(x); };
  const toRad = Math.PI / 180;
  for (let i = 0; i + 1 < E.length; i++) {
    const e0 = E[i], e1 = E[i + 1];
    if (e0[0] !== e1[0] || e0[1] !== e1[1]) continue;
    // exactly two faces
    if ((i > 0 && E[i - 1][0] === e0[0] && E[i - 1][1] === e0[1]) || (i + 2 < E.length && E[i + 2][0] === e0[0] && E[i + 2][1] === e0[1])) continue;
    const va = e0[0], vb = e0[1];
    const dx = P[3 * vb] - P[3 * va], dy = P[3 * vb + 1] - P[3 * va + 1], dz = P[3 * vb + 2] - P[3 * va + 2];
    const dl = Math.hypot(dx, dy, dz);
    if (dl <= 1e-6) continue;
    const f1 = e0[3], f2 = e1[3], p2 = e1[2];
    const n1 = [fn[3 * f1], fn[3 * f1 + 1], fn[3 * f1 + 2]], n2 = [fn[3 * f2], fn[3 * f2 + 1], fn[3 * f2 + 2]];
    const convex = n1[0] * (P[3 * p2] - P[3 * va]) + n1[1] * (P[3 * p2 + 1] - P[3 * va + 1]) + n1[2] * (P[3 * p2 + 2] - P[3 * va + 2]) < -1e-4;
    const ang = Math.acos(Math.max(-1, Math.min(1, n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2]))) / toRad;
    if (!convex || ang < opt.minAngle || ang > opt.maxAngle) continue;
    if (Math.max(n1[1], n2[1]) < opt.upMin) continue;
    if (Math.abs(dy) / dl > opt.maxEdgeSlope) continue;
    link(va, vb);
  }
  const used = new Set<string>();
  const key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
  const pt = (i: number): Vec3 => [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
  const walk = (start: number, nxt: number) => {
    const chain = [start, nxt];
    used.add(key(start, nxt));
    for (;;) {
      const here = chain[chain.length - 1], prev = chain[chain.length - 2];
      let dx = P[3 * here] - P[3 * prev], dy = P[3 * here + 1] - P[3 * prev + 1], dz = P[3 * here + 2] - P[3 * prev + 2];
      const nd = Math.hypot(dx, dy, dz);
      if (nd < 1e-9) break;
      dx /= nd; dy /= nd; dz /= nd;
      let best = -1, bestDot = -2;
      for (const c of adj.get(here) ?? []) {
        if (c === prev || used.has(key(here, c))) continue;
        const wx = P[3 * c] - P[3 * here], wy = P[3 * c + 1] - P[3 * here + 1], wz = P[3 * c + 2] - P[3 * here + 2];
        const nw = Math.hypot(wx, wy, wz);
        if (nw < 1e-9) continue;
        const dot = (dx * wx + dy * wy + dz * wz) / nw;
        if (dot > bestDot) { best = c; bestDot = dot; }
      }
      if (best < 0 || bestDot < 0.2) break;
      used.add(key(here, best));
      chain.push(best);
      if (chain.length > 4000) break;
    }
    return chain;
  };
  const ends = [...adj].filter(([, nb]) => nb.length !== 2).map(([v]) => v);
  const starts = ends.length ? ends : [...adj.keys()];
  const out: Vec3[][] = [];
  for (const s of starts) {
    for (const nb of [...(adj.get(s) ?? [])]) {
      if (used.has(key(s, nb))) continue;
      const pts = walk(s, nb).map(pt);
      if (pts.length < 2) continue;
      let len = 0;
      for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1], pts[k][2] - pts[k - 1][2]);
      if (len >= opt.minLength) out.push(straighten(pts, opt.straighten));
      if (out.length >= opt.maxSplines) return out;
    }
  }
  return out;
}

export function polylineLength(l: Vec3[]): number {
  let s = 0;
  for (let k = 1; k < l.length; k++) s += Math.hypot(l[k][0] - l[k - 1][0], l[k][1] - l[k - 1][1], l[k][2] - l[k - 1][2]);
  return s;
}
