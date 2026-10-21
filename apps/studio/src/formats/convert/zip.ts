// Minimal zip reader over random access (central directory + zip64), entries inflated as a stream with fflate.
// Thunderstore packages are zips; the CLI extracts to a temp folder, the browser into OPFS, small ones stay in memory.
import { Inflate } from 'fflate';
import type { ModSource } from '../reskate-mod/frostbite.ts';

export type ReadAt = (offset: number, length: number) => Promise<Uint8Array>;
export interface ZipEntry { name: string; method: number; csize: number; usize: number; local: number }

const u16 = (d: Uint8Array, o: number) => d[o] | (d[o + 1] << 8);
const u32 = (d: Uint8Array, o: number) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
const u64 = (d: Uint8Array, o: number) => u32(d, o) + u32(d, o + 4) * 2 ** 32;

export async function zipIndex(read: ReadAt, size: number): Promise<ZipEntry[]> {
  const tailLen = Math.min(size, 65536 + 22);
  const tail = await read(size - tailLen, tailLen);
  let e = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (u32(tail, i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('not a zip (no end of central directory)');
  let count = u16(tail, e + 10), cdSize = u32(tail, e + 12), cdOff = u32(tail, e + 16);
  if (e >= 20 && u32(tail, e - 20) === 0x07064b50) {           // zip64 locator
    const rec = await read(u64(tail, e - 12), 56);
    if (u32(rec, 0) !== 0x06064b50) throw new Error('bad zip64 end record');
    count = u64(rec, 32); cdSize = u64(rec, 40); cdOff = u64(rec, 48);
  }
  const cd = await read(cdOff, cdSize);
  const out: ZipEntry[] = [];
  const dec = new TextDecoder();
  for (let p = 0, n = 0; n < count; n++) {
    if (u32(cd, p) !== 0x02014b50) throw new Error('bad central directory entry');
    const method = u16(cd, p + 10), nl = u16(cd, p + 28), xl = u16(cd, p + 30), cl = u16(cd, p + 32);
    let csize = u32(cd, p + 20), usize = u32(cd, p + 24), local = u32(cd, p + 42);
    const name = dec.decode(cd.subarray(p + 46, p + 46 + nl)).replace(/\\/g, '/');
    for (let x = p + 46 + nl, xe = x + xl; x + 4 <= xe;) {       // zip64 extra field
      const id = u16(cd, x), len = u16(cd, x + 2); let q = x + 4;
      if (id === 1) {
        if (usize === 0xffffffff) { usize = u64(cd, q); q += 8; }
        if (csize === 0xffffffff) { csize = u64(cd, q); q += 8; }
        if (local === 0xffffffff) { local = u64(cd, q); }
      }
      x += 4 + len;
    }
    if (!name.endsWith('/')) out.push({ name, method, csize, usize, local });
    p += 46 + nl + xl + cl;
  }
  return out;
}

/** Calls `sink` with the entry's bytes in order (stored or deflated). */
export async function zipEntryStream(read: ReadAt, e: ZipEntry, sink: (chunk: Uint8Array) => void | Promise<void>, chunk = 8 << 20): Promise<void> {
  const lh = await read(e.local, 30);
  if (u32(lh, 0) !== 0x04034b50) throw new Error(`bad local header for ${e.name}`);
  const start = e.local + 30 + u16(lh, 26) + u16(lh, 28);
  if (e.method !== 0 && e.method !== 8) throw new Error(`${e.name}: unsupported zip method ${e.method}`);
  const pending: Uint8Array[] = [];
  const inf = e.method === 8 ? new Inflate((d) => { pending.push(d); }) : null;
  for (let o = 0; o < e.csize; o += chunk) {
    const c = await read(start + o, Math.min(chunk, e.csize - o));
    if (inf) { inf.push(c, o + chunk >= e.csize); while (pending.length) await sink(pending.shift()!); }
    else await sink(c);
  }
  if (inf && e.csize === 0) inf.push(new Uint8Array(0), true);
  while (pending.length) await sink(pending.shift()!);
}

export async function zipEntryBytes(read: ReadAt, e: ZipEntry): Promise<Uint8Array> {
  const out = new Uint8Array(e.usize); let o = 0;
  await zipEntryStream(read, e, (c) => { out.set(c, o); o += c.length; });
  if (o !== e.usize) throw new Error(`${e.name}: inflated ${o} of ${e.usize} bytes`);
  return out;
}

/** ModSource straight over a zip, each entry inflated once on first read and kept (small mods, tests). */
export async function memoryZipSource(read: ReadAt, size: number): Promise<ModSource> {
  const entries = await zipIndex(read, size);
  const byName = new Map(entries.map((e) => [e.name.toLowerCase(), e]));
  const cache = new Map<string, Promise<Uint8Array>>();
  const get = (p: string) => { const e = byName.get(p.toLowerCase()); if (!e) throw new Error(`not in zip: ${p}`); return e; };
  return {
    list: () => entries.map((e) => e.name),
    size: (p) => get(p).usize,
    async read(p, off, len) {
      const e = get(p);
      if (e.method === 0) {                                       // stored: read in place
        const lh = await read(e.local, 30);
        return read(e.local + 30 + u16(lh, 26) + u16(lh, 28) + off, len);
      }
      let b = cache.get(e.name); if (!b) { b = zipEntryBytes(read, e); cache.set(e.name, b); }
      return (await b).subarray(off, off + len);
    },
  };
}
