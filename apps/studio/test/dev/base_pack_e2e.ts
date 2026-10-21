// DEV ONLY: node test/dev/base_pack_e2e.ts <mod folder> <pack dir> <refs.json> <out dir>
// Converts a real map with the CC0 base pack AND a grid of extra base props (refs.json: [{partition, class}],
// made locally by the dirty room) near the map's spawn, through the whole converter to a .big, and checks
// the props, their collision and their grind lines made it in.
import { readFileSync, mkdirSync, writeFileSync, createWriteStream } from 'node:fs';
import assert from 'node:assert/strict';
import { openInput, folderPack } from '../../cli/node_source.ts';
import { convertMod } from '../../src/formats/convert/convert.ts';
import { urlPack } from '../../src/formats/convert/base_pack.ts';
import type { BaseRef } from '../../src/formats/reskate-mod/mod.ts';

const [modDir, packDir, refsPath, out] = process.argv.slice(2);
const refs: { partition: string; class: string }[] = JSON.parse(readFileSync(refsPath, 'utf8'));
const pack = /^https?:/.test(packDir) ? await urlPack(packDir) : folderPack(packDir);   // folder or served web layout
// a 6-wide grid, 14 m apart, starting beside the map's own spawn
const origin = [-138.75 + 20, 523.05, -214.95];
const extra: BaseRef[] = refs.map((r, i) => ({
  kind: 'blueprint', partition: r.partition, instance: '0'.repeat(32), source: 'e2e',
  T: [1, 0, 0, 0, 1, 0, 0, 0, 1, origin[0] + 14 * (i % 6), origin[1], origin[2] + 14 * Math.floor(i / 6)],
}));
const { src, dispose } = await openInput(modDir);
try {
  const base = await convertMod(src, { basePack: pack });
  const r = await convertMod(src, { basePack: pack, extraBaseRefs: extra, log: (s) => { if (/base pack/.test(s)) console.log(' ', s); } });
  const bp = (r.report.export as any).basePack, b0 = base.report.export as any, b1 = r.report.export as any;
  console.log('base pack report', JSON.stringify(bp));
  console.log('grind lines', b0.splines, '->', b1.splines, '; pack', (base.report.pack as any).tiles, '->', (r.report.pack as any).tiles, 'tiles;',
    (base.pack.bigSize / 1e6).toFixed(1), '->', (r.pack.bigSize / 1e6).toFixed(1), 'MB');
  assert.equal(bp.placed, refs.length, 'every test prop placed');
  assert.equal(bp.missing, 0);
  assert.ok(b1.splines > b0.splines, 'the props brought grind lines');
  assert.ok(r.pack.bigSize > base.pack.bigSize, 'the props are in the pack');
  const dir = `${out}/${r.pack.contentId}`; mkdirSync(dir, { recursive: true });
  const ws = createWriteStream(`${dir}/${r.pack.bigName}`); for (const p of r.pack.bigParts) ws.write(p); ws.end();
  await new Promise((res) => ws.on('finish', res));
  writeFileSync(`${dir}/${r.pack.headerName}`, r.pack.header);
  console.log('wrote', dir, '- base pack end-to-end: ok');
} finally { dispose(); }
