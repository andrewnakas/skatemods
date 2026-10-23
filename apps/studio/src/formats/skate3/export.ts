// SPDX-License-Identifier: GPL-3.0-or-later
// ReSkate map mod -> MapExport: the in-memory form of what skate4to3's exporter writes as GLBs
// (per-material world geometry + images, material routing, grind splines, spawns), ready for assemble.

import { budgetPrims, TILE_TRI_BUDGET } from './budget.ts';
import type { ModSource } from '../reskate-mod/frostbite.ts';
import { bindMaterials, displayNameOf, indexMod, levelOf, placeGeometry, readDepots, readLevel, readTexture, spawnTransforms, type BaseRef, type MaterialBinding, type Placement } from '../reskate-mod/mod.ts';
import { decodePng, packId, readPackGlb, resolveId, type BasePack, type PackAsset } from '../convert/base_pack.ts';
import { contentKey } from './blake2b.ts';
import { grindEdges, polylineLength, type Vec3 } from './grind.ts';
import { findSpawns, Grid, type Spawn } from './spawns.ts';
import { classify, standin, type StandinClass } from './standins.ts';
import { fitPlanar, reproject } from './uv_project.ts';

export interface TexImage { key: string; w: number; h: number; rgba: Uint8Array }
export interface ExportPrim {
  material: string;
  positions: Float32Array; normals: Float32Array; uv0: Float32Array; uv1: Float32Array | null; indices: Uint32Array;
  images: { diffuse?: TexImage; specular?: TexImage; normal?: TexImage; lightmap?: TexImage };
  /** welded source shell for collision when the render copy was re-projected (duplicated vertices) */
  collision?: { positions: Float32Array; indices: Uint32Array };
}
export interface ExportMaterial { excludeCollision: boolean; excludePres: boolean; surface: number; cls: StandinClass; alpha: boolean }
export interface MapExport {
  name: string;
  prims: ExportPrim[];
  materials: Record<string, ExportMaterial>;
  splines: Vec3[][];
  spawns: Spawn[];
  report: Record<string, unknown>;
}

const NO_COLLISION: StandinClass[] = ['foliage', 'glass', 'water'];
const STANDIN_OK: Record<string, true> = { concrete: true, asphalt: true, wood: true, metal: true, brick: true, grass: true, rock: true, paint: true, glass: true, foliage: true };
const NOT_GROUND: StandinClass[] = ['foliage', 'glass', 'water', 'metal', 'fabric'];

function image(rgba: Uint8Array, w: number, h: number): TexImage {
  const k = new Uint8Array(rgba.length + 8);
  k.set(rgba); new DataView(k.buffer).setUint32(rgba.length, w, true); new DataView(k.buffer).setUint32(rgba.length + 4, h, true);
  return { key: contentKey(k), w, h, rgba };
}

/** skate. `_ny` maps keep X/Y in red/green and something that is not Z in blue; Skate 3's shader reads
 * blue as Z raw, so rebuild it: Z = sqrt(1 - x^2 - y^2) (sk4/export_glb.py normal_z; black floors otherwise). */
export function normalZ(rgba: Uint8Array): Uint8Array {
  const out = new Uint8Array(rgba);
  for (let i = 0; i < out.length; i += 4) {
    const x = Math.fround(out[i] / 127.5 - 1), y = Math.fround(out[i + 1] / 127.5 - 1);
    const z = Math.sqrt(Math.min(1, Math.max(0, 1 - (x * x + y * y))));
    out[i + 2] = Math.min(255, Math.max(0, Math.floor(127.5 + 127.5 * z + 0.5)));
    out[i + 3] = 255;
  }
  return out;
}

export function vertexNormals(P: Float32Array, T: Uint32Array): Float32Array {
  const N = new Float32Array(P.length);
  for (let t = 0; t < T.length; t += 3) {
    const a = 3 * T[t], b = 3 * T[t + 1], c = 3 * T[t + 2];
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) { N[i] += nx; N[i + 1] += ny; N[i + 2] += nz; }
  }
  for (let i = 0; i < N.length; i += 3) {
    const l = Math.hypot(N[i], N[i + 1], N[i + 2]);
    if (l > 1e-12) { N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; } else { N[i + 1] = 1; }
  }
  return N;
}

function transform(p: Vec3, T: number[]): Vec3 {
  const [x, y, z] = p;
  return [x * T[0] + y * T[3] + z * T[6] + T[9], x * T[1] + y * T[4] + z * T[7] + T[10], x * T[2] + y * T[5] + z * T[8] + T[11]];
}

export interface ExportOptions {
  maxTexture: number; log: (s: string) => void; progress: (f: number, what: string) => void;
  /** CC0 base-asset pack: base-game props the map places are drawn from it instead of dropped */
  basePack?: BasePack;
  /** extra base-game props to place (a test course, or props added on top of the map); needs basePack */
  extraBaseRefs?: BaseRef[];
}

type Rgba = { w: number; h: number; rgba: Uint8Array };
const packPngCache = new WeakMap<BasePack, Map<string, Promise<Rgba>>>();

/** A material's base texture params (partition guids) -> the pack's decoded images by role. */
async function packTextures(pack: BasePack, guids: string[]): Promise<{ c?: Rgba; normal?: Rgba; opacity?: Rgba }> {
  const out: { c?: Rgba; normal?: Rgba; opacity?: Rgba } = {};
  let cache = packPngCache.get(pack);
  if (!cache) { cache = new Map(); packPngCache.set(pack, cache); }
  for (const g of guids) {
    const t = pack.textures?.[packId(g)];
    if (!t || (t.role !== 'c' && t.role !== 'normal' && t.role !== 'opacity') || out[t.role as 'c']) continue;
    if (!cache.has(t.file)) cache.set(t.file, pack.file(t.file).then(decodePng));
    out[t.role as 'c' | 'normal' | 'opacity'] = await cache.get(t.file)!;
  }
  return out;
}

/** Base-game placements -> pack prims grouped per pack texture, plus their grind lines. */
async function placeBaseAssets(pack: BasePack, refs: BaseRef[], log: (s: string) => void) {
  const byTex = new Map<string, { P: number[]; I: number[]; U: number[] }>();
  const collOnly: { P: number[]; I: number[] } = { P: [], I: [] };
  const splines: Vec3[][] = [];
  const cache = new Map<string, PackAsset | null>();
  let placed = 0, missing = 0, noFile = 0;
  const missingIds = new Map<string, number>();
  const put = (dst: { P: number[]; I: number[]; U?: number[] }, pos: Float32Array, idx: Uint32Array, uv: Float32Array | null, T: number[]) => {
    const base = dst.P.length / 3;
    for (let i = 0; i < pos.length; i += 3) dst.P.push(...transform([pos[i], pos[i + 1], pos[i + 2]], T));
    for (const i of idx) dst.I.push(base + i);
    if (dst.U) { if (uv) for (const v of uv) dst.U.push(v); else for (let i = 0; i < pos.length / 3; i++) dst.U.push(0, 0); }
  };
  for (const r of refs) {
    const id = resolveId(pack, r.partition);
    if (!id) { missing++; missingIds.set(r.partition, (missingIds.get(r.partition) ?? 0) + 1); continue; }
    const e = pack.assets[id];
    if (!e.file) { noFile++; continue; }
    if (!cache.has(id)) cache.set(id, await pack.file(e.file).then(readPackGlb).catch(() => null));
    const a = cache.get(id);
    if (!a) { noFile++; continue; }
    // a skateable asset draws its collision; prims that are not drawn still collide (collision-only material)
    for (const p of a.visual) {
      const k = p.texture ?? 'concrete';
      if (!byTex.has(k)) byTex.set(k, { P: [], I: [], U: [] });
      put(byTex.get(k)!, p.positions, p.indices, p.uv0, r.T);
    }
    const drawnCount = a.visual.reduce((s, p) => s + p.indices.length, 0);
    const collCount = a.collision.reduce((s, p) => s + p.indices.length, 0);
    if (collCount && drawnCount !== collCount) for (const p of a.collision) put(collOnly, p.positions, p.indices, null, r.T);
    for (const l of e.grind ?? a.grind) splines.push(l.map((p) => transform(p as Vec3, r.T)));
    placed++;
  }
  log(`base pack: ${placed} placements drawn, ${missing} not in the pack (${missingIds.size} assets), ${noFile} without geometry`);
  return { byTex, collOnly, splines, report: { placed, missing, missingAssets: missingIds.size, noFile } };
}

export async function exportMod(src: ModSource, opts: Partial<ExportOptions> = {}): Promise<MapExport> {
  const log = opts.log ?? (() => {}), progress = opts.progress ?? (() => {});
  const maxTexture = opts.maxTexture ?? 1024;
  progress(0.02, 'indexing the mod');
  const ix = await indexMod(src, log);
  const levelName = await levelOf(src);
  const display = await displayNameOf(src) ?? levelDisplayName(levelName);
  progress(0.1, 'reading the level');
  const lvl = await readLevel(src, ix, levelName, log);

  // grind rails per distinct mesh, in mesh space, then placed
  const splines: Vec3[][] = [];
  const features: Vec3[] = [];
  const meshKeyNames = new Map<string, string[]>();
  const hook = (mesh: string, local: { positions: Float32Array; indices: Uint32Array; keys: string[] }, places: Placement[]) => {
    meshKeyNames.set(mesh, local.keys);
    const lines = grindEdges(local.positions, local.indices);
    for (const pl of places) for (const l of lines) splines.push(l.map((p) => transform(p, pl.T)));
    if (lines.length) for (const pl of places) features.push([pl.T[9], pl.T[10], pl.T[11]]);
  };
  progress(0.15, 'decoding meshes');
  const geo = await placeGeometry(src, ix, lvl, log, hook);
  const depots = await readDepots(src, ix);
  const bindings = bindMaterials(ix, lvl, depots, geo.meshKeys);

  progress(0.5, 'decoding textures');
  const texCache = new Map<string, TexImage | null>();
  const tex = async (name?: string) => {
    if (!name) return null;
    if (!texCache.has(name)) {
      const im = await readTexture(src, ix, name, maxTexture);
      texCache.set(name, im ? image(im.rgba, im.w, im.h) : null);
    }
    return texCache.get(name)!;
  };
  const prims: ExportPrim[] = [];
  const materials: Record<string, ExportMaterial> = {};
  const report: Record<string, unknown> = { level: levelName, unresolved: lvl.unresolved, geometry: geo.stats, missingMeshes: geo.missingMeshes.length };
  let standins = 0, own = 0, fromPack = 0;
  const reprojected: { material: string; density: number; steepFaces: number; faces: number }[] = [];
  const ground = new Grid(), solid = new Grid();
  for (const [key, p] of geo.prims) {
    const b: MaterialBinding | undefined = bindings.get(key);
    const cls = classify(...(b?.names ?? []), b?.colour);
    const diffuseOwn = await tex(b?.colour);
    const nraw = await tex(b?.normal);
    const normalOwn = nraw ? image(normalZ(nraw.rgba), nraw.w, nraw.h) : null;
    const st = standin(cls);
    // base-game texture params -> the CC0 pack's texture for that id (colour / normal / opacity), before stand-ins
    const pk = opts.basePack && b?.baseTextures.length ? await packTextures(opts.basePack, b.baseTextures) : {};
    let diffusePack = !diffuseOwn && pk.c ? image(pk.c.rgba, pk.c.w, pk.c.h) : null;
    if (diffusePack && pk.opacity && pk.opacity.w === pk.c!.w && pk.opacity.h === pk.c!.h) {
      const rgba = diffusePack.rgba.slice();
      for (let i = 0; i < rgba.length; i += 4) rgba[i + 3] = pk.opacity.rgba[i];
      diffusePack = image(rgba, pk.c!.w, pk.c!.h);
    }
    const diffuse = diffuseOwn ?? diffusePack ?? image(st.albedo, st.size, st.size);
    if (diffuseOwn) own++; else if (diffusePack) fromPack++; else standins++;
    const normal = normalOwn ?? (pk.normal ? image(pk.normal.rgba, pk.normal.w, pk.normal.h) : image(st.normal, st.size, st.size));
    const alpha = !!b?.opacity || (diffuse.rgba.some((v, i) => (i & 3) === 3 && v < 250));
    const name = `${cls}__${key}`;
    materials[name] = { excludeCollision: NO_COLLISION.includes(cls), excludePres: false, surface: 0, cls, alpha };
    const normals = vertexNormals(p.positions, p.indices);
    const fit = fitPlanar(p.positions, p.uv0, p.indices);
    const steep = fit.planar ? fit.faceAxis.reduce((n, a) => n + (a !== 1 ? 1 : 0), 0) : 0;
    const density = Math.sqrt(Math.abs(fit.u[0] * fit.v[2] - fit.u[2] * fit.v[0]));
    if (fit.planar && steep >= 8 && density <= 2) {
      const r = reproject(p.positions, normals, p.uv0, p.indices, fit);
      reprojected.push({ material: name, density: +density.toFixed(4), steepFaces: r.steepFaces, faces: p.indices.length / 3 });
      prims.push({ material: name, positions: r.positions, normals: r.normals, uv0: r.uv0, uv1: null, indices: r.indices,
        images: { diffuse, normal }, collision: { positions: p.positions, indices: p.indices } });
    } else {
      prims.push({ material: name, positions: p.positions, normals, uv0: p.uv0, uv1: null, indices: p.indices, images: { diffuse, normal } });
    }
    solid.addTriangles(p.positions, p.indices, false);
    if (!NOT_GROUND.includes(cls)) ground.addTriangles(p.positions, p.indices, true);
  }
  const baseRefs = [...lvl.baseRefs, ...(opts.extraBaseRefs ?? [])];
  if (opts.basePack && baseRefs.length) {
    progress(0.75, 'placing base assets from the CC0 pack');
    const b = await placeBaseAssets(opts.basePack, baseRefs, log);
    for (const [texName, g] of b.byTex) {
      if (!g.I.length) continue;
      const cls = (texName in STANDIN_OK ? texName : 'concrete') as StandinClass;
      const png = decodePng(await opts.basePack.file(`textures/${texName}.png`));
      const st = standin(cls);
      const name = `${cls}__base_${texName}`;
      materials[name] = { excludeCollision: NO_COLLISION.includes(cls), excludePres: false, surface: 0, cls, alpha: false };
      const P = Float32Array.from(g.P), I = Uint32Array.from(g.I);
      prims.push({ material: name, positions: P, normals: vertexNormals(P, I), uv0: Float32Array.from(g.U), uv1: null, indices: I,
        images: { diffuse: image(png.rgba, png.w, png.h), normal: image(st.normal, st.size, st.size) } });
      solid.addTriangles(P, I, false);
      if (!NOT_GROUND.includes(cls)) ground.addTriangles(P, I, true);
    }
    if (b.collOnly.I.length) {
      const P = Float32Array.from(b.collOnly.P), I = Uint32Array.from(b.collOnly.I), st = standin('default');
      materials['default__base_collision'] = { excludeCollision: false, excludePres: true, surface: 0, cls: 'default', alpha: false };
      prims.push({ material: 'default__base_collision', positions: P, normals: vertexNormals(P, I), uv0: new Float32Array(P.length / 3 * 2), uv1: null, indices: I,
        images: { diffuse: image(st.albedo, st.size, st.size), normal: image(st.normal, st.size, st.size) } });
      solid.addTriangles(P, I, false);
    }
    splines.push(...b.splines);
    report.basePack = b.report;
  }
  progress(0.8, 'placing spawns');
  // Stacked geometry stacks its grind lines too (OG Berrics: 7,249 runs, mostly exact repeats).
  const lineKey = (l: Vec3[]) => l.map((v) => v.map((c) => Math.round(c * 100)).join(',')).join(';');
  const seenLines = new Set<string>();
  const keep = splines.filter((l) => {
    if (polylineLength(l) < 1.0) return false;
    const k = lineKey(l), r = lineKey([...l].reverse());
    if (seenLines.has(k) || seenLines.has(r)) return false;
    seenLines.add(k);
    return true;
  });
  // the map's own spawn: the first authored transform inside the geometry with ground under it
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) for (let i = 0; i < p.positions.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p.positions[i + k]); hi[k] = Math.max(hi[k], p.positions[i + k]); }
  const authored = spawnTransforms(lvl).find((t) => t.pos.every((v, k) => v >= lo[k] - 1 && v <= hi[k] + 10) && ground.below(t.pos, 6)) ?? null;
  if (authored) log(`spawn: the map's own at ${authored.pos.map((v) => v.toFixed(2))} yaw ${authored.yaw}`);
  report.authoredSpawn = authored;
  const spawns = findSpawns(ground, solid, keep, features, display, 8, authored);
  progress(0.85, 'fitting dense geometry to the tile budget');
  report.budget = await budgetPrims(prims, 100, TILE_TRI_BUDGET, log);
  report.textures = opts.basePack ? { own, standins, fromPack } : { own, standins };
  report.reprojected = reprojected;
  report.splines = keep.length;
  report.spawns = spawns.length;
  log(`export: ${prims.length} materials (${own} own textures, ${standins} stand-ins), ${keep.length} grind lines, ${spawns.length} spawns, ${reprojected.length} top-down materials re-projected`);
  return { name: display, prims, materials, splines: keep, spawns, report };
}

function levelDisplayName(level: string): string {
  return level.replace(/^dingolevel_(reskate_)?/, '').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
