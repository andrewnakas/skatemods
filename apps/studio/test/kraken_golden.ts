// node test/kraken_golden.ts <mod folder | .cas>... : every Kraken block in the mods' CAS files is decoded by our decoder;
// blocks the DLL oracle once decoded (test/golden/kraken_oracle.json, hashes only) must give the same bytes. No DLL needed.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { krakenDecompress } from '../src/formats/kraken/kraken.ts';
const h = (b: Uint8Array) => createHash('sha256').update(b).digest('hex').slice(0, 32);
const G: Record<string, [string, number]> = JSON.parse(readFileSync(new URL('./golden/kraken_oracle.json', import.meta.url), 'utf8')).blocks;
const cas: string[] = [];
const walk = (p: string) => { if (statSync(p).isDirectory()) for (const e of readdirSync(p)) walk(join(p, e)); else if (/\.cas$/i.test(p)) cas.push(p); };
for (const a of process.argv.slice(2)) walk(a);
if (!cas.length) { console.log('kraken_golden: skip (give mod folders, e.g. Mods/DM_Jumpline)'); process.exit(0); }
let n = 0, errs = 0, checked = 0, bad = 0;
for (const f of cas) {
  const d = new Uint8Array(readFileSync(f));
  for (let p = 0; p + 8 <= d.length;) {
    const dec = (d[p] << 24 | d[p + 1] << 16 | d[p + 2] << 8 | d[p + 3]) >>> 0, typ = d[p + 4];
    const comp = ((d[p + 5] & 0xF) << 16) | (d[p + 6] << 8) | d[p + 7];
    if (comp === 0 || dec > 0x100000 || (typ !== 0 && typ !== 0x11) || p + 8 + comp > d.length) { p++; continue; }
    if (typ === 0x11) {
      const pl = d.subarray(p + 8, p + 8 + comp); n++;
      let raw: Uint8Array | null = null;
      try { raw = krakenDecompress(pl, dec); } catch { errs++; }
      const want = G[h(pl)];
      if (want) { checked++; if (!raw || h(raw) !== want[0]) { bad++; console.log('MISMATCH', f, p); } }
    }
    p += 8 + comp;
  }
}
console.log(`${n} kraken blocks in ${cas.length} CAS files, ${errs} decode errors; ${checked} oracle blocks checked, ${bad} differ`);
if (bad) process.exit(1);
