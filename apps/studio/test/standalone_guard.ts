// node test/standalone_guard.ts [mod folder] : proves the converter needs nothing but the mod.
// 1. source check: no game paths, Oodle, SKATE_ROOT or drive letters in the converter or CLI sources;
// 2. runs dist-cli/skate3-convert.mjs under Node's permission model, allowed to read only the bundle + the mod and to
//    write only the output folder, and checks a Steam/skate. read really is refused there.
// Build the bundle first: npm run build:cli (npm run test:standalone does both).
import { readFileSync, readdirSync, statSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, dirname, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), studio = resolve(here, '..');
let fail = 0;

// 1. sources
const FORBIDDEN = [/steamapps/i, /SKATE_ROOT/, /oo2core|oodle/i, /['"`][A-Za-z]:[\\/]/, /common[\\/]+Skate\b/i, /process\.env/, /node:child_process/];
const roots = ['src/formats/kraken', 'src/formats/reskate-mod', 'src/formats/skate3', 'src/formats/convert', 'cli'].map((d) => join(studio, d));
const files: string[] = [];
const walk = (p: string) => { if (statSync(p).isDirectory()) for (const e of readdirSync(p)) walk(join(p, e)); else if (/\.ts$/.test(p)) files.push(p); };
roots.forEach(walk);
for (const f of files) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) return;            // comments may name the oracle
    for (const re of FORBIDDEN) if (re.test(line)) { fail++; console.log(`FORBIDDEN ${re} ${f.slice(studio.length + 1)}:${i + 1}: ${line.trim().slice(0, 120)}`); }
  });
}
console.log(`source check: ${files.length} files, ${fail} forbidden references`);

// 2. sandboxed run
const mod = process.argv[2];
const bundle = join(studio, 'dist-cli', 'skate3-convert.mjs');
if (!existsSync(bundle)) { console.log('no dist-cli/skate3-convert.mjs: run npm run build:cli'); process.exit(1); }
if (!mod) { console.log('sandboxed run: skip (give a mod folder)'); process.exit(fail ? 1 : 0); }
const out = mkdtempSync(join(tmpdir(), 'skate3-guard-'));
const perm = ['--permission', `--allow-fs-read=${bundle}`, `--allow-fs-read=${resolve(mod)}`, `--allow-fs-write=${out}`, '--max-old-space-size=12000'];
try {
  const r = spawnSync(process.execPath, [...perm, bundle, mod, '-o', out], { encoding: 'utf8' });
  const wrote = /wrote (\S+)/.exec(r.stdout ?? '');
  console.log(`sandboxed run: exit ${r.status}${wrote ? `, wrote ${wrote[1].slice(out.length)}` : ''}`);
  if (r.status !== 0 || !wrote) { fail++; console.log((r.stdout ?? '').slice(-800), (r.stderr ?? '').slice(-800)); }
  // the sandbox itself: reading a game folder from inside it must be refused
  const probe = spawnSync(process.execPath, [...perm, '-e', `require('fs').readdirSync(${JSON.stringify('C:/Program Files (x86)/Steam/steamapps/common/Skate')})`], { encoding: 'utf8' });
  const refused = /ERR_ACCESS_DENIED/.test(probe.stderr ?? '');
  console.log(`sandbox refuses a skate. read: ${refused}`);
  if (!refused) fail++;
} finally {
  if (out.startsWith(resolve(tmpdir()) + sep) && /skate3-guard-[^\\/]+$/.test(out)) rmSync(out, { recursive: true, force: true });
}
console.log(fail ? `STANDALONE GUARD FAILED (${fail})` : 'standalone guard: ok');
process.exit(fail ? 1 : 0);
