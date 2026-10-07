// Byte-level helpers and SKATE storage methods, mirroring skate_map.rs
// (`StoredBlock::decode`) and skate_map/storage_v15.rs, plus the encoders used
// by the Blender addon exporter (owned_world_material_addon/exporter.py).
import { unzlibSync, zlibSync } from 'fflate';
import { decompress as zstdDecompress } from 'fzstd';

export const STORAGE_RAW = 0;
export const STORAGE_DEFLATE = 1;
export const STORAGE_ZSTD = 2;
export const STORAGE_ZSTD_RGBA_FILTER = 3;
export const STORAGE_ZSTD_VERTEX_SOA = 4;
export const STORAGE_ZSTD_INDEX_DELTA = 5;
export const STORAGE_ZSTD_COLLISION_INDEXED = 6;
export const STORAGE_DEFLATE_RGBA_FILTER = 7;
export const STORAGE_DEFLATE_VERTEX_SOA = 8;
export const STORAGE_DEFLATE_INDEX_DELTA = 9;
export const STORAGE_DEFLATE_COLLISION_INDEXED = 10;
export const STORAGE_TEXTURE_REFERENCE = 11;

export const VERTEX_BYTES = 56;
export const VERTEX_BYTES_V11 = 44;
export const COLLISION_BYTES = 48;
export const COLLISION_BYTES_V10 = 44;

export class SkateError extends Error {
  constructor(message: string) { super(message); this.name = 'SkateError'; }
}

const utf8 = new TextDecoder('utf-8', { fatal: true });
const utf8Encode = new TextEncoder();

export class ByteReader {
  readonly view: DataView;
  at = 0;
  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  get remaining(): number { return this.bytes.length - this.at; }
  take(n: number): Uint8Array {
    const end = this.at + n;
    if (n < 0 || end > this.bytes.length) throw new SkateError(`Truncated SKATE at byte ${this.at} (need ${n})`);
    const out = this.bytes.subarray(this.at, end);
    this.at = end;
    return out;
  }
  u(): number {
    if (this.at + 4 > this.bytes.length) throw new SkateError(`Truncated SKATE at byte ${this.at} (need 4)`);
    const v = this.view.getUint32(this.at, true);
    this.at += 4;
    return v;
  }
  f(): number {
    if (this.at + 4 > this.bytes.length) throw new SkateError(`Truncated SKATE at byte ${this.at} (need 4)`);
    const v = this.view.getFloat32(this.at, true);
    if (!Number.isFinite(v)) throw new SkateError(`Non-finite SKATE float at ${this.at}`);
    this.at += 4;
    return v;
  }
  floats3(): [number, number, number] { return [this.f(), this.f(), this.f()]; }
  string(): string {
    const n = this.u();
    try {
      return utf8.decode(this.take(n));
    } catch (e) {
      if (e instanceof SkateError) throw e;
      throw new SkateError('Invalid SKATE UTF-8');
    }
  }
  checkCount(count: number, minimumBytes: number): void {
    if (count > Math.floor(this.remaining / minimumBytes)) throw new SkateError('SKATE count exceeds remaining data');
  }
  points(): [number, number, number][] {
    const n = this.u();
    this.checkCount(n, 12);
    const out: [number, number, number][] = new Array(n);
    for (let i = 0; i < n; i++) out[i] = this.floats3();
    return out;
  }
}

/** Growable little-endian byte sink. */
export class ByteWriter {
  private buf: Uint8Array;
  private view: DataView;
  length = 0;
  constructor(initial = 1 << 16) {
    this.buf = new Uint8Array(initial);
    this.view = new DataView(this.buf.buffer);
  }
  private reserve(n: number): void {
    const need = this.length + n;
    if (need <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < need) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
    this.view = new DataView(next.buffer);
  }
  u(v: number): void {
    if (!Number.isInteger(v) || v < 0 || v > 0xffffffff) throw new SkateError(`SKATE u32 out of range: ${v}`);
    this.reserve(4);
    this.view.setUint32(this.length, v, true);
    this.length += 4;
  }
  f(v: number): void {
    if (!Number.isFinite(v)) throw new SkateError('SKATE does not permit non-finite floats');
    this.reserve(4);
    this.view.setFloat32(this.length, v, true);
    this.length += 4;
  }
  fs(values: ArrayLike<number>): void { for (let i = 0; i < values.length; i++) this.f(values[i]); }
  bytes(b: Uint8Array): void {
    this.reserve(b.length);
    this.buf.set(b, this.length);
    this.length += b.length;
  }
  string(s: string): void {
    const b = utf8Encode.encode(s);
    this.u(b.length);
    this.bytes(b);
  }
  tag(s: string): void {
    if (s.length !== 4) throw new SkateError(`SKATE extension tag must be 4 bytes: ${JSON.stringify(s)}`);
    const b = new Uint8Array(4);
    for (let i = 0; i < 4; i++) {
      const c = s.charCodeAt(i);
      if (c > 0xff) throw new SkateError(`SKATE extension tag must be Latin-1: ${JSON.stringify(s)}`);
      b[i] = c;
    }
    this.bytes(b);
  }
  finish(): Uint8Array { return this.buf.slice(0, this.length); }
}

const MAX_BLOCK = 2_147_483_648;

function inflate(bytes: Uint8Array): Uint8Array {
  try {
    return unzlibSync(bytes);
  } catch (e) {
    throw new SkateError(`SKATE DEFLATE: ${(e as Error).message}`);
  }
}

function unzstd(bytes: Uint8Array): Uint8Array {
  try {
    return zstdDecompress(bytes);
  } catch (e) {
    throw new SkateError(`SKATE Zstandard: ${(e as Error).message}`);
  }
}

/** A stored block that has been located but not yet decoded. */
export interface StoredBlock { expected: number; method: number; bytes: Uint8Array }

export function readStoredBlock(r: ByteReader, expected: number): StoredBlock {
  if (expected > MAX_BLOCK) throw new SkateError('SKATE decoded block exceeds 2 GiB reader limit');
  const method = r.u();
  const n = r.u();
  return { expected, method, bytes: r.take(n) };
}

export function decodeStored(block: StoredBlock): Uint8Array {
  const { expected, method, bytes } = block;
  let decoded: Uint8Array;
  if (method === STORAGE_RAW) decoded = bytes;
  else if (method === STORAGE_DEFLATE) decoded = inflate(bytes);
  else if (method === STORAGE_ZSTD) decoded = unzstd(bytes);
  else if (method >= 3 && method <= 10) return decodeTransformed(method, bytes, expected);
  else throw new SkateError(`Unsupported SKATE storage method ${method}`);
  if (decoded.length !== expected) throw new SkateError('SKATE decoded block size mismatch');
  return decoded;
}

const VERTEX_FIELDS: [number, number][] = [[0, 12], [12, 12], [24, 8], [32, 8], [40, 4], [44, 8], [52, 4]];

/** storage_v15::decode. */
function decodeTransformed(method: number, bytes: Uint8Array, expected: number): Uint8Array {
  const head = new ByteReader(bytes);
  const size = head.u();
  if (size > expected * 3 + 16 || size > MAX_BLOCK) throw new SkateError('SKATE transformed block exceeds size limit');
  const data = decodeStored({ expected: size, method: method <= 6 ? STORAGE_ZSTD : STORAGE_DEFLATE, bytes: bytes.subarray(4) });
  const src = new ByteReader(data);
  const result = new Uint8Array(expected);
  let written = 0;
  switch (method) {
    case 3: case 7: {
      const width = src.u();
      const height = src.u();
      const row = width * 4;
      if (row * height !== expected || width > 16384 || height > 16384) throw new SkateError('SKATE filtered dimensions mismatch');
      for (let y = 0; y < height; y++) {
        const filter = src.take(1)[0];
        if (filter > 4) throw new SkateError('Invalid SKATE RGBA filter');
        const line = src.take(row);
        const base = y * row;
        for (let x = 0; x < row; x++) {
          const at = base + x;
          const left = x >= 4 ? result[at - 4] : 0;
          const above = y > 0 ? result[at - row] : 0;
          const upperLeft = x >= 4 && y > 0 ? result[at - row - 4] : 0;
          let predictor = 0;
          if (filter === 1) predictor = left;
          else if (filter === 2) predictor = above;
          else if (filter === 3) predictor = (left + above) >> 1;
          else if (filter === 4) predictor = paeth(left, above, upperLeft);
          result[at] = (line[x] + predictor) & 0xff;
        }
      }
      written = expected;
      break;
    }
    case 4: case 8: {
      if (expected % VERTEX_BYTES !== 0 || data.length !== expected) throw new SkateError('Invalid SKATE vertex streams');
      const n = expected / VERTEX_BYTES;
      for (const [offset, length] of VERTEX_FIELDS) {
        const stream = src.take(length * n);
        for (let v = 0; v < n; v++) result.set(stream.subarray(v * length, v * length + length), v * VERTEX_BYTES + offset);
      }
      written = expected;
      break;
    }
    case 5: case 9: {
      if (expected % 4 !== 0) throw new SkateError('Invalid SKATE index block size');
      const out = new DataView(result.buffer);
      let previous = 0;
      const d = data;
      let at = src.at;
      for (let i = 0; i < expected / 4; i++) {
        // Up to 5 bytes (33-bit zigzag delta). Use float math above 2^31.
        let zigzag = 0;
        let shift = 0;
        for (;;) {
          if (at >= d.length) throw new SkateError(`Truncated SKATE at byte ${at} (need 1)`);
          const byte = d[at++];
          if (shift === 28 && byte > 31) throw new SkateError('Invalid SKATE index varint');
          zigzag += (byte & 127) * 2 ** shift;
          if ((byte & 128) === 0 || shift === 28) break;
          shift += 7;
        }
        const half = Math.floor(zigzag / 2);
        const delta = zigzag % 2 === 1 ? -half - 1 : half;
        const current = previous + delta;
        if (current < 0 || current > 0xffffffff) throw new SkateError('SKATE index delta overflow');
        out.setUint32(i * 4, current, true);
        previous = current;
      }
      src.at = at;
      written = expected;
      break;
    }
    case 6: case 10: {
      if (expected % COLLISION_BYTES !== 0) throw new SkateError('Invalid SKATE collision block size');
      const count = src.u();
      const vertices = src.take(count * 12);
      let o = 0;
      for (let t = 0; t < expected / COLLISION_BYTES; t++) {
        for (let k = 0; k < 3; k++) {
          const index = src.u();
          if (index >= count) throw new SkateError('Invalid SKATE collision vertex reference');
          result.set(vertices.subarray(index * 12, index * 12 + 12), o);
          o += 12;
        }
        result.set(src.take(12), o);
        o += 12;
      }
      written = o;
      break;
    }
    default:
      throw new SkateError('Invalid SKATE storage transform');
  }
  if (src.at !== data.length || written !== expected) throw new SkateError('SKATE transformed size mismatch or trailing data');
  return result;
}

function paeth(left: number, above: number, upperLeft: number): number {
  const p = left + above - upperLeft;
  const a = Math.abs(p - left);
  const b = Math.abs(p - above);
  const c = Math.abs(p - upperLeft);
  if (a <= b && a <= c) return left;
  return b <= c ? above : upperLeft;
}

// ---------------------------------------------------------------- encoders

export type Compression = 'zlib' | 'none';

export function deflate(data: Uint8Array, level: number): Uint8Array {
  return zlibSync(data, { level: level as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 });
}

/** Writes method, length and payload; raw when compression does not help. */
export function writeStored(w: ByteWriter, decoded: Uint8Array, compression: Compression, level = 6): void {
  let method = STORAGE_RAW;
  let payload = decoded;
  if (compression === 'zlib' && decoded.length > 0) {
    const packed = deflate(decoded, level);
    if (packed.length < decoded.length) { method = STORAGE_DEFLATE; payload = packed; }
  }
  w.u(method);
  w.u(payload.length);
  w.bytes(payload);
}

/**
 * SKATE15 transformed storage (deflate flavour: methods 7..10). Falls back to
 * plain deflate/raw when the transform is not smaller, as the exporter does.
 */
export function writeTransformed(
  w: ByteWriter, decoded: Uint8Array, transform: () => Uint8Array, method: number, compression: Compression, level = 6,
): void {
  if (compression === 'none' || decoded.length === 0) { writeStored(w, decoded, compression, level); return; }
  const transformed = transform();
  const packed = deflate(transformed, level);
  const plain = deflate(decoded, level);
  // Same candidate choice as exporter.py `_write_transformed_bytes`: smallest of
  // transformed+deflate, plain deflate and raw.
  if (4 + packed.length < plain.length && 4 + packed.length < decoded.length) {
    w.u(method);
    w.u(4 + packed.length);
    w.u(transformed.length);
    w.bytes(packed);
  } else if (plain.length < decoded.length) {
    w.u(STORAGE_DEFLATE);
    w.u(plain.length);
    w.bytes(plain);
  } else {
    w.u(STORAGE_RAW);
    w.u(decoded.length);
    w.bytes(decoded);
  }
}

/** exporter.py `_filter_rgba8` with all five PNG predictors. */
export function filterRgba8(decoded: Uint8Array, width: number, height: number): Uint8Array {
  const row = width * 4;
  if (decoded.length !== row * height) throw new SkateError('RGBA8 texture dimensions do not match its bytes');
  const out = new Uint8Array(8 + height * (row + 1));
  const dv = new DataView(out.buffer);
  dv.setUint32(0, width, true);
  dv.setUint32(4, height, true);
  const candidate = new Uint8Array(row);
  const best = new Uint8Array(row);
  let o = 8;
  for (let y = 0; y < height; y++) {
    const base = y * row;
    let bestScore = Infinity;
    let bestFilter = 0;
    for (let filter = 0; filter <= 4; filter++) {
      let score = 0;
      for (let x = 0; x < row; x++) {
        const at = base + x;
        const left = x >= 4 ? decoded[at - 4] : 0;
        const above = y > 0 ? decoded[at - row] : 0;
        const upperLeft = x >= 4 && y > 0 ? decoded[at - row - 4] : 0;
        const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? above
          : filter === 3 ? (left + above) >> 1 : paeth(left, above, upperLeft);
        const v = (decoded[at] - predictor) & 0xff;
        candidate[x] = v;
        score += v < 128 ? v : 256 - v;
        if (score >= bestScore) break;
      }
      if (score < bestScore) { bestScore = score; bestFilter = filter; best.set(candidate); }
    }
    out[o++] = bestFilter;
    out.set(best, o);
    o += row;
  }
  return out;
}

/** exporter.py `_vertex_soa`. */
export function vertexSoa(decoded: Uint8Array): Uint8Array {
  if (decoded.length % VERTEX_BYTES) throw new SkateError('visual vertex block is not SKATE15-compatible');
  const n = decoded.length / VERTEX_BYTES;
  const out = new Uint8Array(decoded.length);
  let o = 0;
  for (const [offset, length] of VERTEX_FIELDS) {
    for (let v = 0; v < n; v++) {
      const s = v * VERTEX_BYTES + offset;
      out.set(decoded.subarray(s, s + length), o);
      o += length;
    }
  }
  return out;
}

/** exporter.py `_index_delta_varints`. */
export function indexDeltaVarints(indices: Uint32Array): Uint8Array {
  const out = new Uint8Array(indices.length * 5);
  let o = 0;
  let previous = 0;
  for (let i = 0; i < indices.length; i++) {
    const current = indices[i];
    const delta = current - previous;
    let zigzag = delta >= 0 ? delta * 2 : -delta * 2 - 1;
    while (zigzag >= 0x80) {
      out[o++] = (zigzag % 128) | 0x80;
      zigzag = Math.floor(zigzag / 128);
    }
    out[o++] = zigzag;
    previous = current;
  }
  return out.slice(0, o);
}

/** exporter.py `_indexed_collision`: welds bit-identical corners. */
export function indexedCollision(decoded: Uint8Array): Uint8Array {
  if (decoded.length % COLLISION_BYTES) throw new SkateError('collision block is not SKATE15-compatible');
  const n = decoded.length / COLLISION_BYTES;
  const words = new DataView(decoded.buffer, decoded.byteOffset, decoded.byteLength);
  const ids = new Map<string, number>();
  const vertexBytes = new Uint8Array(n * 36);
  let vertexCount = 0;
  const records = new Uint8Array(n * 24);
  const rv = new DataView(records.buffer);
  for (let t = 0; t < n; t++) {
    const base = t * COLLISION_BYTES;
    for (let k = 0; k < 3; k++) {
      const at = base + k * 12;
      const key = `${words.getUint32(at, true)},${words.getUint32(at + 4, true)},${words.getUint32(at + 8, true)}`;
      let index = ids.get(key);
      if (index === undefined) {
        index = vertexCount++;
        ids.set(key, index);
        vertexBytes.set(decoded.subarray(at, at + 12), index * 12);
      }
      rv.setUint32(t * 24 + k * 4, index, true);
    }
    records.set(decoded.subarray(base + 36, base + 48), t * 24 + 12);
  }
  const out = new Uint8Array(4 + vertexCount * 12 + records.length);
  new DataView(out.buffer).setUint32(0, vertexCount, true);
  out.set(vertexBytes.subarray(0, vertexCount * 12), 4);
  out.set(records, 4 + vertexCount * 12);
  return out;
}
