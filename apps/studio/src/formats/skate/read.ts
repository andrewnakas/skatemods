// .skate -> MapIR.
//
// Conventions (all verified against the Rust engine and the exporters):
// - World space: .skate is already Y-up metres (the Blender exporter writes
//   (x, z, -y)), the same as MapIR, so positions pass through untouched.
// - Textures: .skate RGBA rows are bottom-first (Blender `image.pixels` order;
//   tools/asset_pipeline/map_writer.py flips PNGs before writing) and UVs have
//   v = 0 at the bottom (map_writer writes `1 - v`). MapIR is top-row-first
//   with glTF UVs, so rows are flipped and v -> 1 - v.
// - Heading: the engine builds the deck basis as Mat3::from_rotation_y(heading)
//   (crates/skate-game/src/physics.rs) and the board's forward axis is the
//   basis' third column (deck.basis.columns[2], used as `board_forward` in
//   physics/riding_outputs.rs; tests/map_startup.rs checks it equals
//   [sin h, 0, cos h]). So forward = (sin h, 0, cos h) and
//   MapIR yaw = degrees(atan2(fwd.x, fwd.z)) = degrees(heading).
//   The Blender exporter writes the spawn's Euler Z, which maps to the same
//   rotation about runtime +Y.
// - Surfaces: gameplay surface is per material (audio/physics/pattern); see surfaces.ts.
import { decodeRwcmSet } from './rwcm';
import type { Light, MapIR, MapObject, Material, MeshGroup, Rail, SurfaceId, Texture } from '../../ir';
import { IDENTITY, emptyMap } from '../../ir';
import type { SkateCollisionExtra, SkateMapExtra, SkateRailExtra, SkateRenderExtra } from './extra';
import { parseSkate, type ParseOptions } from './parse';
import { surfaceFromSkate } from './surfaces';
import type { SkateMap, SkateRail, SkateTexture } from './types';

export type { SkateMap } from './types';

export function readSkate(bytes: Uint8Array, opts: ParseOptions = {}): { map: MapIR; raw: SkateMap } {
  const raw = parseSkate(bytes, opts);
  return { map: skateToMapIR(raw), raw };
}

export const RADIANS_TO_YAW = 180 / Math.PI;

export function skateToMapIR(raw: SkateMap): MapIR {
  const map = emptyMap(raw.name, `skate SKATE${String(raw.version).padStart(2, '0')}`);

  map.textures = raw.textures.map(textureToIR);

  map.materials = raw.materials.map((m): Material => {
    const slot = (id: number) => (id > 0 ? id - 1 : undefined);
    const textures: Material['textures'] = {};
    const set = (key: keyof Material['textures'], id: number) => { const v = slot(id); if (v !== undefined) textures[key] = v; };
    set('albedo', m.textures[0]);
    set('lightmap', m.textures[1]);
    set('normal', m.textures[2]);
    set('orm', m.textures[3]);
    set('emissive', m.textures[4]);
    return {
      name: m.name,
      color: [m.color[0], m.color[1], m.color[2], 1],
      roughness: m.roughness,
      // The engine sets metallic = 1 when an ORM texture is bound, else 0.
      metallic: m.textures[3] ? 1 : 0,
      emissive: m.emissive,
      textures,
      alphaMode: m.alphaMode === 1 ? 'mask' : m.alphaMode === 2 ? 'blend' : 'opaque',
      alphaCutoff: m.alphaCutoff,
      doubleSided: false,
      surface: surfaceFromSkate(m),
    };
  });

  map.objects.push(renderObject(raw));
  if (raw.geometry.collision.count > 0) map.objects.push(collisionObject(raw));
  else map.objects.push(...rwcmObjects(raw, map.warnings));

  map.rails = raw.rails.map(railToIR);

  const yaw = raw.heading * RADIANS_TO_YAW;
  map.spawns = [{ name: 'spawn', position: [...raw.spawn], yaw }];

  map.lights = raw.lights.map((l): Light => ({
    name: l.name,
    kind: l.kind === 1 ? 'spot' : 'point',
    position: [...l.position],
    direction: [...l.direction],
    color: [...l.color],
    intensity: l.intensity,
    range: l.range,
  }));

  const extra: SkateMapExtra = {
    version: raw.version,
    environment: [...raw.environment],
    heading: raw.heading,
    spawnYaw: yaw,
    materials: raw.materials.map((m, i) => ({ raw: m, surface: map.materials[i].surface })),
    lights: raw.lights,
    doors: raw.doors,
    routes: raw.routes,
    extensions: raw.extensions,
  };
  map.extra = { skate: extra };

  if (raw.doors.length) map.warnings.push(`${raw.doors.length} hinged door(s) kept as .skate passthrough (not editable).`);
  if (raw.routes.length) map.warnings.push(`${raw.routes.length} NPC route(s) kept as .skate passthrough.`);
  if (raw.lights.some((l) => l.kind === 2)) map.warnings.push('Area lights are shown as point lights.');
  const native = raw.rails.filter((r) => r.native).length;
  if (native) map.warnings.push(`${native} native spline rail(s) sampled to polylines; unchanged ones are written back natively.`);
  if (raw.extensions.some((e) => e.tag === 'RWCM')) {
    map.warnings.push('Collision comes from the embedded RWCM archive (retail clustered mesh). It is decoded for other formats and written back unchanged to .skate.');
  }
  return map;
}

function textureToIR(t: SkateTexture): Texture {
  const tex: Texture = { name: t.name, width: t.width, height: t.height, srgb: t.colorSpace === 1 };
  if (t.width && t.height) tex.rgba = flipRows(t.rgba, t.width, t.height);
  return tex;
}

/** Bottom-first <-> top-first RGBA8 (its own inverse). */
export function flipRows(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const row = width * 4;
  const out = new Uint8Array(row * height);
  for (let y = 0; y < height; y++) out.set(rgba.subarray(y * row, y * row + row), (height - 1 - y) * row);
  return out;
}

/** v -> 1 - v on interleaved uv pairs (glTF <-> .skate). */
export function flipV(uv: Float32Array): Float32Array {
  const out = new Float32Array(uv.length);
  for (let i = 0; i < uv.length; i += 2) {
    out[i] = uv[i];
    out[i + 1] = 1 - uv[i + 1];
  }
  return out;
}

/** Groups = maximal runs of one material in index order, so nothing is reordered. */
function materialRuns(triangleMaterial: (t: number) => number, triangles: number): MeshGroup[] {
  const groups: MeshGroup[] = [];
  for (let t = 0; t < triangles; t++) {
    const material = triangleMaterial(t);
    const last = groups[groups.length - 1];
    if (last && last.material === material) last.count += 3;
    else groups.push({ start: t * 3, count: 3, material });
  }
  return groups;
}

function renderObject(raw: SkateMap): MapObject {
  const { vertices, indices } = raw.geometry;
  const extra: SkateRenderExtra = {
    kind: 'render',
    uvs: vertices.uvs,
    lightmapUvs: vertices.lightmapUvs,
    decalUvs: vertices.decalUvs,
    tangentFrames: vertices.tangentFrames,
    vertexMaterials: vertices.materials,
  };
  return {
    name: raw.name,
    mesh: {
      // Shared with `raw` (no copy): retail maps have millions of vertices.
      positions: vertices.positions,
      normals: vertices.normals,
      uvs: flipV(vertices.uvs),
      uv2: flipV(vertices.lightmapUvs),
      indices,
      groups: materialRuns((t) => vertices.materials[indices[t * 3]] - 1, indices.length / 3),
    },
    transform: [...IDENTITY],
    render: true,
    collision: { mode: 'none' },
    extra: { skate: extra },
  };
}

function collisionObject(raw: SkateMap): MapObject {
  const c = raw.geometry.collision;
  const indices = new Uint32Array(c.count * 3);
  for (let i = 0; i < indices.length; i++) indices[i] = i;
  const extra: SkateCollisionExtra = {
    kind: 'collision',
    surfaces: c.surfaces,
    materials: c.materials,
    edgeCodes: c.edgeWords,
    points: c.points,
  };
  return {
    name: `${raw.name} collision`,
    mesh: {
      positions: c.points.slice(),
      indices,
      groups: materialRuns((t) => c.materials[t] - 1, c.count),
    },
    transform: [...IDENTITY],
    render: false,
    collision: { mode: 'mesh' },
    extra: { skate: extra },
  };
}

/**
 * Retail maps carry collision only as an RWCM archive. Decode it into one collision object per
 * gameplay surface so other formats get real collision. Tagged kind 'rwcm' so the .skate writer
 * skips them while the original archive is still passed through.
 */
function rwcmObjects(raw: SkateMap, warnings: string[]): MapObject[] {
  const ext = raw.extensions.find((e) => e.tag === 'RWCM' && e.payload.length > 0);
  if (!ext) return [];
  let tris;
  try { tris = decodeRwcmSet(ext.payload); } catch (e) {
    warnings.push(`Could not decode the RWCM collision archive (${e instanceof Error ? e.message : e}); other formats get no collision.`);
    return [];
  }
  const bySurface = new Map<SurfaceId, number[]>();
  for (let t = 0; t < tris.count; t++) {
    const packed = tris.surfaces[t];
    const id = surfaceFromSkate({ audio: packed & 127, physics: (packed >> 7) & 31, pattern: packed >> 12 });
    (bySurface.get(id) ?? bySurface.set(id, []).get(id)!).push(t);
  }
  const out: MapObject[] = [];
  for (const [surface, list] of bySurface) {
    const positions = new Float32Array(list.length * 9);
    list.forEach((t, i) => positions.set(tris.points.subarray(t * 9, t * 9 + 9), i * 9));
    const indices = Uint32Array.from({ length: list.length * 3 }, (_, i) => i);
    out.push({
      name: `${raw.name} collision (${surface})`,
      mesh: { positions, indices, groups: [{ start: 0, count: indices.length, material: 0 }] },
      transform: [...IDENTITY],
      render: false,
      collision: { mode: 'mesh', surface },
      extra: { skate: { kind: 'rwcm' } },
    });
  }
  return out;
}

/** Samples per native spline segment when converting to a polyline. */
export const NATIVE_RAIL_SAMPLES = 4;

function railToIR(r: SkateRail): Rail {
  if (!r.native) return { name: r.name, points: r.points.map((p) => [...p]), closed: r.closed };
  const points = sampleNativeRail(r.native, r.closed);
  const extra: SkateRailExtra = { native: r.native, sampled: JSON.stringify(points) };
  return { name: r.name, points, closed: r.closed, extra: { skate: extra } };
}

/**
 * Native retail spline (rail representation 1): after the 24-byte header and
 * the u32 segment count, each 120-byte segment is 30 f32 words (stored as
 * little-endian u32). Words 0..2, 4..6, 8..10, 12..14 are the cubic
 * coefficients a, b, c, d of P(t) = a t^3 + b t^2 + c t + d, t in [0, 1]
 * (exporter.py `_retail_grind_controls`), already in Y-up metres.
 */
export function sampleNativeRail(native: Uint8Array, closed: boolean, samples = NATIVE_RAIL_SAMPLES): [number, number, number][] {
  const dv = new DataView(native.buffer, native.byteOffset, native.byteLength);
  const count = dv.getUint32(24, true);
  const points: [number, number, number][] = [];
  const at = (seg: number, word: number) => dv.getFloat32(28 + seg * 120 + word * 4, true);
  const evaluate = (seg: number, t: number): [number, number, number] => {
    const p: number[] = [];
    for (let k = 0; k < 3; k++) {
      const a = at(seg, k), b = at(seg, 4 + k), c = at(seg, 8 + k), d = at(seg, 12 + k);
      p.push(((a * t + b) * t + c) * t + d);
    }
    return p as [number, number, number];
  };
  for (let s = 0; s < count; s++) for (let i = 0; i < samples; i++) points.push(evaluate(s, i / samples));
  if (count && !closed) points.push(evaluate(count - 1, 1));
  return points;
}
