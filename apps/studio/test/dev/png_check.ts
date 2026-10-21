// DEV: node test/dev/png_check.ts <dir> : decodePng over every PNG in a folder (the CC0 pack's textures).
import { readFileSync, readdirSync } from 'node:fs';
import { decodePng } from '../../src/formats/convert/base_pack.ts';
const d = process.argv[2];
for (const f of readdirSync(d)) {
  const t0 = performance.now();
  const b = new Uint8Array(readFileSync(`${d}/${f}`));
  const ct = b[25];
  try {
    const im = decodePng(b);
    console.log(f, 'ct', ct, im.w, 'x', im.h, 'px0', [...im.rgba.subarray(0, 4)].join(','), (performance.now() - t0).toFixed(0), 'ms');
  } catch (e) { console.log(f, 'ct', ct, 'ERROR', (e as Error).message); }
}
