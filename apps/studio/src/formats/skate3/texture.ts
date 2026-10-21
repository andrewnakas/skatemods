// SPDX-License-Identifier: GPL-3.0-or-later
// Skate 3 (Xbox 360) texture facts the writer needs: port of the layout half of skate4to3
// sk3/texture.py (formats, fetch constant fields, Xenos 2D tiling, mip layout, endian swaps, the
// 565 expansion the BC1 encoder uses). Facts: skate4to3 specs/sk3_textures.md.

export const T_BASE = 0x10031, T_TEXTURE = 0x200e8, T_NAMES = 0xeb000b, T_EB0008 = 0xeb0008;
export const HDR_WORDS = [3, 1, 0, 0, 0, 0xFFFF0000, 0xFFFF0000] as const;
export const FNV_TEXTURE = 0xAC462E4A;
export const LOWRES_FLAG = 0x4000000000000000n;

/** Xenos format -> [name, block width/height, bytes per block] */
export const FORMATS: Record<number, [string, number, number]> = {
  4: ['R5G6B5', 1, 2],
  6: ['A8R8G8B8', 1, 4],
  18: ['DXT1', 4, 8],
  19: ['DXT3', 4, 16],
  20: ['DXT5', 4, 16],
};

const bits = (v: number, lo: number, n: number) => Math.floor(v / 2 ** lo) % 2 ** n;

/** GPUTEXTURE_FETCH_CONSTANT (6 dwords) decoded to the fields the writer uses */
export class FetchConstant {
  readonly words: readonly number[];
  constructor(words: readonly number[]) { this.words = words; }
  get pitch() { return bits(this.words[0], 22, 9) * 32; }
  get format() { return bits(this.words[1], 0, 6); }
  get endian() { return bits(this.words[1], 6, 2); }
  get width() { return bits(this.words[2], 0, 13) + 1; }
  get height() { return bits(this.words[2], 13, 13) + 1; }
  get mipMax() { return bits(this.words[4], 6, 4); }
  get dimension() { return bits(this.words[5], 9, 2); }
  get packedMips() { return bits(this.words[5], 11, 1); }
  get mipPage() { return bits(this.words[5], 12, 20); }
  get levels() { return this.mipMax + 1; }
}

const LOG_BPB: Record<number, number> = { 1: 0, 2: 1, 4: 2, 8: 3, 16: 4 };

/** Block index (units of bpb) of block (x, y) in a tiled surface wb blocks wide (32-aligned). */
export function tiledOffset(x: number, y: number, wb: number, bpb: number): number {
  const lb = LOG_BPB[bpb];
  const aw = (wb + 31) & ~31;
  const macro = ((x >> 5) + (y >> 5) * (aw >> 5)) << (lb + 7);
  const micro = ((x & 7) + ((y & 6) << 2)) << lb;
  const off = macro + ((micro & ~15) << 1) + (micro & 15) + ((y & 8) << (3 + lb)) + ((y & 1) << 4);
  // off stays far below 2^31 for every surface up to 8192 x 8192 blocks of 16 B
  return ((((off & ~511) << 3) + ((off & 448) << 2) + (off & 63) + ((y & 16) << 7)
    + (((((y & 8) >> 2) + (x >> 3)) & 3) << 6)) >> lb);
}

function nextPow2(v: number): number {
  let p = 1;
  while (p < v) p *= 2;
  return p;
}
export const a32 = (v: number) => (v + 31) & ~31;
export const a4k = (v: number) => Math.ceil(v / 0x1000) * 0x1000;

export const faces = (fc: FetchConstant) => (fc.dimension === 3 ? 6 : 1);

export function levelDims(fc: FetchConstant, lv: number): [number, number] {
  if (lv === 0) return [fc.width, fc.height];
  return [Math.max(1, Math.floor(nextPow2(fc.width) / 2 ** lv)), Math.max(1, Math.floor(nextPow2(fc.height) / 2 ** lv))];
}

/** First level stored in the shared packed tile (min side <= 16 texels), or null. */
export function packedStart(fc: FetchConstant): number | null {
  if (!fc.packedMips) return null;
  for (let lv = 0; lv < fc.levels; lv++) if (Math.min(...levelDims(fc, lv)) <= 16) return lv;
  return null;
}

export function packedTileOffset(t: number, w: number, h: number, bw: number): [number, number] {
  const wide = w > h;
  const major = wide ? w : h;
  const [alongMinor, alongMajor] = t < 3 ? [16 >> t, 0] : [0, 4 * Math.max(1, major >> t)];
  const [x, y] = wide ? [alongMajor, alongMinor] : [alongMinor, alongMajor];
  return [Math.floor(x / bw), Math.floor(y / bw)];
}

/** [level, face, width, height, surface byte offset, block x, block y, surface wb, surface hb] */
export type LayoutEntry = [number, number, number, number, number, number, number, number, number];

export function levelLayout(fc: FetchConstant): LayoutEntry[] {
  const [, bw, bpb] = FORMATS[fc.format];
  const nf = faces(fc);
  const ps = packedStart(fc);
  const out: LayoutEntry[] = [];
  let off = 0;
  for (let lv = 0; lv < fc.levels; lv++) {
    if (lv === 1) off = fc.mipPage * 4096;
    if (ps !== null && lv > ps) continue;
    const [w, h] = levelDims(fc, lv);
    const sw = a32(Math.ceil(w / bw)), sh = a32(Math.ceil(h / bw));
    const size = a4k(sw * sh * bpb);
    for (let f = 0; f < nf; f++) {
      if (ps !== null && lv === ps) {
        for (let k = lv; k < fc.levels; k++) {
          const [kw, kh] = levelDims(fc, k);
          const [px, py] = packedTileOffset(k - ps, w, h, bw);
          out.push([k, f, kw, kh, off + f * size, px, py, sw, sh]);
        }
      } else {
        out.push([lv, f, w, h, off + f * size, 0, 0, sw, sh]);
      }
    }
    off += nf * size;
  }
  return out;
}

/** Xenos endian field: 0 none, 1 8-in-16, 2 8-in-32, 3 16-in-32 (returns a new array). */
export function endianFix(b: Uint8Array, endian: number): Uint8Array {
  if (endian === 1) {
    const out = new Uint8Array(b.length + (b.length & 1));
    out.set(b);
    for (let i = 0; i < out.length; i += 2) { const t = out[i]; out[i] = out[i + 1]; out[i + 1] = t; }
    return out;
  }
  if (endian === 2) {
    const out = new Uint8Array(b.length);
    for (let i = 0; i + 3 < b.length; i += 4) {
      out[i] = b[i + 3]; out[i + 1] = b[i + 2]; out[i + 2] = b[i + 1]; out[i + 3] = b[i];
    }
    return out;
  }
  if (endian === 3) {
    const out = new Uint8Array(b.length);
    for (let i = 0; i + 3 < b.length; i += 4) {
      out[i] = b[i + 2]; out[i + 1] = b[i + 3]; out[i + 2] = b[i]; out[i + 3] = b[i + 1];
    }
    return out;
  }
  return b.slice();
}

/** 565 colour -> expanded [r, g, b] (texture._565) */
export function expand565(c: number): [number, number, number] {
  const r = (c >> 11) & 31, g = (c >> 5) & 63, b = c & 31;
  return [Math.floor((r * 255 + 15) / 31), Math.floor((g * 255 + 31) / 63), Math.floor((b * 255 + 15) / 31)];
}
