// node test/mod_read.ts <mod folder>: index + level + geometry + materials + one texture, with timings.
import { folderSource } from './node_source.ts';
import { indexMod, levelOf, readLevel, placeGeometry, readDepots, bindMaterials, readTexture } from '../src/formats/reskate-mod/mod.ts';

const src = folderSource(process.argv[2]);
const t = () => (performance.now() / 1000).toFixed(1) + 's';
const ix = await indexMod(src, console.log);
console.log(t(), 'index', ix.stats, 'ebx', ix.ebx.size, 'res', ix.res.size, 'chunks', ix.chunks.size);
const lvl = await readLevel(src, ix, await levelOf(src), console.log);
console.log(t(), 'unresolved', lvl.unresolved);
const geo = await placeGeometry(src, ix, lvl, console.log);
console.log(t(), geo.stats, 'missing', geo.missingMeshes.slice(0, 3));
const dep = await readDepots(src, ix);
const mats = bindMaterials(ix, lvl, dep, geo.meshKeys);
let withColour = 0, base = 0;
for (const m of mats.values()) { if (m.colour) withColour++; base += m.baseRefs; }
console.log(t(), `materials ${mats.size}, with own colour ${withColour}, base refs ${base}`);
for (const m of [...mats.values()].slice(0, 4)) console.log('  ', m.key, m.names[0], '->', m.colour?.split('/').pop(), m.normal?.split('/').pop());
const first = [...mats.values()].find((m) => m.colour);
if (first?.colour) { const im = await readTexture(src, ix, first.colour); console.log(t(), 'texture', first.colour.split('/').pop(), im && `${im.w}x${im.h} mip${im.mip} fmt${im.format}`); }
