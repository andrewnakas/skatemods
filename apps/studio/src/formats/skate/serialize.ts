// SkateMap -> .skate bytes (SKATE14 or SKATE15). Layout follows the Blender
// addon exporter (owned_world_material_addon/exporter.py, SKATE15 and its
// SKATE_EXPORT_COMPAT14 mode) and tools/asset_pipeline/map_writer.py (SKATE14).
// SKATE15 uses the deflate flavour of the reversible transforms (methods 7..10)
// and texture back-references (11); zstd is never written (no encoder in the
// browser), which the reader accepts.
import {
  ByteWriter, COLLISION_BYTES, SkateError, STORAGE_DEFLATE_COLLISION_INDEXED, STORAGE_DEFLATE_INDEX_DELTA,
  STORAGE_DEFLATE_RGBA_FILTER, STORAGE_DEFLATE_VERTEX_SOA, STORAGE_TEXTURE_REFERENCE, VERTEX_BYTES,
  filterRgba8, indexDeltaVarints, indexedCollision, vertexSoa, writeStored, writeTransformed, type Compression,
} from './storage';
import type { SkateGeometry, SkateMap, SkateMaterial, SkateRail } from './types';

export interface SerializeOptions {
  version?: 14 | 15;
  compression?: Compression;
  /** zlib level 0..9, default 6. */
  level?: number;
}

/**
 * Environment defaults from exporter.py `_scene_metadata` (45 floats after
 * spawn + heading): sky zenith/horizon/nadir, cycle seconds, start hour,
 * orbit azimuth, end hour, ping-pong, twilight zenith/horizon/nadir, night
 * zenith/horizon/nadir, sun colour, moon colour, sun intensity, moon
 * intensity, day ambient, night ambient, sky tint.
 */
export const DEFAULT_ENVIRONMENT: readonly number[] = [
  0.09, 0.34, 0.72, 0.58, 0.78, 0.98, 0.18, 0.25, 0.34,
  96, 9, 0.62, 17, 0,
  0.045, 0.10, 0.26, 1.0, 0.32, 0.10, 0.05, 0.035, 0.06,
  0.007, 0.015, 0.045, 0.045, 0.085, 0.17, 0.008, 0.014, 0.032,
  1.0, 0.92, 0.78, 0.42, 0.56, 0.92,
  1.25, 0.18, 0.32, 0.11,
  1, 1, 1,
];
export const ENV = { sunColor: 32, sunIntensity: 38, orbitAzimuth: 11 } as const;

const OVERLAY_TOKENS = [
  'sign', '_sgn', 'sgn_', 'sgns', 'poster', 'billboard', 'adbord', 'advert', 'banner', 'logo', 'decal', 'graffiti',
  'sticker', 'plaque', 'letter', 'neon', 'marking', 'videowall', 'vwall', 'branding',
];

/** exporter.py `_presentation_depth_layer` without an authored override. */
export function defaultDepthLayer(name: string, alphaMode: number): number {
  if (alphaMode === 2) return 3;
  const lower = name.toLowerCase();
  if (OVERLAY_TOKENS.some((t) => lower.includes(t))) return 2;
  return alphaMode === 1 ? 1 : 0;
}

export function serializeSkate(map: SkateMap, opts: SerializeOptions = {}): Uint8Array {
  const version = opts.version ?? 14;
  if (version !== 14 && version !== 15) throw new SkateError(`writeSkate supports SKATE14 and SKATE15, not ${version}`);
  const compression = opts.compression ?? 'zlib';
  const level = opts.level ?? 6;
  if (!map.name) throw new SkateError('SKATE map name must not be empty');
  const g = map.geometry;
  if (!map.materials.length || !g.vertices.count || !g.indices.length) {
    throw new SkateError('SKATE requires materials and render geometry');
  }
  if (!g.collision.count && !map.extensions.some((e) => e.tag === 'RWCM' && e.schema === 1 && e.payload.length > 0)) {
    throw new SkateError('SKATE requires collision triangles (an object with collision) or an embedded RWCM archive');
  }

  const w = new ByteWriter(1 << 20);
  w.bytes(new TextEncoder().encode(`SKATE${version}\0`));
  w.u(0x12345678);
  w.string(map.name);
  w.fs(map.spawn);
  w.f(map.heading);
  const env = map.environment.slice(0, 45);
  for (let i = env.length; i < 45; i++) env.push(DEFAULT_ENVIRONMENT[i]);
  w.fs(env);
  for (const n of [map.materials.length, map.textures.length, g.vertices.count, g.indices.length, g.collision.count,
    map.rails.length, map.doors.length, map.lights.length, map.routes.length]) w.u(n);

  const materials = new ByteWriter();
  for (const m of map.materials) writeMaterial(materials, m, map.textures.length);
  const materialBytes = materials.finish();
  if (version >= 15) {
    w.u(materialBytes.length);
    writeStored(w, materialBytes, compression, level);
  } else {
    w.bytes(materialBytes);
  }

  // Textures, deduplicated by content in SKATE15 (STORAGE_TEXTURE_REFERENCE).
  const seen = new Map<string, number[]>();
  map.textures.forEach((t, index) => {
    const expected = t.width * t.height * 4;
    if ((t.width === 0) !== (t.height === 0) || t.width > 16384 || t.height > 16384) {
      throw new SkateError(`texture ${t.name}: invalid size ${t.width}x${t.height}`);
    }
    if (t.rgba.length !== expected) throw new SkateError(`texture ${t.name}: RGBA8 has ${t.rgba.length} bytes, expected ${expected}`);
    w.string(t.name);
    w.u(t.width);
    w.u(t.height);
    w.u(t.colorSpace ? 1 : 0);
    if (version >= 15 && expected > 0) {
      const key = `${t.width}x${t.height}:${fnv1a(t.rgba)}`;
      const candidates = seen.get(key) ?? [];
      const source = candidates.find((i) => sameBytes(map.textures[i].rgba, t.rgba));
      if (source !== undefined) {
        w.u(STORAGE_TEXTURE_REFERENCE);
        w.u(4);
        w.u(source);
        return;
      }
      candidates.push(index);
      seen.set(key, candidates);
      writeTransformed(w, t.rgba, () => filterRgba8(t.rgba, t.width, t.height), STORAGE_DEFLATE_RGBA_FILTER, compression, level);
    } else {
      writeStored(w, t.rgba, compression, level);
    }
  });

  const vertexBytes = packVertices(g);
  const indexBytes = packIndices(g.indices);
  const collisionBytes = packCollision(g);
  if (version >= 15) {
    writeTransformed(w, vertexBytes, () => vertexSoa(vertexBytes), STORAGE_DEFLATE_VERTEX_SOA, compression, level);
    writeTransformed(w, indexBytes, () => indexDeltaVarints(g.indices), STORAGE_DEFLATE_INDEX_DELTA, compression, level);
    writeTransformed(w, collisionBytes, () => indexedCollision(collisionBytes), STORAGE_DEFLATE_COLLISION_INDEXED, compression, level);
  } else {
    writeStored(w, vertexBytes, compression, level);
    writeStored(w, indexBytes, compression, level);
    writeStored(w, collisionBytes, compression, level);
  }

  for (const rail of map.rails) writeRail(w, rail);
  for (const d of map.doors) {
    w.string(d.name);
    if (d.frame.length !== 6) throw new SkateError(`door ${d.name}: frame needs 6 vectors`);
    for (const v of d.frame) w.fs(v);
    w.fs(d.motion);
    // SKATE5+ doors carry the response triple; older doors default to zero.
    w.fs(d.response ?? [0, 0, 0]);
    w.f(d.friction);
    w.f(d.restitution);
    w.u(d.surface);
    w.u(d.geometry.vertices.count);
    w.u(d.geometry.indices.length);
    w.u(d.geometry.collision.count);
    w.bytes(packVertices(d.geometry));
    w.bytes(packIndices(d.geometry.indices));
    w.bytes(packCollision(d.geometry));
  }
  for (const l of map.lights) {
    w.string(l.name);
    w.u(l.kind);
    w.fs(l.position);
    w.fs(l.direction);
    w.fs(l.color);
    w.f(l.intensity);
    w.f(l.range);
    w.f(l.radius);
    w.f(l.innerCos);
    w.f(l.outerCos);
  }
  for (const r of map.routes) {
    w.string(r.rail.name);
    w.u(r.rail.closed ? 1 : 0);
    w.u(r.skaters);
    w.f(r.speed);
    w.f(r.spacing);
    w.u(r.rail.points.length);
    for (const p of r.rail.points) w.fs(p);
  }
  w.u(map.extensions.length);
  for (const e of map.extensions) {
    w.tag(e.tag);
    w.u(e.schema);
    w.u(e.payload.length);
    writeStored(w, e.payload, compression, level);
  }
  return w.finish();
}

function writeMaterial(w: ByteWriter, m: SkateMaterial, textureCount: number): void {
  if (!m.name) throw new SkateError('SKATE material name must not be empty');
  if (m.textures.some((id) => id < 0 || id > textureCount)) throw new SkateError(`material ${m.name}: texture slot out of range`);
  if (m.alphaMode > 2 || m.audio > 127 || m.physics > 13 || m.pattern > 15 || m.friction < 0 || m.restitution < 0
    || !(m.roughness >= 0 && m.roughness <= 1) || !(m.alphaCutoff >= 0 && m.alphaCutoff <= 1) || m.indirectStrength < 0) {
    throw new SkateError(`material ${m.name}: field out of the range the engine accepts`);
  }
  w.string(m.name);
  w.u(m.flags);
  w.f(m.friction);
  w.f(m.restitution);
  w.fs(m.color);
  w.f(m.roughness);
  w.f(m.emissive);
  w.u(m.textures[0]);
  w.u(m.textures[1]);
  w.f(m.indirectStrength);
  w.u(m.textures[2]);
  w.u(m.textures[3]);
  w.u(m.textures[4]);
  w.u(m.alphaMode);
  w.f(m.alphaCutoff);
  w.u(m.audio);
  w.u(m.physics);
  w.u(m.pattern);
  const layer = m.depthLayer ?? defaultDepthLayer(m.name, m.alphaMode);
  if (layer > 3) throw new SkateError(`material ${m.name}: depth layer must be 0..3`);
  w.u(layer);
  if (m.retailDefinition) {
    w.u(1);
    w.bytes(m.retailDefinition);
  } else {
    w.u(0);
  }
}

function writeRail(w: ByteWriter, r: SkateRail): void {
  w.string(r.name);
  w.u(r.closed ? 1 : 0);
  if (r.native) {
    if (r.native.length < 28 || (r.native.length - 28) % 120 !== 0
      || new DataView(r.native.buffer, r.native.byteOffset, r.native.byteLength).getUint32(24, true) !== (r.native.length - 28) / 120) {
      throw new SkateError(`rail ${r.name}: malformed native spline`);
    }
    w.u(1);
    w.bytes(r.native);
  } else {
    w.u(0);
    w.u(r.points.length);
    for (const p of r.points) w.fs(p);
  }
}

/** 56-byte SKATE12+ vertex records. Missing decal UVs reuse UV0; missing tangent frames are zero. */
export function packVertices(g: SkateGeometry): Uint8Array {
  const v = g.vertices;
  const out = new Uint8Array(v.count * VERTEX_BYTES);
  const dv = new DataView(out.buffer);
  const put = (at: number, x: number) => {
    if (!Number.isFinite(x)) throw new SkateError('SKATE does not permit non-finite floats (vertex data)');
    dv.setFloat32(at, x, true);
  };
  for (let i = 0; i < v.count; i++) {
    const o = i * VERTEX_BYTES;
    for (let k = 0; k < 3; k++) {
      put(o + k * 4, v.positions[i * 3 + k]);
      put(o + 12 + k * 4, v.normals[i * 3 + k]);
    }
    put(o + 24, v.uvs[i * 2]);
    put(o + 28, v.uvs[i * 2 + 1]);
    put(o + 32, v.lightmapUvs[i * 2]);
    put(o + 36, v.lightmapUvs[i * 2 + 1]);
    dv.setUint32(o + 40, v.materials[i], true);
    const decal = v.decalUvs ?? v.uvs;
    put(o + 44, decal[i * 2]);
    put(o + 48, decal[i * 2 + 1]);
    if (v.tangentFrames) out.set(v.tangentFrames.subarray(i * 4, i * 4 + 4), o + 52);
  }
  return out;
}

export function packIndices(indices: Uint32Array): Uint8Array {
  const out = new Uint8Array(indices.length * 4);
  const dv = new DataView(out.buffer);
  for (let i = 0; i < indices.length; i++) dv.setUint32(i * 4, indices[i], true);
  return out;
}

/** 48-byte SKATE11+ collision records. */
export function packCollision(g: SkateGeometry): Uint8Array {
  const c = g.collision;
  const out = new Uint8Array(c.count * COLLISION_BYTES);
  const dv = new DataView(out.buffer);
  for (let i = 0; i < c.count; i++) {
    const o = i * COLLISION_BYTES;
    for (let k = 0; k < 9; k++) {
      const x = c.points[i * 9 + k];
      if (!Number.isFinite(x)) throw new SkateError('SKATE does not permit non-finite floats (collision)');
      dv.setFloat32(o + k * 4, x, true);
    }
    dv.setUint32(o + 36, c.surfaces[i], true);
    dv.setUint32(o + 40, c.materials[i], true);
    if (c.edgeWords) out.set(c.edgeWords.subarray(i * 4, i * 4 + 4), o + 44);
  }
  return out;
}

function fnv1a(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  // Sample-stride hash keeps large textures cheap; equality is confirmed byte-for-byte.
  const step = Math.max(1, Math.floor(bytes.length / 65536));
  for (let i = 0; i < bytes.length; i += step) h = Math.imul(h ^ bytes[i], 0x01000193);
  return `${(h >>> 0).toString(16)}:${bytes.length}`;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
