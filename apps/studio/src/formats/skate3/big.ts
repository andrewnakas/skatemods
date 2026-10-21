// SPDX-License-Identifier: GPL-3.0-or-later
// EA BIG archives ("EB\0\3"), the container Skate 3 ships worlds and DLC packs in; port of
// skate4to3 sk3/big.py (reader from bytes, byte-exact writer, DLC path directory).
//
// Layout (big-endian): 0x00 'EB' 00 03, 0x04 u32 entry count n, 0x08 u32 flags (0x00100400 world,
// 0x00500400 DLC), 0x0C name table offset, 0x10 name table length, 0x14 name layout
// (nameSlot << 24 | rootSlot << 16 | rootCount), 0x1C total size, 0x20 path-directory length;
// 0x30 records {offset >> shift, stored size, size, djb2 id} ascending by id; align16(n) bytes;
// name table; path directory (DLC); data, each entry 16-aligned, file padded to 16.
import {
  ascii, ByteWriter, cmpStr, concat, decodeLatin1, indexOfByte, u32be, utf8,
} from './bytes_util.ts';
import * as refpack from './refpack.ts';

export const MAGIC = new Uint8Array([0x45, 0x42, 0x00, 0x03]);
export const RECORDS = 0x30;
export const FLAGS_WORLD = 0x00100400;
export const FLAGS_DLC = 0x00500400;

export function djb2(text: string): number {
  let h = 5381;
  for (const b of utf8(text)) h = (Math.imul(h, 33) + b) >>> 0;
  return h;
}

const a16 = (x: number) => Math.ceil(x / 16) * 16;

export interface Entry {
  root: string;
  name: string;
  offset: number;
  size: number;
  id: number;
  stored: number;     // compressed size on disk, 0 when stored as-is
}

export const entryPath = (e: { root: string; name: string }) => `${e.root}/${e.name}`;

export interface Archive {
  data: Uint8Array;
  flags: number;
  nameLayout: number;
  roots: string[];
  entries: Entry[];
  directory: Uint8Array;
  nameTableOffset: number;
  stride: number;
  entryTable: Uint8Array;
}

/** An entry's bytes, decoded when the archive stores it compressed. */
export function readEntry(a: Archive, e: Entry): Uint8Array {
  const b = a.data.subarray(e.offset, e.offset + (e.stored || e.size));
  return e.stored ? unpackStored(b) : b;
}

export function readRaw(a: Archive, e: Entry): Uint8Array {
  return a.data.subarray(e.offset, e.offset + (e.stored || e.size));
}

/** Paths in data order (by offset, then size). */
export function dataOrder(a: Archive): string[] {
  return [...a.entries].sort((x, y) => x.offset - y.offset || x.size - y.size).map(entryPath);
}

function nulStr(b: Uint8Array): string {
  const k = b.indexOf(0);
  return decodeLatin1(k < 0 ? b : b.subarray(0, k));
}

export function readBig(d: Uint8Array): Archive {
  for (let i = 0; i < 4; i++) if (d[i] !== MAGIC[i]) throw new Error('not an EB v3 archive');
  const count = u32be(d, 4), flags = u32be(d, 8), nt = u32be(d, 12), nl = u32be(d, 16), layout = u32be(d, 20);
  const dlen = u32be(d, 0x20);
  const recs: [number, number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    const b = RECORDS + 16 * i;
    recs.push([u32be(d, b), u32be(d, b + 4), u32be(d, b + 8), u32be(d, b + 12)]);
  }
  const table = d.subarray(nt, nt + nl);
  const nroots = layout & 0xFFFF, rslot = (layout >>> 16) & 0xFF;
  const rootsAt = (rstart: number) => {
    const out: string[] = [];
    for (let i = 0; i < nroots; i++) out.push(nulStr(table.subarray(rstart + i * rslot, rstart + (i + 1) * rslot)));
    return out;
  };
  const okRoots = (r: string[]) => r.length > 0 && r.every((x) => x.startsWith('data/'));
  let roots = rootsAt(a16((layout >>> 24) * count));
  if (!okRoots(roots)) roots = rootsAt((1 + (layout >>> 24) * count + 31) & ~31);
  if (!okRoots(roots)) {
    roots = [];
    let s = 0;
    for (let i = 0; i <= table.length; i++) {
      if (i === table.length || table[i] === 0) {
        const raw = decodeLatin1(table.subarray(s, i));
        if (raw.startsWith('data/') && !roots.includes(raw)) roots.push(raw);
        s = i + 1;
      }
    }
  }
  const slotAt = (k: number, stride: number): [string, string] | null => {
    const s = table.subarray(1 + k * stride, 1 + (k + 1) * stride);
    if (s.length < 2 || s[0] >= roots.length) return null;
    const name = nulStr(s.subarray(1));
    if (!name || name.startsWith('data/')) return null;
    const cands: string[] = [];
    for (let i = s[0]; i < roots.length; i += 256) cands.push(roots[i]);
    if (cands.length > 1 && k < recs.length) {
      for (const r of cands) if (djb2(`${r}/${name}`) === recs[k][3]) return [r, name];
    }
    return [cands[0], name];
  };
  const hits = (st: number) => {
    let n = 0;
    for (let k = 0; k < recs.length; k++) {
      const r = slotAt(k, st);
      if (r && djb2(`${r[0]}/${r[1]}`) === recs[k][3]) n++;
    }
    return n;
  };
  let stride = layout >>> 24;
  if (hits(stride) !== recs.length) {
    let best = -1;
    for (let st = 4; st < 321; st++) {
      const n = hits(st);
      if (n > best) { best = n; stride = st; }
      if (n === recs.length) break;
    }
  }
  const a: Archive = {
    data: d, flags, nameLayout: layout, roots, entries: [],
    directory: d.subarray(nt + nl, nt + nl + dlen), nameTableOffset: nt, stride,
    entryTable: d.subarray(RECORDS + 16 * count, nt),
  };
  const shift = (flags >>> 8) & 0xFF;
  recs.forEach(([w0, stored, size, rid], k) => {
    let r = slotAt(k, stride);
    if (!r || djb2(`${r[0]}/${r[1]}`) !== rid) r = ['', `~unnamed_${rid.toString(16).toUpperCase().padStart(8, '0')}`];
    a.entries.push({ root: r[0], name: r[1], offset: w0 * 2 ** shift, size, id: rid, stored });
  });
  return a;
}

/** Decode a compressed entry: one RefPack stream, or a 'chunkref' container. */
export function unpackStored(b: Uint8Array): Uint8Array {
  if (decodeLatin1(b.subarray(0, 8)) !== 'chunkref') return refpack.looksLike(b) ? refpack.decompress(b) : b;
  const total = u32be(b, 0xC), n = u32be(b, 0x14), al = u32be(b, 0x18);
  let pos = 0x30;
  const parts: Uint8Array[] = [];
  for (let i = 0; i < n; i++) {
    const c = u32be(b, pos - 8), t = u32be(b, pos - 4);
    const d = b.subarray(pos, pos + c);
    pos = Math.ceil((pos + c + 8) / al) * al;
    parts.push(t === 2 ? refpack.decompress(d) : d);
  }
  const out = concat(parts);
  if (out.length !== total) throw new Error(`chunkref produced ${out.length} bytes, header said ${total}`);
  return out;
}

// ---- path directory --------------------------------------------------------------------------
export type DirNode = [path: string, isFile: boolean];

const byUpper = (a: string, b: string) => cmpStr(a.toUpperCase(), b.toUpperCase());

/** [(path, isFile)] in DLC tree order: pre-order walk, per directory its files then its
 *  subdirectories, each sorted by the upper-cased path. The top directory gets no node. */
export function planDirectory(filePaths: readonly string[]): DirNode[] {
  const files = new Set(filePaths);
  const dirs = new Set<string>();
  for (const f of files) {
    const parts = f.split('/');
    for (let k = 1; k < parts.length; k++) dirs.add(parts.slice(0, k).join('/'));
  }
  const kids = new Map<string, string[]>();
  for (const x of [...dirs, ...files]) {
    const i = x.lastIndexOf('/');
    if (i >= 0) {
      const p = x.slice(0, i);
      let l = kids.get(p);
      if (!l) kids.set(p, (l = []));
      l.push(x);
    }
  }
  let top = '';
  let first = true;
  for (const d of dirs) if (first || d.length < top.length) { top = d; first = false; }
  const out: DirNode[] = [];
  const walk = (d: string) => {
    const ks = kids.get(d) ?? [];
    for (const k of ks.filter((x) => files.has(x)).sort(byUpper)) out.push([k, true]);
    for (const k of ks.filter((x) => !files.has(x)).sort(byUpper)) { out.push([k, false]); walk(k); }
  };
  walk(top);
  return out;
}

/** The DLC path directory for nodes (planDirectory order); see sk3/big.py build_directory. */
export function buildDirectory(nodes: readonly DirNode[], flavour = 1): Uint8Array {
  const idof = new Map<string, number>();
  nodes.forEach(([p], i) => idof.set(p, i + 2));
  const parent: number[] = [];
  const children = new Map<number, number[]>();
  nodes.forEach(([p], i) => {
    const j = p.lastIndexOf('/');
    const pid = (j >= 0 ? idof.get(p.slice(0, j)) : idof.get(p)) ?? 1;
    parent.push(pid);
    let l = children.get(pid);
    if (!l) children.set(pid, (l = []));
    l.push(i + 2);
  });
  const ids = [1];
  const run = new Map<number, number>();
  for (const d of [...children.keys()].sort((a, b) => a - b)) {
    run.set(d, ids.length);
    ids.push(...[...children.get(d)!].sort((a, b) => b - a));
  }
  const pool = new ByteWriter();
  const at = new Map<string, number>();
  const nameOff = (s: string) => {
    let o = at.get(s);
    if (o === undefined) {
      o = pool.length;
      at.set(s, o);
      pool.bytes(ascii(s)).u8(0);
    }
    return o;
  };
  nameOff(nodes.length ? nodes[0][0].split('/')[0] : 'data');
  const body = new ByteWriter();
  body.u32(36 + 20 * nodes.length + 4, 0, 0, 0, flavour, 0, 0, 0, 0);
  let nonfirst = 0;
  nodes.forEach(([p, isFile], i) => {
    const sib = children.get(parent[i])!;
    const isFirst = sib[0] === i + 2;
    const leaf = p.slice(p.lastIndexOf('/') + 1);
    body.u32(isFirst ? sib.length : nonfirst, isFirst ? run.get(parent[i])! : 0xFFFFFFFF,
      nameOff(leaf), isFile ? 1 : 0, parent[i]);
    if (!isFirst) nonfirst++;
  });
  body.u32(nonfirst, 0xFFFFFFFF, 4 * ids.length, ...ids);
  body.u32(pool.length).bytes(pool.finish());
  body.align(16);
  return body.finish();
}

/** [flavour, nodes] from a path directory. */
export function readDirectory(d: Uint8Array): [number, DirNode[]] {
  const end = u32be(d, 0), flavour = u32be(d, 16);
  const n = (end - 40) / 20;
  const nodes: number[][] = [];
  for (let i = 0; i < n; i++) {
    const b = 36 + 20 * i;
    nodes.push([u32be(d, b), u32be(d, b + 4), u32be(d, b + 8), u32be(d, b + 12), u32be(d, b + 16)]);
  }
  const p = 36 + 20 * n;
  const idlen = u32be(d, p + 8);
  const q = p + 12 + idlen;
  const plen = u32be(d, q);
  const pool = d.subarray(q + 4, q + 4 + plen);
  const nm = (o: number) => decodeLatin1(pool.subarray(o, indexOfByte(pool, 0, o)));
  const out: DirNode[] = [];
  for (const [, , no, isf, par] of nodes) {
    const parts = [nm(no)];
    let q2 = par;
    while (q2 >= 2) { parts.push(nm(nodes[q2 - 2][2])); q2 = nodes[q2 - 2][4]; }
    parts.push(nm(0));
    out.push([parts.reverse().join('/'), Boolean(isf)]);
  }
  return [flavour, out];
}

// ---- writer ----------------------------------------------------------------------------------
/** One file to store. */
export interface Source {
  root: string;
  name: string;
  data: Uint8Array;
}

/** Source from a full path 'root/dir/name' (split at the last '/', as Python rsplit). */
export function sourceOf(path: string, data: Uint8Array): Source {
  const i = path.lastIndexOf('/');
  return { root: path.slice(0, i), name: path.slice(i + 1), data };
}

export interface WriteOptions {
  flags?: number;
  dataOrder?: string[] | null;          // default: path-directory order
  directory?: Uint8Array | null;        // null/undefined = generate (DLC), empty = none, bytes = as given
  flavour?: number;
  entryTable?: Uint8Array | null;
}

/** The archive as a list of byte parts (no big copy; feed them to a Blob) and its total size. */
export function writeBigParts(sources: readonly Source[], opt: WriteOptions = {}): { parts: Uint8Array[]; size: number } {
  const flags = opt.flags ?? FLAGS_DLC;
  const srcs = new Map<string, Source>();
  for (const s of sources) srcs.set(entryPath(s), s);
  if (srcs.size !== sources.length) throw new Error('duplicate paths');
  let directory = opt.directory ?? null;
  let order: string[];
  if (directory === null) {
    const nodes = planDirectory([...srcs.keys()]);
    directory = buildDirectory(nodes, opt.flavour ?? 1);
    order = opt.dataOrder && opt.dataOrder.length ? opt.dataOrder : nodes.filter((x) => x[1]).map((x) => x[0]);
  } else {
    order = opt.dataOrder && opt.dataOrder.length ? opt.dataOrder
      : planDirectory([...srcs.keys()]).filter((x) => x[1]).map((x) => x[0]);
  }
  {
    const a = [...order].sort(cmpStr), b = [...srcs.keys()].sort(cmpStr);
    if (a.length !== b.length || a.some((x, i) => x !== b[i])) throw new Error('data order does not list every entry exactly once');
  }
  const ids = new Map<string, number>();
  for (const p of srcs.keys()) ids.set(p, djb2(p));
  if (new Set(ids.values()).size !== ids.size) throw new Error('two paths share a djb2 id');
  const recs = [...srcs.keys()].sort((x, y) => ids.get(x)! - ids.get(y)!);
  const roots: string[] = [];
  for (const p of order) { const r = srcs.get(p)!.root; if (!roots.includes(r)) roots.push(r); }
  const rindex = new Map(roots.map((r, i) => [r, i] as [string, number]));
  const n = recs.length;
  const slot = n ? Math.max(...recs.map((p) => srcs.get(p)!.name.length)) + 3 : 0;
  const rslot = roots.length ? Math.max(...roots.map((r) => r.length)) + 1 : 0;
  if (slot > 255 || rslot > 255 || roots.length > 0xFFFF) throw new Error('name or root too long for the header layout word');
  const rstart = a16(n * slot);
  let tlen = Math.max(1 + n * slot, rstart + rslot * roots.length);
  tlen = a16(tlen);
  const table = new Uint8Array(tlen);
  recs.forEach((p, k) => {
    const s = srcs.get(p)!;
    const b = 1 + k * slot;
    table[b] = rindex.get(s.root)! & 0xFF;
    table.set(ascii(s.name), b + 1);
  });
  roots.forEach((r, i) => table.set(ascii(r), rstart + i * rslot));
  const et = opt.entryTable ?? new Uint8Array(a16(n));
  const nt = RECORDS + 16 * n + et.length;
  const shift = (flags >>> 8) & 0xFF;
  const gran = Math.max(16, 2 ** shift);
  const up = (x: number) => Math.ceil(x / gran) * gran;
  let pos = up(nt + table.length + directory.length);
  const offs = new Map<string, number>();
  for (const p of order) { offs.set(p, pos); pos = up(pos + srcs.get(p)!.data.length); }
  pos = a16(pos);
  const total = pos;
  if (total >= 2 ** 32) throw new Error('archive past 4 GiB');
  const head = new ByteWriter(nt + table.length + directory.length + 64);
  head.bytes(MAGIC).u32(n, flags, nt, table.length, ((slot << 24) | (rslot << 16) | roots.length) >>> 0, 0, total,
    directory.length).zeros(12);
  for (const p of recs) head.u32(Math.floor(offs.get(p)! / 2 ** shift), 0, srcs.get(p)!.data.length, ids.get(p)!);
  head.bytes(et).bytes(table).bytes(directory);
  head.align(16);
  const parts: Uint8Array[] = [head.finish()];
  let at = head.length;
  for (const p of order) {
    const o = offs.get(p)!;
    if (o !== at) { parts.push(new Uint8Array(o - at)); at = o; }
    const d = srcs.get(p)!.data;
    parts.push(d);
    at += d.length;
  }
  if (total > at) parts.push(new Uint8Array(total - at));
  return { parts, size: total };
}

/** The whole archive in one buffer. */
export function writeBig(sources: readonly Source[], opt: WriteOptions = {}): Uint8Array {
  return concat(writeBigParts(sources, opt).parts);
}

/** Re-write an archive from its own entries, layout and directory (entries must be stored as-is). */
export function rebuild(a: Archive): Uint8Array {
  if (a.entries.some((e) => e.stored)) throw new Error('compressed entries: the writer stores entries as-is only');
  const sources = a.entries.map((e) => ({ root: e.root, name: e.name, data: a.data.subarray(e.offset, e.offset + e.size) }));
  return writeBig(sources, { flags: a.flags, dataOrder: dataOrder(a), directory: a.directory, entryTable: a.entryTable });
}
