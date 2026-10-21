// Browser ModSources: a picked folder (File objects), or a zip unpacked once into OPFS (falls back to memory).
import type { ModSource } from '../reskate-mod/frostbite.ts';
import { zipIndex, zipEntryStream, memoryZipSource, type ReadAt } from './zip.ts';
import { modRoot, subSource } from './convert.ts';

const fileRead = (f: Blob): ReadAt => async (o, n) => new Uint8Array(await f.slice(o, o + n).arrayBuffer());

/** Files from <input webkitdirectory> or a drop; `path` is relative ('Mod/Win32/...'). */
export function filesSource(files: { path: string; file: File }[]): ModSource {
  const byName = new Map(files.map((f) => [f.path.replace(/\\/g, '/').toLowerCase(), f.file]));
  const list = files.map((f) => f.path.replace(/\\/g, '/'));
  const get = (p: string) => { const f = byName.get(p.toLowerCase()); if (!f) throw new Error(`not in folder: ${p}`); return f; };
  const src: ModSource = { list: () => list, size: (p) => get(p).size, read: (p, o, n) => fileRead(get(p))(o, n) };
  return subSource(src, modRoot(list));
}

export interface Unpacked { src: ModSource; dispose: () => Promise<void> }

/** A zip (File/Blob) -> ModSource. In a worker with OPFS sync handles every entry is inflated to disk once;
 *  otherwise entries are inflated into memory on first read. */
export async function zipSource(zip: Blob, progress: (f: number, what: string) => void = () => {}): Promise<Unpacked> {
  const read = fileRead(zip);
  const entries = await zipIndex(read, zip.size);
  const base = modRoot(entries.map((e) => e.name));
  const opfs = typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function' &&typeof (globalThis as any).FileSystemSyncAccessHandle !== 'undefined';
  if (!opfs) {
    const src = subSource(await memoryZipSource(read, zip.size), base);
    return { src, dispose: async () => {} };
  }
  const root = await navigator.storage.getDirectory();
  const dirName = `skate3-convert-${Date.now().toString(36)}`;
  const dir = await root.getDirectoryHandle(dirName, { create: true });
  const handles = new Map<string, any>(), sizes = new Map<string, number>();
  const total = entries.reduce((s, e) => s + e.csize, 0) || 1; let done = 0;
  try {
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (!e.name.startsWith(base)) continue;
      const rel = e.name.slice(base.length);
      const fh = await dir.getFileHandle(`f${i}`, { create: true });   // flat names: no nested dirs needed
      const h = await (fh as any).createSyncAccessHandle();
      let at = 0;
      await zipEntryStream(read, e, (c) => { h.write(c, { at }); at += c.length; });
      h.flush();
      handles.set(rel.toLowerCase(), h); sizes.set(rel.toLowerCase(), at);
      done += e.csize; progress(done / total, `unpacking ${rel.split('/').pop()}`);
    }
  } catch (err) {
    for (const h of handles.values()) h.close();
    await root.removeEntry(dirName, { recursive: true }).catch(() => {});
    throw err;
  }
  const list = entries.filter((e) => e.name.startsWith(base)).map((e) => e.name.slice(base.length));
  const get = (p: string) => { const h = handles.get(p.toLowerCase()); if (!h) throw new Error(`not in zip: ${p}`); return h; };
  return {
    src: {
      list: () => list,
      size: (p) => { get(p); return sizes.get(p.toLowerCase())!; },
      async read(p, off, len) { const b = new Uint8Array(len); get(p).read(b, { at: off }); return b; },
    },
    dispose: async () => { for (const h of handles.values()) h.close(); await root.removeEntry(dirName, { recursive: true }).catch(() => {}); },
  };
}

// ---- output: a stored (uncompressed) zip as Blob parts, no copies of the pack data

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(parts: Uint8Array[]): number {
  let c = 0xffffffff;
  for (const p of parts) for (let i = 0; i < p.length; i++) c = CRC[(c ^ p[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function storedZip(files: { name: string; parts: Uint8Array[] }[]): Blob {
  const enc = new TextEncoder(), out: BlobPart[] = [], central: Uint8Array[] = [];
  let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), size = f.parts.reduce((s, p) => s + p.length, 0), crc = crc32(f.parts);
    if (size >= 0xffffffff || off >= 0xffffffff) throw new Error('pack too large for a plain zip; use the CLI');
    const lh = new Uint8Array(30 + name.length), l = new DataView(lh.buffer);
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x0800, true);
    l.setUint32(14, crc, true); l.setUint32(18, size, true); l.setUint32(22, size, true); l.setUint16(26, name.length, true);
    lh.set(name, 30);
    const ch = new Uint8Array(46 + name.length), c = new DataView(ch.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true); c.setUint16(28, name.length, true);
    c.setUint32(42, off, true); ch.set(name, 46);
    out.push(lh, ...(f.parts as BlobPart[])); central.push(ch);
    off += lh.length + size;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
  return new Blob([...out, ...(central as BlobPart[]), end], { type: 'application/zip' });
}
