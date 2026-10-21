// SPDX-License-Identifier: GPL-3.0-or-later
// Skate 3 render-arena constants (port of the parts of skate4to3 sk3/render.py the writer needs;
// the decoder itself is not ported). Facts: skate4to3 specs/sk3_render.md.

export const T_BASE = 0x10031, T_TEX = 0x200e8, T_DECL = 0x200e9, T_VB = 0x200ea, T_IB = 0x200eb, T_BIND = 0x20081;
export const T_MODEL = 0xeb0001, T_MATS = 0xeb0005, T_VER = 0xeb0008, T_EXPORTS = 0xeb000b, T_INST = 0xeb000d,
  T_MESH = 0xeb0023, T_PROBES = 0xeb0024;
export const T_QUADS = 0xeb0016, T_POLYS = 0xeb0025, T_GUIDS = 0xeb0028;
export const SUBREF = 0x00800000;

/** numpy dtype kind of a vertex element: 'f4' | 'f2' | 'i2' | 'u4' | 'u1' (big-endian except u1) */
export type ElKind = 'f4' | 'f2' | 'i2' | 'u4' | 'u1';
/** D3DDECLTYPE word -> (element kind, component count, bytes per component) */
export const FMT: Record<number, [ElKind, number, number]> = {
  0x002A23B9: ['f4', 3, 4],     // FLOAT3
  0x002C235F: ['f2', 2, 2],     // FLOAT16_2
  0x001A2360: ['f2', 4, 2],     // FLOAT16_4
  0x001A215A: ['i2', 4, 2],     // SHORT4N
  0x002C2159: ['i2', 2, 2],     // SHORT2N
  0x002A2190: ['u4', 1, 4],     // 11:11:10 signed normalized
  0x001A2286: ['u1', 4, 1],     // UBYTE4
  0x002C2359: ['i2', 2, 2],     // SHORT2
};
export const EL_POSITION = 1, EL_TEX0 = 6, EL_TEX1 = 7, EL_TEX3 = 9, EL_TANGENT = 0x15;
export const UV_NAMES: Record<number, string> = { [EL_TEX0]: 'uv0', [EL_TEX1]: 'uv1', [EL_TEX3]: 'uv3' };
export const UV_EXTRA: Record<number, string> = { [EL_TEX0]: 'uv2' };
export const PRIM_TRIANGLELIST = 4;

export interface DeclElement {
  stream: number; offset: number; type: number; method: number; usage: number; usage_index: number; id: number; w3: number;
}
export interface Decl { w0: number; w2lo: number; w3: number; elements: DeclElement[] }

export function declStride(decl: Decl): number {
  const e = decl.elements[decl.elements.length - 1];
  const [, n, sz] = FMT[e.type];
  return e.offset + sz * n;
}

/** big-endian u32 words of b from byte o */
export function words(b: Uint8Array, o = 0, n?: number): number[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const cnt = n ?? Math.floor((b.length - o) / 4);
  const out: number[] = [];
  for (let k = 0; k < cnt; k++) out.push(dv.getUint32(o + 4 * k));
  return out;
}
