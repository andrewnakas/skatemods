// node test/ebx_types.ts <mod folder> <regex>: own EBX instance types matching regex, with one example each
import { folderSource } from './node_source.ts';
import { indexMod, levelOf, readLevel } from '../src/formats/reskate-mod/mod.ts';
const src = folderSource(process.argv[2]); const rx = new RegExp(process.argv[3], 'i');
const ix = await indexMod(src); const lvl = await readLevel(src, ix, await levelOf(src));
const seen = new Map<string, number>();
for (const [n, p] of lvl.partitions) p.instances.forEach(([, t], i) => {
  const tn = p.typeName(t); if (!rx.test(tn)) return;
  seen.set(tn, (seen.get(tn) ?? 0) + 1);
  if (seen.get(tn) === 1) console.log(tn, 'in', n, JSON.stringify(p.read(i), (k, v) => typeof v === 'bigint' ? v.toString() : v).slice(0, 900));
});
console.log([...seen]);
