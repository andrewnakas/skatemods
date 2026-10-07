// MapIR -> .skate.
//
// - Render geometry: every object with render=true, baked to world space.
//   A .skate vertex has exactly one material, so vertices shared between
//   material groups are duplicated (identity order is kept when possible so a
//   .skate -> MapIR -> .skate round trip reproduces the vertex/index arrays).
// - Collision: every object whose collision.mode != 'none', as exact
//   triangles. 'convex' and 'hull' are NOT decomposed/hulled here; their
//   triangles are written as-is (a warning says so). The gameplay surface of a
//   collision triangle is its material's audio/physics/pattern, so when an
//   object's collision.surface (or 'water' mode) differs from the material's
//   surface a collision-only material variant "<name>#<surface>" is appended.
//   The per-triangle surface word is the 1-based collision object ordinal,
//   like the Blender exporter.
// - Spawn: heading = radians(yaw); see read.ts for the convention.
// - Textures must carry decoded `rgba` (call decodeTextures() from decode.ts
//   first for PNG/JPEG-only textures).
import type { Light, MapIR, MapObject, Mat4, Material, SurfaceId } from '../../ir';
import type { SkateCollisionExtra, SkateMapExtra, SkateRailExtra, SkateRenderExtra } from './extra';
import { isSkateMapExtra } from './extra';
import { collisionArea2 } from './parse';
import { RADIANS_TO_YAW, flipRows } from './read';
import { DEFAULT_ENVIRONMENT, ENV, serializeSkate, type SerializeOptions } from './serialize';
import { SkateError } from './storage';
import { sameSkateSurface, skateSurface, type SkateSurface } from './surfaces';
import type {
  SkateExtension, SkateLight, SkateMap, SkateMaterial, SkateRail, SkateTexture,
} from './types';

export interface WriteSkateOptions extends SerializeOptions {
  /** Default 14: the Rust runtime's requested storage contract (exporter COMPAT14). */
  version?: 14 | 15;
  compression?: 'zlib' | 'none';
}

export function writeSkate(map: MapIR, opts: WriteSkateOptions = {}): Uint8Array {
  return writeSkateWithReport(map, opts).bytes;
}

export function writeSkateWithReport(map: MapIR, opts: WriteSkateOptions = {}): { bytes: Uint8Array; raw: SkateMap; warnings: string[] } {
  const { raw, warnings } = mapIRToSkate(map);
  return { bytes: serializeSkate(raw, opts), raw, warnings };
}

const fr = Math.fround;

export function mapIRToSkate(map: MapIR): { raw: SkateMap; warnings: string[] } {
  const warnings: string[] = [];
  const pass: SkateMapExtra | null = isSkateMapExtra(map.extra?.skate) ? (map.extra!.skate as SkateMapExtra) : null;

  // ---------------------------------------------------------------- textures
  const textures: SkateTexture[] = map.textures.map((t) => {
    if (t.width === 0 && t.height === 0) return { name: t.name, width: 0, height: 0, colorSpace: t.srgb ? 1 : 0, rgba: new Uint8Array(0) };
    if (!t.rgba) {
      throw new SkateError(`texture "${t.name}" has no decoded RGBA; run decodeTextures(map) from formats/skate/decode.ts before writeSkate`);
    }
    if (t.rgba.length !== t.width * t.height * 4) throw new SkateError(`texture "${t.name}": rgba size does not match ${t.width}x${t.height}`);
    return { name: t.name, width: t.width, height: t.height, colorSpace: t.srgb ? 1 : 0, rgba: flipRows(t.rgba, t.width, t.height) };
  });

  // --------------------------------------------------------------- materials
  const irMaterials: Material[] = map.materials.length ? map.materials : [defaultMaterialFor()];
  if (!map.materials.length) warnings.push('Map had no materials; wrote one default material.');
  const materials: SkateMaterial[] = irMaterials.map((m, i) => toSkateMaterial(m, i, pass, textures.length));
  const triple = (i: number): SkateSurface => materials[i];
  const variants = new Map<string, number>();
  /** One-based skate material id for MapIR material `index` with gameplay surface `surface`. */
  const materialFor = (index: number, surface: SurfaceId | undefined): number => {
    if (surface === undefined) return index + 1;
    const want = skateSurface(surface);
    if (sameSkateSurface(want, triple(index))) return index + 1;
    const key = `${index}:${surface}`;
    let id = variants.get(key);
    if (id === undefined) {
      materials.push({ ...materials[index], name: `${materials[index].name}#${surface}`, audio: want.audio, physics: want.physics, pattern: want.pattern });
      id = materials.length;
      variants.set(key, id);
    }
    return id;
  };

  // ---------------------------------------------------------- render geometry
  const renderObjects = map.objects.filter((o) => o.render && o.mesh.indices.length > 0);
  if (!renderObjects.length) throw new SkateError('SKATE requires render geometry: no object has render=true with triangles');
  const parts = renderObjects.map((o) => buildRenderPart(o, irMaterials.length, warnings));
  const nv = parts.reduce((n, p) => n + p.count, 0);
  const ni = parts.reduce((n, p) => n + p.indices.length, 0);
  const vertices = {
    count: nv,
    positions: new Float32Array(nv * 3),
    normals: new Float32Array(nv * 3),
    uvs: new Float32Array(nv * 2),
    lightmapUvs: new Float32Array(nv * 2),
    materials: new Uint32Array(nv),
    decalUvs: new Float32Array(nv * 2),
    tangentFrames: new Uint8Array(nv * 4),
  };
  const indices = new Uint32Array(ni);
  let vBase = 0;
  let iBase = 0;
  for (const p of parts) {
    vertices.positions.set(p.positions, vBase * 3);
    vertices.normals.set(p.normals, vBase * 3);
    vertices.uvs.set(p.uvs, vBase * 2);
    vertices.lightmapUvs.set(p.lightmapUvs, vBase * 2);
    vertices.decalUvs.set(p.decalUvs, vBase * 2);
    vertices.tangentFrames.set(p.tangentFrames, vBase * 4);
    for (let i = 0; i < p.count; i++) vertices.materials[vBase + i] = p.materials[i] + 1;
    for (let i = 0; i < p.indices.length; i++) indices[iBase + i] = p.indices[i] + vBase;
    vBase += p.count;
    iBase += p.indices.length;
  }

  // ---------------------------------------------------------------- collision
  const points: number[] = [];
  const surfaces: number[] = [];
  const cmaterials: number[] = [];
  const edges: number[] = [];
  let ordinal = 0;
  let skipped = 0;
  const rwcmKept = (pass?.extensions ?? []).some((e) => e.tag === 'RWCM' && e.payload.length > 0);
  for (const o of map.objects) {
    const mode = o.collision.mode;
    if (mode === 'none') continue;
    // Decoded RWCM collision: the archive itself is written back, so skip the copy.
    if (rwcmKept && (o.extra?.skate as { kind?: string } | undefined)?.kind === 'rwcm') continue;
    ordinal++;
    if (mode === 'convex' || mode === 'hull') {
      warnings.push(`${o.name}: collision mode '${mode}' written as exact triangles (no convex decomposition in .skate export).`);
    }
    const ex = o.extra?.skate as SkateCollisionExtra | undefined;
    const triCount = o.mesh.indices.length / 3;
    const reuse = ex?.kind === 'collision' && ex.surfaces.length === triCount && isIdentity(o.transform) ? ex : null;
    const T = o.transform;
    const flip = det3(T) < 0;
    const pos = o.mesh.positions;
    const overrideSurface: SurfaceId | undefined = o.collision.surface ?? (mode === 'water' ? 'water' : undefined);
    const tri = new Float32Array(9);
    for (const g of groupsOf(o, irMaterials.length, warnings)) {
      for (let k = g.start; k < g.start + g.count; k += 3) {
        const t = k / 3;
        const corner = [o.mesh.indices[k], o.mesh.indices[flip ? k + 2 : k + 1], o.mesh.indices[flip ? k + 1 : k + 2]];
        for (let c = 0; c < 3; c++) {
          const p = transformPoint(T, pos, corner[c]);
          tri[c * 3] = p[0]; tri[c * 3 + 1] = p[1]; tri[c * 3 + 2] = p[2];
        }
        const area = collisionArea2(tri, 0);
        if (!Number.isFinite(area) || !(area > 0)) { skipped++; continue; }
        for (let c = 0; c < 9; c++) points.push(tri[c]);
        if (reuse && overrideSurface === undefined && reuse.materials[t] === g.material + 1) {
          surfaces.push(reuse.surfaces[t]);
          cmaterials.push(reuse.materials[t]);
          let same = !!reuse.edgeCodes;
          for (let c = 0; c < 9 && same; c++) same = reuse.points[t * 9 + c] === tri[c];
          for (let b = 0; b < 4; b++) edges.push(same ? reuse.edgeCodes![t * 4 + b] : 0);
        } else {
          surfaces.push(ordinal);
          cmaterials.push(materialFor(g.material, overrideSurface));
          edges.push(0, 0, 0, 0);
        }
      }
    }
  }
  if (skipped) warnings.push(`${skipped} degenerate collision triangle(s) skipped (the engine rejects zero-area collision).`);

  // ------------------------------------------------------------------- rails
  const rails: SkateRail[] = map.rails.map((r) => {
    const ex = r.extra?.skate as SkateRailExtra | undefined;
    if (ex?.native && ex.sampled === JSON.stringify(r.points)) return { name: r.name, closed: r.closed, points: [], native: ex.native };
    return { name: r.name, closed: r.closed, points: r.points.map((p) => [p[0], p[1], p[2]] as [number, number, number]), native: null };
  });

  // ------------------------------------------------------------ spawn / env
  const spawn = map.spawns[0];
  if (!spawn) warnings.push('No spawn; wrote the origin facing +Z.');
  if (map.spawns.length > 1) warnings.push(`.skate has one spawn; wrote "${map.spawns[0].name}" and dropped ${map.spawns.length - 1}.`);
  const yaw = spawn?.yaw ?? 0;
  const heading = pass && pass.spawnYaw === yaw ? pass.heading : yaw / RADIANS_TO_YAW;
  const environment = (pass?.environment ?? []).slice(0, 45);
  for (let i = environment.length; i < 45; i++) environment.push(DEFAULT_ENVIRONMENT[i]);

  // ------------------------------------------------------------------ lights
  const lights: SkateLight[] = [];
  map.lights.forEach((l, i) => {
    if (l.kind === 'sun') { applySun(environment, l); return; }
    lights.push(toSkateLight(l, pass?.lights[i]?.name === l.name ? pass.lights[i] : undefined));
  });

  // -------------------------------------------------------------- extensions
  const extensions: SkateExtension[] = [];
  let droppedObjects = false;
  for (const e of pass?.extensions ?? []) {
    if (e.tag === 'MOBJ') {
      const problem = checkMobj(e, ni, points.length / 9, rails.length);
      if (problem) { warnings.push(`Dropped MOBJ editor-object table: ${problem}.`); droppedObjects = true; continue; }
    }
    extensions.push(e);
  }
  if (droppedObjects) {
    const before = extensions.length;
    const kept = extensions.filter((e) => e.tag !== 'BGRP');
    if (kept.length !== before) warnings.push('Dropped BGRP break groups (they reference MOBJ objects).');
    extensions.length = 0;
    extensions.push(...kept);
  }

  const raw: SkateMap = {
    version: 0,
    name: map.name || 'map',
    spawn: spawn ? [spawn.position[0], spawn.position[1], spawn.position[2]] : [0, 0, 0],
    heading,
    environment,
    materials,
    textures,
    geometry: {
      vertices,
      indices,
      collision: {
        count: points.length / 9,
        points: Float32Array.from(points),
        surfaces: Uint32Array.from(surfaces),
        materials: Uint32Array.from(cmaterials),
        edgeWords: Uint8Array.from(edges),
      },
    },
    rails,
    doors: pass?.doors ?? [],
    lights,
    routes: pass?.routes ?? [],
    extensions,
  };
  return { raw, warnings };
}

function defaultMaterialFor(): Material {
  return {
    name: 'default', color: [1, 1, 1, 1], roughness: 0.8, metallic: 0, emissive: 0, textures: {},
    alphaMode: 'opaque', alphaCutoff: 0.5, doubleSided: false, surface: 'concrete',
  };
}

function toSkateMaterial(m: Material, index: number, pass: SkateMapExtra | null, textureCount: number): SkateMaterial {
  const p = pass?.materials[index];
  const base = p && p.raw.name === m.name ? p : undefined;
  const slot = (i: number | undefined, label: string): number => {
    if (i === undefined || i < 0) return 0;
    if (i >= textureCount) throw new SkateError(`material ${m.name}: ${label} texture ${i} out of range`);
    return i + 1;
  };
  const surface = base && base.surface === m.surface ? base.raw : skateSurface(m.surface);
  const alphaMode = m.alphaMode === 'mask' ? 1 : m.alphaMode === 'blend' ? 2 : 0;
  const lightmap = slot(m.textures.lightmap, 'lightmap');
  return {
    name: m.name || `material_${index}`,
    // exporter.py defaults: ow_flags 1, ow_friction 0.82, ow_restitution 0, baked strength 1.
    flags: base?.raw.flags ?? 1,
    friction: base?.raw.friction ?? 0.82,
    restitution: base?.raw.restitution ?? 0,
    color: [m.color[0], m.color[1], m.color[2]],
    roughness: clamp01(m.roughness),
    emissive: Math.max(0, m.emissive),
    textures: [slot(m.textures.albedo, 'albedo'), lightmap, slot(m.textures.normal, 'normal'), slot(m.textures.orm, 'orm'), slot(m.textures.emissive, 'emissive')],
    indirectStrength: base?.raw.indirectStrength ?? 1,
    alphaMode,
    alphaCutoff: clamp01(m.alphaCutoff),
    audio: surface.audio,
    physics: surface.physics,
    pattern: surface.pattern,
    depthLayer: base && base.raw.alphaMode === alphaMode ? base.raw.depthLayer : null,
    retailDefinition: base?.raw.retailDefinition ?? null,
  };
}

function toSkateLight(l: Light, p: SkateLight | undefined): SkateLight {
  const spot = l.kind === 'spot';
  const dir = l.direction ?? p?.direction ?? [0, -1, 0];
  const kind = spot ? 1 : p?.kind === 2 ? 2 : 0;
  const sameKind = p && p.kind === kind;
  return {
    name: l.name,
    kind,
    position: [l.position[0], l.position[1], l.position[2]],
    direction: [dir[0], dir[1], dir[2]],
    color: [l.color[0], l.color[1], l.color[2]],
    intensity: Math.max(0, l.intensity),
    range: l.range && l.range > 0 ? l.range : p?.range ?? 10,
    radius: sameKind ? p.radius : 0.1,
    // Exporter writes cosines of 1 for point/area lights; spot defaults to 30/45 degree half-angles.
    innerCos: sameKind ? p.innerCos : spot ? Math.cos(Math.PI / 6) : 1,
    outerCos: sameKind ? p.outerCos : spot ? Math.cos(Math.PI / 4) : 1,
  };
}

/** exporter.py `_sun_metadata`: colour, intensity and orbit azimuth from a sun light. */
function applySun(env: number[], l: Light): void {
  env[ENV.sunColor] = l.color[0];
  env[ENV.sunColor + 1] = l.color[1];
  env[ENV.sunColor + 2] = l.color[2];
  env[ENV.sunIntensity] = Math.max(0, l.intensity);
  if (l.direction) {
    const toLight = [-l.direction[0], -l.direction[1], -l.direction[2]];
    if (Math.hypot(toLight[0], toLight[2]) > 1e-5) env[ENV.orbitAzimuth] = Math.atan2(toLight[2], toLight[0]);
  }
}

/** validate_static_objects (skate_map.rs) ranges against the new counts. */
function checkMobj(e: SkateExtension, indexCount: number, collisionCount: number, railCount: number): string | null {
  if (e.schema !== 3) return null;
  try {
    const dv = new DataView(e.payload.buffer, e.payload.byteOffset, e.payload.byteLength);
    let at = 0;
    const u = () => { const v = dv.getUint32(at, true); at += 4; return v; };
    const count = u();
    for (let i = 0; i < count; i++) {
      u();
      at += u(); // name
      at += 12;
      for (const limit of [indexCount, collisionCount]) {
        const first = u();
        const length = u();
        if (first + length > limit) return 'its geometry ranges no longer match the written geometry';
      }
      const rails = u();
      for (let k = 0; k < rails; k++) if (u() >= railCount) return 'it references rails that were removed';
      at += 4 + 4 + 24 + 8;
    }
    return at === e.payload.length ? null : 'malformed payload';
  } catch {
    return 'malformed payload';
  }
}

// ------------------------------------------------------------ render parts

interface RenderPart {
  count: number;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  lightmapUvs: Float32Array;
  decalUvs: Float32Array;
  tangentFrames: Uint8Array;
  /** Zero-based MapIR material per vertex. */
  materials: Uint32Array;
  indices: Uint32Array;
}

function groupsOf(o: MapObject, materialCount: number, warnings: string[]) {
  const n = o.mesh.indices.length;
  let groups = o.mesh.groups;
  if (!groups.length && n) {
    warnings.push(`${o.name}: no material groups; used material 0.`);
    groups = [{ start: 0, count: n, material: 0 }];
  }
  for (const g of groups) {
    if (g.material < 0 || g.material >= materialCount) throw new SkateError(`${o.name}: group material ${g.material} out of range`);
    if (g.start % 3 || g.count % 3 || g.start + g.count > n) throw new SkateError(`${o.name}: group range is not whole triangles`);
  }
  return groups;
}

function buildRenderPart(o: MapObject, materialCount: number, warnings: string[]): RenderPart {
  const mesh = o.mesh;
  const srcCount = mesh.positions.length / 3;
  const groups = groupsOf(o, materialCount, warnings);
  const ex = o.extra?.skate as SkateRenderExtra | undefined;
  const extra = ex?.kind === 'render' && ex.uvs.length === srcCount * 2 ? ex : null;

  // One material per output vertex.
  const vm = new Int32Array(srcCount).fill(-1);
  let conflict = false;
  for (const g of groups) {
    for (let k = g.start; k < g.start + g.count; k++) {
      const v = mesh.indices[k];
      if (v >= srcCount) throw new SkateError(`${o.name}: index out of range`);
      if (vm[v] === -1) vm[v] = g.material;
      else if (vm[v] !== g.material) conflict = true;
    }
  }
  let src: Uint32Array;
  let materials: Uint32Array;
  const indices = new Uint32Array(groups.reduce((n, g) => n + g.count, 0));
  const T = o.transform;
  const flip = det3(T) < 0;
  if (!conflict) {
    src = new Uint32Array(srcCount);
    materials = new Uint32Array(srcCount);
    const fallback = groups[0]?.material ?? 0;
    for (let i = 0; i < srcCount; i++) {
      src[i] = i;
      const keep = extra ? extra.vertexMaterials[i] - 1 : -1;
      materials[i] = vm[i] >= 0 ? vm[i] : keep >= 0 && keep < materialCount ? keep : fallback;
    }
    let at = 0;
    for (const g of groups) for (let k = g.start; k < g.start + g.count; k++) indices[at++] = mesh.indices[k];
  } else {
    const remap = new Map<number, number>();
    const order: number[] = [];
    const mats: number[] = [];
    let at = 0;
    for (const g of groups) {
      for (let k = g.start; k < g.start + g.count; k++) {
        const v = mesh.indices[k];
        const key = v * materialCount + g.material;
        let id = remap.get(key);
        if (id === undefined) { id = order.length; remap.set(key, id); order.push(v); mats.push(g.material); }
        indices[at++] = id;
      }
    }
    src = Uint32Array.from(order);
    materials = Uint32Array.from(mats);
  }
  if (flip) for (let k = 0; k < indices.length; k += 3) { const t = indices[k + 1]; indices[k + 1] = indices[k + 2]; indices[k + 2] = t; }

  const count = src.length;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const p = transformPoint(T, mesh.positions, src[i]);
    positions[i * 3] = p[0]; positions[i * 3 + 1] = p[1]; positions[i * 3 + 2] = p[2];
  }
  let normals: Float32Array;
  if (mesh.normals && mesh.normals.length === mesh.positions.length) {
    normals = new Float32Array(count * 3);
    const N = normalMatrix(T);
    const ident = isIdentity(T);
    for (let i = 0; i < count; i++) {
      const s = src[i] * 3;
      const x = mesh.normals[s], y = mesh.normals[s + 1], z = mesh.normals[s + 2];
      if (ident) { normals[i * 3] = x; normals[i * 3 + 1] = y; normals[i * 3 + 2] = z; continue; }
      const nx = N[0] * x + N[3] * y + N[6] * z;
      const ny = N[1] * x + N[4] * y + N[7] * z;
      const nz = N[2] * x + N[5] * y + N[8] * z;
      const len = Math.hypot(nx, ny, nz) || 1;
      normals[i * 3] = nx / len; normals[i * 3 + 1] = ny / len; normals[i * 3 + 2] = nz / len;
    }
  } else {
    normals = computeNormals(positions, indices);
  }

  // UVs in .skate convention (v up). While a value is unchanged from what was
  // read, the original f32 is reused so 1 - (1 - v) rounding never drifts.
  const toSkate = (ir: Float32Array | undefined, orig: Float32Array | null | undefined): Float32Array => {
    const out = new Float32Array(count * 2);
    if (!ir || ir.length !== srcCount * 2) return out;
    for (let i = 0; i < count; i++) {
      const s = src[i] * 2;
      out[i * 2] = ir[s];
      const v = ir[s + 1];
      out[i * 2 + 1] = orig && fr(1 - orig[s + 1]) === v ? orig[s + 1] : 1 - v;
    }
    return out;
  };
  const uvs = toSkate(mesh.uvs, extra?.uvs);
  const lightmapUvs = mesh.uv2 ? toSkate(mesh.uv2, extra?.lightmapUvs) : uvs.slice();
  let decalUvs = uvs;
  if (extra?.decalUvs) {
    decalUvs = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) { decalUvs[i * 2] = extra.decalUvs[src[i] * 2]; decalUvs[i * 2 + 1] = extra.decalUvs[src[i] * 2 + 1]; }
  }
  let tangentFrames: Uint8Array;
  if (extra?.tangentFrames && isIdentity(T)) {
    tangentFrames = new Uint8Array(count * 4);
    for (let i = 0; i < count; i++) tangentFrames.set(extra.tangentFrames.subarray(src[i] * 4, src[i] * 4 + 4), i * 4);
  } else {
    tangentFrames = mesh.uvs ? computeTangentFrames(positions, normals, uvs, indices) : new Uint8Array(count * 4);
  }
  return { count, positions, normals, uvs, lightmapUvs, decalUvs, tangentFrames, materials, indices };
}

// ------------------------------------------------------------------ math

function isIdentity(m: Mat4): boolean {
  for (let i = 0; i < 16; i++) if (m[i] !== (i % 5 === 0 ? 1 : 0)) return false;
  return true;
}

function det3(m: Mat4): number {
  return m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
}

function transformPoint(m: Mat4, p: ArrayLike<number>, i: number): [number, number, number] {
  const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

/** Cofactor matrix of the upper 3x3 (column-major), i.e. det * inverse-transpose, sign-corrected. */
function normalMatrix(m: Mat4): number[] {
  const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], k = m[10];
  const cof = [
    e * k - f * h, f * g - d * k, d * h - e * g,
    c * h - b * k, a * k - c * g, b * g - a * h,
    b * f - c * e, c * d - a * f, a * e - b * d,
  ];
  // `cof` is the cofactor matrix in column-major order, applied like `m` itself.
  const s = det3(m) < 0 ? -1 : 1;
  return cof.map((v) => v * s);
}

function computeNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const n = new Float32Array(positions.length);
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k] * 3, b = indices[k + 1] * 3, c = indices[k + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    for (const i of [a, b, c]) { n[i] += cx; n[i + 1] += cy; n[i + 2] += cz; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const len = Math.hypot(n[i], n[i + 1], n[i + 2]);
    if (len > 0) { n[i] /= len; n[i + 1] /= len; n[i + 2] /= len; } else { n[i + 1] = 1; }
  }
  return n;
}

const snorm8 = (v: number) => Math.max(-127, Math.min(127, Math.round(Math.max(-1, Math.min(1, v)) * 127))) & 0xff;

/**
 * Packed tangent frames as the retail writer builds them: binormal =
 * cross(normal, tangent) * sign as snorm8 xyz, sign as snorm8 w. The engine
 * reconstructs tangent = cross(binormal, normal) * w. Tangents follow the
 * UVs as stored in the file (.skate convention).
 */
function computeTangentFrames(positions: Float32Array, normals: Float32Array, uvs: Float32Array, indices: Uint32Array): Uint8Array {
  const count = positions.length / 3;
  const tan = new Float64Array(count * 3);
  const bit = new Float64Array(count * 3);
  for (let k = 0; k < indices.length; k += 3) {
    const ia = indices[k], ib = indices[k + 1], ic = indices[k + 2];
    const e1 = [positions[ib * 3] - positions[ia * 3], positions[ib * 3 + 1] - positions[ia * 3 + 1], positions[ib * 3 + 2] - positions[ia * 3 + 2]];
    const e2 = [positions[ic * 3] - positions[ia * 3], positions[ic * 3 + 1] - positions[ia * 3 + 1], positions[ic * 3 + 2] - positions[ia * 3 + 2]];
    const du1 = uvs[ib * 2] - uvs[ia * 2], dv1 = uvs[ib * 2 + 1] - uvs[ia * 2 + 1];
    const du2 = uvs[ic * 2] - uvs[ia * 2], dv2 = uvs[ic * 2 + 1] - uvs[ia * 2 + 1];
    const det = du1 * dv2 - du2 * dv1;
    if (!det) continue;
    const r = 1 / det;
    for (let c = 0; c < 3; c++) {
      const t = (e1[c] * dv2 - e2[c] * dv1) * r;
      const b = (e2[c] * du1 - e1[c] * du2) * r;
      for (const v of [ia, ib, ic]) { tan[v * 3 + c] += t; bit[v * 3 + c] += b; }
    }
  }
  const out = new Uint8Array(count * 4);
  for (let i = 0; i < count; i++) {
    const nx = normals[i * 3], ny = normals[i * 3 + 1], nz = normals[i * 3 + 2];
    let tx = tan[i * 3], ty = tan[i * 3 + 1], tz = tan[i * 3 + 2];
    const d = tx * nx + ty * ny + tz * nz;
    tx -= nx * d; ty -= ny * d; tz -= nz * d;
    const len = Math.hypot(tx, ty, tz);
    if (len < 1e-12) continue; // zero frame: engine falls back to generated tangents
    tx /= len; ty /= len; tz /= len;
    // cross(n, t)
    const cx = ny * tz - nz * ty, cy = nz * tx - nx * tz, cz = nx * ty - ny * tx;
    const sign = cx * bit[i * 3] + cy * bit[i * 3 + 1] + cz * bit[i * 3 + 2] < 0 ? -1 : 1;
    out[i * 4] = snorm8(cx * sign);
    out[i * 4 + 1] = snorm8(cy * sign);
    out[i * 4 + 2] = snorm8(cz * sign);
    out[i * 4 + 3] = snorm8(sign);
  }
  return out;
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}
