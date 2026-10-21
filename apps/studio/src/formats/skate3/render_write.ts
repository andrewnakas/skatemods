// SPDX-License-Identifier: GPL-3.0-or-later
// Skate 3 render-arena writer: port of skate4to3 sk3/render_write.py (encoders for every cPres
// object type + build_render_arena, the builder that makes a whole render arena from mesh parts).
// Output is byte-identical to the Python for identical inputs (test/sk3_render_write.test.ts).
// Not ported: objects_from_render / rebuild (they need the render decoder).
import * as R from './render.ts';
import type { Decl } from './render.ts';
import { BE, align, concat, f32s, halfBits, hex16, latin1, npMax, npMin, rint, u32s, wrap16 } from './num_util.ts';
import { buildArena } from './rw4_write.ts';
import type { SpecObject } from './rw4_write.ts';

/** NUL-terminated strings, deduplicated in first-use order. */
class Pool {
  base: number;
  parts: Uint8Array[] = [];
  len = 0;
  at = new Map<string, number>();
  constructor(base: number) { this.base = base; }
  add(s: string): number {
    let o = this.at.get(s);
    if (o === undefined) {
      o = this.base + this.len;
      this.at.set(s, o);
      const b = concat([latin1(s), new Uint8Array(1)]);
      this.parts.push(b);
      this.len += b.length;
    }
    return o;
  }
  bytes(): Uint8Array { return concat(this.parts); }
}

// ---------------------------------------------------------------- object dicts (as render.py decodes them)

export interface VbDict { head: number[]; resource: number; fetch_type: number; size: number; w9: number }
export interface IbDict { head: number[]; resource: number; size: number; count: number }
export interface BindDict { w0: number; w1: number; ib: number; vb: number }
export interface Prim { type: number; base_vertex: number; start: number; count: number }
export interface MeshDict {
  bbox: number[]; w8: number; material: number; decl: number; bind: number; ib: number; vb: number;
  extra_ref: number; bounds_ref: number; prim_off: number; w18: number; pad: number[]; prims: Prim[]; tail: number;
}
export interface ModelDict {
  bbox: number[]; matrix: number[]; meshes: number[]; mesh_pad: number[]; name: string; n_meshes2: number;
  w13hi: number; n_bounds: number;
  bounds: ArrayLike<number>;      // (ceil4(n_bounds), 8) row-major floats
  extra: ArrayLike<number>;       // (ceil4(n_bounds), 4)
}
export interface InstRecord {
  matrix: number[]; bbox: number[]; guid: bigint; links: number[]; model: number; t1: number; t2: number;
  strings: string[]; t7: number;
}
export interface InstDict { hash: number; w2: number; head_pad: number[]; records: InstRecord[] }
export interface ArrayDict { rec_off: number; fill: number[] }
export interface ExportEntry { name: string | null; hash: number; guid: bigint; type: number; value: number }
export interface ExportsDict { entries: ExportEntry[]; index: unknown[]; string_pad?: Uint8Array }
export interface MatParam {
  name: string; type: number; fill: readonly number[];
  guid?: bigint; value?: string; z?: number;        // type 0xFFFF
  raw?: number[];                                  // otherwise: 4 words
}
export interface Material { params: MatParam[]; z: number }
export interface MaterialsDict { materials: Material[]; tail?: number }

// ---------------------------------------------------------------- small objects

export function encDecl(d: Decl): Uint8Array {
  const els = d.elements;
  let mask = 0;
  for (const e of els) mask = (mask | (2 ** e.id)) >>> 0;
  const stride = R.declStride(d);
  const parts = [u32s(d.w0, mask, (els.length << 16 | d.w2lo) >>> 0, d.w3)];
  for (const e of els) {
    parts.push(u32s((e.stream << 16 | e.offset) >>> 0, e.type,
      (e.method << 24 | e.usage << 16 | e.usage_index << 8 | e.id) >>> 0, e.w3));
  }
  parts.push(new Uint8Array(els.length).fill(stride));
  return concat(parts);
}

export const VB_HEAD = [1, 1, 0, 0, 0, 0xFFFF0000];
export const IB_HEAD = [0x20000002, 1, 0, 0, 0, 0xFFFF0000];

export function encVb(d: VbDict): Uint8Array {
  return u32s(...d.head, (d.resource << 2 | d.fetch_type) >>> 0, (0x10000000 | d.size | 2) >>> 0, d.size, d.w9);
}

export function encIb(d: IbDict): Uint8Array {
  return u32s(...d.head, d.resource, d.size, d.count);
}

export function encBind(d: BindDict): Uint8Array {
  return u32s(d.w0, d.w1, d.ib, d.vb);
}

export function encMesh(d: MeshDict): Uint8Array {
  const n = d.prims.length;
  const parts = [f32s(...d.bbox), u32s(d.w8, d.material, d.decl, d.bind, d.ib, d.vb, n, d.extra_ref, d.bounds_ref,
    d.prim_off, d.w18, d.prim_off + 16 * n, ...d.pad)];
  for (const p of d.prims) parts.push(u32s(p.type, p.base_vertex, p.start, p.count));
  parts.push(u32s(d.tail));
  return concat(parts);
}

export function encModel(d: ModelDict): Uint8Array {
  const n = d.meshes.length;
  const nb = d.n_bounds;
  const nbp = Math.floor((nb + 3) / 4) * 4;
  const matAt = 0x40, listAt = 0x80;
  const ptrAt = listAt + 8 * n;
  const nameAt = ptrAt + 4;
  const name = concat([latin1(d.name), new Uint8Array(1)]);
  const boundsAt = align(nameAt + name.length, 16);
  const extraAt = boundsAt + 32 * nbp;
  const o = new BE(extraAt + 16 * nbp);
  o.f32(0, ...d.bbox);
  o.u32(0x20, matAt, listAt, ptrAt, nameAt, n << 16 | d.n_meshes2, d.w13hi << 16 | nb, boundsAt, extraAt);
  o.f32(matAt, ...d.matrix);
  for (let k = 0; k < n; k++) o.u32(listAt + 8 * k, d.meshes[k], d.mesh_pad[k]);
  o.u32(ptrAt, nameAt);
  o.set(nameAt, name);
  for (let k = 0; k < 8 * nbp; k++) o.f32(boundsAt + 4 * k, d.bounds[k]);
  for (let k = 0; k < 4 * nbp; k++) o.f32(extraAt + 4 * k, d.extra[k]);
  return o.b;
}

export function encInst(d: InstDict): Uint8Array {
  const recs = d.records;
  const pool = new Pool(0x20 + 0xA0 * recs.length);
  const parts = [u32s(d.hash, recs.length, d.w2, 0x20, pool.base, ...d.head_pad)];
  for (const r of recs) {
    const offs = r.strings.map(s => pool.add(s));
    const g = new BE(8);
    g.u64(0, r.guid);
    parts.push(f32s(...r.matrix), f32s(...r.bbox), g.b, u32s(...r.links), u32s(r.model, r.t1, r.t2, ...offs, r.t7));
  }
  parts.push(pool.bytes());
  return concat(parts);
}

export function encVersion(d: { words: number[] }): Uint8Array {
  return u32s(...d.words);
}

function encArray(d: ArrayDict, count: number, rec: Uint8Array): Uint8Array {
  const head = u32s(count, d.rec_off, ...d.fill);
  return concat([head, new Uint8Array(d.rec_off - head.length), rec]);
}

/** eb0024 light probes: records (n, 40) floats */
export function encProbes(d: ArrayDict & { records: number[][] }): Uint8Array {
  return encArray(d, d.records.length, f32s(...d.records.flat()));
}

export interface QuadRecord { points: number[][]; axis: number[]; guid: bigint; w: number; tag: number }
/** eb0016 quads: 112-byte records (5 x vec4 points, vec4 axis, u64 guid, u32 w, u32 tag) */
export function encQuads(d: ArrayDict & { records: QuadRecord[] }): Uint8Array {
  const o = new BE(112 * d.records.length);
  d.records.forEach((r, k) => {
    const b = 112 * k;
    o.f32(b, ...r.points.flat());
    o.f32(b + 80, ...r.axis);
    o.u64(b + 96, r.guid);
    o.u32(b + 104, r.w, r.tag);
  });
  return encArray(d, d.records.length, o.b);
}

/** eb0028: records (n, 4) u64 */
export function encGuidQuads(d: ArrayDict & { records: bigint[][] }): Uint8Array {
  const o = new BE(32 * d.records.length);
  d.records.forEach((r, k) => o.u64(32 * k, ...r));
  return encArray(d, d.records.length, o.b);
}

/** eb0025: bbox + (n, 4, 4) points */
export function encPolys(d: ArrayDict & { bbox: number[]; points: number[][][] }): Uint8Array {
  return concat([f32s(...d.bbox), u32s(d.points.length, d.rec_off, ...d.fill), f32s(...d.points.flat(2))]);
}

// the per-type index after an export table (see render_write.py)
export const INDEX_TYPES = [0xeb0066, 0xeb0005, 0xeb0067, 0xeb0006, 0xeb0001, 0xeb000a, 0xeb0065, 0xeb0007,
  0xeb0069, 0xeb000d, 0xeb006b, 0xeb0019, 0xeb0064, 0xeb0004, 0xeb0068, 0xeb0009,
  0xeb0016, 0xeb0013, 0xeb0014, 0xeb0018, 0xeb0017, 0xeb0020, 0xeb0024, 0xeb0026, 0xeb0027];

export function exportIndex(entries: ExportEntry[]): [number, number][] {
  const n = entries.length;
  const n66 = entries.filter(e => e.type === 0xeb0066).length;
  const has05 = entries.some(e => e.type === 0xeb0005);
  const first = n66 ? 0 : n;
  const second = has05 ? n66 : n;
  return INDEX_TYPES.map((t, k) => [t, k === 0 ? first : k === 1 ? second : n]);
}

export function encExports(d: ExportsDict): Uint8Array {
  const ents = d.entries;
  const tab = 0x14;
  const tabEnd = tab + 24 * ents.length;
  const pool = new Pool(tabEnd);
  const rows = new BE(24 * ents.length);
  ents.forEach((e, k) => {
    rows.u32(24 * k, e.name !== null ? pool.add(e.name) : 0, e.hash);
    rows.u64(24 * k + 8, e.guid);
    rows.u32(24 * k + 16, e.type, e.value);
  });
  const strings = pool.bytes();
  const hasIndex = d.index.length > 0;
  const pairsAt = align(tabEnd + strings.length, 4);
  const index = hasIndex ? exportIndex(ents) : [];
  const head = u32s(ents.length, tab, tabEnd, index.length, pairsAt);
  const pad = d.string_pad ?? new Uint8Array(0);
  const bodyLen = head.length + rows.b.length + strings.length;
  return concat([head, rows.b, strings, pad, new Uint8Array(Math.max(0, pairsAt - bodyLen - pad.length)),
    ...index.map(([t, v]) => u32s(t, v))]);
}

export function encMaterials(d: MaterialsDict): Uint8Array {
  const mats = d.materials;
  const cnt = mats.length;
  const total = mats.reduce((a, m) => a + m.params.length, 0);
  const tab = 0x14;
  const par = align(tab + 12 * cnt, 16);
  const strs = par + 32 * total;
  const pool = new Pool(strs);
  const head: Uint8Array[] = [], rows: Uint8Array[] = [];
  let off = par;
  for (const m of mats) {
    head.push(u32s(m.params.length, m.z, off));
    off += 32 * m.params.length;
    for (const p of m.params) {
      const no = pool.add(p.name);
      let val: Uint8Array;
      if (p.type === 0xFFFF) {
        const v = new BE(16);
        v.u64(0, p.guid!);
        v.u32(8, pool.add(p.value!), p.z!);
        val = v.b;
      } else {
        val = u32s(...p.raw!);
      }
      rows.push(u32s(no, p.type, ...p.fill), val);
    }
  }
  const out = concat([u32s(cnt, total, tab, par, strs), ...head]);
  return concat([out, new Uint8Array(par - out.length), ...rows, pool.bytes(), new Uint8Array(d.tail ?? 0)]);
}

// ---------------------------------------------------------------- vertex / index data

/** Semantic vertex attributes (render.vertex_semantics layout), row-major float64. */
export interface Semantics {
  n: number;
  position: Float64Array;         // n x 3
  uv0?: Float64Array;             // n x 2
  uv1?: Float64Array;
  uv2?: Float64Array;
  uv3?: Float64Array;
  normal?: Float64Array;          // n x 3
  tangent?: Float64Array;         // n x 3
  binormal_sign?: Int8Array;      // n (+-1)
  raw?: Record<number, ArrayLike<number>>;   // 'el<id>' arrays: on-disk values, n x count
}

/** pack_111110: (n,3) in [-1, 1] -> u32 (x 11 bits low, y 11, z 10) */
export function pack111110(x: number, y: number, z: number): number {
  const q0 = rint(x * 1023), q1 = rint(y * 1023), q2 = rint(z * 511);
  return ((q0 & 0x7FF) | ((q1 & 0x7FF) << 11) | ((q2 & 0x3FF) << 22)) >>> 0;
}

const sn16 = (v: number) => rint(v * 32767);

function writeComp(dv: DataView, at: number, kind: R.ElKind, v: number) {
  switch (kind) {
    case 'f4': dv.setFloat32(at, v); break;
    case 'f2': dv.setUint16(at, halfBits(v)); break;
    case 'i2': dv.setInt16(at, wrap16(v)); break;
    case 'u4': dv.setUint32(at, v >>> 0); break;
    case 'u1': dv.setUint8(at, v & 0xFF); break;
  }
}

/** pack_vertices: semantics -> interleaved vertex bytes for decl */
export function packVertices(sem: Semantics, decl: Decl): Uint8Array {
  const n = sem.n;
  const stride = R.declStride(decl);
  const out = new Uint8Array(n * stride);
  const dv = new DataView(out.buffer);
  for (const e of decl.elements) {
    const [kind, cnt, sz] = R.FMT[e.type];
    const i = e.id;
    const put = (v: number, c: number, val: number) => writeComp(dv, v * stride + e.offset + c * sz, kind, val);
    if (i === R.EL_POSITION) {
      const p = sem.position;
      for (let v = 0; v < n; v++) for (let c = 0; c < cnt; c++) put(v, c, p[3 * v + c]);
    } else if (i === R.EL_TANGENT) {
      const t = sem.tangent!;
      for (let v = 0; v < n; v++) dv.setUint32(v * stride + e.offset, pack111110(t[3 * v], t[3 * v + 1], t[3 * v + 2]));
    } else if (i === R.EL_TEX1 && kind === 'i2' && cnt === 4) {
      const uv = sem.uv1!, nr = sem.normal!, bs = sem.binormal_sign!;
      for (let v = 0; v < n; v++) {
        const nzNeg = nr[3 * v + 2] < 0 || Object.is(nr[3 * v + 2], -0);
        put(v, 0, sn16(uv[2 * v]) * bs[v]);
        put(v, 1, sn16(uv[2 * v + 1]) * (nzNeg ? -1 : 1));
        put(v, 2, sn16(nr[3 * v]));
        put(v, 3, sn16(nr[3 * v + 1]));
      }
    } else if (i in R.UV_NAMES) {
      const a = (sem as unknown as Record<string, Float64Array>)[R.UV_NAMES[i]];
      const x = cnt === 4 ? (sem as unknown as Record<string, Float64Array>)[R.UV_EXTRA[i]] : undefined;
      for (let v = 0; v < n; v++) {
        for (let c = 0; c < cnt; c++) {
          const val = c < 2 ? a[2 * v + c] : x![2 * v + c - 2];
          put(v, c, kind === 'i2' ? sn16(val) : val);
        }
      }
    } else {
      const a = sem.raw![i];
      for (let v = 0; v < n; v++) for (let c = 0; c < cnt; c++) put(v, c, a[cnt * v + c]);
    }
  }
  return out;
}

/** pack_indices: '>u2' indices padded to 16 bytes */
export function packIndices(idx: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(align(2 * idx.length, 16));
  const dv = new DataView(out.buffer);
  for (let k = 0; k < idx.length; k++) dv.setUint16(2 * k, idx[k] & 0xFFFF);
  return out;
}

// ---------------------------------------------------------------- builder

type DeclRow = [number, number, number, number];
const _POS: DeclRow = [0x002A23B9, 0, 0, R.EL_POSITION];
const _UV0: DeclRow = [0x002C235F, 5, 0, R.EL_TEX0];
const _UV0_UV2: DeclRow = [0x001A2360, 5, 0, R.EL_TEX0];
const _LM_NRM: DeclRow = [0x001A215A, 5, 1, R.EL_TEX1];
const _LM: DeclRow = [0x002C2159, 5, 1, R.EL_TEX1];
const _TAN: DeclRow = [0x002A2190, 6, 0, R.EL_TANGENT];
export const DECL_BY_SHADER: Record<string, DeclRow[]> = {
  'environmentsimple.default': [_POS, _UV0, _LM_NRM, _TAN],
  'environment.default': [_POS, _UV0, _LM_NRM, _TAN],
  'environment.decal': [_POS, _UV0_UV2, _LM_NRM, _TAN],
  'environment.decal_tileable': [_POS, _UV0_UV2, _LM_NRM, _TAN],
  'environment.transparent': [_POS, _UV0, _LM_NRM],
  'advertisement.default': [_POS, _UV0, _LM_NRM],
  'environmentsimple.diffuse': [_POS, _UV0, _LM],
  'incandescent.default': [_POS, _UV0, _LM],
  'incandescent.backlituvscroll': [_POS, _UV0, _LM],
  'incandescent.videoscreen': [_POS, _UV0, _LM],
};
export const PARAMS_BY_SHADER: Record<string, string[]> = {
  'environmentsimple.default': ['lightmap', 'specular', 'diffuse', 'normal'],
  'environmentsimple.diffuse': ['lightmap', 'diffuse'],
  'environment.default': ['lightmap', 'detailNormalUVScale', 'specular', 'diffuse', 'macroOverlayOpacity',
    'detail', 'macrooverlay', 'normal', 'macroOverlayUVScale'],
  'environment.transparent': ['lightmap', 'transparent', 'specular', 'diffuse'],
  'advertisement.default': ['lightmap', 'diffuse'],
  'incandescent.default': ['exposure', 'diffuse'],
  'incandescent.backlituvscroll': ['uAnimationSpeed', 'lightmap', 'vAnimationSpeed', 'diffuse'],
  'incandescent.videoscreen': ['diffuse'],
  'environment.decal': ['environment', 'lightmap', 'detailNormalUVScale', 'decal', 'specular', 'diffuse',
    'macroOverlayOpacity', 'detail', 'embeddedDecal', 'macrooverlay', 'normal', 'macroOverlayUVScale'],
  'dynamicobject.default': ['detailNormalUVScale', 'gamePlayDesignate', 'specular', 'diffuse', 'detail', 'normal'],
};
PARAMS_BY_SHADER['environment.decal_tileable'] = PARAMS_BY_SHADER['environment.decal'];
export const FLOAT_DEFAULTS: Record<string, number> = {
  detailNormalUVScale: 8.0, macroOverlayOpacity: 1.0, macroOverlayUVScale: 0.3,
  exposure: 10.0, embeddedDecal: 1.0, gamePlayDesignate: 0.0, uAnimationSpeed: -0.25, vAnimationSpeed: 0.0,
};
export const INST_HASH = 0xACB31C9A;
export const NO_HASH = 0xFEFFFFFF;
export const FILL = [0xDEADBEEF, 0xDEADC0DE] as const;
export const MODEL_MATRIX = [1.0, -0.0, 0.0, -0.0, -0.0, 1.0, -0.0, 0.0, 0.0, -0.0, 1.0, -0.0, -0.0, 0.0, -0.0, 1.0];
export const IDENTITY = [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0];

/** Deterministic 64-bit id (FNV-1a over '|'.join(str(p))). Pass ints as number/bigint, not floats. */
export function guid64(...parts: (string | number | bigint)[]): bigint {
  let h = 0xCBF29CE484222325n;
  for (const b of new TextEncoder().encode(parts.map(p => String(p)).join('|'))) {
    h = ((h ^ BigInt(b)) * 0x100000001B3n) & 0xFFFFFFFFFFFFFFFFn;
  }
  return h;
}

export function makeDecl(shader: string): Decl {
  const els = [];
  let off = 0;
  for (const [ty, usage, ui, i] of DECL_BY_SHADER[shader]) {
    els.push({ stream: 0, offset: off, type: ty, method: 0, usage, usage_index: ui, id: i, w3: 1 });
    const [, n, sz] = R.FMT[ty];
    off += sz * n;
  }
  return { w0: 0, w2lo: 1, w3: 0, elements: els };
}

/** tangent_frame: per-vertex tangent (n x 3) and binormal sign (n), float64 exactly as numpy. */
export function tangentFrame(pos: Float64Array, nrm: Float64Array, uv: Float64Array, tri: ArrayLike<number>):
  { t: Float64Array; sign: Int8Array } {
  const n = pos.length / 3, m = tri.length / 3;
  const T = new Float64Array(3 * m), B = new Float64Array(3 * m);
  for (let r = 0; r < m; r++) {
    const a = tri[3 * r], b = tri[3 * r + 1], c = tri[3 * r + 2];
    const d1u = uv[2 * b] - uv[2 * a], d1v = uv[2 * b + 1] - uv[2 * a + 1];
    const d2u = uv[2 * c] - uv[2 * a], d2v = uv[2 * c + 1] - uv[2 * a + 1];
    let rr = d1u * d2v - d2u * d1v;
    if (Math.abs(rr) < 1e-12) rr = 1e-12;
    for (let k = 0; k < 3; k++) {
      const e1 = pos[3 * b + k] - pos[3 * a + k], e2 = pos[3 * c + k] - pos[3 * a + k];
      T[3 * r + k] = (e1 * d2v - e2 * d1v) / rr;
      B[3 * r + k] = (e2 * d1u - e1 * d2u) / rr;
    }
  }
  const t = new Float64Array(3 * n), bb = new Float64Array(3 * n);
  for (let k = 0; k < 3; k++) {                 // np.add.at(t, tri[:, k], T) for k = 0, 1, 2
    for (let r = 0; r < m; r++) {
      const v = tri[3 * r + k];
      for (let c = 0; c < 3; c++) { t[3 * v + c] += T[3 * r + c]; bb[3 * v + c] += B[3 * r + c]; }
    }
  }
  const ln = new Float64Array(n);
  let anyBad = false;
  for (let v = 0; v < n; v++) {
    const s = (t[3 * v] * nrm[3 * v] + t[3 * v + 1] * nrm[3 * v + 1]) + t[3 * v + 2] * nrm[3 * v + 2];
    for (let c = 0; c < 3; c++) t[3 * v + c] -= nrm[3 * v + c] * s;
    ln[v] = Math.sqrt((t[3 * v] * t[3 * v] + t[3 * v + 1] * t[3 * v + 1]) + t[3 * v + 2] * t[3 * v + 2]);
    if (ln[v] < 1e-9) anyBad = true;
  }
  if (anyBad) {
    for (let v = 0; v < n; v++) {
      if (!(ln[v] < 1e-9)) continue;
      const alt = Math.abs(nrm[3 * v]) < 0.9 ? [1.0, 0, 0] : [0, 0, 1.0];
      const s = (alt[0] * nrm[3 * v] + alt[1] * nrm[3 * v + 1]) + alt[2] * nrm[3 * v + 2];
      for (let c = 0; c < 3; c++) t[3 * v + c] = alt[c] - nrm[3 * v + c] * s;
      ln[v] = Math.sqrt((t[3 * v] * t[3 * v] + t[3 * v + 1] * t[3 * v + 1]) + t[3 * v + 2] * t[3 * v + 2]);
    }
  }
  const sign = new Int8Array(n);
  for (let v = 0; v < n; v++) {
    for (let c = 0; c < 3; c++) t[3 * v + c] = t[3 * v + c] / ln[v];
    const n0 = nrm[3 * v], n1 = nrm[3 * v + 1], n2 = nrm[3 * v + 2];
    const t0 = t[3 * v], t1 = t[3 * v + 1], t2 = t[3 * v + 2];
    const c0 = n1 * t2 - n2 * t1, c1 = n2 * t0 - n0 * t2, c2 = n0 * t1 - n1 * t0;
    const h = (c0 * bb[3 * v] + c1 * bb[3 * v + 1]) + c2 * bb[3 * v + 2];
    sign[v] = h > 0 ? -1 : 1;
  }
  return { t, sign };
}

export interface PartMaterial {
  name?: string;
  shader?: string;
  textures?: Record<string, bigint>;        // param -> texture guid
  floats?: Record<string, number>;
  texture_names?: Record<string, string>;
  guid?: bigint;
  params?: string[];                         // param order (default: PARAMS_BY_SHADER[shader])
}

/** One render part: world-space positions etc, row-major float64 / int arrays. */
export interface RenderPart {
  positions: ArrayLike<number>;   // n x 3
  normals?: ArrayLike<number>;    // n x 3 (needed by shaders with a tangent / SHORT4N lightmap)
  uv0: ArrayLike<number>;         // n x 2
  uv1?: ArrayLike<number>;        // n x 2 lightmap uv (clipped to [0, 1]); default 0
  uv2?: ArrayLike<number>;        // n x 2 (decal shaders); default uv0
  indices: ArrayLike<number>;     // m x 3
  material: PartMaterial;
}

function material(m: PartMaterial, mi: number): [Material, string] {
  const shader = m.shader ?? 'environmentsimple.default';
  const name = m.name ?? `mat${mi}`;
  const tex = m.textures ?? {};
  const fl: Record<string, number> = { ...FLOAT_DEFAULTS, ...(m.floats ?? {}) };
  const texNames = m.texture_names ?? {};
  const params: MatParam[] = [
    { name: 'Name', type: 0xFFFF, fill: FILL, guid: m.guid ?? guid64('mat', name), value: name, z: 0 },
    { name: 'AttribulatorMaterialName', type: 0xFFFF, fill: FILL, guid: 0n, value: shader, z: 0 }];
  for (const pn of m.params ?? PARAMS_BY_SHADER[shader]) {
    if (pn in fl) {
      const b = new DataView(new ArrayBuffer(4));
      b.setFloat32(0, fl[pn]);
      params.push({ name: pn, type: 0x20000, fill: FILL, raw: [b.getUint32(0), 0, 0, 0] });
    } else {
      const g = tex[pn];
      if (g === undefined) throw new Error(`material ${name}: no texture for ${pn}`);
      params.push({ name: pn, type: 0xFFFF, fill: FILL, guid: g, value: `${texNames[pn] ?? pn}_0x${hex16(g)}`, z: 0 });
    }
  }
  return [{ params, z: 0 }, shader];
}

function meshSemantics(p: RenderPart, decl: Decl): { sem: Semantics; tri: Int32Array } {
  const pos = Float64Array.from(p.positions);
  const n = pos.length / 3;
  const tri = Int32Array.from(p.indices);
  const ids = new Map(decl.elements.map(e => [e.id, R.FMT[e.type]] as const));
  const uv0 = Float64Array.from(p.uv0);
  const sem: Semantics = { n, position: pos, uv0 };
  if (ids.get(R.EL_TEX0)![1] === 4) sem.uv2 = Float64Array.from(p.uv2 ?? uv0);
  if (ids.has(R.EL_TEX1)) {
    const uv1 = p.uv1 ? Float64Array.from(p.uv1) : new Float64Array(2 * n);
    for (let k = 0; k < uv1.length; k++) uv1[k] = Math.min(Math.max(uv1[k], 0), 1);
    sem.uv1 = uv1;
  }
  if (ids.has(R.EL_TANGENT) || (ids.has(R.EL_TEX1) && ids.get(R.EL_TEX1)![1] === 4)) {
    const nrm = Float64Array.from(p.normals!);
    for (let v = 0; v < n; v++) {
      const l = Math.sqrt((nrm[3 * v] * nrm[3 * v] + nrm[3 * v + 1] * nrm[3 * v + 1]) + nrm[3 * v + 2] * nrm[3 * v + 2]);
      for (let c = 0; c < 3; c++) nrm[3 * v + c] = nrm[3 * v + c] / l;
    }
    const { t, sign } = tangentFrame(pos, nrm, uv0, tri);
    sem.normal = nrm;
    sem.binormal_sign = sign;
    sem.tangent = t;
  }
  return { sem, tri };
}

/** build_render_arena: parts -> one cPres render arena laid out like retail (see render_write.py). */
export function buildRenderArena(parts: RenderPart[], arenaId: number, name = 'Model'): Uint8Array {
  const ms = parts.map((p, k) => material(p.material, k));
  const mats = ms.map(x => x[0]), shaders = ms.map(x => x[1]);
  const n = parts.length;
  const modelIndex = 3 + 7 * n;
  const spec: (SpecObject | null)[] = [
    { typeId: R.T_VER, align: 0x10, data: encVersion({ words: [0x19, 0x0D, 0, 0] }) },
    { typeId: R.T_MATS, align: 0x10, data: encMaterials({ materials: mats, tail: 0 }) },
    null];
  const meshIdx: number[] = [], refs: [string, number][] = [];
  const bounds: number[][] = [], extra: number[][] = [];
  const loAll = [Infinity, Infinity, Infinity], hiAll = [-Infinity, -Infinity, -Infinity];
  parts.forEach((p, k) => {
    const decl = makeDecl(shaders[k]);
    const { sem, tri } = meshSemantics(p, decl);
    const pos = sem.position;
    const nv = sem.n;
    if (nv > 0xFFFF) throw new Error('a part needs <= 65535 vertices (16-bit indices)');
    const vdata = packVertices(sem, decl);
    const lo = [pos[0], pos[1], pos[2]], hi = [pos[0], pos[1], pos[2]];     // pos.min(0) / max(0)
    for (let v = 1; v < nv; v++) {
      for (let c = 0; c < 3; c++) { lo[c] = npMin(lo[c], pos[3 * v + c]); hi[c] = npMax(hi[c], pos[3 * v + c]); }
    }
    for (let c = 0; c < 3; c++) { loAll[c] = npMin(loAll[c], lo[c]); hiAll[c] = npMax(hiAll[c], hi[c]); }
    const dd = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    const half = Math.sqrt((dd[0] * dd[0] + dd[1] * dd[1]) + dd[2] * dd[2]) / 2;
    bounds.push([...lo, half, ...hi, half]);
    const ex = [0, 0, 0];
    for (let r = 0; r < tri.length / 3; r++) {
      const a = tri[3 * r], b = tri[3 * r + 1], c = tri[3 * r + 2];
      const e1 = [0, 1, 2].map(i => pos[3 * b + i] - pos[3 * a + i]);
      const e2 = [0, 1, 2].map(i => pos[3 * c + i] - pos[3 * a + i]);
      const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      for (let i = 0; i < 3; i++) ex[i] += Math.abs(cr[i] / 2);
    }
    extra.push([...ex, 0.0]);
    const sr = refs.length;
    refs.push(['mat', k], ['extra', k], ['bounds', k]);
    const base = spec.length;
    const nidx = tri.length;
    spec.push(
      { typeId: R.T_BASE, align: 4, data: vdata },
      { typeId: R.T_VB, align: 4, data: encVb({ head: VB_HEAD, resource: base, fetch_type: 3, size: vdata.length, w9: 0 }) },
      { typeId: R.T_BASE, align: 4, data: packIndices(tri) },
      { typeId: R.T_IB, align: 4, data: encIb({ head: IB_HEAD, resource: base + 2, size: align(2 * nidx, 16), count: nidx }) },
      { typeId: R.T_MESH, align: 0x10, data: encMesh({
        bbox: [...lo, 0.0, ...hi, 0.0], w8: 0, material: R.SUBREF | sr, decl: base + 5, bind: base + 6,
        ib: base + 3, vb: base + 1, extra_ref: R.SUBREF | (sr + 1), bounds_ref: R.SUBREF | (sr + 2),
        prim_off: 0x60, w18: 1, pad: [0, 0, 0, 0], tail: 0,
        prims: [{ type: R.PRIM_TRIANGLELIST, base_vertex: 0, start: 0, count: nidx }] }) },
      { typeId: R.T_DECL, align: 4, data: encDecl(decl) },
      { typeId: R.T_BIND, align: 4, data: encBind({ w0: 1, w1: 1, ib: base + 3, vb: base + 1 }) });
    meshIdx.push(base + 4);
  });
  const nbp = Math.floor((n + 3) / 4) * 4;
  const bb = new Float64Array(nbp * 8), ex = new Float64Array(nbp * 4);
  bounds.forEach((r, k) => bb.set(r, 8 * k));
  extra.forEach((r, k) => ex.set(r, 4 * k));
  const model: ModelDict = {
    bbox: [...loAll, 0.0, ...hiAll, 0.0], matrix: MODEL_MATRIX, meshes: meshIdx, mesh_pad: new Array(n).fill(0),
    name, n_meshes2: n, w13hi: 1, bounds: bb, extra: ex, n_bounds: n };
  const modelBytes = encModel(model);
  const w = R.words(modelBytes, 0x20, 8);
  const at: Record<string, [number, number, number]> = {
    mat: [1, 0x14, 12], extra: [modelIndex, w[7], 16], bounds: [modelIndex, w[6], 32] };
  const subrefs: [number, number][] = refs.map(([r, k]) => [at[r][0], at[r][1] + at[r][2] * k]);
  const instSr = subrefs.length;
  subrefs.push([2, 0x20]);
  const instGuid = guid64('inst', arenaId, name);
  spec[2] = { typeId: R.T_INST, align: 0x10, data: encInst({ hash: INST_HASH, w2: 2, head_pad: [0, 0, 0], records: [{
    matrix: IDENTITY, bbox: model.bbox, guid: instGuid, links: new Array(6).fill(0xFFFFFFFF),
    model: modelIndex, t1: 0, t2: 0, strings: [name, 'undefined', 'undefined', 'undefined'], t7: 0 }] }) };
  spec.push({ typeId: R.T_MODEL, align: 0x10, data: modelBytes });
  const ents: ExportEntry[] = mats.map((m, k) => (
    { name: null, hash: NO_HASH, guid: m.params[0].guid!, type: 0xeb0066, value: R.SUBREF | 3 * k }));
  ents.push(
    { name: null, hash: NO_HASH, guid: guid64('mats', arenaId, name), type: R.T_MATS, value: 1 },
    { name: null, hash: NO_HASH, guid: instGuid, type: 0xeb0069, value: R.SUBREF | instSr },
    { name: null, hash: NO_HASH, guid: guid64('instobj', arenaId, name), type: R.T_INST, value: 2 });
  spec.push({ typeId: R.T_EXPORTS, align: 0x10, data: encExports({ entries: ents, index: [true], string_pad: new Uint8Array(0) }) });
  return buildArena({ arenaId, objects: spec as SpecObject[], subrefs });
}
