// node test/ebx_grep.ts <mod folder> <regex>: partitions/instances whose JSON contains regex
import { folderSource } from './node_source.ts';
import { indexMod, levelOf, readLevel } from '../src/formats/reskate-mod/mod.ts';
const src = folderSource(process.argv[2]); const rx = new RegExp(process.argv[3], 'i');
const ix = await indexMod(src); const lvl = await readLevel(src, ix, await levelOf(src));
let k = 0;
for (const [n, p] of lvl.partitions) p.instances.forEach((_, i) => {
  const s = JSON.stringify(p.read(i), (kk, v) => typeof v === 'bigint' ? v.toString() : v);
  if (rx.test(s) && k++ < 6) console.log(n, '::', s.slice(0, 1200));
});
console.log('hits', k);
