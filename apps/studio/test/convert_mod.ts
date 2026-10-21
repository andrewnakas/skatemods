// node test/convert_mod.ts <mod folder> <out dir>: the whole converter in node -> <out>/<CONTENTID>/<slug>_00000000.big + .header
import { mkdirSync, writeFileSync, createWriteStream } from 'node:fs';
import { folderSource } from './node_source.ts';
import { convertMod } from '../src/formats/convert/convert.ts';
const t0 = performance.now(); const t = () => ((performance.now() - t0) / 1000).toFixed(1) + 's';
const r = await convertMod(folderSource(process.argv[2]), { shiftY: process.env.SHIFT_Y ? +process.env.SHIFT_Y : undefined, log: (s) => console.log(t(), s) });
const pk = r.pack;
const dir = `${process.argv[3]}/${pk.contentId}`; mkdirSync(dir, { recursive: true });
const ws = createWriteStream(`${dir}/${pk.bigName}`); for (const p of pk.bigParts) ws.write(p); ws.end();
await new Promise((res) => ws.on('finish', res));
writeFileSync(`${dir}/${pk.headerName}`, pk.header);
console.log(t(), 'wrote', dir, JSON.stringify(pk.report), 'spawn', JSON.stringify(r.spawn));
