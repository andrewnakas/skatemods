// Embedded RWCM v1 / RWCMSET1 collision archives (retail clustered collision meshes), ported
// from the Rust engine's crates/skate-data/src/retail_collision.rs. Cluster coordinates are
// already world space. Vertex offsets are unsigned halfwords added to a signed base with
// saturation, as the native GetVertex does.

export interface RwcmTriangles {
  /** xyz per corner, three corners per triangle. */
  points: Float32Array;
  /** Packed RW surface id per triangle: audio | physics << 7 | pattern << 12. */
  surfaces: Uint16Array;
  count: number;
}

function fail(msg: string): never { throw new Error(`RWCM: ${msg}`); }

export function decodeRwcmSet(data: Uint8Array): RwcmTriangles {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const need = (at: number, n: number) => { if (at + n > data.length) fail(`truncated at ${at}`); };
  need(0, 12);
  if (String.fromCharCode(...data.subarray(0, 8)) !== 'RWCMSET1') fail('bad RWCMSET1 magic');
  let at = 8;
  const le32 = () => { need(at, 4); const v = dv.getUint32(at, true); at += 4; return v; };
  const count = le32();
  if (count === 0 || count > data.length / 105) fail('bad mesh count');
  const points: number[] = [];
  const surfaces: number[] = [];
  for (let m = 0; m < count; m++) {
    const nameLen = le32();
    if (nameLen === 0 || nameLen > 4096) fail('bad mesh name length');
    need(at, nameLen);
    at += nameLen;
    const size = le32();
    need(at, size);
    meshClusters(data.subarray(at, at + size), points, surfaces);
    at += size;
  }
  if (at !== data.length) fail('trailing bytes');
  return { points: new Float32Array(points), surfaces: new Uint16Array(surfaces), count: surfaces.length };
}

function meshClusters(data: Uint8Array, points: number[], surfaces: number[]) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length < 96) fail('mesh too short');
  const be16 = (o: number) => { if (o + 2 > data.length) fail(`truncated at ${o}`); return dv.getUint16(o); };
  const be32 = (o: number) => { if (o + 4 > data.length) fail(`truncated at ${o}`); return dv.getUint32(o); };
  const size = be32(80);
  if (size < 96 || size > data.length) fail('bad mesh size');
  const table = be32(52), count = be32(64);
  const granularity = dv.getFloat32(56);
  if (!Number.isFinite(granularity) || granularity <= 0) fail('bad granularity');
  if (table < 96 || count === 0 || count > size / 4) fail('bad cluster table');
  const groupWidth = data[62], surfaceWidth = data[63];
  let previousEnd = table + count * 4;
  let total = 0;
  for (let i = 0; i < count; i++) {
    const offset = be32(table + i * 4);
    if (offset < previousEnd) fail('overlapping clusters');
    const csize = be16(offset + 8);
    if (csize < 16 || offset + csize > size) fail('bad cluster size');
    total += decodeCluster(data.subarray(offset, offset + csize), granularity, groupWidth, surfaceWidth, points, surfaces);
    previousEnd = offset + csize;
  }
  if (total !== be32(40)) fail('triangle count mismatch');
}

function decodeCluster(d: Uint8Array, granularity: number, groupWidth: number, surfaceWidth: number, points: number[], surfaces: number[]): number {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const be16 = (o: number) => { if (o + 2 > d.length) fail(`cluster truncated at ${o}`); return dv.getUint16(o); };
  const be32 = (o: number) => { if (o + 4 > d.length) fail(`cluster truncated at ${o}`); return dv.getUint32(o); };
  const unitCount = be16(0);
  const unitStart = (be16(4) + 1) * 16;
  const unitLen = be16(2);
  if (unitStart + unitLen > d.length) fail('unit stream out of range');
  const vcount = d[10], compression = d[12];
  const verts: number[] = [];
  for (let i = 0; i < vcount; i++) for (let axis = 0; axis < 3; axis++) {
    let v: number;
    if (compression === 0) v = dv.getFloat32(16 + i * 16 + axis * 4);
    else if (compression === 1) {
      const base = be32(16 + axis * 4) | 0;
      const delta = be16(28 + i * 6 + axis * 2);
      const sum = Math.max(-2147483648, Math.min(2147483647, base + delta));
      v = Math.fround(sum) * granularity;
    } else if (compression === 2) v = (be32(16 + i * 12 + axis * 4) | 0) * granularity;
    else fail(`unsupported vertex compression ${compression}`);
    if (!Number.isFinite(v)) fail('non-finite vertex');
    verts.push(v);
  }
  let at = unitStart;
  const end = unitStart + unitLen;
  const readId = (width: number) => {
    if (width === 1) return d[at++];
    if (width === 2) { const v = dv.getUint16(at, true); at += 2; return v; }
    return fail(`unsupported id width ${width}`);
  };
  for (let u = 0; u < unitCount; u++) {
    if (at + 4 > end) fail('unit stream truncated');
    const flags = d[at++];
    if ((flags & 15) !== 1) fail(`unsupported unit type ${flags & 15}`);
    for (let k = 0; k < 3; k++) {
      const vi = d[at++];
      if (vi >= vcount) fail('missing vertex');
      points.push(verts[vi * 3], verts[vi * 3 + 1], verts[vi * 3 + 2]);
    }
    if (flags & 0x20) at += 3; // edge codes
    if (flags & 0x40) readId(groupWidth);
    surfaces.push(flags & 0x80 ? readId(surfaceWidth) : 0);
  }
  if (at !== end) fail('unit stream has trailing bytes');
  return unitCount;
}
