// ModSource over an unzipped mod folder or a mod .zip (CLI + node tests).
import { openSync, readSync, readFileSync, statSync, readdirSync, closeSync, mkdtempSync, mkdirSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, dirname, sep } from 'node:path';
import type { ModSource } from '../src/formats/reskate-mod/frostbite.ts';
import { modRoot, subSource } from '../src/formats/convert/convert.ts';
import { zipIndex, zipEntryStream, type ReadAt } from '../src/formats/convert/zip.ts';
import type { BasePack } from '../src/formats/convert/base_pack.ts';

export function folderSource(root: string): ModSource & { close(): void } {
  const files: string[] = [];
  const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else files.push(relative(root, p).replace(/\\/g, '/')); } };
  walk(root);
  const fds = new Map<string, number>();
  const lower = new Map(files.map((f) => [f.toLowerCase(), f]));
  const real = (p: string) => lower.get(p.toLowerCase()) ?? p;
  return {
    list: () => files,
    size: (p) => statSync(join(root, real(p))).size,
    async read(p, off, len) {
      const f = real(p);
      let fd = fds.get(f);
      if (fd === undefined) { fd = openSync(join(root, f), 'r'); fds.set(f, fd); }
      const b = Buffer.alloc(len);
      readSync(fd, b, 0, len, off);
      return new Uint8Array(b.buffer, b.byteOffset, len);
    },
    close() { for (const fd of fds.values()) closeSync(fd); fds.clear(); },
  };
}

const TMP_RX = /skate3-convert-[^\\/]+$/;

/** A mod folder or .zip -> ModSource at the mod root. A zip is streamed out to a private temp folder first;
 *  dispose() closes files and removes only that folder. */
export async function openInput(input: string, log: (s: string) => void = () => {}): Promise<{ src: ModSource; dispose: () => void }> {
  let root = resolve(input), tmp: string | null = null;
  const cleanup = () => { if (tmp && tmp.startsWith(resolve(tmpdir()) + sep) && TMP_RX.test(tmp)) rmSync(tmp, { recursive: true, force: true }); };
  if (statSync(root).isFile()) {
    tmp = mkdtempSync(join(tmpdir(), 'skate3-convert-'));
    const fd = openSync(root, 'r'), size = statSync(root).size;
    try {
      const read: ReadAt = async (o, n) => { const b = Buffer.alloc(n); readSync(fd, b, 0, n, o); return new Uint8Array(b.buffer, b.byteOffset, n); };
      const entries = await zipIndex(read, size);
      const base = modRoot(entries.map((e) => e.name));
      for (const e of entries) {
        if (!e.name.startsWith(base)) continue;
        const dst = resolve(tmp, e.name.slice(base.length));
        if (!dst.startsWith(tmp + sep)) throw new Error(`unsafe path in zip: ${e.name}`);
        mkdirSync(dirname(dst), { recursive: true });
        const o = openSync(dst, 'w');
        try { await zipEntryStream(read, e, (c) => { writeSync(o, c); }); } finally { closeSync(o); }
      }
      log(`unzipped ${entries.length} entries${base ? ` from ${base}` : ''}`);
    } catch (e) { closeSync(fd); cleanup(); throw e; }
    closeSync(fd);
    root = tmp;
  }
  const fsrc = folderSource(root);
  return { src: subSource(fsrc, modRoot(fsrc.list())), dispose: () => { fsrc.close(); cleanup(); } };
}

/** The CC0 base-asset pack from an unpacked folder (index.json + meshes/ + textures/). */
export function folderPack(dir: string): BasePack {
  const ix = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
  return { assets: ix.assets, aliases: ix.aliases ?? {}, textures: ix.textures ?? {}, file: async (p) => new Uint8Array(readFileSync(join(dir, p))) };
}
