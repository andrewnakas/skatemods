// node test/export_mod.ts <mod folder>: mod -> MapExport summary
import { folderSource } from './node_source.ts';
import { exportMod } from '../src/formats/skate3/export.ts';
const t0 = performance.now();
const ex = await exportMod(folderSource(process.argv[2]), { log: console.log });
console.log(((performance.now() - t0) / 1000).toFixed(1) + 's', ex.name, JSON.stringify(ex.report));
console.log('spawns', ex.spawns.slice(0, 3));
console.log('materials', Object.entries(ex.materials).map(([k, m]) => `${k.split('__')[0]}${m.excludeCollision ? '(nocoll)' : ''}${m.alpha ? '(a)' : ''}`).join(' '));
