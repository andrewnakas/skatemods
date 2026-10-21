import { folderSource } from './node_source.ts';
import { indexMod } from '../src/formats/reskate-mod/mod.ts';
import { decodeBlocks } from '../src/formats/reskate-mod/frostbite.ts';
import { parseTextureDesc, bestMip, TEXTURE_RES } from '../src/formats/reskate-mod/mesh.ts';
import { decodeBC5, decodeBC7 } from '../src/formats/reskate-mod/bc.ts';
const src = folderSource(process.argv[2]); const ix = await indexMod(src); let k = 0;
for (const [n, r] of ix.res) { if (r.type !== TEXTURE_RES || k > 4) continue;
  const d = parseTextureDesc(decodeBlocks(await src.read(r.range.cas, r.range.offset, r.range.size))); if (!d || d.format !== 63 || d.w < 64) continue;
  const rg: [number, number, Uint8Array][] = []; for (const c of ix.chunks.get(d.guid) ?? []) { const x = decodeBlocks(await src.read(c.range.cas, c.range.offset, c.range.size)); rg.push([c.logicalOffset, c.logicalSize ?? x.length, x]); }
  const p = bestMip(d, rg)!; const w = d.w >> p[0], h = d.h >> p[0]; k++;
  for (const [nm, f] of [['BC5', decodeBC5], ['BC7', decodeBC7]] as const) {
    const im = f(p[1], w, h); let ok = 0, sx = 0, sy = 0;
    for (let i = 0; i < im.length; i += 4) { const x = im[i] / 127.5 - 1, y = im[i + 1] / 127.5 - 1; if (x * x + y * y <= 1.02) ok++; sx += im[i]; sy += im[i + 1]; }
    console.log(n.split('/').pop()!.slice(0, 36), w, nm, 'unit-disc', (100 * ok / (w * h)).toFixed(1) + '%', 'mean', Math.round(sx / (w * h)), Math.round(sy / (w * h)));
  }
}
