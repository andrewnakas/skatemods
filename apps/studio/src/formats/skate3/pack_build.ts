// SPDX-License-Identifier: GPL-3.0-or-later
// MapExport -> installable Skate 3 DLC pack, in memory. Ports skate4to3's sk3/assemble.py (tiling,
// texture set, render/collision arenas with grind splines), tools/build_pack.py (per-tile streams:
// cPres = render + 16 px stand-ins, cTex = full textures within a byte budget, cSim = collision) and
// tools/pack.py (names, manifests, vaults, BIG).

import { buildRenderArena, type RenderPart } from './render_write.ts';
import { buildTexture, fromImage, lowresStandin, mipChainCached, type Rgba } from './texture_write.ts';
import { buildMesh, buildTileArena } from './collision_write.ts';
import { straightSegment, type SplineSet } from './splines.ts';
import { buildFiles, namesFor, writePack, type PackOutput, type Spot, type TileArenas } from './dlc.ts';
import type { Kind } from './manifests.ts';
import { h32, h64, tileTextureId, hex16 } from './blake2b.ts';
import type { ExportPrim, MapExport, TexImage } from './export.ts';
import type { Vec3 } from './grind.ts';

const DEFAULT_SURFACE = 0xB700;
const MAX_PART_VERTS = 8000;
const ARENA_MAX_MESHES = 48;
const ARENA_MAX_BYTES = 750_000;
const MAX_COLLISION_TRIS = 30000;
const STANDIN_PX = 16;
const SLOTS = ['diffuse', 'specular', 'normal', 'lightmap'] as const;
type Slot = typeof SLOTS[number];

function flat(rgba: [number, number, number, number], size = 16): Rgba {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) data.set(rgba, 4 * i);
  return { width: size, height: size, data };
}
const DEFAULTS: Record<Slot, Rgba> = {
  normal: flat([128, 128, 255, 255]), specular: flat([10, 10, 10, 255]), lightmap: flat([255, 255, 255, 255]), diffuse: flat([128, 128, 128, 255]),
};

/** Resample to power-of-two sides (4..2048), bilinear. */
function pow2(im: TexImage): Rgba {
  const p = (n: number) => Math.min(2048, Math.max(4, 1 << Math.ceil(Math.log2(Math.max(1, n)))));
  const W = p(im.w), H = p(im.h);
  if (W === im.w && H === im.h) return { width: W, height: H, data: im.rgba };
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = Math.min(im.w - 1, Math.max(0, (x + 0.5) * im.w / W - 0.5)), sy = Math.min(im.h - 1, Math.max(0, (y + 0.5) * im.h / H - 0.5));
    const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(im.w - 1, x0 + 1), y1 = Math.min(im.h - 1, y0 + 1), fx = sx - x0, fy = sy - y0;
    for (let c = 0; c < 4; c++) {
      const a = im.rgba[(y0 * im.w + x0) * 4 + c], b = im.rgba[(y0 * im.w + x1) * 4 + c], d = im.rgba[(y1 * im.w + x0) * 4 + c], e = im.rgba[(y1 * im.w + x1) * 4 + c];
      out[(y * W + x) * 4 + c] = Math.round((a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy);
    }
  }
  return { width: W, height: H, data: out };
}

interface TexMeta { rgba: Rgba; bytes: number; alpha: boolean; isDefault: boolean }

class TextureSet {
  ids = new Map<string, bigint>();
  meta = new Map<bigint, TexMeta>();
  add(slot: Slot, im?: TexImage): bigint {
    const key = im ? im.key : `default:${slot}`;
    const hit = this.ids.get(key);
    if (hit !== undefined) return hit;
    const rgba = im ? pow2(im) : DEFAULTS[slot];
    const nid = h64('tex', key);
    let alpha = false;
    if (slot === 'diffuse') for (let i = 3; i < rgba.data.length; i += 4) if (rgba.data[i] < 250) { alpha = true; break; }
    const bytes = buildTexture(fromImage(rgba, nid, h32('texarena', key), { alpha })).length;
    this.ids.set(key, nid);
    this.meta.set(nid, { rgba, bytes, alpha, isDefault: !im });
    return nid;
  }
}

const tileKey = (x: number, z: number, size: number): [number, number] =>
  [Math.floor(x / size) * size + size / 2, Math.floor(z / size) * size + size / 2];

/** Indices of T (triangle numbers) split into compact groups of <= limit (median cuts on the longer horizontal axis). */
function splitTriangles(V: Float32Array | number[], T: Uint32Array | number[], tris: number[], limit: number): number[][] {
  const cx = (t: number, a: number) => (V[3 * T[3 * t] + a] + V[3 * T[3 * t + 1] + a] + V[3 * T[3 * t + 2] + a]) / 3;
  const out: number[][] = [], todo = [tris];
  while (todo.length) {
    const idx = todo.pop()!;
    if (idx.length <= limit) { out.push(idx); continue; }
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const t of idx) { const x = cx(t, 0), z = cx(t, 2); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const ax = x1 - x0 >= z1 - z0 ? 0 : 2;
    const order = idx.map((t) => [cx(t, ax), t] as [number, number]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
    const h = order.length >> 1;
    todo.push(order.slice(h), order.slice(0, h));
  }
  return out;
}

const UV_CELL = 4;
/**
 * Render uv0 is written as half floats, whose step is 1/512 below 4 but 1/16 near 100 (32 texels of
 * a 512 px texture). Group a part's triangles by the UV_CELL square their UV centroid falls in and
 * shift each group by its whole cell (textures repeat), so every written uv stays near [0, 4).
 */
function uvCells(UV: Float32Array | null, I: Uint32Array): { tris: number[]; du: number; dv: number; whole: boolean }[] {
  const nt = I.length / 3;
  if (!UV) return [{ tris: [], du: 0, dv: 0, whole: true }];
  const groups = new Map<string, { tris: number[]; du: number; dv: number; whole: boolean }>();
  for (let t = 0; t < nt; t++) {
    const a = I[3 * t], b = I[3 * t + 1], c = I[3 * t + 2];
    const cu = Math.floor((UV[2 * a] + UV[2 * b] + UV[2 * c]) / 3 / UV_CELL), cv = Math.floor((UV[2 * a + 1] + UV[2 * b + 1] + UV[2 * c + 1]) / 3 / UV_CELL);
    const k = `${cu},${cv}`;
    let g = groups.get(k);
    if (!g) { g = { tris: [], du: cu * UV_CELL, dv: cv * UV_CELL, whole: false }; groups.set(k, g); }
    g.tris.push(t);
  }
  const out = [...groups.values()];
  if (out.length === 1) out[0].whole = true;
  return out;
}

/** Compact a triangle subset: new vertex arrays + reindexed triangles (vertices in ascending old order). */
function compact(tris: number[], I: Uint32Array, attrs: { a: ArrayLike<number> | null; k: number }[]): { idx: Uint32Array; out: (Float32Array | null)[] } {
  const used = new Map<number, number>();
  const verts: number[] = [];
  for (const t of tris) for (let j = 0; j < 3; j++) { const v = I[3 * t + j]; if (!used.has(v)) { used.set(v, 0); verts.push(v); } }
  verts.sort((a, b) => a - b);
  verts.forEach((v, i) => used.set(v, i));
  const idx = new Uint32Array(tris.length * 3);
  tris.forEach((t, n) => { for (let j = 0; j < 3; j++) idx[3 * n + j] = used.get(I[3 * t + j])!; });
  const out = attrs.map(({ a, k }) => {
    if (!a) return null;
    const o = new Float32Array(verts.length * k);
    verts.forEach((v, i) => { for (let c = 0; c < k; c++) o[i * k + c] = a[v * k + c]; });
    return o;
  });
  return { idx, out };
}

function clipPolyline(points: Vec3[], size: number): Map<string, Vec3[][]> {
  const out = new Map<string, Vec3[][]>();
  let run: Vec3[] = [points[0]], cur: string | null = null;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1];
    const k = tileKey((a[0] + b[0]) / 2, (a[2] + b[2]) / 2, size).join('_');
    if (cur !== null && k !== cur) { (out.get(cur) ?? out.set(cur, []).get(cur)!).push(run); run = [a]; }
    cur = k;
    run.push(b);
  }
  if (cur !== null && run.length > 1) (out.get(cur) ?? out.set(cur, []).get(cur)!).push(run);
  return out;
}

/**
 * buildMesh for a triangle subset; a leaf the writer cannot hold (> 255 vertices: dense or unwelded
 * geometry, seen on Losal Streets) is retried welded (exact duplicate positions, collapsed triangles
 * dropped), then split in halves. Subsets that build first time are unchanged.
 */
function collisionMeshes(V: number[], T: Uint32Array, S: number[], sel: number[], out: ReturnType<typeof buildMesh>['mesh'][], welded = false): void {
  const c = compact(sel, T, [{ a: V, k: 3 }]);
  let P = c.out[0]!, I = c.idx, keep = sel;
  if (welded) {
    const at = new Map<string, number>(), remap: number[] = [], Pw: number[] = [];
    for (let v = 0; v < P.length / 3; v++) {
      const k = `${P[3 * v]},${P[3 * v + 1]},${P[3 * v + 2]}`;
      let w = at.get(k);
      if (w === undefined) { w = Pw.length / 3; at.set(k, w); Pw.push(P[3 * v], P[3 * v + 1], P[3 * v + 2]); }
      remap.push(w);
    }
    const Iw: number[] = []; keep = [];
    sel.forEach((t, n) => {
      const a = remap[I[3 * n]], b = remap[I[3 * n + 1]], d = remap[I[3 * n + 2]];
      if (a !== b && b !== d && a !== d) { Iw.push(a, b, d); keep.push(t); }
    });
    if (!keep.length) return;
    P = Float32Array.from(Pw); I = Uint32Array.from(Iw);
  }
  try {
    out.push(buildMesh(P, I, keep.map((t) => S[t])).mesh);
  } catch (e) {
    if (!/more than 255 vertices/.test((e as Error).message)) throw e;
    if (!welded) return collisionMeshes(V, T, S, sel, out, true);
    if (sel.length < 2) throw e;
    for (const half of splitTriangles(V, T, sel, Math.ceil(sel.length / 2))) collisionMeshes(V, T, S, half, out, true);
  }
}

export interface PackOptions { size: number; shiftY?: number; texBudgetBytes: number; display?: string; log: (s: string) => void; progress: (f: number, what: string) => void;
  /** free the export's geometry once it is tiled (the caller no longer needs it) */
  releaseInput?: boolean }

export interface BuiltPack extends PackOutput { report: Record<string, unknown> }

export function buildPack(ex: MapExport, o: Partial<PackOptions> = {}): BuiltPack {
  const size = o.size ?? 100, budget = o.texBudgetBytes ?? 7e6, log = o.log ?? (() => {}), progress = o.progress ?? (() => {});
  const display = o.display ?? ex.name;
  // recentre: whole-tile shift putting the map's tile box around the origin
  let tx0 = Infinity, tx1 = -Infinity, tz0 = Infinity, tz1 = -Infinity;
  for (const p of ex.prims) for (let i = 0; i < p.positions.length; i += 3) {
    const [kx, kz] = tileKey(p.positions[i], p.positions[i + 2], size);
    tx0 = Math.min(tx0, kx); tx1 = Math.max(tx1, kx); tz0 = Math.min(tz0, kz); tz1 = Math.max(tz1, kz);
  }
  const shift: Vec3 = [-Math.round((tx0 + tx1) / 2 / size) * size || 0, o.shiftY ?? 0, -Math.round((tz0 + tz1) / 2 / size) * size || 0];
  log(`shift ${shift}`);

  const tex = new TextureSet();
  const render = new Map<string, RenderPart[]>();
  const coll = new Map<string, { V: Float32Array; T: Uint32Array; s: number }[]>();
  const tileTex = new Map<string, Set<bigint>>();
  const add = <T>(m: Map<string, T[]>, k: string, v: T) => (m.get(k) ?? m.set(k, []).get(k)!).push(v);
  ex.prims.forEach((pr: ExportPrim, pi) => {
    progress(0.05 + 0.45 * pi / ex.prims.length, 'building tiles');
    const P = Float32Array.from(pr.positions, (v, i) => v + shift[i % 3]);
    const m = ex.materials[pr.material];
    const pres = !m?.excludePres, collide = !m?.excludeCollision;
    const surf = m?.surface || DEFAULT_SURFACE;
    let ids: Record<Slot, bigint> | null = null;
    if (pres) ids = Object.fromEntries(SLOTS.map((s) => [s, tex.add(s, pr.images[s])])) as Record<Slot, bigint>;
    const byTile = new Map<string, number[]>();
    const nt = pr.indices.length / 3;
    for (let t = 0; t < nt; t++) {
      const a = 3 * pr.indices[3 * t], b = 3 * pr.indices[3 * t + 1], c = 3 * pr.indices[3 * t + 2];
      add(byTile, tileKey((P[a] + P[b] + P[c]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3, size).join('_'), t);
    }
    for (const [key, tris] of byTile) {
      const [x, z] = key.split('_').map(Number);
      const { idx: T, out: [V, N, U0, U1] } = compact(tris, pr.indices, [{ a: P, k: 3 }, { a: pr.normals, k: 3 }, { a: pr.uv0, k: 2 }, { a: pr.uv1, k: 2 }]);
      if (collide && !pr.collision) add(coll, key, { V: V!, T, s: surf });
      if (!pres || !ids) continue;
      const tt = tileTex.get(key) ?? tileTex.set(key, new Set()).get(key)!;
      for (const s of SLOTS) tt.add(ids[s]);
      const texHere = Object.fromEntries(SLOTS.map((s) => [s, tex.meta.get(ids![s])!.isDefault ? ids![s] : tileTextureId(ids![s], x, z)]));
      const nv = V!.length / 3;
      let step = Math.max(1, Math.floor(T.length / 3 * MAX_PART_VERTS / Math.max(nv, 1)));
      let s = 0;
      const allTris = Array.from({ length: T.length / 3 }, (_, i) => i);
      while (s < T.length / 3) {
        const sub = allTris.slice(s, s + step);
        const c2 = compact(sub, T, [{ a: V, k: 3 }, { a: N, k: 3 }, { a: U0, k: 2 }, { a: U1, k: 2 }]);
        const n2 = c2.out[0]!.length / 3;
        if (n2 > MAX_PART_VERTS && step > 1) { step >>= 1; continue; }
        s += step;
        for (const cell of uvCells(c2.out[2], c2.idx)) {
          const c3 = cell.whole ? c2 : compact(cell.tris, c2.idx, [{ a: c2.out[0], k: 3 }, { a: c2.out[1], k: 3 }, { a: c2.out[2], k: 2 }, { a: c2.out[3], k: 2 }]);
          const n3 = c3.out[0]!.length / 3;
          const uv0 = c3.out[2] ? Float32Array.from(c3.out[2]) : new Float32Array(n3 * 2);
          if (cell.du || cell.dv) for (let i = 0; i < uv0.length; i += 2) { uv0[i] -= cell.du; uv0[i + 1] -= cell.dv; }
          add(render, key, {
            positions: c3.out[0]!, indices: c3.idx,
            normals: c3.out[1] ?? Float32Array.from({ length: n3 * 3 }, (_, i) => (i % 3 === 1 ? 1 : 0)),
            uv0,
            uv1: c3.out[3] ?? new Float32Array(n3 * 2).fill(0.5),
            material: { name: pr.material.slice(0, 60), shader: 'environmentsimple.default', textures: texHere },
          });
        }
      }
    }
  });

  // re-projected prims carry duplicated vertices; collide against the welded source shell instead
  ex.prims.forEach((pr: ExportPrim) => {
    if (!pr.collision || ex.materials[pr.material]?.excludeCollision) return;
    const P = Float32Array.from(pr.collision.positions, (v, i) => v + shift[i % 3]), I = pr.collision.indices;
    const surf = ex.materials[pr.material]?.surface || DEFAULT_SURFACE;
    const byTile = new Map<string, number[]>();
    for (let t = 0; t < I.length / 3; t++) {
      const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2];
      add(byTile, tileKey((P[a] + P[b] + P[c]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3, size).join('_'), t);
    }
    for (const [key, tris] of byTile) {
      const { idx: T, out: [V] } = compact(tris, I, [{ a: P, k: 3 }]);
      add(coll, key, { V: V!, T, s: surf });
    }
  });

  // the export's own arrays are now split into tiles; let them go (big maps: hundreds of MB in a browser tab)
  if (o.releaseInput) for (const pr of ex.prims) { pr.positions = pr.normals = pr.uv0 = new Float32Array(0); pr.uv1 = null; pr.indices = new Uint32Array(0); pr.collision = undefined; }
  const spl = new Map<string, Vec3[][]>();
  for (const l of ex.splines) {
    const pts = l.map((p) => [p[0] + shift[0], p[1] + shift[1], p[2] + shift[2]] as Vec3);
    for (const [k, runs] of clipPolyline(pts, size)) for (const r of runs) add(spl, k, r);
  }

  // ---- per tile arenas, staged as the packer's streams
  const streams = new Map<string, [bigint, Uint8Array][]>();
  const put = (stream: string, k: number, data: Uint8Array) => (streams.get(stream) ?? streams.set(stream, []).get(stream)!).push([h64('chunk', stream, k), data]);
  const defaults = [...tex.meta].filter(([, m]) => m.isDefault).map(([id]) => id);
  defaults.forEach((id, k) => { const m = tex.meta.get(id)!; put('cPres_Global', k, buildTexture(fromImage(m.rgba, id, h32('texarena', [...tex.ids].find(([, v]) => v === id)![0]), { alpha: m.alpha }))); });
  const keys = [...new Set([...render.keys(), ...coll.keys()])].sort((a, b) => {
    const [ax, az] = a.split('_').map(Number), [bx, bz] = b.split('_').map(Number);
    return ax - bx || az - bz;
  });
  const report: Record<string, unknown> = { tiles: keys.length, shift };
  let ki = 0, splineCount = 0;
  const texPerTile: number[] = [];
  for (const key of keys) {
    progress(0.5 + 0.45 * ki++ / keys.length, 'writing arenas');
    const [x, z] = key.split('_').map(Number);
    const parts = render.get(key) ?? [];
    let k = -1;
    if (parts.length) {
      const groups: RenderPart[][] = [];
      let cur: RenderPart[] = [], est = 0;
      for (const p of parts) {
        const b = p.positions.length / 3 * 28 + p.indices.length / 3 * 6 + 600;
        if (cur.length && (cur.length >= ARENA_MAX_MESHES || est + b > ARENA_MAX_BYTES)) { groups.push(cur); cur = []; est = 0; }
        cur.push(p); est += b;
      }
      groups.push(cur);
      groups.forEach((g, gi) => put(`cPres_${x}_${z}_high`, ++k, buildRenderArena(g, h32('cPres', key, gi), `cPres_${key}_${gi}`)));
    }
    const texs = [...(tileTex.get(key) ?? [])].filter((t) => !tex.meta.get(t)!.isDefault).sort((a, b) => hex16(a) < hex16(b) ? -1 : 1);
    if (parts.length) for (const t of texs) {
      const id = tileTextureId(t, x, z);
      put(`cPres_${x}_${z}_high`, ++k, buildTexture(lowresStandin(tex.meta.get(t)!.rgba, id, h32('lowres', id), STANDIN_PX)));
    }
    const cl = coll.get(key) ?? [];
    if (cl.length) {
      const Vs: number[] = [], Ts: number[] = [], Ss: number[] = [];
      for (const { V, T, s } of cl) { const base = Vs.length / 3; for (const v of V) Vs.push(v); for (const i of T) Ts.push(i + base); for (let i = 0; i < T.length / 3; i++) Ss.push(s); }
      const runs = spl.get(key) ?? [];
      splineCount += runs.length;
      const ss: SplineSet | null = runs.length ? { kind: 0, splines: runs.map((r, i) => ({ id: h64('spline', key, i), template: 0x2C70170700000000n, segments: r.slice(1).map((b, j) => straightSegment(r[j], b)) })) } : null;
      const TT = Uint32Array.from(Ts);
      const meshes: ReturnType<typeof buildMesh>['mesh'][] = [];
      for (const sel of splitTriangles(Vs, TT, Array.from({ length: TT.length / 3 }, (_, i) => i), MAX_COLLISION_TRIS)) collisionMeshes(Vs, TT, Ss, sel, meshes);
      meshes.forEach((mesh, ci) => {
        const { arena } = buildTileArena(mesh, h32('cSim', key, ci), `cSim_${key}_${ci}`, h64('cSimInst', key, ci), { spline_set: ci === 0 ? ss : null, splines_id: h64('splines', key) });
        put(`cSim_${x}_${z}_high`, ci, arena);
      });
    }
    if (texs.length) {
      const cap = new Map(texs.map((t) => [t, Math.max(tex.meta.get(t)!.rgba.width, tex.meta.get(t)!.rgba.height)]));
      const sz = new Map(texs.map((t) => [t, tex.meta.get(t)!.bytes]));
      const total = () => [...sz.values()].reduce((a, b) => a + b, 0);
      while (total() > budget) {
        const t = texs.reduce((a, b) => (sz.get(b)! > sz.get(a)! || (sz.get(b) === sz.get(a) && hex16(b) > hex16(a)) ? b : a));
        if (cap.get(t)! <= 64) break;
        cap.set(t, cap.get(t)! >> 1);
        sz.set(t, Math.floor(sz.get(t)! / 4));
      }
      texs.forEach((t, kk) => {
        const m = tex.meta.get(t)!;
        let im = m.rgba, lv = 0;
        while (Math.max(im.width, im.height) >> lv > cap.get(t)! && Math.min(im.width, im.height) >> lv > 4) lv++;
        if (lv) im = mipChainCached(im, lv + 1)[lv];
        const id = tileTextureId(t, x, z);
        put(`cTex_${x}_${z}_high`, kk, buildTexture(fromImage(im, id, h32('tex', id, `(${im.height}, ${im.width})`), { alpha: m.alpha })));
      });
      texPerTile.push(total());
    }
    // this tile's input geometry is written: drop it so memory holds the output, not input and output together
    render.delete(key); coll.delete(key); spl.delete(key);
  }
  report.splines = splineCount;
  report.textures = tex.meta.size;
  report.texMbMax = texPerTile.length ? Math.max(...texPerTile) / 1e6 : 0;

  // ---- pack (tools/pack.py, template-free)
  progress(0.96, 'packing');
  const spots: Spot[] = (ex.spawns.length ? ex.spawns : [{ name: display, x: 0, y: 10, z: 0, yaw: 0 }]).map((s) => ({
    title: s.name, pos: [s.x + shift[0], s.y + shift[1], s.z + shift[2]] as [number, number, number], yaw: s.yaw ?? 0 }));
  const tiles: Partial<Record<Kind, TileArenas>> = { Pres: [], Sim: [], Tex: [] };
  for (const name of [...streams.keys()].sort()) {
    const kind = ({ cPres: 'Pres', cSim: 'Sim', cTex: 'Tex' } as Record<string, Kind>)[name.split('_')[0]];
    if (kind) tiles[kind]!.push([name, streams.get(name)!]);
  }
  const names = namesFor(display, spots);
  const files = buildFiles(display, tiles, spots, names, { cell: size, releaseArenas: true });
  const out = writePack(files, names.slug, display);
  log(`pack ${out.contentId}/${out.bigName}: ${(out.bigSize / 1e6).toFixed(1)} MB, ${files.size} files, ${keys.length} tiles, ${splineCount} spline runs`);
  return { ...out, report };
}
