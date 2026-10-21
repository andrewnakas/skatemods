// node test/kraken_sweep.ts <out_rare.bin> <cas files...>: decode every Kraken block with our decoder; blocks
// that hit rarely used paths (or fail) are written as (u32 comp_len, u32 raw_len, comp) for oracle checking.
import { readFileSync, writeFileSync } from 'node:fs';
import { krakenDecompress, stats } from '../src/formats/kraken/kraken.ts';

const RARE = ['tans', 'tans_rice', 'tans_sparse', 'multiarray', 'offs_scale1', 'offs_scale2', 'block_raw', 'quantum_raw', 'quantum_memset', 'huff_old', 'chunk_entropy'];
const rare: Buffer[] = []; const picked = new Map<string, number>();
let n = 0, errs = 0; const errKinds = new Map<string, number>();
for (const f of process.argv.slice(3)) {
  const d = new Uint8Array(readFileSync(f));
  let p = 0, nf = 0;
  while (p + 8 <= d.length) {
    const dec = (d[p] << 24 | d[p + 1] << 16 | d[p + 2] << 8 | d[p + 3]) >>> 0, typ = d[p + 4];
    const comp = ((d[p + 5] & 0xF) << 16) | (d[p + 6] << 8) | d[p + 7];
    if (comp === 0 || dec > 0x100000 || (typ !== 0 && typ !== 0x11) || p + 8 + comp > d.length) { p++; continue; }
    if (typ === 0x11) {
      const pl = d.subarray(p + 8, p + 8 + comp);
      const before = { ...stats };
      let tag = '';
      try { krakenDecompress(pl, dec); } catch (e) { errs++; tag = 'ERR ' + (e as Error).message.replace(/\d+/g, 'N'); errKinds.set(tag, (errKinds.get(tag) ?? 0) + 1); }
      if (!tag) for (const k of RARE) if ((stats[k] ?? 0) > (before[k] ?? 0)) { tag = k; break; }
      if (tag && (picked.get(tag) ?? 0) < 25) {
        picked.set(tag, (picked.get(tag) ?? 0) + 1);
        const h = Buffer.alloc(8); h.writeUInt32LE(comp, 0); h.writeUInt32LE(dec, 4);
        rare.push(h, Buffer.from(pl));
      }
      n++; nf++;
    }
    p += 8 + comp;
  }
  console.log(`${nf.toString().padStart(7)} kraken blocks  ${f.split('/Skate/')[1] ?? f}`);
}
writeFileSync(process.argv[2], Buffer.concat(rare));
console.log(`${n} blocks, ${errs} decode errors; rare picks: ${[...picked].map(([k, v]) => `${k}=${v}`).join(' ')}`);
for (const [k, v] of errKinds) console.log(`  ${v}  ${k}`);
console.log('paths:', Object.entries(stats).sort().map(([k, v]) => `${k}=${v}`).join(' '));
