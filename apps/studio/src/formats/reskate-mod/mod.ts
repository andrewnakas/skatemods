// SPDX-License-Identifier: GPL-3.0-or-later
// A ReSkate Studio map mod -> placed geometry, materials and textures, from the mod's own data only.
// Base-game assets the mod references are never read (they are not in the mod); they are reported
// so the converter can substitute its own stand-ins. Logic follows skate4to3/sk4/collect.py (level
// placements) and bind_keys.py (texture roles), trimmed to what Studio-built maps use.

import { decodeBlocks, parseDepot, parseManifest, paramTextures, DEPOT_RES, Toc, type CasRange, type DepotParam, type ModSource } from './frostbite.ts';
import { Partition, isImport, type EbxImport, type EbxObject, type EbxValue } from './ebx.ts';
import { bestMip, decodeSection, isShadow, parseMeshSet, parseTextureDesc, MESHSET_RES, TEXTURE_RES, type MeshSet } from './mesh.ts';
import { decodeTexture } from './bc.ts';

export interface ResEntry { range: CasRange; type: number; meta: Uint8Array }
export interface ChunkPiece { range: CasRange; logicalOffset: number; logicalSize: number | null }

export interface ModIndex {
  ebx: Map<string, CasRange>;
  res: Map<string, ResEntry>;
  chunks: Map<string, ChunkPiece[]>;
  stats: Record<string, number>;
}

async function readRange(src: ModSource, r: CasRange): Promise<Uint8Array> {
  return src.read(r.cas, r.offset, r.size);
}

/** Index every asset whose bytes live in the mod's own CAS files. */
export async function indexMod(src: ModSource, log: (s: string) => void = () => {}): Promise<ModIndex> {
  const ix: ModIndex = { ebx: new Map(), res: new Map(), chunks: new Map(), stats: {} };
  const bump = (k: string, n = 1) => { ix.stats[k] = (ix.stats[k] ?? 0) + n; };
  const tocs = src.list().filter((p) => /^Win32\/.*\.toc$/i.test(p)).sort();
  for (const path of tocs) {
    const d = await src.read(path, 0, src.size(path));
    if (!Toc.isBinary(d)) continue;
    let toc: Toc;
    try { toc = new Toc(d); } catch (e) { log(`skip ${path}: ${(e as Error).message}`); continue; }
    for (const c of toc.chunks()) {
      if (!c.own) { bump('toc chunks base'); continue; }
      bump('toc chunks own');
      const list = ix.chunks.get(c.guid) ?? [];
      list.push({ range: c, logicalOffset: 0, logicalSize: null });
      ix.chunks.set(c.guid, list);
    }
    for (let i = 0; i < toc.bundlesCount; i++) {
      const b = toc.bundle(i);
      const e0 = b.entries[0];
      if (!e0.own) { bump('bundles base'); continue; }
      bump('bundles own');
      const m = parseManifest(await readRange(src, e0));
      const ents = b.entries.slice(1);
      const ne = m.ebx.length, nr = m.res.length;
      if (ents.length !== ne + nr + m.chunks.length) { bump('bundles mismatched'); continue; }
      m.ebx.forEach((x, k) => { const r = ents[k]; bump(r.own ? 'ebx own' : 'ebx base'); if (r.own && !ix.ebx.has(x.name)) ix.ebx.set(x.name, r); });
      m.res.forEach((x, k) => { const r = ents[ne + k]; bump(r.own ? 'res own' : 'res base'); if (r.own && !ix.res.has(x.name)) ix.res.set(x.name, { range: r, type: x.type, meta: x.meta }); });
      m.chunks.forEach((x, k) => {
        const r = ents[ne + nr + k];
        bump(r.own ? 'chunks own' : 'chunks base');
        if (!r.own) return;
        const list = ix.chunks.get(x.guid) ?? [];
        list.push({ range: r, logicalOffset: x.logicalOffset, logicalSize: x.logicalSize });
        ix.chunks.set(x.guid, list);
      });
    }
  }
  return ix;
}

// ------------------------------------------------------------------------------------------ the level
export type Mat3x4 = number[];   // row-vector transform: right(3) up(3) forward(3) trans(3)

export interface Placement { mesh: string; T: Mat3x4; source: string }

function ltRows(v: EbxValue): Mat3x4 {
  const o = v as EbxObject;
  const out: number[] = [];
  for (const k of ['right', 'up', 'forward', 'trans']) {
    const r = o[k] as EbxObject;
    out.push(Number(r.x), Number(r.y), Number(r.z));
  }
  return out;
}

/** A placed base-game asset: only its EBX import (partition + instance guid) is known inside the mod. */
export interface BaseRef { kind: 'mesh' | 'blueprint' | 'blueprint mesh'; partition: string; instance: string; T: number[]; source: string }

export interface ModLevel {
  level: string;
  placements: Placement[];
  partitions: Map<string, Partition>;     // own EBX by name
  byGuid: Map<string, string>;            // partition guid -> name
  unresolved: Record<string, number>;
  baseRefs: BaseRef[];                    // placements of base-game assets (dropped today; CC0 library keys)
}

/** The level asset path from reskate-levels.json, e.g. levels/game/<lvl>/<lvl>. */
export async function levelOf(src: ModSource): Promise<string> {
  const p = src.list().find((x) => /(^|\/)reskate-levels\.json$/i.test(x));
  if (!p) throw new Error('not a map mod: no reskate-levels.json');
  const j = JSON.parse(new TextDecoder().decode(await src.read(p, 0, src.size(p))));
  const asset: string = j.levels?.[0]?.asset;
  if (!asset) throw new Error('reskate-levels.json lists no level');
  return asset.split('/')[2];
}

/**
 * Spawn transforms a ReSkate map carries: ReSkate Studio writes the map's spawn as a LocalTransform
 * override in its own copy of the core ECS prefab (levels/game/bam_levelroot/ecs_coreassets_ecsprefab),
 * next to the base game's access spawns. The values are boxed, so read the 48-byte transform layout
 * directly: scale vec3 (16-aligned), rotation quaternion xyzw, translation vec3. DM Jumpline: scale 1,
 * quat (0, 0.7046, 0, 0.7096) = yaw 89.6, at (-138.75, 523.05, -214.95) on the start deck.
 * yaw = heading of the rotated +z, atan2(fx, fz) in degrees (the convention of Spawn.yaw).
 */
export function spawnTransforms(lvl: ModLevel): { pos: [number, number, number]; yaw: number }[] {
  const out: { pos: [number, number, number]; yaw: number }[] = [];
  for (const [name, p] of lvl.partitions) {
    if (!/ecs.*prefab/i.test(name)) continue;
    const d = p.d, dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
    for (let o = 0; o + 48 <= d.length; o += 16) {
      const f = (k: number) => dv.getFloat32(o + 4 * k, true);
      const sx = f(0), sy = f(1), sz = f(2), qx = f(4), qy = f(5), qz = f(6), qw = f(7), tx = f(8), ty = f(9), tz = f(10);
      if (![sx, sy, sz, qx, qy, qz, qw, tx, ty, tz].every(Number.isFinite)) continue;
      if (Math.abs(sx - 1) > 1e-3 || Math.abs(sy - 1) > 1e-3 || Math.abs(sz - 1) > 1e-3) continue;
      if (Math.abs(Math.hypot(qx, qy, qz, qw) - 1) > 1e-3 || f(3) !== 0 || f(11) !== 0) continue;
      if (Math.max(Math.abs(tx), Math.abs(ty), Math.abs(tz)) > 1e5 || (tx === 0 && ty === 0 && tz === 0)) continue;
      const fx = 2 * (qx * qz + qw * qy), fz = 1 - 2 * (qx * qx + qy * qy);
      out.push({ pos: [tx, ty, tz], yaw: Math.round(Math.atan2(fx, fz) * 180 / Math.PI * 100) / 100 });
    }
  }
  return out;
}

/** The map's display name from reskate-levels.json, if it gives one. */
export async function displayNameOf(src: ModSource): Promise<string | null> {
  const p = src.list().find((x) => /(^|\/)reskate-levels\.json$/i.test(x));
  if (!p) return null;
  const j = JSON.parse(new TextDecoder().decode(await src.read(p, 0, src.size(p))));
  const n = j.levels?.[0]?.displayName;
  return typeof n === 'string' && n.trim() ? n.trim() : null;
}

export async function readLevel(src: ModSource, ix: ModIndex, level: string, log: (s: string) => void = () => {}): Promise<ModLevel> {
  const partitions = new Map<string, Partition>(), byGuid = new Map<string, string>();
  for (const [name, r] of ix.ebx) {
    try {
      const p = new Partition(decodeBlocks(await readRange(src, r)));
      partitions.set(name, p);
      byGuid.set(p.partitionGuid, name);
    } catch { /* unreadable partition: skipped like collect.py */ }
  }
  const nameOf = (v: EbxValue | undefined) => (isImport(v) ? byGuid.get(v.partition) : undefined);
  const pfx = `levels/game/${level}/`.toLowerCase();
  const unresolved: Record<string, number> = {};
  const miss = (k: string) => { unresolved[k] = (unresolved[k] ?? 0) + 1; };
  const placements: Placement[] = [];
  const baseRefs: BaseRef[] = [];
  const blueprintMeshes = new Map<string, string[]>(), blueprintBase = new Map<string, EbxImport[]>();
  const meshesOf = (bp: string) => {
    let m = blueprintMeshes.get(bp);
    if (m) return m;
    m = []; const base: EbxImport[] = [];
    const p = partitions.get(bp);
    if (p) for (const i of p.instancesOf('StaticModelEntityData')) {
      const v = p.read(i).Mesh, n = nameOf(v);
      if (n) m.push(n); else if (isImport(v)) base.push(v);
    }
    blueprintMeshes.set(bp, m); blueprintBase.set(bp, base);
    return m;
  };
  for (const [n, p] of partitions) {
    if (!n.toLowerCase().startsWith(pfx)) continue;
    for (const i of p.instancesOf('StaticModelGroupEntityData')) {
      for (const m of (p.read(i).MemberDatas as EbxObject[] | undefined) ?? []) {
        const mesh = nameOf(m.MeshAsset);
        if (!mesh) {
          miss('static-model-group member');
          const v = m.MeshAsset;
          if (isImport(v)) for (const T of (m.InstanceTransforms as EbxValue[] | undefined) ?? []) baseRefs.push({ kind: 'mesh', partition: v.partition, instance: v.instance, T: ltRows(T), source: n });
          continue;
        }
        for (const T of (m.InstanceTransforms as EbxValue[] | undefined) ?? []) placements.push({ mesh, T: ltRows(T), source: n });
      }
    }
    for (const kind of ['ObjectReferenceObjectData', 'SpatialReferenceObjectData']) {
      for (const i of p.instancesOf(kind)) {
        const d = p.read(i);
        if (d.Excluded) continue;
        const bp = nameOf(d.Blueprint);
        if (!bp) {
          miss(kind);
          if (isImport(d.Blueprint)) baseRefs.push({ kind: 'blueprint', partition: d.Blueprint.partition, instance: d.Blueprint.instance, T: ltRows(d.BlueprintTransform), source: n });
          continue;
        }
        const meshes = [...new Set(meshesOf(bp))];
        if (!meshes.length) miss('blueprint without own static mesh');
        // base meshes inside an own blueprint: placed at the blueprint transform (the entity's own offset is not applied yet)
        for (const v of blueprintBase.get(bp) ?? []) baseRefs.push({ kind: 'blueprint mesh', partition: v.partition, instance: v.instance, T: ltRows(d.BlueprintTransform), source: n });
        for (const mesh of meshes) placements.push({ mesh, T: ltRows(d.BlueprintTransform), source: n });
      }
    }
    for (const kind of ['PrefabReferenceObjectData', 'EffectReferenceObjectData']) {
      const k = p.instancesOf(kind).length;
      if (k) unresolved[`${kind} (not handled)`] = (unresolved[`${kind} (not handled)`] ?? 0) + k;
    }
  }
  log(`level ${level}: ${placements.length} placements, own partitions ${partitions.size}`);
  return { level, placements, partitions, byGuid, unresolved, baseRefs };
}

// ---------------------------------------------------------------------------------- materials / textures
const ROLE_RX = /_(c|co|ny|n|msk|osk|osm|ogk|rgb|packed|cu|smao|ta|isk|isv|utk)$/;
/** ReSkate Studio names imported textures '<stem>_<role>-<12 hex>[_basecolor]_<n>'. */
const STUDIO_TAIL = /-[0-9a-f]{12}(_[a-z]+)?_\d+$/;

export function roleOf(name: string): string {
  const leaf = name.slice(name.lastIndexOf('/') + 1).replace(STUDIO_TAIL, '');
  if (leaf.startsWith('neutral') || name.includes('/default/')) return 'neutral';
  if (leaf.startsWith('t_fx') || name.includes('/panoramas/') || name.includes('/mask/global')) return 'util';
  const m = ROLE_RX.exec(leaf);
  return m ? m[1] : 'other';
}

export interface MaterialBinding {
  key: string;                 // depot key (decimal)
  names: string[];             // section material names seen with this key
  colour?: string; normal?: string; mask?: string; opacity?: string;   // own texture asset names
  baseRefs: number;            // texture params pointing at base-game assets (stand-ins)
  baseTextures: string[];      // those params' partition guids (CC0 library keys)
}

export function bindMaterials(ix: ModIndex, lvl: ModLevel, depots: Map<bigint, DepotParam[]>, keys: Map<bigint, Set<string>>): Map<string, MaterialBinding> {
  const out = new Map<string, MaterialBinding>();
  for (const [key, names] of keys) {
    const b: MaterialBinding = { key: key.toString(), names: [...names], baseRefs: 0, baseTextures: [] };
    for (const p of depots.get(key) ?? []) {
      for (const [, part] of paramTextures(p)) {
        const n = lvl.byGuid.get(part);
        if (!n || !ix.res.has(n)) { b.baseRefs++; if (!b.baseTextures.includes(part)) b.baseTextures.push(part); continue; }
        const r = roleOf(n);
        if ((r === 'c' || r === 'co' || r === 'cu') && !b.colour) b.colour = n;
        else if ((r === 'ny' || r === 'n') && !b.normal) b.normal = n;
        else if (r === 'msk' && !b.mask) b.mask = n;
        else if ((r === 'osk' || r === 'osm') && !b.opacity) b.opacity = n;
      }
    }
    out.set(b.key, b);
  }
  return out;
}

export interface Image { w: number; h: number; rgba: Uint8Array; mip: number; format: number }

async function chunkRanges(src: ModSource, ix: ModIndex, guid: string): Promise<[number, number, Uint8Array][]> {
  const out: [number, number, Uint8Array][] = [];
  for (const c of ix.chunks.get(guid) ?? []) {
    const data = decodeBlocks(await readRange(src, c.range));
    out.push([c.logicalOffset, c.logicalSize ?? data.length, data]);
  }
  return out;
}

export async function readTexture(src: ModSource, ix: ModIndex, name: string, maxSize = 2048): Promise<Image | null> {
  const r = ix.res.get(name);
  if (!r || r.type !== TEXTURE_RES) return null;
  const desc = parseTextureDesc(decodeBlocks(await readRange(src, r.range)));
  if (!desc) return null;
  const ranges = await chunkRanges(src, ix, desc.guid);
  // largest mip we hold that is no bigger than maxSize
  let pick: [number, Uint8Array] | null = null;
  for (let i = 0; i < desc.mips.length; i++) {
    if (Math.max(desc.w >> i, desc.h >> i) > maxSize) continue;
    pick = bestMip({ ...desc, mips: desc.mips.slice(i), mipOffsets: desc.mipOffsets.slice(i) }, ranges);
    if (pick) { pick = [pick[0] + i, pick[1]]; break; }
  }
  if (!pick) return null;
  const [mip, px] = pick;
  const w = Math.max(1, desc.w >> mip), h = Math.max(1, desc.h >> mip);
  return { w, h, rgba: decodeTexture(px, w, h, desc.format), mip, format: desc.format };
}

// ---------------------------------------------------------------------------------------- geometry
export interface Prim {
  material: string;            // depot key (decimal) - one prim per material
  positions: Float32Array;     // world space (Frostbite axes)
  uv0: Float32Array;
  indices: Uint32Array;
}

export interface ModGeometry {
  prims: Map<string, Prim>;
  meshKeys: Map<bigint, Set<string>>;
  stats: Record<string, number>;
  missingMeshes: string[];
}

/** Every placement's LOD0 non-shadow sections, transformed and merged per material key. */
/** Called once per distinct placed mesh with its LOD0 sections merged in mesh space. */
export type MeshHook = (mesh: string, local: { positions: Float32Array; indices: Uint32Array; keys: string[] }, places: Placement[]) => void;

export async function placeGeometry(src: ModSource, ix: ModIndex, lvl: ModLevel, log: (s: string) => void = () => {}, onMesh?: MeshHook): Promise<ModGeometry> {
  const stats: Record<string, number> = {};
  const bump = (k: string, n = 1) => { stats[k] = (stats[k] ?? 0) + n; };
  const byMesh = new Map<string, Placement[]>();
  for (const p of lvl.placements) { const l = byMesh.get(p.mesh) ?? []; l.push(p); byMesh.set(p.mesh, l); }
  const parts = new Map<string, { P: number[]; U: number[]; I: number[] }>();
  const meshKeys = new Map<bigint, Set<string>>();
  const missing: string[] = [];
  for (const [mesh, places] of byMesh) {
    const r = ix.res.get(mesh);
    if (!r || r.type !== MESHSET_RES) { missing.push(mesh); bump('placements of missing meshes', places.length); continue; }
    let ms: MeshSet;
    try { ms = parseMeshSet(decodeBlocks(await readRange(src, r.range))); } catch { missing.push(mesh); continue; }
    const lod = ms.lods[0];
    if (!lod) continue;
    const ranges = await chunkRanges(src, ix, lod.chunk);
    const whole = ranges.find(([o]) => o === 0);
    if (!whole) { missing.push(mesh); bump('meshes without own chunk'); continue; }
    const chunk = whole[2];
    const localP: number[] = [], localI: number[] = [], localK: string[] = [];
    for (const sec of lod.sections) {
      if (isShadow(sec) || sec.primitives === 0) continue;
      const g = decodeSection(chunk, lod, sec);
      if (onMesh) {
        const b0 = localP.length / 3;
        for (const v of g.positions) localP.push(v);
        for (const i of g.indices) localI.push(i + b0);
        localK.push(sec.depotKey.toString());
      }
      const key = sec.depotKey.toString();
      const names = meshKeys.get(sec.depotKey) ?? new Set();
      names.add(sec.material);
      meshKeys.set(sec.depotKey, names);
      let part = parts.get(key);
      if (!part) { part = { P: [], U: [], I: [] }; parts.set(key, part); }
      for (const pl of places) {
        const T = pl.T;
        const base = part.P.length / 3;
        const nv = g.positions.length / 3;
        for (let v = 0; v < nv; v++) {
          const x = g.positions[3 * v], y = g.positions[3 * v + 1], z = g.positions[3 * v + 2];
          part.P.push(x * T[0] + y * T[3] + z * T[6] + T[9], x * T[1] + y * T[4] + z * T[7] + T[10], x * T[2] + y * T[5] + z * T[8] + T[11]);
          part.U.push(g.uv0 ? g.uv0[2 * v] : 0, g.uv0 ? g.uv0[2 * v + 1] : 0);
        }
        // a mirrored placement (det < 0) flips winding
        const det = T[0] * (T[4] * T[8] - T[5] * T[7]) - T[1] * (T[3] * T[8] - T[5] * T[6]) + T[2] * (T[3] * T[7] - T[4] * T[6]);
        for (let t = 0; t < g.indices.length; t += 3) {
          const a = g.indices[t] + base, b = g.indices[t + 1] + base, c = g.indices[t + 2] + base;
          if (det < 0) part.I.push(a, c, b); else part.I.push(a, b, c);
        }
        bump('triangles', g.indices.length / 3);
      }
    }
    if (onMesh) onMesh(mesh, { positions: Float32Array.from(localP), indices: Uint32Array.from(localI), keys: localK }, places);
    bump('meshes');
  }
  const prims = new Map<string, Prim>();
  for (const [k, p] of parts) prims.set(k, { material: k, positions: Float32Array.from(p.P), uv0: Float32Array.from(p.U), indices: Uint32Array.from(p.I) });
  log(`geometry: ${stats.meshes ?? 0} meshes, ${stats.triangles ?? 0} triangles, ${prims.size} materials, ${missing.length} meshes not in the mod`);
  return { prims, meshKeys, stats, missingMeshes: missing };
}

/** All own depots of the mod, merged (Studio writes one per level). */
export async function readDepots(src: ModSource, ix: ModIndex): Promise<Map<bigint, DepotParam[]>> {
  const out = new Map<bigint, DepotParam[]>();
  for (const [, r] of ix.res) {
    if (r.type !== DEPOT_RES) continue;
    for (const [k, v] of parseDepot(decodeBlocks(await readRange(src, r.range)), r.meta)) out.set(k, v);
  }
  return out;
}
