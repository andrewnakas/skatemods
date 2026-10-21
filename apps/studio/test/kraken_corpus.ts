// node test/kraken_corpus.ts <corpus.bin> : decode every oracle record, report mismatches by error kind.
import { readFileSync } from 'node:fs';
import { krakenDecompress, stats } from '../src/formats/kraken/kraken.ts';

const buf = new Uint8Array(readFileSync(process.argv[2]));
const dv = new DataView(buf.buffer, buf.byteOffset);
let p = 0, ok = 0, bad = 0, i = 0;
const kinds = new Map<string, number[]>();
const t0 = performance.now(); let bytes = 0;
while (p < buf.length) {
  const cl = dv.getUint32(p, true), rl = dv.getUint32(p + 4, true);
  const comp = buf.subarray(p + 8, p + 8 + cl), raw = buf.subarray(p + 8 + cl, p + 8 + cl + rl);
  p += 8 + cl + rl;
  let why = '';
  try {
    const got = krakenDecompress(comp, rl);
    let k = 0; while (k < rl && got[k] === raw[k]) k++;
    if (k !== rl) why = `mismatch@${k >> 10}k`.replace(/\d+k/, 'Nk');
  } catch (e) { why = (e as Error).message.replace(/\d+/g, 'N'); }
  if (why) { bad++; const l = kinds.get(why) ?? []; l.push(i); kinds.set(why, l); } else { ok++; bytes += rl; }
  i++;
}
console.log(`${ok}/${ok + bad} exact, ${(bytes / 1048576 / ((performance.now() - t0) / 1000)).toFixed(1)} MB/s`);
for (const [k, l] of [...kinds].sort((a, b) => b[1].length - a[1].length)) console.log(`  ${l.length.toString().padStart(4)}  ${k}  e.g. #${l.slice(0, 5).join(',')}`);
console.log('  paths:', Object.entries(stats).sort().map(([k, v]) => `${k}=${v}`).join(' '));
