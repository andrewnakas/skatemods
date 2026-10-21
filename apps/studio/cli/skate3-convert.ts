// skate3-convert <mod.zip | mod folder> [-o out] [--shift-y N] [-v]
// A ReSkate (skate.) map mod in, a Skate 3 DLC pack out: <out>/<CONTENTID>/<slug>_00000000.big + .header.
// Reads nothing but the input; no skate. install, no Oodle DLL.
import { mkdirSync, writeFileSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { openInput, folderPack } from './node_source.ts';
import { convertMod } from '../src/formats/convert/convert.ts';
import { urlPack } from '../src/formats/convert/base_pack.ts';

const USAGE = 'usage: skate3-convert <mod.zip | mod folder> [-o out_dir] [--shift-y N] [--base-pack dir|url] [-v]';
const args = process.argv.slice(2);
let input = '', out = '.', shiftY: number | undefined, verbose = false, packDir = '';
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '-o' || a === '--out') out = args[++i];
  else if (a === '--shift-y') shiftY = +args[++i];
  else if (a === '-v' || a === '--verbose') verbose = true;
  else if (a === '--base-pack') packDir = args[++i];
  else if (a === '-h' || a === '--help') { console.log(USAGE); process.exit(0); }
  else if (!input) input = a;
  else { console.error(USAGE); process.exit(2); }
}
if (!input || !out || (shiftY !== undefined && !Number.isFinite(shiftY))) { console.error(USAGE); process.exit(2); }

const t0 = performance.now(); const t = () => ((performance.now() - t0) / 1000).toFixed(1).padStart(6) + 's';
const log = (s: string) => { if (verbose) console.log(t(), s); };
let lastPct = -1;
const progress = (f: number, what: string) => {
  const pct = Math.floor(f * 100);
  if (!verbose && process.stdout.isTTY && pct !== lastPct) { lastPct = pct; process.stdout.write(`\r${String(pct).padStart(3)}% ${what.padEnd(40).slice(0, 40)}`); }
};

let dispose = () => {};
try {
  const opened = await openInput(input, log);
  dispose = opened.dispose;
  const r = await convertMod(opened.src, { shiftY, log, progress, basePack: !packDir ? undefined : /^https?:/.test(packDir) ? await urlPack(packDir) : folderPack(packDir) });
  const pk = r.pack;
  const dir = join(out, pk.contentId); mkdirSync(dir, { recursive: true });
  const ws = createWriteStream(join(dir, pk.bigName)); for (const p of pk.bigParts) ws.write(p); ws.end();
  await new Promise((res, rej) => { ws.on('finish', res); ws.on('error', rej); });
  writeFileSync(join(dir, pk.headerName), pk.header);
  if (!verbose && process.stdout.isTTY) process.stdout.write('\r' + ' '.repeat(46) + '\r');
  const ex = r.report.export as Record<string, unknown>, pr = r.report.pack as Record<string, unknown>;
  console.log(`${t()} wrote ${dir.replace(/\\/g, '/')}  (${(pk.bigSize / 1e6).toFixed(1)} MB)`);
  console.log('  export', JSON.stringify(ex));
  console.log('  pack  ', JSON.stringify(pr));
  if (r.spawn) console.log('  spawn ', JSON.stringify(r.spawn));
} catch (e) {
  console.error('skate3-convert:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  dispose();
}
