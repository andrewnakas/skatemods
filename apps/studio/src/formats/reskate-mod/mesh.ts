// SPDX-License-Identifier: GPL-3.0-or-later
// skate. MeshSet res (type 0x49B156D4) and DxTexture res (0x6BDE20BA). Ports of skate4to3/sk4/meshset.py
// and the descriptor part of textures.py; layouts measured in skate4to3/specs/SKATE_FORMATS.md.

import { hex } from './frostbite.ts';

export const MESHSET_RES = 0x49B156D4;
export const TEXTURE_RES = 0x6BDE20BA;
const BASE = 0x10;
const USAGE_POS = 0x01, USAGE_UV0 = 0x21;
/** format -> [bytes per component, components, half float?] */
const FORMATS: Record<number, [number, number, boolean]> = {
  0x02: [4, 2, false], 0x03: [4, 3, false], 0x04: [4, 4, false], 0x06: [2, 2, true], 0x07: [2, 3, true], 0x08: [2, 4, true],
};

export interface Section {
  material: string; primitives: number; startIndex: number; vertexOffset: number; vertices: number;
  elements: [usage: number, format: number, offset: number, stream: number][]; strides: number[];
  depotKey: bigint;
}
export interface Lod { name: string; chunk: string; indexBufferSize: number; vertexBufferSize: number; sections: Section[] }
export interface MeshSet { name: string; lods: Lod[] }

export const isShadow = (s: Section) => s.material.endsWith('_Shadow') || s.elements.every((e) => e[0] === USAGE_POS);

export function parseMeshSet(d: Uint8Array): MeshSet {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const u32 = (o: number) => dv.getUint32(o, true);
  const u64 = (o: number) => Number(dv.getBigUint64(o, true));
  const cstr = (o: number) => { let e = o; while (d[e]) e++; return new TextDecoder().decode(d.subarray(o, e)); };
  const lods: Lod[] = [];
  for (let k = 0; k < 8; k++) {
    const v = u64(BASE + 0x20 + 8 * k);
    if (v === 0 || v + BASE >= d.length) break;
    const L = v + BASE;
    const nsec = u32(L + 0x08), sptr = u64(L + 0x0C) + BASE;
    const sections: Section[] = [];
    for (let s = 0; s < nsec; s++) {
      const S = sptr + s * 0x180;
      const ne = d[S + 0xD0], ns = d[S + 0xD1];
      sections.push({
        material: cstr(u64(S + 0x08) + BASE), primitives: u32(S + 0x20), startIndex: u32(S + 0x24),
        vertexOffset: u32(S + 0x28), vertices: u32(S + 0x2C),
        elements: Array.from({ length: ne }, (_, e) => [d[S + 0x70 + 4 * e], d[S + 0x71 + 4 * e], d[S + 0x72 + 4 * e], d[S + 0x73 + 4 * e]] as [number, number, number, number]),
        strides: Array.from({ length: ns }, (_, j) => d[S + 0xB0 + 2 * j]),
        depotKey: S + 0x140 <= d.length ? dv.getBigUint64(S + 0x138, true) : 0n,
      });
    }
    lods.push({ name: cstr(u64(L + 0x8C) + BASE), chunk: hex(d, L + 0x74, 16), indexBufferSize: u32(L + 0x58), vertexBufferSize: u32(L + 0x5C), sections });
  }
  let name = lods.length ? lods[0].name : '';
  const i = name.lastIndexOf('_lod');
  if (i >= 0) name = name.slice(0, i);
  if (name.startsWith('Mesh:')) name = name.slice(5);
  return { name, lods };
}

function half(h: number): number {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, f = h & 1023;
  if (e === 0) return s * f * 2 ** -24;
  if (e === 31) return f ? NaN : s * Infinity;
  return s * (1 + f / 1024) * 2 ** (e - 15);
}

export interface SectionGeometry { positions: Float32Array; uv0: Float32Array | null; indices: Uint32Array }

/** One section's positions, UV0 and triangles from the LOD's VB+IB chunk. */
export function decodeSection(chunk: Uint8Array, lod: Lod, sec: Section): SectionGeometry {
  const dv = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  const streams: [number, number][] = [];
  let pos = sec.vertexOffset;
  for (const st of sec.strides) { streams.push([pos, st]); pos += sec.vertices * st; }
  const got = new Map<number, Float32Array>();
  for (const [usage, fmt, off, stream] of sec.elements) {
    if ((usage !== USAGE_POS && usage !== USAGE_UV0) || got.has(usage)) continue;
    const f = FORMATS[fmt];
    if (!f) { if (usage === USAGE_POS) throw new Error(`unsupported position format 0x${fmt.toString(16)}`); continue; }
    const [bytes, n, isHalf] = f;
    const keep = usage === USAGE_POS ? 3 : 2;
    const [so, stride] = streams[stream];
    const out = new Float32Array(sec.vertices * keep);
    for (let v = 0; v < sec.vertices; v++) {
      const b = so + v * stride + off;
      for (let c = 0; c < Math.min(n, keep); c++) out[v * keep + c] = isHalf ? half(dv.getUint16(b + 2 * c, true)) : dv.getFloat32(b + 4 * c, true);
    }
    got.set(usage, out);
  }
  const p = got.get(USAGE_POS);
  if (!p) throw new Error('section without positions');
  const total = Math.max(0, ...lod.sections.map((s) => s.startIndex + 3 * s.primitives));
  const w = total * 4 <= lod.indexBufferSize ? 4 : 2;
  const indices = new Uint32Array(sec.primitives * 3);
  const ib = lod.vertexBufferSize + sec.startIndex * w;
  for (let i = 0; i < indices.length; i++) indices[i] = w === 4 ? dv.getUint32(ib + 4 * i, true) : dv.getUint16(ib + 2 * i, true);
  return { positions: p, uv0: got.get(USAGE_UV0) ?? null, indices };
}

// ------------------------------------------------------------------------------------------ textures
export interface TextureDesc { format: number; w: number; h: number; guid: string; mips: number[]; mipOffsets: number[]; total: number }

export function parseTextureDesc(b: Uint8Array): TextureDesc | null {
  if (b.length < 0x40) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const w = dv.getUint16(0x16, true), h = dv.getUint16(0x18, true);
  if (!w || !h) return null;
  const mips: number[] = [], mipOffsets: number[] = [];
  let acc = 0;
  for (let i = 0; i < 12; i++) {
    const p = 0x38 + 4 * i;
    if (p + 4 > b.length) break;
    const m = dv.getUint32(p, true);
    if (!m) break;
    mips.push(m); mipOffsets.push(acc); acc += m;
  }
  return { format: dv.getUint32(0x0C, true), w, h, guid: hex(b, 0x28, 16), mips, mipOffsets, total: acc };
}

/** Highest-resolution mip fully covered by the chunk ranges we hold: [(logicalOffset, logicalSize, bytes)]. */
export function bestMip(desc: TextureDesc, ranges: [number, number, Uint8Array][]): [number, Uint8Array] | null {
  for (let i = 0; i < desc.mips.length; i++) {
    const lo = desc.mipOffsets[i], hi = lo + desc.mips[i];
    for (const [o, l, data] of ranges) {
      if (o <= lo && hi <= o + l && data.length >= hi - o) return [i, data.subarray(lo - o, hi - o)];
    }
  }
  return null;
}
