// SPDX-License-Identifier: GPL-3.0-or-later
// Skate 3 collision writer: port of skate4to3 sk3/collision_write.py. Encoders for the cSim
// objects (clustered mesh 0x80006, volume, box aggregate, model, link, instances, import table)
// and the builder: triangles + surface ids -> clustered mesh with our own clustering and KD tree
// (buildMesh), and a whole retail-layout tile arena (buildTileArena). Byte-identical to the Python
// for identical inputs; the one libm dependency (acos / log2 in the edge angle code) is noted at
// edgeCode().
import * as co from './collision.ts';
import type { ClusteredMesh, Cluster, Node, Volume, BoxAggregate, CollisionModel, InstanceList, ImportTable, Unit } from './collision.ts';
import { BE, align, bitLength, concat, latin1, npMax, npMin, rint, u32s } from './num_util.ts';
import { buildArena } from './rw4_write.ts';
import type { Spec, SpecObject } from './rw4_write.ts';
import { T_SPLINES, encodeSplines, splineSubrefs } from './splines.ts';
import type { SplineSet } from './splines.ts';

export const MESH_FLAGS = 0x00100202;
export const GRANULARITY = Math.fround(0.001);

type V3 = [number, number, number];

// ---------------------------------------------------------------------------------------------
// 0x80006 clustered mesh
export function encodeCluster(c: Cluster): Uint8Array {
  const vc = c.qverts.length;
  let vb: Uint8Array;
  if (c.vertex_mode === 1) {
    const o = new BE(12 + 6 * vc);
    o.i32(0, ...c.offset!);
    c.qverts.forEach((q, k) => o.u16(12 + 6 * k, ...q));
    vb = o.b;
  } else if (c.vertex_mode === 2) {
    const o = new BE(12 * vc);
    c.qverts.forEach((q, k) => o.i32(12 * k, ...q));
    vb = o.b;
  } else {
    throw new Error(`vertex mode ${c.vertex_mode}`);
  }
  const ust = align(vb.length, 16) / 16;
  const ub: number[] = [];
  for (const [f, v, e, s] of c.units) {
    ub.push(f, ...v, ...e);
    if (f & co.UNIT_SURFACE) ub.push((s! >> 8) & 0xFF, s! & 0xFF);
  }
  const total = 16 + 16 * ust + ub.length;
  const hdr = new BE(16);
  hdr.u16(0, c.units.length, ub.length, ust, ust, total);
  hdr.b[10] = vc; hdr.b[11] = c.normal_count; hdr.b[12] = c.vertex_mode;
  return concat([hdr.b, vb, new Uint8Array(16 * ust - vb.length), Uint8Array.from(ub)]);
}

export function encodeMesh(m: ClusteredMesh): Uint8Array {
  const nunits = m.clusters.reduce((a, c) => a + c.units.length, 0);
  const nb = m.nodes.length, ncl = m.clusters.length;
  const ctab = 0x90 + 32 * nb;
  const cl = m.clusters.map(encodeCluster);
  const ptrs: number[] = [];
  let p = align(ctab + 4 * ncl, 16);
  for (const b of cl) { ptrs.push(p); p = align(p + b.length, 16); }
  const o = new BE(p);
  const [[bmin, bmax], [tmin, tmax]] = [m.bbox, m.tree_bbox];
  o.f32(0x00, ...bmin);
  o.f32(0x10, ...bmax);
  o.u32(0x24, m.max_leaf === null ? bitLength(nunits + 1) : m.max_leaf, nunits);
  o.u32(0x30, 0x60, ctab); o.f32(0x38, m.granularity); o.u32(0x3C, m.flags);
  o.u32(0x40, ncl, ncl, nunits, nunits);
  o.u32(0x50, p);
  o.u32(0x58, 0x80000000);
  o.u32(0x60, nb ? 0x90 : m.node_ptr, nb, nunits);
  o.f32(0x70, ...tmin);
  o.f32(0x80, ...tmax);
  m.nodes.forEach((n, k) => {
    const [[c0, i0], [c1, i1]] = n.children;
    o.u32(0x90 + 32 * k, n.parent, n.axis, c0, i0, c1, i1);
    o.f32(0x90 + 32 * k + 24, ...n.extents);
  });
  o.u32(ctab, ...ptrs);
  ptrs.forEach((q, k) => o.set(q, cl[k]));
  return o.b;
}

// ---------------------------------------------------------------------------------------------
// small objects
export function encodeVolume(v: Volume): Uint8Array {
  const o = new BE(0x60);
  o.f32(0, ...v.matrix);
  o.u32(0x40, v.vtype, v.geometry, ...v.tail);
  return o.b;
}

export function encodeAggregate(g: BoxAggregate): Uint8Array {
  const n = g.volumes.length, nb = g.nodes.length;
  const toff = 0x50 + 0x60 * n;
  const o = new BE(toff + 0x30 + 32 * nb);
  o.f32(0, ...g.bbox[0]); o.f32(0x10, ...g.bbox[1]);
  o.u32(0x20, 0, g.w24, n, 0); o.u32(0x30, 0x50); o.u32(0x40, toff);
  g.volumes.forEach((v, k) => o.set(0x50 + 0x60 * k, encodeVolume(v)));
  o.u32(toff, nb ? toff + 0x30 : g.node_ptr, nb, g.n_entries);
  o.f32(toff + 0x10, ...g.tree_bbox[0]); o.f32(toff + 0x20, ...g.tree_bbox[1]); o.u32(toff + 0x2C, g.tree_pad);
  g.nodes.forEach((nd, k) => {
    const [[c0, i0], [c1, i1]] = nd.children;
    o.u32(toff + 0x30 + 32 * k, nd.parent, nd.axis, c0, i0, c1, i1);
    o.f32(toff + 0x30 + 32 * k + 24, ...nd.extents);
  });
  return o.b;
}

export function encodeModel(m: CollisionModel): Uint8Array {
  return u32s(m.bounding, m.volumes.length, 0x0C, ...m.volumes, 0);
}

export function encodeLink(volume: number, instance: number): Uint8Array {   // eb0020
  return u32s(volume, instance, 0, 0);
}

export const ARENA_WORDS = u32s(0x19, 0x0D, 0, 0);     // eb0008

export function encodeInstances(il: InstanceList): Uint8Array {
  const n = il.instances.length;
  const soff = 0x20 + 0xA0 * n;
  const pool: Uint8Array[] = [];
  const at = new Map<string, number>();
  let plen = 0;
  for (const ins of il.instances) {
    for (const s of ins.strings) {
      if (!at.has(s)) {
        at.set(s, soff + plen);
        const b = concat([latin1(s), new Uint8Array(1)]);
        pool.push(b);
        plen += b.length;
      }
    }
  }
  const o = new BE(soff + plen);
  o.set(soff, concat(pool));
  o.u32(0, il.kind, n, at.size, 0x20, soff);
  il.instances.forEach((ins, k) => {
    const e = 0x20 + 0xA0 * k;
    o.f32(e, ...ins.matrix);
    o.f32(e + 0x40, ...ins.bbox[0]); o.f32(e + 0x50, ...ins.bbox[1]);
    o.u64(e + 0x60, ...ins.ids);
    o.u32(e + 0x80, 0, ins.flags, 0, ...ins.strings.map(s => at.get(s)!), 0);
  });
  return o.b;
}

export function encodeImports(t: ImportTable): Uint8Array {
  const n = t.entries.length, m = t.types.length;
  const t2 = 0x14 + 24 * n;
  const o = new BE(t2 + 8 * m);
  o.u32(0, n, 0x14, t2, m, t2);
  t.entries.forEach(([i, ty, v], k) => {
    o.u32(0x14 + 24 * k, 0, 0xFEFFFFFF);
    o.u64(0x14 + 24 * k + 8, i);
    o.u32(0x14 + 24 * k + 16, ty, v);
  });
  t.types.forEach((ty, k) => o.u32(t2 + 8 * k, ty, n));
  return o.b;
}

// =============================================================================================
// Builder
export const EDGE_FLAT = 26;
export const EDGE_CONVEX = 0x20;
export const EDGE_VERTEX_OFF = 0x40;

/**
 * 5-bit angle code: floor(-2 log2(theta / 90deg)) + 2, clamped 0..26 (26 = flat).
 * libm note: JS Math.acos / Math.log2 (V8's fdlibm) and the MSVC CRT that Python uses differ by
 * one ulp on ~1-2% of inputs; that changes the code only when -2 log2(theta / 90deg) lies within
 * ~1e-15 of an integer. No such case in 500k probes (incl. 45 / 90 degree bevels from quantised
 * triangles) nor in the golden meshes.
 */
export function edgeCode(theta: number): number {
  if (theta <= 1e-9) return EDGE_FLAT;
  return Math.trunc(Math.max(0, Math.min(EDGE_FLAT, Math.floor(-2 * Math.log2(theta / (Math.PI / 2))) + 2)));
}

/** the decoder's arithmetic: (int coordinate) * f32 granularity, rounded to f32 */
export function dequantise(q: number, granularity = GRANULARITY): number {
  return Math.fround(q * Math.fround(granularity));
}

const dot3 = (a: ArrayLike<number>, ao: number, b: ArrayLike<number>, bo: number) =>
  (a[ao] * b[bo] + a[ao + 1] * b[bo + 1]) + a[ao + 2] * b[bo + 2];

/** retail-style edge bytes for triangles T (m x 3) over integer positions Q (n x 3), welded by position */
export function edgeBytes(Q: ArrayLike<number>, T: ArrayLike<number>, enableVertices = true): Uint8Array {
  const m = T.length / 3;
  const V = Q;
  const N = new Float64Array(3 * m);
  for (let t = 0; t < m; t++) {
    const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2];
    const e1 = [0, 1, 2].map(i => V[3 * b + i] - V[3 * a + i]);
    const e2 = [0, 1, 2].map(i => V[3 * c + i] - V[3 * a + i]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const l = npMax(Math.sqrt((n[0] * n[0] + n[1] * n[1]) + n[2] * n[2]), 1e-30);
    for (let i = 0; i < 3; i++) N[3 * t + i] = n[i] / l;
  }
  const key = new Map<string, number>();
  const nq = Q.length / 3;
  const W = new Int32Array(nq);
  for (let v = 0; v < nq; v++) {
    const k = `${Q[3 * v]},${Q[3 * v + 1]},${Q[3 * v + 2]}`;
    let id = key.get(k);
    if (id === undefined) { id = key.size; key.set(k, id); }
    W[v] = id;
  }
  const TT = new Int32Array(3 * m);
  for (let k = 0; k < 3 * m; k++) TT[k] = W[T[k]];
  const emap = new Map<number, number[]>();       // edge key -> [t0, k0, t1, k1, ...]
  const ekey = (a: number, b: number) => Math.min(a, b) * key.size + Math.max(a, b);
  for (let t = 0; t < m; t++) {
    for (let k = 0; k < 3; k++) {
      const ek = ekey(TT[3 * t + k], TT[3 * t + (k + 1) % 3]);
      let l = emap.get(ek);
      if (!l) { l = []; emap.set(ek, l); }
      l.push(t, k);
    }
  }
  const E = new Uint8Array(3 * m);
  const nk = key.size;
  const conv = new Int32Array(nk);
  const conc = new Uint8Array(nk), bound = new Uint8Array(nk);
  for (let t = 0; t < m; t++) {
    for (let k = 0; k < 3; k++) {
      const a = TT[3 * t + k], b = TT[3 * t + (k + 1) % 3];
      const l = emap.get(ekey(a, b))!;
      const nb: number[] = [];
      for (let j = 0; j < l.length; j += 2) if (l[j] !== t) nb.push(l[j]);
      if (nb.length !== 1) {
        E[3 * t + k] = EDGE_FLAT;
        bound[a] = bound[b] = 1;
        continue;
      }
      const u = nb[0];
      const d = dot3(N, 3 * t, N, 3 * u);
      const th = Math.acos(Math.min(Math.max(d, -1), 1));
      const code = edgeCode(th);
      let opp = -1;
      for (let j = 0; j < 3; j++) {
        const w = TT[3 * u + j];
        if (w !== a && w !== b) { opp = T[3 * u + j]; break; }
      }
      let side = 0.0;
      if (opp >= 0) {
        const t0 = T[3 * t];
        const dv = [0, 1, 2].map(i => V[3 * opp + i] - V[3 * t0 + i]);
        side = dot3(dv, 0, N, 3 * t);
      }
      const convex = code < EDGE_FLAT && side < 0;
      E[3 * t + k] = code | (convex ? EDGE_CONVEX : 0);
      if (convex) { conv[a]++; conv[b]++; }
      else if (code < EDGE_FLAT) conc[a] = conc[b] = 1;
    }
  }
  for (let t = 0; t < m; t++) {
    for (let k = 0; k < 3; k++) {
      const w = TT[3 * t + k];
      const corner = enableVertices && Math.floor(conv[w] / 2) >= 3 && !conc[w] && !bound[w];
      if (!corner) E[3 * t + k] |= EDGE_VERTEX_OFF;
    }
  }
  return E;
}

type KdNode = [number, number, ['node' | 'leaf', number] | null, ['node' | 'leaf', number] | null, number, number];

function kd(Pmin: Float64Array, Pmax: Float64Array, C: Float64Array, idx: number[], leafMax: number,
  nodes: KdNode[], leaves: number[][], parent: number): number | null {
  if (idx.length <= leafMax) return null;
  const ext = [0, 0, 0];
  for (let ax = 0; ax < 3; ax++) {
    let mn = C[3 * idx[0] + ax], mx = mn;
    for (let k = 1; k < idx.length; k++) { const x = C[3 * idx[k] + ax]; mn = npMin(mn, x); mx = npMax(mx, x); }
    ext[ax] = mx - mn;
  }
  if (Math.max(ext[0], ext[1], ext[2]) <= 0) return null;     // NaN: numpy's max is NaN, NaN <= 0 is false
  let axis = 0;
  for (let ax = 1; ax < 3; ax++) if (ext[ax] > ext[axis]) axis = ax;
  const order = idx.slice().sort((p, q) => C[3 * p + axis] - C[3 * q + axis]);   // stable (ES2019)
  const h = Math.floor(order.length / 2);
  const L = order.slice(0, h), R = order.slice(h);
  let lmax = Pmax[3 * L[0] + axis];
  for (const t of L) lmax = npMax(lmax, Pmax[3 * t + axis]);
  let rmin = Pmin[3 * R[0] + axis];
  for (const t of R) rmin = npMin(rmin, Pmin[3 * t + axis]);
  const me = nodes.length;
  nodes.push([parent, axis, null, null, lmax, rmin]);
  for (const [side, part] of [[2, L], [3, R]] as [2 | 3, number[]][]) {
    const sub = kd(Pmin, Pmax, C, part, leafMax, nodes, leaves, me);
    if (sub === null) {
      leaves.push(part);
      nodes[me][side] = ['leaf', leaves.length - 1];
    } else {
      nodes[me][side] = ['node', sub];
    }
  }
  return me;
}

export interface BuildMeshOptions {
  granularity?: number; leaf_max?: number; max_cluster_verts?: number;
  edges?: ArrayLike<number> | null;           // per input triangle, 3 bytes (before dropping)
  enable_vertices?: boolean;
}
export interface BuildMeshReport {
  triangles: number; dropped: number; clusters: number; branch_nodes: number; leaves: number; mode2: number;
}

/**
 * build_mesh: triangles (V float (n x 3), T int (m x 3)), per-triangle surface ids (u16, or -1 /
 * null = no field) -> clustered mesh + report. Degenerate triangles after quantisation are dropped.
 */
export function buildMesh(V: ArrayLike<number>, Tin: ArrayLike<number>, surface: ArrayLike<number> | null = null,
  o: BuildMeshOptions = {}): { mesh: ClusteredMesh; report: BuildMeshReport } {
  const g = Math.fround(o.granularity ?? 0.001);
  const leafMax = o.leaf_max ?? 8, maxVerts = o.max_cluster_verts ?? 255;
  const nv = V.length / 3, m0 = Tin.length / 3;
  const Q = new Float64Array(3 * nv);
  for (let k = 0; k < 3 * nv; k++) Q[k] = rint(V[k] / g);
  const Vq = new Float64Array(3 * nv);
  for (let k = 0; k < 3 * nv; k++) Vq[k] = Math.fround(Q[k] * g);
  const keep: number[] = [];
  for (let t = 0; t < m0; t++) {
    const a = Tin[3 * t], b = Tin[3 * t + 1], c = Tin[3 * t + 2];
    const e1 = [0, 1, 2].map(i => Vq[3 * b + i] - Vq[3 * a + i]);
    const e2 = [0, 1, 2].map(i => Vq[3 * c + i] - Vq[3 * a + i]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const area = Math.sqrt((n[0] * n[0] + n[1] * n[1]) + n[2] * n[2]);
    const eqv = (x: number, y: number) => Q[3 * x] === Q[3 * y] && Q[3 * x + 1] === Q[3 * y + 1] && Q[3 * x + 2] === Q[3 * y + 2];
    const same = eqv(a, b) || eqv(b, c) || eqv(a, c);
    if (area > 0 && !same) keep.push(t);
  }
  const m = keep.length;
  const T = new Int32Array(3 * m);
  const S = new Int32Array(m);
  keep.forEach((t, k) => {
    T.set([Tin[3 * t], Tin[3 * t + 1], Tin[3 * t + 2]], 3 * k);
    S[k] = surface === null ? -1 : surface[t];
  });
  let E: Uint8Array;
  if (o.edges == null) E = edgeBytes(Q, T, o.enable_vertices ?? false);
  else {
    E = new Uint8Array(3 * m);
    keep.forEach((t, k) => { for (let j = 0; j < 3; j++) E[3 * k + j] = o.edges![3 * t + j]; });
  }
  const Pmin = new Float64Array(3 * m), Pmax = new Float64Array(3 * m), C = new Float64Array(3 * m);
  for (let t = 0; t < m; t++) {
    for (let i = 0; i < 3; i++) {
      const x0 = Vq[3 * T[3 * t] + i], x1 = Vq[3 * T[3 * t + 1] + i], x2 = Vq[3 * T[3 * t + 2] + i];
      Pmin[3 * t + i] = npMin(npMin(x0, x1), x2);
      Pmax[3 * t + i] = npMax(npMax(x0, x1), x2);
      C[3 * t + i] = ((x0 + x1) + x2) / 3;
    }
  }
  const nodes: KdNode[] = [];
  let leaves: number[][] = [];
  const all = Array.from({ length: m }, (_, k) => k);
  const root = kd(Pmin, Pmax, C, all, leafMax, nodes, leaves, 0);
  if (root === null) leaves = [all];
  const clusters: [number[], Map<number, number>][] = [];
  const leafIds: [number, number][] = [];
  let curUnits: number[] = [], curVmap = new Map<number, number>(), curBytes = 0;
  let curLo: number[] | null = null, curHi: number[] | null = null;
  const flush = () => { if (curUnits.length) clusters.push([curUnits.slice(), new Map(curVmap)]); };
  const ubytes = (t: number) => (S[t] >= 0 ? 9 : 7);
  for (const lf of leaves) {
    const need = new Set<number>();
    for (const t of lf) for (let j = 0; j < 3; j++) { const v = T[3 * t + j]; if (!curVmap.has(v)) need.add(v); }
    let lbytes = 0;
    for (const t of lf) lbytes += ubytes(t);
    let lqMin: number[] | null = null, lqMax: number[] | null = null;
    if (need.size) {
      const nl = [...need];
      lqMin = [0, 1, 2].map(i => Math.min(...nl.map(v => Q[3 * v + i])));
      lqMax = [0, 1, 2].map(i => Math.max(...nl.map(v => Q[3 * v + i])));
    }
    let span = false;
    if (curUnits.length && lqMin) {
      const lo_ = [0, 1, 2].map(i => Math.min(curLo![i], lqMin![i])), hi_ = [0, 1, 2].map(i => Math.max(curHi![i], lqMax![i]));
      span = Math.max(...[0, 1, 2].map(i => hi_[i] - lo_[i])) > 0xFFFE &&
        Math.max(...[0, 1, 2].map(i => curHi![i] - curLo![i])) <= 0xFFFE;
    }
    if (curUnits.length && (curVmap.size + need.size > maxVerts || curBytes + lbytes > 0xFFFF || span)) {
      flush();
      curUnits = []; curVmap = new Map(); curBytes = 0;
    }
    if (lqMin) {
      if (!curVmap.size) { curLo = lqMin.slice(); curHi = lqMax!.slice(); }
      curLo = [0, 1, 2].map(i => Math.min(curLo![i], lqMin![i]));
      curHi = [0, 1, 2].map(i => Math.max(curHi![i], lqMax![i]));
    }
    leafIds.push([lf.length, (clusters.length * 65536 + curBytes) >>> 0]);
    for (const t of lf) {
      for (let j = 0; j < 3; j++) { const v = T[3 * t + j]; if (!curVmap.has(v)) curVmap.set(v, curVmap.size); }
      curUnits.push(t);
      curBytes += ubytes(t);
    }
    if (curVmap.size > maxVerts) throw new Error('a single leaf needs more than 255 vertices');
  }
  flush();
  const outClusters: Cluster[] = [];
  for (const [units, vmap] of clusters) {
    const verts = [...vmap.keys()].map(v => [Q[3 * v], Q[3 * v + 1], Q[3 * v + 2]]);   // insertion order == value order
    const lo = [0, 1, 2].map(i => Math.min(...verts.map(q => q[i])) - 1);
    const hi = [0, 1, 2].map(i => Math.max(...verts.map(q => q[i])));
    let mode: number, off: V3 | null, q: number[][];
    if (Math.max(...[0, 1, 2].map(i => hi[i] - lo[i])) <= 0xFFFF) {
      mode = 1; off = lo as V3; q = verts.map(r => r.map((x, i) => x - lo[i]));
    } else {
      mode = 2; off = null; q = verts;
    }
    const us: Unit[] = units.map(t => {
      const s = S[t];
      const f = 0x21 | (s >= 0 ? co.UNIT_SURFACE : 0);
      return [f, [0, 1, 2].map(j => vmap.get(T[3 * t + j])!), [E[3 * t], E[3 * t + 1], E[3 * t + 2]], s >= 0 ? s : null];
    });
    outClusters.push({ vertex_mode: mode, offset: off, qverts: q, units: us, normal_count: 0 });
  }
  const outNodes: Node[] = nodes.map(([p, ax, a, b, e0, e1]) => ({
    parent: p, axis: ax,
    children: [a!, b!].map(([kind, k]) => (kind === 'node' ? [co.BRANCH, k] : leafIds[k])) as Node['children'],
    extents: [e0, e1],
  }));
  const bmin: V3 = [Infinity, Infinity, Infinity], bmax: V3 = [-Infinity, -Infinity, -Infinity];
  if (m) {
    for (let i = 0; i < 3; i++) { bmin[i] = Vq[3 * T[0] + i]; bmax[i] = bmin[i]; }
    for (let k = 0; k < 3 * m; k++) {
      for (let i = 0; i < 3; i++) { bmin[i] = npMin(bmin[i], Vq[3 * T[k] + i]); bmax[i] = npMax(bmax[i], Vq[3 * T[k] + i]); }
    }
  }
  const bb: [V3, V3] = [bmin, bmax];
  const mesh: ClusteredMesh = { bbox: bb, max_leaf: null, granularity: g, flags: MESH_FLAGS, tree_bbox: bb,
    nodes: outNodes, clusters: outClusters, node_ptr: 0x90, n_entries: m };
  const report: BuildMeshReport = { triangles: m, dropped: m0 - m, clusters: outClusters.length,
    branch_nodes: outNodes.length, leaves: leaves.length, mode2: outClusters.filter(c => c.vertex_mode === 2).length };
  return { mesh, report };
}

// =============================================================================================
// Tile arena builder (object order and links of a retail tile collision arena)
export const INSTANCE_KIND = 0xACB31C9A;
export const IMPORT_TYPES = [0xeb0066, 0xeb0005, 0xeb0067, 0xeb0006, 0xeb0001, 0xeb000a, 0xeb0065, 0xeb0007,
  0xeb0069, 0xeb000d, 0xeb006b, 0xeb0019, 0xeb0064, 0xeb0004, 0xeb0068, 0xeb0009,
  0xeb0016, 0xeb0013, 0xeb0014, 0xeb0018, 0xeb0017, 0xeb0020, 0xeb0024, 0xeb0026, 0xeb0027];
export const IDENTITY = [1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0];
const ALL64 = 0xFFFFFFFFFFFFFFFFn;

export interface TileArenaOptions {
  spline_set?: SplineSet | null;
  splines_id?: bigint;
  imports?: [bigint, number, number][];
  instance_ids?: bigint[] | null;
}

/** build_tile_arena -> { arena bytes, spec } */
export function buildTileArena(mesh: ClusteredMesh, arenaId: number, name: string, exportId: bigint,
  o: TileArenaOptions = {}): { arena: Uint8Array; spec: Spec } {
  const ids = o.instance_ids ?? [exportId, ALL64, ALL64, ALL64];
  const inst: InstanceList = { kind: INSTANCE_KIND, instances: [{ matrix: IDENTITY, bbox: mesh.bbox, ids, flags: 4,
    strings: [name, 'undefined', 'undefined', 'undefined'] }] };
  const objs: SpecObject[] = [
    { typeId: co.T_HDR, align: 16, data: ARENA_WORDS },
    { typeId: co.T_INSTANCE, align: 16, data: encodeInstances(inst) },
    { typeId: co.T_VOLUME, align: 16, data: encodeVolume({
      matrix: [1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 0], vtype: 6, geometry: 3, tail: [0, 0, 0, 0, 0xFFFFFFFF, 1] }) },
    { typeId: co.T_MESH, align: 16, data: encodeMesh(mesh) },
    { typeId: co.T_MESHREF, align: 16, data: encodeModel({ bounding: 0, volumes: [2] }) }];
  const subrefs: [number, number][] = [[1, 0x20]];
  const rows: [bigint, number, number][] = [...(o.imports ?? []), [exportId, co.T_INSTANCE, 1]];
  const ss = o.spline_set;
  if (ss && ss.splines.length) {
    const k = objs.length;
    objs.push({ typeId: T_SPLINES, align: 16, data: encodeSplines(ss) });
    subrefs.push(...splineSubrefs(k, ss));
    rows.push([o.splines_id ?? 0n, T_SPLINES, k]);
  }
  objs.push({ typeId: co.T_IMPORTS, align: 16, data: encodeImports({ entries: rows, types: IMPORT_TYPES }) });
  const spec: Spec = { arenaId, objects: objs, subrefs };
  return { arena: buildArena(spec), spec };
}
