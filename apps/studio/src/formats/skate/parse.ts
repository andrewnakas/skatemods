// .skate (SKATE01..SKATE15) -> SkateMap. A line-for-line port of
// SkateMap::parse_inner in crates/skate-data/src/skate_map.rs, including its
// validation, so a file this accepts is a file the Rust engine accepts.
import {
  ByteReader, COLLISION_BYTES, COLLISION_BYTES_V10, SkateError, STORAGE_RAW, STORAGE_TEXTURE_REFERENCE,
  VERTEX_BYTES, VERTEX_BYTES_V11, decodeStored, readStoredBlock, type StoredBlock,
} from './storage';
import type {
  SkateCollision, SkateDoor, SkateExtension, SkateGeometry, SkateLight, SkateMap, SkateMaterial, SkateRail,
  SkateRoute, SkateTexture, SkateVertices,
} from './types';

export interface ParseOptions {
  /** Playable maps need collision or an RWCM archive (Rust `parse`). Default true. */
  requireCollision?: boolean;
}

export function parseSkate(data: Uint8Array, opts: ParseOptions = {}): SkateMap {
  const requireCollision = opts.requireCollision ?? true;
  let r = new ByteReader(data);
  const magic = r.take(8);
  const isDigit = (c: number) => c >= 0x30 && c <= 0x39;
  if (String.fromCharCode(...magic.subarray(0, 5)) !== 'SKATE' || magic[7] !== 0 || !isDigit(magic[5]) || !isDigit(magic[6])) {
    throw new SkateError('Invalid SKATE magic/version');
  }
  const version = (magic[5] - 0x30) * 10 + (magic[6] - 0x30);
  if (version < 1 || version > 15) {
    throw new SkateError('Unsupported SKATE version: reader supports 01 through 15; newer packages require an update');
  }
  if (r.u() !== 0x12345678) throw new SkateError('Invalid SKATE endian marker');
  const name = r.string();
  if (!name) throw new SkateError('Empty SKATE map name');
  const spawn = r.floats3();
  const heading = r.f();
  const ne = version >= 6 ? 45 : version >= 3 ? 14 : 12;
  const environment: number[] = [];
  for (let i = 0; i < ne; i++) environment.push(r.f());
  const n = version >= 8 ? 9 : version >= 7 ? 8 : version >= 4 ? 7 : 6;
  const counts = new Array<number>(9).fill(0);
  for (let i = 0; i < n; i++) counts[i] = r.u();

  // v15 compresses the material table as one stored block.
  let packageReader: ByteReader | null = null;
  if (version >= 15) {
    const size = r.u();
    const bytes = decodeStored(readStoredBlock(r, size));
    packageReader = r;
    r = new ByteReader(bytes);
  }
  r.checkCount(counts[0], version >= 2 ? 80 : 48);
  const materials: SkateMaterial[] = [];
  for (let i = 0; i < counts[0]; i++) {
    const m: SkateMaterial = {
      name: r.string(),
      flags: r.u(),
      friction: r.f(),
      restitution: r.f(),
      color: r.floats3(),
      roughness: r.f(),
      emissive: r.f(),
      textures: [r.u(), r.u(), 0, 0, 0],
      indirectStrength: r.f(),
      alphaMode: 0,
      alphaCutoff: 0.5,
      audio: 3,
      physics: 1,
      pattern: 0,
      depthLayer: null,
      retailDefinition: null,
    };
    if (version >= 2) {
      m.textures[2] = r.u();
      m.textures[3] = r.u();
      m.textures[4] = r.u();
      m.alphaMode = r.u();
      m.alphaCutoff = r.f();
      m.audio = r.u();
      m.physics = r.u();
      m.pattern = r.u();
    }
    if (version >= 13) {
      const layer = r.u();
      if (layer > 3) throw new SkateError('Invalid SKATE depth layer');
      m.depthLayer = layer;
    }
    if (version >= 12 && r.u() !== 0) {
      const start = r.at;
      r.take(16);
      r.string();
      r.take(8);
      const bindings = r.u();
      r.checkCount(bindings, 20);
      for (let b = 0; b < bindings; b++) {
        r.string();
        const id = r.u();
        const uv = r.u();
        const au = r.u();
        const av = r.u();
        if (id > counts[1] || uv > 2 || au > 1 || av > 1) throw new SkateError('Invalid SKATE retail texture binding');
      }
      const parameters = r.u();
      r.checkCount(parameters, 8);
      for (let p = 0; p < parameters; p++) {
        r.string();
        const values = r.u();
        r.checkCount(values, 4);
        for (let v = 0; v < values; v++) r.string();
      }
      r.string();
      m.retailDefinition = r.bytes.slice(start, r.at);
    }
    if (!m.name || m.textures.some((id) => id > counts[1]) || m.alphaMode > 2 || m.audio > 127 || m.physics > 13
      || m.pattern > 15 || m.friction < 0 || m.restitution < 0 || !(m.roughness >= 0 && m.roughness <= 1)
      || !(m.alphaCutoff >= 0 && m.alphaCutoff <= 1) || m.indirectStrength < 0) {
      throw new SkateError('Invalid SKATE material');
    }
    materials.push(m);
  }
  if (packageReader) {
    if (r.at !== r.bytes.length) throw new SkateError('SKATE material block has trailing bytes');
    r = packageReader;
  }

  r.checkCount(counts[1], 20);
  const textures: SkateTexture[] = [];
  const blocks: StoredBlock[] = [];
  for (let i = 0; i < counts[1]; i++) {
    const tname = r.string();
    const width = r.u();
    const height = r.u();
    const colorSpace = r.u();
    if ((width === 0) !== (height === 0) || width > 16384 || height > 16384 || colorSpace > 1) {
      throw new SkateError('Invalid SKATE embedded texture');
    }
    const expected = width * height * 4;
    let block: StoredBlock;
    if (version >= 9) {
      block = readStoredBlock(r, expected);
    } else {
      const bytes = r.u();
      if (bytes !== expected) throw new SkateError('Invalid SKATE embedded texture size');
      block = { expected, method: STORAGE_RAW, bytes: r.take(bytes) };
    }
    if (version >= 15 && block.method === STORAGE_TEXTURE_REFERENCE) {
      if (block.bytes.length !== 4) throw new SkateError('Invalid SKATE texture reference size');
      const index = new DataView(block.bytes.buffer, block.bytes.byteOffset, 4).getUint32(0, true);
      const source = blocks[index];
      if (!source) throw new SkateError('Invalid SKATE forward texture reference');
      if (source.expected !== expected) throw new SkateError('SKATE texture reference size mismatch');
      block = source;
    }
    blocks.push(block);
    textures.push({ name: tname, width, height, colorSpace, rgba: new Uint8Array(0) });
  }
  // Back-references share a block; decode each distinct block once.
  const decodedBlocks = new Map<StoredBlock, Uint8Array>();
  textures.forEach((t, i) => {
    let rgba = decodedBlocks.get(blocks[i]);
    if (!rgba) {
      try {
        rgba = decodeStored(blocks[i]);
      } catch (e) {
        throw new SkateError(`Texture ${i}: ${(e as Error).message}`);
      }
      decodedBlocks.set(blocks[i], rgba);
    }
    t.rgba = rgba;
  });

  const vertexSize = version >= 12 ? VERTEX_BYTES : VERTEX_BYTES_V11;
  const collisionSize = version >= 11 ? COLLISION_BYTES : COLLISION_BYTES_V10;
  let geometry: SkateGeometry;
  if (version >= 9) {
    const v = decodeStored(readStoredBlock(r, counts[2] * vertexSize));
    const ix = decodeStored(readStoredBlock(r, counts[3] * 4));
    const c = decodeStored(readStoredBlock(r, counts[4] * collisionSize));
    const joined = new Uint8Array(v.length + ix.length + c.length);
    joined.set(v, 0);
    joined.set(ix, v.length);
    joined.set(c, v.length + ix.length);
    geometry = readGeometry(new ByteReader(joined), [counts[2], counts[3], counts[4]], materials.length, version);
  } else {
    geometry = readGeometry(r, [counts[2], counts[3], counts[4]], materials.length, version);
  }
  if (materials.length === 0 || geometry.vertices.count === 0 || geometry.indices.length === 0) {
    throw new SkateError('SKATE requires materials and render geometry');
  }

  r.checkCount(counts[5], 12);
  const rails: SkateRail[] = [];
  for (let i = 0; i < counts[5]; i++) {
    const rname = r.string();
    const closed = r.u() !== 0;
    const representation = version >= 10 ? r.u() : 0;
    if (representation === 0) {
      rails.push({ name: rname, closed, points: r.points(), native: null });
    } else if (representation === 1) {
      const start = r.at;
      r.take(24);
      const segments = r.u();
      r.checkCount(segments, 120);
      r.take(segments * 120);
      rails.push({ name: rname, closed, points: [], native: r.bytes.slice(start, r.at) });
    } else {
      throw new SkateError('Unsupported SKATE rail representation');
    }
  }

  r.checkCount(counts[6], 120);
  const doors: SkateDoor[] = [];
  for (let i = 0; i < counts[6]; i++) {
    const dname = r.string();
    const frame = [r.floats3(), r.floats3(), r.floats3(), r.floats3(), r.floats3(), r.floats3()];
    const motion: [number, number, number, number, number] = [r.f(), r.f(), r.f(), r.f(), r.f()];
    const response: [number, number, number] | null = version >= 5 ? r.floats3() : null;
    const friction = r.f();
    const restitution = r.f();
    const surface = r.u();
    const dc: [number, number, number] = [r.u(), r.u(), r.u()];
    doors.push({ name: dname, frame, motion, response, friction, restitution, surface, geometry: readGeometry(r, dc, materials.length, version) });
  }

  r.checkCount(counts[7], 64);
  const lights: SkateLight[] = [];
  for (let i = 0; i < counts[7]; i++) {
    const light: SkateLight = {
      name: r.string(), kind: r.u(), position: r.floats3(), direction: r.floats3(), color: r.floats3(),
      intensity: r.f(), range: r.f(), radius: r.f(), innerCos: r.f(), outerCos: r.f(),
    };
    if (light.kind > 2 || light.range <= 0 || light.intensity < 0 || light.radius < 0
      || !(light.innerCos >= -1 && light.innerCos <= 1) || !(light.outerCos >= -1 && light.outerCos <= 1)) {
      throw new SkateError('Invalid SKATE light');
    }
    lights.push(light);
  }

  r.checkCount(counts[8], 24);
  const routes: SkateRoute[] = [];
  for (let i = 0; i < counts[8]; i++) {
    const rname = r.string();
    const closed = r.u() !== 0;
    const skaters = r.u();
    const speed = r.f();
    const spacing = r.f();
    const points = r.points();
    routes.push({ rail: { name: rname, closed, points, native: null }, skaters, speed, spacing });
  }

  const extensions: SkateExtension[] = [];
  if (version >= 12) {
    const count = r.u();
    r.checkCount(count, 20);
    for (let i = 0; i < count; i++) {
      const tag = String.fromCharCode(...r.take(4));
      const schema = r.u();
      const bytes = r.u();
      extensions.push({ tag, schema, payload: decodeStored(readStoredBlock(r, bytes)) });
    }
  }
  if (requireCollision && geometry.collision.count === 0
    && !extensions.some((e) => e.tag === 'RWCM' && e.schema === 1 && e.payload.length > 0)) {
    throw new SkateError('SKATE requires triangle collision or an embedded RWCM archive');
  }
  if (r.at !== data.length) throw new SkateError(`SKATE contains ${data.length - r.at} unexplained trailing bytes`);
  return { version, name, spawn, heading, environment, materials, textures, geometry, rails, doors, lights, routes, extensions };
}

function readGeometry(r: ByteReader, counts: [number, number, number], materialCount: number, version: number): SkateGeometry {
  const [nv, ni, nc] = counts;
  const v12 = version >= 12;
  const vertexSize = v12 ? VERTEX_BYTES : VERTEX_BYTES_V11;
  r.checkCount(nv, vertexSize);
  const vbytes = r.take(nv * vertexSize);
  const dv = new DataView(vbytes.buffer, vbytes.byteOffset, vbytes.byteLength);
  const vertices: SkateVertices = {
    count: nv,
    positions: new Float32Array(nv * 3),
    normals: new Float32Array(nv * 3),
    uvs: new Float32Array(nv * 2),
    lightmapUvs: new Float32Array(nv * 2),
    materials: new Uint32Array(nv),
    decalUvs: v12 ? new Float32Array(nv * 2) : null,
    tangentFrames: v12 ? new Uint8Array(nv * 4) : null,
  };
  const fin = (at: number) => {
    const x = dv.getFloat32(at, true);
    if (!Number.isFinite(x)) throw new SkateError(`Non-finite SKATE float at ${vbytes.byteOffset + at}`);
    return x;
  };
  for (let i = 0; i < nv; i++) {
    const o = i * vertexSize;
    for (let k = 0; k < 3; k++) {
      vertices.positions[i * 3 + k] = fin(o + k * 4);
      vertices.normals[i * 3 + k] = fin(o + 12 + k * 4);
    }
    for (let k = 0; k < 2; k++) {
      vertices.uvs[i * 2 + k] = fin(o + 24 + k * 4);
      vertices.lightmapUvs[i * 2 + k] = fin(o + 32 + k * 4);
    }
    vertices.materials[i] = dv.getUint32(o + 40, true);
    if (v12) {
      vertices.decalUvs![i * 2] = fin(o + 44);
      vertices.decalUvs![i * 2 + 1] = fin(o + 48);
      vertices.tangentFrames!.set(vbytes.subarray(o + 52, o + 56), i * 4);
    }
  }
  r.checkCount(ni, 4);
  const ibytes = r.take(ni * 4);
  const indices = new Uint32Array(ni);
  const idv = new DataView(ibytes.buffer, ibytes.byteOffset, ibytes.byteLength);
  for (let i = 0; i < ni; i++) indices[i] = idv.getUint32(i * 4, true);

  const v11 = version >= 11;
  const collisionSize = v11 ? COLLISION_BYTES : COLLISION_BYTES_V10;
  r.checkCount(nc, collisionSize);
  const cbytes = r.take(nc * collisionSize);
  const cdv = new DataView(cbytes.buffer, cbytes.byteOffset, cbytes.byteLength);
  const collision: SkateCollision = {
    count: nc,
    points: new Float32Array(nc * 9),
    surfaces: new Uint32Array(nc),
    materials: new Uint32Array(nc),
    edgeWords: v11 ? new Uint8Array(nc * 4) : null,
  };
  for (let i = 0; i < nc; i++) {
    const o = i * collisionSize;
    for (let k = 0; k < 9; k++) {
      const x = cdv.getFloat32(o + k * 4, true);
      if (!Number.isFinite(x)) throw new SkateError(`Non-finite SKATE float at ${cbytes.byteOffset + o + k * 4}`);
      collision.points[i * 9 + k] = x;
    }
    collision.surfaces[i] = cdv.getUint32(o + 36, true);
    collision.materials[i] = cdv.getUint32(o + 40, true);
    if (v11) collision.edgeWords!.set(cbytes.subarray(o + 44, o + 48), i * 4);
  }

  const valid = (id: number) => id > 0 && id <= materialCount;
  for (let i = 0; i < nv; i++) if (!valid(vertices.materials[i])) throw new SkateError('SKATE invalid material/surface reference');
  for (let i = 0; i < nc; i++) {
    if (!valid(collision.materials[i]) || collision.surfaces[i] === 0) throw new SkateError('SKATE invalid material/surface reference');
  }
  if (ni % 3 !== 0) throw new SkateError('SKATE invalid triangle indices');
  for (let i = 0; i < ni; i++) if (indices[i] >= nv) throw new SkateError('SKATE invalid triangle indices');
  for (let t = 0; t < ni; t += 3) {
    const m = vertices.materials[indices[t]];
    if (vertices.materials[indices[t + 1]] !== m || vertices.materials[indices[t + 2]] !== m) {
      throw new SkateError('SKATE triangle mixes materials');
    }
  }
  const p = collision.points;
  for (let i = 0; i < nc; i++) {
    const area = collisionArea2(p, i * 9);
    if (!Number.isFinite(area) || !(area > 0)) throw new SkateError('SKATE degenerate collision triangle');
  }
  return { vertices, indices, collision };
}

const fr = Math.fround;

/** Squared cross-product length computed in f32 like the Rust validator. */
export function collisionArea2(p: ArrayLike<number>, o: number): number {
  const ux = fr(p[o + 3] - p[o]), uy = fr(p[o + 4] - p[o + 1]), uz = fr(p[o + 5] - p[o + 2]);
  const vx = fr(p[o + 6] - p[o]), vy = fr(p[o + 7] - p[o + 1]), vz = fr(p[o + 8] - p[o + 2]);
  const cx = fr(fr(uy * vz) - fr(uz * vy));
  const cy = fr(fr(uz * vx) - fr(ux * vz));
  const cz = fr(fr(ux * vy) - fr(uy * vx));
  return fr(fr(fr(cx * cx) + fr(cy * cy)) + fr(cz * cz));
}
