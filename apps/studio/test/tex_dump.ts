// node test/tex_dump.ts <mod folder> <out.bin>: for every own texture, the chosen mip's raw bytes and our RGBA
// record: u32 fmt, w, h, nraw, raw, rgba(w*h*4)
import { writeFileSync } from 'node:fs';
import { folderSource } from './node_source.ts';
import { indexMod } from '../src/formats/reskate-mod/mod.ts';
import { decodeBlocks } from '../src/formats/reskate-mod/frostbite.ts';
import { parseTextureDesc, bestMip, TEXTURE_RES } from '../src/formats/reskate-mod/mesh.ts';
import { decodeTexture } from '../src/formats/reskate-mod/bc.ts';
const src = folderSource(process.argv[2]);
const ix = await indexMod(src);
const recs: Buffer[] = []; const fmts: Record<string, number> = {};
for (const [name, r] of ix.res) {
  if (r.type !== TEXTURE_RES) continue;
  const d = parseTextureDesc(decodeBlocks(await src.read(r.range.cas, r.range.offset, r.range.size)));
  if (!d) continue;
  const ranges: [number, number, Uint8Array][] = [];
  for (const c of ix.chunks.get(d.guid) ?? []) { const x = decodeBlocks(await src.read(c.range.cas, c.range.offset, c.range.size)); ranges.push([c.logicalOffset, c.logicalSize ?? x.length, x]); }
  const pick = bestMip(d, ranges);
  if (!pick) continue;
  const w = Math.max(1, d.w >> pick[0]), h = Math.max(1, d.h >> pick[0]);
  if (w < 4 || h < 4 || (fmts[d.format] ?? 0) >= 6) continue;
  fmts[d.format] = (fmts[d.format] ?? 0) + 1;
  const rgba = decodeTexture(pick[1], w, h, d.format);
  const hd = Buffer.alloc(16); hd.writeUInt32LE(d.format, 0); hd.writeUInt32LE(w, 4); hd.writeUInt32LE(h, 8); hd.writeUInt32LE(pick[1].length, 12);
  recs.push(hd, Buffer.from(pick[1]), Buffer.from(rgba));
}
writeFileSync(process.argv[3], Buffer.concat(recs));
console.log('formats sampled', fmts);
