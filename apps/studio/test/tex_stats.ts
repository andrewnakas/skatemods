import { folderSource } from './node_source.ts';
import { indexMod, readTexture } from '../src/formats/reskate-mod/mod.ts';
const src = folderSource(process.argv[2]); const ix = await indexMod(src);
for (const [n, r] of ix.res) { if (!/_ny-|_n-|_ny$/.test(n)) continue;
  const im = await readTexture(src, ix, n); if (!im) continue;
  const s = [0, 0, 0, 0]; for (let i = 0; i < im.rgba.length; i++) s[i & 3] += im.rgba[i];
  console.log(n.split('/').pop(), im.w, 'fmt', im.format, 'mean RGBA', s.map((v) => Math.round(v / (im.w * im.h))));
}
