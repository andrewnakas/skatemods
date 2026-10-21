// DEV ONLY: test/golden/kraken_oracle.json from an oracle corpus (u32 comp_len, u32 raw_len, comp, raw)* made by the
// game's DLL on MOD blocks (skate4to3 work/kraken/rare_oracle.bin). Keeps sha256(comp) -> sha256(raw) only: no data.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const h = (b: Uint8Array) => createHash('sha256').update(b).digest('hex').slice(0, 32);
const buf = new Uint8Array(readFileSync(process.argv[2])); const dv = new DataView(buf.buffer, buf.byteOffset);
const out: Record<string, [string, number]> = {};
for (let p = 0; p < buf.length;) {
  const cl = dv.getUint32(p, true), rl = dv.getUint32(p + 4, true);
  out[h(buf.subarray(p + 8, p + 8 + cl))] = [h(buf.subarray(p + 8 + cl, p + 8 + cl + rl)), rl];
  p += 8 + cl + rl;
}
writeFileSync(new URL('../golden/kraken_oracle.json', import.meta.url), JSON.stringify({ _source: 'sha256/128 of mod Kraken blocks and of the oracle (game DLL) output, 2026-10-17 rare-path corpus; hashes only', blocks: out }));
console.log(Object.keys(out).length, 'oracle blocks');
