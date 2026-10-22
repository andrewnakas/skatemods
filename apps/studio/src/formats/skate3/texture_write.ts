// SPDX-License-Identifier: GPL-3.0-or-later
// Skate 3 (Xbox 360) texture arena writer: port of skate4to3 sk3/texture_write.py.
//   buildTexture(TexSpec) -> arena bytes (tiling, base-resource size, mip placement, name table, RW4
//   layout all derived), fromImage(rgba, ...) -> TexSpec (box-filter mip chain -> our own BC1 / BC3
//   encoder, or 565 / 8888 for the low-res stand-in). Byte-identical to the Python: the float32
//   numpy arithmetic of the encoder and the mip filter is reproduced op for op (Math.fround, numpy's
//   summation orders), see num_util.ts. Not ported: extract / untile_levels (readers).
import * as T from './texture.ts';
import { FetchConstant } from './texture.ts';
import { concat, f32, hex16, rint, tree8f } from './num_util.ts';
import { buildArena } from './rw4_write.ts';

export const EB0008 = new Uint8Array([0, 0, 0, 0x19, 0, 0, 0, 0x0D]);
export const NAME_HASH = 0x9B0F1678;

/** RGBA uint8 image, row-major [h][w][4] */
export interface Rgba { width: number; height: number; data: Uint8Array }

export interface TexSpec {
  arena_id: number;
  name_id: bigint;
  fmt: number;
  width: number;
  height: number;
  nlevels: number;
  cube: boolean;
  levels: Map<string, Uint8Array>;   // key `${level},${face}` -> linear block bytes, stored byte order
  table_id?: bigint | null;          // id in the name-table entry; null = name_id
  name_hash?: number;                // default NAME_HASH
  pad?: number;                      // name table's last byte (default 0)
  header?: readonly number[];        // default HDR_WORDS
  fc_override?: number[] | null;
}

export const levelKey = (lv: number, f: number) => `${lv},${f}`;

export function specFcWords(s: TexSpec): number[] {
  return s.fc_override ?? fetchWords(s.fmt, s.width, s.height, s.nlevels, { cube: s.cube });
}

// ---------------------------------------------------------------- tiling

export function surfaceSize(fc: FetchConstant): number {
  const [, , bpb] = T.FORMATS[fc.format];
  return Math.max(...T.levelLayout(fc).map(e => e[4] + T.a4k(e[7] * e[8] * bpb)));
}

/** Linear level blocks -> the base resource (all levels, tiled, zero elsewhere). */
export function tile(fc: FetchConstant, levels: Map<string, Uint8Array>): Uint8Array {
  const [, bw, bpb] = T.FORMATS[fc.format];
  const out = new Uint8Array(surfaceSize(fc));
  for (const [lv, f, w, h, off, px, py, sw] of T.levelLayout(fc)) {
    const wb = Math.ceil(w / bw), hb = Math.ceil(h / bw);
    const src = levels.get(levelKey(lv, f));
    if (!src) throw new Error(`missing level ${lv} face ${f}`);
    if (src.length !== wb * hb * bpb) throw new Error(`level ${lv}: ${src.length} bytes, want ${wb * hb * bpb}`);
    for (let y = 0; y < hb; y++) {
      for (let x = 0; x < wb; x++) {
        const d = off + T.tiledOffset(px + x, py + y, sw, bpb) * bpb;
        if (d + bpb > out.length) throw new Error('tiled block outside the surface');
        out.set(src.subarray((y * wb + x) * bpb, (y * wb + x + 1) * bpb), d);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- objects

export function namesObject(nameId: bigint, tableId: bigint, nameHash: number, pad: number, dictIndex = 1): Uint8Array {
  const name = new TextEncoder().encode(`0x${hex16(nameId)}.Texture\0`);
  const head = new Uint8Array(0x2C);
  const dv = new DataView(head.buffer);
  [1, 0x14, 0x2C, 0, 0].forEach((v, i) => dv.setUint32(4 * i, v));
  dv.setUint32(0x14, 0x2C);
  dv.setUint32(0x18, nameHash >>> 0);
  dv.setBigUint64(0x1C, BigInt.asUintN(64, tableId));
  dv.setUint32(0x24, T.FNV_TEXTURE);
  dv.setUint32(0x28, dictIndex);
  let body = concat([head, name]);
  const size = (body.length + 3) & ~3;
  if (size > body.length) {
    const b = new Uint8Array(size);
    b.set(body);
    b[body.length] = pad;
    body = b;
  }
  new DataView(body.buffer).setUint32(0x10, body.length);
  return body;
}

/** build(TexSpec) -> texture arena bytes */
// The same image is written once per tile it appears in (only ids differ), so its mip chain, its encoded levels
// and its tiled surface are computed once per image and reused: pure caches, byte-identical output.
const tiledCache = new WeakMap<Map<string, Uint8Array>, Map<string, Uint8Array>>();
function tiledMemo(fc: FetchConstant, words: number[], levels: Map<string, Uint8Array>): Uint8Array {
  let m = tiledCache.get(levels);
  if (!m) { m = new Map(); tiledCache.set(levels, m); }
  const k = words.join(',');
  let t = m.get(k);
  if (!t) { t = tile(fc, levels); m.set(k, t); }
  return t;
}
const mipCache = new WeakMap<Rgba, Rgba[]>();
/** mipChain, memoised per source image (a longer chain extends the cached one: each level derives from the last) */
export function mipChainCached(img: Rgba, levels: number): Rgba[] {
  let c = mipCache.get(img);
  if (!c || c.length < levels) { c = mipChain(img, levels); mipCache.set(img, c); }
  return c.slice(0, levels);
}
const encodedCache = new WeakMap<Rgba, Map<string, Map<string, Uint8Array>>>();

export function buildTexture(s: TexSpec): Uint8Array {
  const words = specFcWords(s);
  const fc = new FetchConstant(words);
  const tex = new Uint8Array(52);
  const dv = new DataView(tex.buffer);
  [...(s.header ?? T.HDR_WORDS), ...words].forEach((v, i) => dv.setUint32(4 * i, v >>> 0));
  const nt = namesObject(s.name_id, s.table_id ?? s.name_id, s.name_hash ?? NAME_HASH, s.pad ?? 0);
  return buildArena({ arenaId: s.arena_id, objects: [
    { typeId: T.T_BASE, align: 0x1000, data: tiledMemo(fc, words, s.levels) },
    { typeId: T.T_TEXTURE, align: 4, data: tex },
    { typeId: T.T_NAMES, align: 0x10, data: nt },
    { typeId: T.T_EB0008, align: 0x10, data: EB0008 }] });
}

// ---------------------------------------------------------------- fetch constant from fields

export const RETAIL_SWIZZLE: Record<number, number[]> = { 4: [2, 1, 0, 5], 6: [2, 1, 0, 3], 18: [0, 1, 2, 3], 19: [0, 1, 2, 3], 20: [0, 1, 2, 3] };
export const RETAIL_ENDIAN: Record<number, number> = { 4: 1, 6: 2, 18: 1, 19: 1, 20: 1 };

export interface FetchOptions {
  swizzle?: number[]; endian?: number; clamp?: number[]; filters?: number[]; cube?: boolean; mip_page?: number;
}

export function fetchWords(fmt: number, width: number, height: number, levels: number, o: FetchOptions = {}): number[] {
  const swizzle = o.swizzle ?? RETAIL_SWIZZLE[fmt];
  const endian = o.endian ?? RETAIL_ENDIAN[fmt];
  const clamp = o.clamp ?? [0, 0, 0];
  const [mag, mn, mip, an] = o.filters ?? [0, 0, 0, 0];
  const cube = o.cube ?? false;
  const sw = swizzle.reduce((a, v, i) => a + v * 2 ** (3 * i), 0);
  const [, bw] = T.FORMATS[fmt];
  const pitch = Math.floor(T.a32(Math.ceil(width / bw)) * bw / 32);
  const w0 = (2 | (clamp[0] << 10) | (clamp[1] << 13) | (clamp[2] << 16) | (pitch << 22) | (1 << 31)) >>> 0;
  const w1 = (fmt | (endian << 6)) >>> 0;
  const w2 = ((width - 1) | ((height - 1) << 13) | ((cube ? 5 : 0) << 26)) >>> 0;
  const w3 = ((sw << 1) | (mag << 19) | (mn << 21) | (mip << 23) | (an << 25)) >>> 0;
  const w4 = ((levels - 1) << 6) >>> 0;
  let w5 = (((cube ? 3 : 1) << 9) | ((levels > 1 ? 1 : 0) << 11)) >>> 0;
  let mipPage = o.mip_page;
  if (mipPage === undefined) {
    mipPage = 0;
    if (levels > 1) {
      const fc = new FetchConstant([w0, w1, w2, w3, w4, w5]);
      const ps = T.packedStart(fc);
      if (ps !== 0) {
        const [, , bpb] = T.FORMATS[fmt];
        const l0 = T.levelLayout(fc).filter(e => e[0] === 0);
        mipPage = Math.floor(T.faces(fc) * T.a4k(l0[0][7] * l0[0][8] * bpb) / 4096);
      }
    }
  }
  w5 = (w5 + mipPage * 4096) >>> 0;     // w5 low 12 bits are clear: | == +
  return [w0, w1, w2, w3, w4, w5];
}

// ---------------------------------------------------------------- BC1 / BC3 encoder

const to565 = (r: number, g: number, b: number) =>
  (Math.floor((r * 31 + 127) / 255) << 11) | (Math.floor((g * 63 + 127) / 255) << 5) | Math.floor((b * 31 + 127) / 255);

/** numpy float32 -> int32 astype (truncation; NaN / out of range -> INT32_MIN on x86) */
const toI32 = (x: number) => (Number.isFinite(x) && x > -2147483649 && x < 2147483648 ? Math.trunc(x) : -2147483648);

const F1E6 = f32(1e-6);
const clip = (x: number, lo: number, hi: number) => (Number.isNaN(x) ? x : Math.min(Math.max(x, lo), hi));
const npMax = (a: number, b: number) => (Number.isNaN(a) || Number.isNaN(b) ? NaN : Math.max(a, b));

/**
 * encode_bc1_colors for one block: px = 16 texels x RGB (uint8, row-major in the block) at px[o..o+48)
 * -> 8 bytes little-endian BC1 at out[w..w+8). Every float32 op of the numpy encoder, in order.
 */
export function encodeBc1Block(px: ArrayLike<number>, o: number, out: Uint8Array, w: number): void {
  const p = new Float64Array(48);
  for (let k = 0; k < 48; k++) p[k] = px[o + k];
  const mean = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    let s = 0;
    for (let k = 0; k < 16; k++) s = f32(s + p[3 * k + i]);
    mean[i] = f32(s / 16);
  }
  const d = new Float64Array(48);
  for (let k = 0; k < 16; k++) for (let i = 0; i < 3; i++) d[3 * k + i] = f32(p[3 * k + i] - mean[i]);
  const cov = new Float64Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 16; k++) s = f32(s + f32(d[3 * k + i] * d[3 * k + j]));
      cov[3 * i + j] = s;
    }
  }
  let v = [1, 1, 1];
  for (let it = 0; it < 8; it++) {
    const nv = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      let s = 0;
      for (let j = 0; j < 3; j++) s = f32(s + f32(cov[3 * i + j] * v[j]));
      nv[i] = s;
    }
    const nrm = f32(Math.sqrt(f32(f32(f32(nv[0] * nv[0]) + f32(nv[1] * nv[1])) + f32(nv[2] * nv[2]))));
    const m = npMax(nrm, F1E6);
    v = [f32(nv[0] / m), f32(nv[1] / m), f32(nv[2] / m)];
  }
  let tmin = Infinity, tmax = -Infinity;
  for (let k = 0; k < 16; k++) {
    let s = 0;
    for (let i = 0; i < 3; i++) s = f32(s + f32(d[3 * k + i] * v[i]));
    if (s < tmin || Number.isNaN(s)) tmin = s;
    if (s > tmax || Number.isNaN(s)) tmax = s;
  }
  let lo = [0, 1, 2].map(i => f32(mean[i] + f32(v[i] * tmin)));
  let hi = [0, 1, 2].map(i => f32(mean[i] + f32(v[i] * tmax)));
  const a = new Float64Array(16), b = new Float64Array(16), sq = new Float64Array(16);
  for (let it = 0; it < 2; it++) {
    const hl = [0, 1, 2].map(i => f32(hi[i] - lo[i]));
    const span = f32(f32(f32(hl[0] * hl[0]) + f32(hl[1] * hl[1])) + f32(hl[2] * hl[2]));
    const den = npMax(span, F1E6);
    for (let k = 0; k < 16; k++) {
      let s = 0;
      for (let i = 0; i < 3; i++) s = f32(s + f32(f32(p[3 * k + i] - lo[i]) * hl[i]));
      const tt = f32(s / den);
      const q = f32(clip(rint(f32(tt * 3)), 0, 3) / 3);
      a[k] = f32(1 - q);
      b[k] = q;
    }
    for (let k = 0; k < 16; k++) sq[k] = f32(a[k] * a[k]);
    const aa = tree8f(sq);
    for (let k = 0; k < 16; k++) sq[k] = f32(b[k] * b[k]);
    const bb = tree8f(sq);
    for (let k = 0; k < 16; k++) sq[k] = f32(a[k] * b[k]);
    const ab = tree8f(sq);
    const det = f32(f32(aa * bb) - f32(ab * ab));
    const ok = Math.abs(det) > F1E6;
    const dd = ok ? det : 1;
    const ax = [0, 0, 0], bx = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      let sa = 0, sb = 0;
      for (let k = 0; k < 16; k++) {
        sa = f32(sa + f32(a[k] * p[3 * k + i]));
        sb = f32(sb + f32(b[k] * p[3 * k + i]));
      }
      ax[i] = sa; bx[i] = sb;
    }
    if (ok) {
      const nlo = [0, 1, 2].map(i => f32(f32(f32(bb * ax[i]) - f32(ab * bx[i])) / dd));
      const nhi = [0, 1, 2].map(i => f32(f32(f32(aa * bx[i]) - f32(ab * ax[i])) / dd));
      lo = nlo.map(x => clip(x, 0, 255));
      hi = nhi.map(x => clip(x, 0, 255));
    }
  }
  const q = (x: number) => toI32(clip(rint(x), 0, 255));
  let c0 = to565(q(hi[0]), q(hi[1]), q(hi[2]));
  let c1 = to565(q(lo[0]), q(lo[1]), q(lo[2]));
  if (c0 < c1) { const t = c0; c0 = c1; c1 = t; }
  const eq = c0 === c1;
  const p0 = T.expand565(c0), p1 = T.expand565(c1);
  const pal = [p0, p1, [0, 1, 2].map(i => Math.floor((2 * p0[i] + p1[i]) / 3)), [0, 1, 2].map(i => Math.floor((p0[i] + 2 * p1[i]) / 3))];
  let bits = 0;
  for (let k = 0; k < 16; k++) {
    let sel = 0;
    if (!eq) {
      let best = Infinity;
      for (let e = 0; e < 4; e++) {
        const dr = p[3 * k] - pal[e][0], dg = p[3 * k + 1] - pal[e][1], db = p[3 * k + 2] - pal[e][2];
        const dist = dr * dr + dg * dg + db * db;     // exact small integers
        if (dist < best) { best = dist; sel = e; }
      }
    }
    bits = (bits | (sel << (2 * k))) >>> 0;
  }
  out[w] = c0 & 0xFF; out[w + 1] = c0 >> 8; out[w + 2] = c1 & 0xFF; out[w + 3] = c1 >> 8;
  out[w + 4] = bits & 0xFF; out[w + 5] = (bits >>> 8) & 0xFF; out[w + 6] = (bits >>> 16) & 0xFF; out[w + 7] = bits >>> 24;
}

/** encode_bc3_alpha for one block: 16 alphas at al[o..o+16) -> 8 bytes at out[w..w+8) */
export function encodeBc3AlphaBlock(al: ArrayLike<number>, o: number, out: Uint8Array, w: number): void {
  let hi = -Infinity, lo = Infinity;
  for (let k = 0; k < 16; k++) { hi = Math.max(hi, al[o + k]); lo = Math.min(lo, al[o + k]); }
  if (hi === lo) hi = Math.min(hi + 1, 255);
  if (hi === lo) lo = lo - 1;
  const pal = [hi, lo];
  for (let j = 1; j < 7; j++) pal.push(Math.floor(((7 - j) * hi + j * lo) / 7));
  let bitsLo = 0, bitsHi = 0;         // 48 index bits as two 24-bit halves
  for (let k = 0; k < 16; k++) {
    let sel = 0, best = Infinity;
    for (let e = 0; e < 8; e++) {
      const dist = Math.abs(al[o + k] - pal[e]);
      if (dist < best) { best = dist; sel = e; }
    }
    const sh = 3 * k;
    if (sh < 24) bitsLo |= sel << sh; else bitsHi |= sel << (sh - 24);
  }
  out[w] = hi & 0xFF; out[w + 1] = lo & 0xFF;
  out[w + 2] = bitsLo & 0xFF; out[w + 3] = (bitsLo >> 8) & 0xFF; out[w + 4] = (bitsLo >> 16) & 0xFF;
  out[w + 5] = bitsHi & 0xFF; out[w + 6] = (bitsHi >> 8) & 0xFF; out[w + 7] = (bitsHi >> 16) & 0xFF;
}

/** _blocks: [n,16,4] texels (edge-padded to 4x4 blocks), row-major blocks, row-major texels */
export function toBlocks(img: Rgba): { data: Uint8Array; n: number } {
  const { width: w, height: h } = img;
  const W = Math.ceil(w / 4) * 4, H = Math.ceil(h / 4) * 4;
  const nb = (W / 4) * (H / 4);
  const out = new Uint8Array(nb * 64);
  let o = 0;
  for (let by = 0; by < H / 4; by++) {
    for (let bx = 0; bx < W / 4; bx++) {
      for (let y = 0; y < 4; y++) {
        const sy = Math.min(by * 4 + y, h - 1);
        for (let x = 0; x < 4; x++) {
          const sx = Math.min(bx * 4 + x, w - 1);
          out.set(img.data.subarray((sy * w + sx) * 4, (sy * w + sx) * 4 + 4), o);
          o += 4;
        }
      }
    }
  }
  return { data: out, n: nb };
}

/** encode_bc1_colors over [n,16,3] uint8 -> [n,8] */
export function encodeBc1Colors(px: Uint8Array, n: number): Uint8Array {
  const out = new Uint8Array(8 * n);
  for (let k = 0; k < n; k++) encodeBc1Block(px, 48 * k, out, 8 * k);
  return out;
}

/** encode_bc3_alpha over [n,16] uint8 -> [n,8] */
export function encodeBc3Alpha(a: Uint8Array, n: number): Uint8Array {
  const out = new Uint8Array(8 * n);
  for (let k = 0; k < n; k++) encodeBc3AlphaBlock(a, 16 * k, out, 8 * k);
  return out;
}

/** encode_level: RGBA -> linear little-endian blocks (before the Xenos endian swap) */
export function encodeLevel(img: Rgba, fmt: number): Uint8Array {
  const px = img.data, n = img.width * img.height;
  if (fmt === 4) {
    const out = new Uint8Array(2 * n);
    for (let k = 0; k < n; k++) {
      const c = to565(px[4 * k], px[4 * k + 1], px[4 * k + 2]);
      out[2 * k] = c & 0xFF; out[2 * k + 1] = c >> 8;
    }
    return out;
  }
  if (fmt === 6) {
    const out = new Uint8Array(4 * n);
    for (let k = 0; k < n; k++) {
      out[4 * k] = px[4 * k + 2]; out[4 * k + 1] = px[4 * k + 1]; out[4 * k + 2] = px[4 * k]; out[4 * k + 3] = px[4 * k + 3];
    }
    return out;
  }
  const { data, n: nb } = toBlocks(img);
  const rgb = new Uint8Array(48 * nb), al = new Uint8Array(16 * nb);
  for (let t = 0; t < 16 * nb; t++) {
    rgb[3 * t] = data[4 * t]; rgb[3 * t + 1] = data[4 * t + 1]; rgb[3 * t + 2] = data[4 * t + 2];
    al[t] = data[4 * t + 3];
  }
  if (fmt === 18) return encodeBc1Colors(rgb, nb);
  if (fmt === 20) {
    const c = encodeBc1Colors(rgb, nb), a = encodeBc3Alpha(al, nb);
    const out = new Uint8Array(16 * nb);
    for (let k = 0; k < nb; k++) { out.set(a.subarray(8 * k, 8 * k + 8), 16 * k); out.set(c.subarray(8 * k, 8 * k + 8), 16 * k + 8); }
    return out;
  }
  throw new Error(`format ${fmt}`);
}

/** mip_chain: box-filtered chain in float32 (not re-rounded between levels), like the numpy code */
export function mipChain(img: Rgba, levels: number): Rgba[] {
  const out: Rgba[] = [img];
  let h = img.height, w = img.width;
  let cur = Float32Array.from(img.data);
  for (let l = 1; l < levels; l++) {
    const nh = Math.max(1, h >> 1), nw = Math.max(1, w >> 1);
    const A = Math.floor(h / nh), B = Math.floor(w / nw);
    const div = A * B;
    const nxt = new Float32Array(nh * nw * 4);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        for (let c = 0; c < 4; c++) {
          let s = 0, first = true;
          for (let a = 0; a < A; a++) {
            for (let b = 0; b < B; b++) {
              const v = cur[((y * A + a) * w + (x * B + b)) * 4 + c];
              s = first ? v : f32(s + v);
              first = false;
            }
          }
          nxt[(y * nw + x) * 4 + c] = f32(s / div);
        }
      }
    }
    const u8 = new Uint8Array(nxt.length);
    for (let k = 0; k < nxt.length; k++) u8[k] = clip(rint(nxt[k]), 0, 255);
    out.push({ width: nw, height: nh, data: u8 });
    cur = nxt; h = nh; w = nw;
  }
  return out;
}

export interface FromImageOptions { alpha?: boolean; levels?: number; lowres?: boolean; fmt?: number }

/** from_image: RGBA (power-of-two sides) -> TexSpec (DXT1 / DXT5; 565 / 8888 with lowres) */
export function fromImage(rgba: Rgba, nameId: bigint, arenaId: number, o: FromImageOptions = {}): TexSpec {
  const { width: w, height: h } = rgba;
  if ((w & (w - 1)) || (h & (h - 1))) throw new Error('power-of-two sizes only');
  let alpha = o.alpha;
  if (alpha === undefined) {
    alpha = false;
    for (let k = 3; k < rgba.data.length; k += 4) if (rgba.data[k] < 255) { alpha = true; break; }
  }
  const lowres = o.lowres ?? false;
  const fmt = o.fmt ?? (lowres ? (alpha ? 6 : 4) : (alpha ? 20 : 18));
  const levels = o.levels || Math.floor(Math.log2(Math.max(w, h))) + 1;
  const fc = new FetchConstant(fetchWords(fmt, w, h, levels));
  let byKey = encodedCache.get(rgba);
  if (!byKey) { byKey = new Map(); encodedCache.set(rgba, byKey); }
  let lv = byKey.get(`${fmt}/${levels}`);
  if (!lv) {
    lv = new Map<string, Uint8Array>();
    for (const [k, im] of mipChainCached(rgba, levels).entries()) lv.set(levelKey(k, 0), T.endianFix(encodeLevel(im, fmt), fc.endian));
    byKey.set(`${fmt}/${levels}`, lv);
  }
  return { arena_id: arenaId, name_id: nameId, fmt, width: w, height: h, nlevels: levels, cube: false, levels: lv,
    table_id: lowres ? (nameId | T.LOWRES_FLAG) : null };
}

/** lowres_standin: the small 565 / 8888 copy (longest side <= size) retail keeps in cPres streams */
export function lowresStandin(rgba: Rgba, nameId: bigint, arenaId: number, size = 64): TexSpec {
  const { width: w, height: h } = rgba;
  let k = 0;
  while ((Math.max(w, h) >> k) > size) k++;
  const small = mipChainCached(rgba, k + 1)[k];
  return fromImage(small, nameId, arenaId, { lowres: true });
}
