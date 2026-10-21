// node test/param_probe.ts <mod folder>: every depot parameter (hash/type/tag/values) of the level's materials,
// with the texture roles each texture parameter points at - to map float tags and texture slots.
import { folderSource } from './node_source.ts';
import { indexMod, levelOf, readLevel, placeGeometry, readDepots, roleOf } from '../src/formats/reskate-mod/mod.ts';
import { paramFloats, paramTextures, TEXTURE_PARAM } from '../src/formats/reskate-mod/frostbite.ts';

const src = folderSource(process.argv[2]);
const ix = await indexMod(src, () => {});
const lvl = await readLevel(src, ix, await levelOf(src), () => {});
const geo = await placeGeometry(src, ix, lvl, () => {});
const dep = await readDepots(src, ix);
const seen = new Map<string, number>();
let shown = 0;
for (const [key, names] of geo.meshKeys) {
  const ps = dep.get(key) ?? [];
  const lines = ps.map((p) => {
    const id = `${p.hash.toString(16).padStart(16, '0')} t${p.type.toString(16)} tag${p.tag.toString(16)}`;
    seen.set(id.split(' ').slice(1).join(' '), (seen.get(id.split(' ').slice(1).join(' ')) ?? 0) + 1);
    if (p.type === TEXTURE_PARAM) return `${id} tex ${paramTextures(p).map(([, g]) => { const n = lvl.byGuid.get(g); return n ? `${roleOf(n)}:${n.split('/').pop()}` : 'base'; }).join(',')}`;
    return `${id} f ${paramFloats(p).map((f) => +f.toFixed(3)).join(',')}`;
  });
  if (process.env.ALL || shown++ < 6) console.log(`== ${[...names][0]}\n  ${lines.join('\n  ')}`);
}
console.log('param type/tag counts over', geo.meshKeys.size, 'materials:');
for (const [k, n] of [...seen].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(' ', n, k);
