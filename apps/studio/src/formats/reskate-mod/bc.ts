// SPDX-License-Identifier: GPL-3.0-or-later
// Block-compressed texture decoders -> RGBA8. BC1-BC5 interpolate the way Pillow's BCn decoder does
// (integer division), so results match the Python pipeline's PIL decode; BC7 follows the D3D11
// format specification (partition/anchor tables and weights are the published spec values).

function rgba(w: number, h: number) { return new Uint8Array(w * h * 4); }

function put(out: Uint8Array, w: number, h: number, bx: number, by: number, px: (i: number, o: Uint8Array, k: number) => void) {
  for (let i = 0; i < 16; i++) {
    const x = bx * 4 + (i & 3), y = by * 4 + (i >> 2);
    if (x < w && y < h) px(i, out, (y * w + x) * 4);
  }
}

function bc1Colours(b: Uint8Array, o: number, forceFour: boolean): Uint8Array {
  const c0 = b[o] | (b[o + 1] << 8), c1 = b[o + 2] | (b[o + 3] << 8);
  const e = (c: number) => {
    const r = (c >> 11) & 31, g = (c >> 5) & 63, bl = c & 31;
    return [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (bl << 3) | (bl >> 2)];
  };
  const [r0, g0, b0] = e(c0), [r1, g1, b1] = e(c1);
  const p = new Uint8Array(16);
  p.set([r0, g0, b0, 255, r1, g1, b1, 255]);
  if (c0 > c1 || forceFour) {
    p.set([((2 * r0 + r1) / 3) | 0, ((2 * g0 + g1) / 3) | 0, ((2 * b0 + b1) / 3) | 0, 255,
           ((r0 + 2 * r1) / 3) | 0, ((g0 + 2 * g1) / 3) | 0, ((b0 + 2 * b1) / 3) | 0, 255], 8);
  } else {
    p.set([((r0 + r1) / 2) | 0, ((g0 + g1) / 2) | 0, ((b0 + b1) / 2) | 0, 255, 0, 0, 0, 0], 8);
  }
  return p;
}

function bc4Values(b: Uint8Array, o: number): { lut: number[]; idx: number[] } {
  const a0 = b[o], a1 = b[o + 1];
  const lut = [a0, a1];
  if (a0 > a1) for (let i = 2; i < 8; i++) lut.push((((8 - i) * a0 + (i - 1) * a1) / 7) | 0);
  else { for (let i = 2; i < 6; i++) lut.push((((6 - i) * a0 + (i - 1) * a1) / 5) | 0); lut.push(0, 255); }
  let bits = 0n;
  for (let i = 0; i < 6; i++) bits |= BigInt(b[o + 2 + i]) << BigInt(8 * i);
  const idx: number[] = [];
  for (let i = 0; i < 16; i++) idx.push(Number((bits >> BigInt(3 * i)) & 7n));
  return { lut, idx };
}

export function decodeBC1(src: Uint8Array, w: number, h: number): Uint8Array {
  const out = rgba(w, h), bw = Math.max(1, (w + 3) >> 2), bh = Math.max(1, (h + 3) >> 2);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const o = (by * bw + bx) * 8;
    const pal = bc1Colours(src, o, false);
    const bits = (src[o + 4] | (src[o + 5] << 8) | (src[o + 6] << 16) | (src[o + 7] << 24)) >>> 0;
    put(out, w, h, bx, by, (i, d, k) => { const c = (bits >>> (2 * i)) & 3; d.set(pal.subarray(c * 4, c * 4 + 4), k); });
  }
  return out;
}

export function decodeBC2(src: Uint8Array, w: number, h: number): Uint8Array {
  const out = rgba(w, h), bw = Math.max(1, (w + 3) >> 2), bh = Math.max(1, (h + 3) >> 2);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const o = (by * bw + bx) * 16;
    const pal = bc1Colours(src, o + 8, true);
    const bits = (src[o + 12] | (src[o + 13] << 8) | (src[o + 14] << 16) | (src[o + 15] << 24)) >>> 0;
    put(out, w, h, bx, by, (i, d, k) => {
      const c = (bits >>> (2 * i)) & 3;
      d.set(pal.subarray(c * 4, c * 4 + 3), k);
      const a = (src[o + (i >> 1)] >> ((i & 1) * 4)) & 15;
      d[k + 3] = a * 17;
    });
  }
  return out;
}

export function decodeBC3(src: Uint8Array, w: number, h: number): Uint8Array {
  const out = rgba(w, h), bw = Math.max(1, (w + 3) >> 2), bh = Math.max(1, (h + 3) >> 2);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const o = (by * bw + bx) * 16;
    const { lut, idx } = bc4Values(src, o);
    const pal = bc1Colours(src, o + 8, true);
    const bits = (src[o + 12] | (src[o + 13] << 8) | (src[o + 14] << 16) | (src[o + 15] << 24)) >>> 0;
    put(out, w, h, bx, by, (i, d, k) => {
      const c = (bits >>> (2 * i)) & 3;
      d.set(pal.subarray(c * 4, c * 4 + 3), k);
      d[k + 3] = lut[idx[i]];
    });
  }
  return out;
}

/** BC4 -> grey (R=G=B), BC5 -> R, G, B=0. */
export function decodeBC4(src: Uint8Array, w: number, h: number): Uint8Array {
  const out = rgba(w, h), bw = Math.max(1, (w + 3) >> 2), bh = Math.max(1, (h + 3) >> 2);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const { lut, idx } = bc4Values(src, (by * bw + bx) * 8);
    put(out, w, h, bx, by, (i, d, k) => { const v = lut[idx[i]]; d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255; });
  }
  return out;
}

export function decodeBC5(src: Uint8Array, w: number, h: number): Uint8Array {
  const out = rgba(w, h), bw = Math.max(1, (w + 3) >> 2), bh = Math.max(1, (h + 3) >> 2);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const o = (by * bw + bx) * 16;
    const r = bc4Values(src, o), g = bc4Values(src, o + 8);
    put(out, w, h, bx, by, (i, d, k) => { d[k] = r.lut[r.idx[i]]; d[k + 1] = g.lut[g.idx[i]]; d[k + 2] = 0; d[k + 3] = 255; });
  }
  return out;
}

// --------------------------------------------------------------------------------------------- BC7
const P2 = [0xCCCC, 0x8888, 0xEEEE, 0xECC8, 0xC880, 0xFEEC, 0xFEC8, 0xEC80, 0xC800, 0xFFEC, 0xFE80, 0xE800, 0xFFE8, 0xFF00, 0xFFF0, 0xF000,
  0xF710, 0x008E, 0x7100, 0x08CE, 0x008C, 0x7310, 0x3100, 0x8CCE, 0x088C, 0x3110, 0x6666, 0x366C, 0x17E8, 0x0FF0, 0x718E, 0x399C,
  0xAAAA, 0xF0F0, 0x5A5A, 0x33CC, 0x3C3C, 0x55AA, 0x9696, 0xA55A, 0x73CE, 0x13C8, 0x324C, 0x3BDC, 0x6996, 0xC33C, 0x9966, 0x0660,
  0x0272, 0x04E4, 0x4E40, 0x2720, 0xC936, 0x936C, 0x39C6, 0x639C, 0x9336, 0x9CC6, 0x817E, 0xE718, 0xCCF0, 0x0FCC, 0x7744, 0xEE22];
const P3 = [
  '0011001102212222', '0001001122112221', '0000200122112211', '0222002200110111', '0000000011221122', '0011001100220022', '0022002211111111', '0011001122112211',
  '0000000011112222', '0000111111112222', '0000111122222222', '0012001200120012', '0112011201120112', '0122012201220122', '0011011211221222', '0011200122002220',
  '0001001101121122', '0111001120012200', '0000112211221122', '0022002200221111', '0111011102220222', '0001000122212221', '0000001101220122', '0000110022102210',
  '0122012200110000', '0012001211222222', '0110122112210110', '0000011012211221', '0022110211020022', '0110011020022222', '0011012201220011', '0000200022112221',
  '0000000211221222', '0222002200120011', '0011001200220222', '0120012001200120', '0000111122220000', '0120120120120120', '0120201212010120', '0011220011220011',
  '0011112222000011', '0101010122222222', '0000000021212121', '0022112200221122', '0022001100220011', '0220122102201221', '0101222222220101', '0000212121212121',
  '0101010101012222', '0222011102220111', '0002111200021112', '0000211221122112', '0222011101110222', '0002111211120002', '0110011001102222', '0000000021122112',
  '0110011022222222', '0022001100110022', '0022112211220022', '0000000000002112', '0002000100020001', '0222122202221222', '0101222222222222', '0111201122012220'];
const A2 = [15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 2, 8, 2, 2, 8, 8, 15, 2, 8, 2, 2, 8, 8, 2, 2,
  15, 15, 6, 8, 2, 8, 15, 15, 2, 8, 2, 2, 2, 15, 15, 6, 6, 2, 6, 8, 15, 15, 2, 2, 15, 15, 15, 15, 15, 2, 2, 15];
const A32 = [3, 3, 15, 15, 8, 3, 15, 15, 8, 8, 6, 6, 6, 5, 3, 3, 3, 3, 8, 15, 3, 3, 6, 10, 5, 8, 8, 6, 8, 5, 15, 15,
  8, 15, 3, 5, 6, 10, 8, 15, 15, 3, 15, 5, 15, 15, 15, 15, 3, 15, 5, 5, 5, 8, 5, 10, 5, 10, 8, 13, 15, 12, 3, 3];
const A33 = [15, 8, 8, 3, 15, 15, 3, 8, 15, 15, 15, 15, 15, 15, 15, 8, 15, 8, 15, 3, 15, 8, 15, 8, 3, 15, 6, 10, 15, 15, 10, 8,
  15, 3, 15, 10, 10, 8, 9, 10, 6, 15, 8, 15, 3, 6, 6, 8, 15, 3, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 3, 15, 15, 8];
const W2 = [0, 21, 43, 64], W3 = [0, 9, 18, 27, 37, 46, 55, 64], W4 = [0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64];
const WEIGHTS: Record<number, number[]> = { 2: W2, 3: W3, 4: W4 };

// mode: [subsets, partBits, rotBits, idxSelBits, colourBits, alphaBits, pBitsPerEndpoint(1)/shared(2)/none(0), idxBits, idx2Bits]
const MODES: [number, number, number, number, number, number, number, number, number][] = [
  [3, 4, 0, 0, 4, 0, 1, 3, 0], [2, 6, 0, 0, 6, 0, 2, 3, 0], [3, 6, 0, 0, 5, 0, 0, 2, 0], [2, 6, 0, 0, 7, 0, 1, 2, 0],
  [1, 0, 2, 1, 5, 6, 0, 2, 3], [1, 0, 2, 0, 7, 8, 0, 2, 2], [1, 0, 0, 0, 7, 7, 1, 4, 0], [2, 6, 0, 0, 5, 5, 1, 2, 0]];

function subsetOf(ns: number, part: number, i: number): number {
  if (ns === 1) return 0;
  if (ns === 2) return (P2[part] >> i) & 1;
  return P3[part].charCodeAt(i) - 48;
}
function isAnchor(ns: number, part: number, i: number): boolean {
  if (i === 0) return true;
  if (ns === 2) return i === A2[part];
  if (ns === 3) return i === A32[part] || i === A33[part];
  return false;
}

export function decodeBC7(src: Uint8Array, w: number, h: number): Uint8Array {
  const out = rgba(w, h), bw = Math.max(1, (w + 3) >> 2), bh = Math.max(1, (h + 3) >> 2);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const o = (by * bw + bx) * 16;
    let pos = 0;
    const bit = () => { const v = (src[o + (pos >> 3)] >> (pos & 7)) & 1; pos++; return v; };
    const bits = (n: number) => { let v = 0; for (let i = 0; i < n; i++) v |= bit() << i; return v; };
    let mode = 0;
    while (mode < 8 && !bit()) mode++;
    if (mode === 8) { put(out, w, h, bx, by, (_i, d, k) => d.fill(0, k, k + 4)); continue; }
    const [ns, pb, rb, isb, cb, ab, pmode, ib, ib2] = MODES[mode];
    const part = bits(pb), rot = bits(rb), idxSel = bits(isb);
    const ne = ns * 2;
    const ep: number[][] = Array.from({ length: ne }, () => [0, 0, 0, 255]);
    for (let c = 0; c < 3; c++) for (let e = 0; e < ne; e++) ep[e][c] = bits(cb);
    if (ab) for (let e = 0; e < ne; e++) ep[e][3] = bits(ab);
    let cbits = cb, abits = ab;
    if (pmode === 1) {
      for (let e = 0; e < ne; e++) { const p = bit(); for (let c = 0; c < 4; c++) ep[e][c] = (ep[e][c] << 1) | p; }
      cbits++; if (ab) abits++;
    } else if (pmode === 2) {
      for (let s = 0; s < ns; s++) { const p = bit(); for (const e of [2 * s, 2 * s + 1]) for (let c = 0; c < 4; c++) ep[e][c] = (ep[e][c] << 1) | p; }
      cbits++; if (ab) abits++;
    }
    const expand = (v: number, n: number) => { v <<= 8 - n; return v | (v >> n); };
    for (let e = 0; e < ne; e++) {
      for (let c = 0; c < 3; c++) ep[e][c] = expand(ep[e][c], cbits);
      ep[e][3] = abits ? expand(ep[e][3], abits) : 255;
    }
    const idx1: number[] = [], idx2: number[] = [];
    for (let i = 0; i < 16; i++) idx1.push(bits(isAnchor(ns, part, i) ? ib - 1 : ib));
    if (ib2) for (let i = 0; i < 16; i++) idx2.push(bits(i === 0 ? ib2 - 1 : ib2));
    put(out, w, h, bx, by, (i, d, k) => {
      const s = subsetOf(ns, part, i);
      const e0 = ep[2 * s], e1 = ep[2 * s + 1];
      let ci: number, ai: number, cw: number[], aw: number[];
      if (ib2) {
        if (idxSel) { ci = idx2[i]; cw = WEIGHTS[ib2]; ai = idx1[i]; aw = WEIGHTS[ib]; }
        else { ci = idx1[i]; cw = WEIGHTS[ib]; ai = idx2[i]; aw = WEIGHTS[ib2]; }
      } else { ci = ai = idx1[i]; cw = aw = WEIGHTS[ib]; }
      const lerp = (a: number, b: number, wt: number) => ((64 - wt) * a + wt * b + 32) >> 6;
      const px = [lerp(e0[0], e1[0], cw[ci]), lerp(e0[1], e1[1], cw[ci]), lerp(e0[2], e1[2], cw[ci]), lerp(e0[3], e1[3], aw[ai])];
      if (rot === 1) [px[0], px[3]] = [px[3], px[0]];
      else if (rot === 2) [px[1], px[3]] = [px[3], px[1]];
      else if (rot === 3) [px[2], px[3]] = [px[3], px[2]];
      d[k] = px[0]; d[k + 1] = px[1]; d[k + 2] = px[2]; d[k + 3] = px[3];
    });
  }
  return out;
}

/** skate. DxTexture pixel format -> decoder, chosen as sk4/textures.py does: 0.5 B/px is BC1, then
 * the measured format table (61 BC3, 63 BC5, 67 BC7), unknown 1 B/px formats BC7. */
export function decodeTexture(px: Uint8Array, w: number, h: number, fmt: number): Uint8Array {
  const bpp = px.length / Math.max(1, w * h);
  if (Math.abs(bpp - 0.5) < 0.06) return decodeBC1(px, w, h);
  if (fmt === 61) return decodeBC3(px, w, h);
  // 63: every one is a `_ny` normal map; as BC5 all texels are unit normals (as BC7, 68-86%) - measured 2026-10-17
  if (fmt === 63) return decodeBC5(px, w, h);
  return decodeBC7(px, w, h);
}
