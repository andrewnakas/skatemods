// per format: share of 16-byte blocks whose first byte is 0 (invalid BC7 mode) over all 1 B/px own textures
import { folderSource } from './node_source.ts';
import { indexMod } from '../src/formats/reskate-mod/mod.ts';
import { decodeBlocks } from '../src/formats/reskate-mod/frostbite.ts';
import { parseTextureDesc, bestMip, TEXTURE_RES } from '../src/formats/reskate-mod/mesh.ts';
const res: Record<number, [number, number, string[]]> = {};
for (const m of process.argv.slice(2)) {
  const src = folderSource(m); const ix = await indexMod(src);
  for (const [n, r] of ix.res) { if (r.type !== TEXTURE_RES) continue;
    const d = parseTextureDesc(decodeBlocks(await src.read(r.range.cas, r.range.offset, r.range.size))); if (!d) continue;
    const rg: [number, number, Uint8Array][] = []; for (const c of ix.chunks.get(d.guid) ?? []) { const x = decodeBlocks(await src.read(c.range.cas, c.range.offset, c.range.size)); rg.push([c.logicalOffset, c.logicalSize ?? x.length, x]); }
    const p = bestMip(d, rg); if (!p) continue;
    const w = d.w >> p[0], h = d.h >> p[0]; if (Math.abs(p[1].length / (w * h) - 1) > 0.1) continue;
    const e = res[d.format] ?? (res[d.format] = [0, 0, []]);
    for (let i = 0; i < p[1].length; i += 16) { e[1]++; if (p[1][i] === 0) e[0]++; }
    if (e[2].length < 3) e[2].push(n.split('/').pop()!.slice(0, 40));
  }
}
for (const [f, [z, t, ex]] of Object.entries(res)) console.log('fmt', f, 'invalid-BC7 blocks', (100 * z / t).toFixed(1) + '%', ex);
