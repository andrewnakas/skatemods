import { folderSource } from './node_source.ts';
import { indexMod } from '../src/formats/reskate-mod/mod.ts';
import { decodeBlocks } from '../src/formats/reskate-mod/frostbite.ts';
import { parseTextureDesc } from '../src/formats/reskate-mod/mesh.ts';
import { decodeBC5 } from '../src/formats/reskate-mod/bc.ts';
const src = folderSource(process.argv[2]); const ix = await indexMod(src);
for (const [n, r] of ix.res) { if (!new RegExp(process.argv[3]).test(n)) continue;
  const d = parseTextureDesc(decodeBlocks(await src.read(r.range.cas, r.range.offset, r.range.size)))!;
  console.log(n.split('/').pop(), d.w, d.h, 'fmt', d.format, 'mips', d.mips.slice(0, 4), 'total', d.total);
  for (const g of [d.guid, d.guid.match(/../g)!.reverse().join('')]) for (const c of ix.chunks.get(g) ?? []) {
    const x = decodeBlocks(await src.read(c.range.cas, c.range.offset, c.range.size));
    console.log('  chunk', g === d.guid ? 'fwd' : 'rev', 'logical', c.logicalOffset, c.logicalSize, 'decoded', x.length);
    if (x.length >= d.mips[0]) { const im = decodeBC5(x.subarray(0, d.mips[0]), d.w, d.h); const s=[0,0,0]; for (let i=0;i<im.length;i+=4){s[0]+=im[i];s[1]+=im[i+1];} console.log('  BC5 mip0 mean RG', s.map(v=>Math.round(v/(d.w*d.h)))); }
  }
}
