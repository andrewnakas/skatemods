// SPDX-License-Identifier: GPL-3.0-or-later
// node test/sk3_texture_write.golden.ts : the texture-arena writer port (BC1 / BC3 encoder, mip
// chain, Xenos tiling, fetch constant, name table) against the Python oracle.
import * as TW from '../src/formats/skate3/texture_write.ts';
import type { Rgba } from '../src/formats/skate3/texture_write.ts';
import * as T from '../src/formats/skate3/texture.ts';
import { check, loadCase, summary } from './sk3_golden_util.ts';

/** tests/make_ts_golden_arenas.py formula_image */
function formulaImage(w: number, h: number, alpha: boolean): Rgba {
  const d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = 4 * (y * w + x);
      d[o] = (x * 7 + y * 3) & 255; d[o + 1] = (x * x + y * 5) & 255; d[o + 2] = ((x ^ y) * 13) & 255;
      d[o + 3] = alpha ? ((x + y) * 9) & 255 : 255;
    }
  }
  return { width: w, height: h, data: d };
}

/** tests/make_ts_golden_arenas.py formula_noise */
function formulaNoise(w: number, h: number): Rgba {
  const d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = 4 * (y * w + x);
      d[o] = (x * x * 7 + y * y * 13 + x * y * 3) % 251; d[o + 1] = (x * 31 + y * y * 5) % 253;
      d[o + 2] = (x * y) % 247; d[o + 3] = (x * 3 + y * y) % 256;
    }
  }
  return { width: w, height: h, data: d };
}

{
  const c = loadCase('texture_blocks');
  const px: Uint8Array = c.inputs.bc1_px, al: Uint8Array = c.inputs.bc3_alpha;
  check(c, 'bc1', TW.encodeBc1Colors(px, px.length / 48));
  check(c, 'bc3_alpha', TW.encodeBc3Alpha(al, al.length / 16));
}
{
  const c = loadCase('texture_images');
  const imgs = new Map<string, Rgba>();
  for (const k of c.inputs.cases) {
    if (k.cube) {
      const words = TW.fetchWords(18, 64, 64, 7, { cube: true });
      const lv = new Map<string, Uint8Array>();
      for (const [l, f, w, h] of T.levelLayout(new T.FetchConstant(words))) {
        const n = Math.ceil(w / 4) * Math.ceil(h / 4) * 8;
        lv.set(TW.levelKey(l, f), Uint8Array.from({ length: n }, (_, i) => (i * 31 + l * 7 + f * 13) & 255));
      }
      check(c, k.label, TW.buildTexture({ arena_id: 12, name_id: 0xCCCCn, fmt: 18, width: 64, height: 64, nlevels: 7,
        cube: true, levels: lv, table_id: 0x4000000000000123n, name_hash: 0x9B0F2374, pad: 0x5A }));
      continue;
    }
    if (k.standin) {
      check(c, k.label, TW.buildTexture(TW.lowresStandin(imgs.get(k.rgba_of)!, k.name_id, k.arena_id)));
      continue;
    }
    const [h, w] = k.shape;
    const img: Rgba = k.formula ? (k.label.startsWith('noise') ? formulaNoise(w, h) : formulaImage(w, h, k.label.includes('alpha'))) : { width: w, height: h, data: k.rgba };
    imgs.set(k.label, img);
    check(c, k.label, TW.buildTexture(TW.fromImage(img, k.name_id, k.arena_id, k.opts)));
  }
  const fw = [[18, 2048, 2048, 12, false], [20, 512, 128, 10, false], [4, 64, 64, 7, false], [6, 32, 8, 1, false],
    [18, 1024, 1024, 2, false], [20, 256, 256, 9, true], [18, 8, 8, 4, false], [4, 16, 1024, 11, false]] as const;
  const out = new Uint8Array(24 * fw.length);
  const dv = new DataView(out.buffer);
  fw.forEach(([f, w, h, l, cb], i) => TW.fetchWords(f, w, h, l, { cube: cb }).forEach((x, j) => dv.setUint32(24 * i + 4 * j, x)));
  check(c, 'fetch_words', out);
}
summary('texture_write');
