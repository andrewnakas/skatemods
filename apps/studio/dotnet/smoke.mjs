// Node smoke test for the published Sk3Wasm bundle (apps/studio/public/dotnet/_framework).
//   node apps/studio/dotnet/smoke.mjs [--big path.big ...] [--glb-dir dir] [--keep outdir]
// Checks info(), BuildDlcFromGlb on a handcrafted GLB (non-empty .big), ReadBig on that output,
// and ReadBig on any real .big passed with --big.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { zipSync, unzipSync } from 'fflate';
import { makeTestGlb } from './make-test-glb.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const bigs = args.flatMap((a, i) => (a === '--big' ? [args[i + 1]] : []));
const keep = opt('--keep');
if (keep) mkdirSync(keep, { recursive: true });

const fw = join(here, '..', 'public', 'dotnet', '_framework', 'dotnet.js');
const { dotnet } = await import(pathToFileURL(fw).href);
let t = performance.now();
const rt = await dotnet.create();
const exp = (await rt.getAssemblyExports('Sk3Wasm')).Sk3Wasm.Exports;
console.log(`runtime up in ${(performance.now() - t).toFixed(0)} ms`);

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed++; };

const info = JSON.parse(exp.Info());
check(info.name === 'Sk3Wasm', `info() ${JSON.stringify(info)}`);

// GLB input: handcrafted test park, or every file of --glb-dir (e.g. a real ArenaBuilder GLB set).
const files = {};
const glbDir = opt('--glb-dir');
if (glbDir) for (const f of readdirSync(glbDir)) { const p = join(glbDir, f); if (statSync(p).isFile()) files[f] = readFileSync(p); }
else files['testpark.glb'] = makeTestGlb();
const options = JSON.parse(opt('--options') ?? '{"name":"Smoke Park","spawn":{"x":50,"y":1,"z":42,"yaw":0},"target":"x360","includeDist":true}');

t = performance.now();
let out;
try { out = exp.BuildDlcFromGlb(zipSync(files, { level: 0 }), JSON.stringify(options)); }
catch (e) { console.log(exp.LastLog()); throw e; }
const secs = ((performance.now() - t) / 1000).toFixed(1);
const tree = unzipSync(out);
const bigName = Object.keys(tree).find((n) => n.endsWith('.big'));
const big = tree[bigName];
check(big && big.length > 1024, `BuildDlcFromGlb -> ${bigName} ${big?.length} B in ${secs} s (${Object.keys(tree).length} files in result zip)`);
if (keep) { for (const [n, b] of Object.entries(tree)) { mkdirSync(join(keep, dirname(n)), { recursive: true }); writeFileSync(join(keep, n), b); } }
const log = new TextDecoder().decode(tree['build.log']);
console.log(log.split('\n').filter((l) => /^\[|\.xsf|DIST_|entries|Warning|Error|done/.test(l)).slice(0, 40).join('\n'));

const listing = (bytes, label) => {
  t = performance.now();
  const z = unzipSync(exp.ReadBig(bytes));
  const names = Object.keys(z);
  const bytesOut = names.reduce((s, n) => s + z[n].length, 0);
  check(names.length > 0, `ReadBig(${label}) -> ${names.length} files, ${bytesOut} B in ${(performance.now() - t).toFixed(0)} ms`);
  const roots = {};
  for (const n of names) { const r = n.split('/').slice(0, 4).join('/'); roots[r] = (roots[r] ?? 0) + 1; }
  console.log(Object.entries(roots).slice(0, 12).map(([r, c]) => `    ${c.toString().padStart(4)}  ${r}`).join('\n'));
  return z;
};
const own = listing(big, bigName);
check(Object.keys(own).some((n) => /content\/world\/stream\/DIST_.*_Pres\.xsm$/.test(n)), 'own .big carries the world stream manifests');
for (const p of bigs) listing(new Uint8Array(readFileSync(p)), basename(p));

console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
