// SPDX-License-Identifier: GPL-3.0-or-later
// DIST stream manifests: MMAP (.xmm), CMAP (.xsm), CSPA (.xss), ATOC (.xst) and the location table
// (.loc); port of skate4to3 sk3/manifests.py. All binary manifests are big-endian and start
// {magic, u32 version 3, u32 0, u32 group hash}.
import {
  ascii, ByteWriter, cmpStr, decodeLatin1, decodeUtf8, f32be, fmt6, u32be, u64be, utf8,
} from './bytes_util.ts';

export const VERSION = 3;
export const ROOT_GROUP = 0xE171E1ABFEDB69EDn;   // group id of every *_Global entry
export const ATOC_TAG = 0xAB329A6A;
export const SENTINEL = 0xDEADC0DE;

const M64 = (1n << 64n) - 1n;

/** FNV-1 (multiply, then xor) 64-bit over ASCII: CMAP asset ids. */
export function fnv1_64(text: string): bigint {
  let h = 0xCBF29CE484222325n;
  for (const b of ascii(text)) h = ((h * 0x100000001B3n) & M64) ^ BigInt(b);
  return h;
}

function head(magic: string, group: number, w10: number, w14: number): ByteWriter {
  return new ByteWriter(64).bytes(ascii(magic)).u32(VERSION, 0, group >>> 0, w10, w14);
}

function check(d: Uint8Array, magic: string): number {
  if (decodeLatin1(d.subarray(0, 4)) !== magic) throw new Error(`not a ${magic} manifest`);
  const ver = u32be(d, 4), z = u32be(d, 8);
  if (ver !== VERSION || z) throw new Error(`${magic}: unexpected version/zero word ${ver}/${z}`);
  return u32be(d, 12);
}

// ---- MMAP -------------------------------------------------------------------------------------
export function readMmap(d: Uint8Array): number {
  const g = check(d, 'MMAP');
  if (d.length !== 24 || d.subarray(16).some((x) => x)) throw new Error('MMAP: unexpected size or tail');
  return g;
}

export function writeMmap(group: number): Uint8Array {
  return head('MMAP', group, 0, 0).finish();
}

// ---- CMAP -------------------------------------------------------------------------------------
export interface CmapEntry {
  assetId: bigint;
  groupId: bigint;
  alignment: number;
  size: number;
  chunks: number;
  name: string;
}

export interface Cmap {
  group: number;
  platform: number;
  entries: CmapEntry[];
}

export function readCmap(d: Uint8Array): Cmap {
  const g = check(d, 'CMAP');
  const count = u32be(d, 0x10), platform = u32be(d, 0x14), sent = u32be(d, 0x18), z = u32be(d, 0x1C);
  if (sent !== SENTINEL || z || d.length !== 0x20 + 0x68 * count) throw new Error('CMAP: unexpected header');
  const out: Cmap = { group: g, platform, entries: [] };
  for (let i = 0; i < count; i++) {
    const b = 0x20 + 0x68 * i;
    const raw = d.subarray(b + 0x1C, b + 0x5C);
    const k = raw.indexOf(0);
    const name = decodeLatin1(k < 0 ? raw : raw.subarray(0, k));
    out.entries.push({ assetId: u64be(d, b), groupId: u64be(d, b + 8), alignment: u32be(d, b + 16),
      size: u32be(d, b + 20), chunks: u32be(d, b + 24), name });
  }
  return out;
}

export function writeCmap(m: Cmap): Uint8Array {
  const out = head('CMAP', m.group, m.entries.length, m.platform);
  out.u32(SENTINEL, 0);
  for (const e of m.entries) {
    const nm = ascii(e.name);
    if (nm.length >= 0x40) throw new Error(`tile name too long: ${e.name}`);
    out.u64(e.assetId, e.groupId).u32(e.alignment, e.size, e.chunks);
    out.bytes(nm).zeros(0x40 - nm.length).u32(0xFFFFFFFF).zeros(8);
  }
  return out.finish();
}

// ---- CSPA -------------------------------------------------------------------------------------
export type Box = [number, number, number, number, number, number];   // minx, miny, minz, maxx, maxy, maxz

export interface Cell {
  assetId: bigint;
  box: Box;
  content: Box;
  pad?: Uint8Array;                            // 8 bytes, default zero
  w?: [number, number, number, number];        // default 1.0 x4
}

export interface Cspa {
  group: number;
  cells: Cell[];
}

export function readCspa(d: Uint8Array): Cspa {
  const g = check(d, 'CSPA');
  const count = u32be(d, 0x10), z = u32be(d, 0x14);
  if (z || d.length !== 0x18 + 80 * count) throw new Error('CSPA: unexpected header');
  const out: Cspa = { group: g, cells: [] };
  for (let i = 0; i < count; i++) {
    const b = 0x18 + 80 * i;
    const f = Array.from({ length: 16 }, (_, k) => f32be(d, b + 16 + 4 * k));
    out.cells.push({ assetId: u64be(d, b), box: [f[0], f[1], f[2], f[4], f[5], f[6]],
      content: [f[8], f[9], f[10], f[12], f[13], f[14]], pad: d.slice(b + 8, b + 16), w: [f[3], f[7], f[11], f[15]] });
  }
  return out;
}

export function writeCspa(m: Cspa): Uint8Array {
  const out = head('CSPA', m.group, m.cells.length, 0);
  for (const c of m.cells) {
    const b = c.box, k = c.content, w = c.w ?? [1, 1, 1, 1];
    out.u64(c.assetId).bytes(c.pad ?? new Uint8Array(8));
    out.f32(b[0], b[1], b[2], w[0], b[3], b[4], b[5], w[1], k[0], k[1], k[2], w[2], k[3], k[4], k[5], w[3]);
  }
  return out.finish();
}

// ---- ATOC -------------------------------------------------------------------------------------
export interface AtocRecord {
  assetId: bigint;
  size: number;
  words: number[];        // arena header words +0x44..+0x68
  tag?: number;           // default ATOC_TAG
  pad?: Uint8Array;       // 8 bytes, default zero
}

export function atocRecordOfArena(assetId: bigint, arena: Uint8Array): AtocRecord {
  return { assetId, size: arena.length, words: Array.from({ length: 10 }, (_, i) => u32be(arena, 0x44 + 4 * i)) };
}

export interface Atoc {
  group: number;
  records: AtocRecord[];
}

export function readAtoc(d: Uint8Array): Atoc {
  const g = check(d, 'ATOC');
  const count = u32be(d, 0x10), z = u32be(d, 0x14);
  if (z || d.length !== 0x18 + 64 * count) throw new Error('ATOC: unexpected header');
  const out: Atoc = { group: g, records: [] };
  for (let i = 0; i < count; i++) {
    const b = 0x18 + 64 * i;
    out.records.push({ assetId: u64be(d, b), tag: u32be(d, b + 8), size: u32be(d, b + 12),
      words: Array.from({ length: 10 }, (_, k) => u32be(d, b + 16 + 4 * k)), pad: d.slice(b + 56, b + 64) });
  }
  return out;
}

export function writeAtoc(m: Atoc): Uint8Array {
  const out = head('ATOC', m.group, m.records.length, 0);
  for (const r of m.records) {
    out.u64(r.assetId).u32(r.tag ?? ATOC_TAG, r.size, ...r.words).bytes(r.pad ?? new Uint8Array(8));
  }
  return out.finish();
}

// ---- location table (.loc, text) --------------------------------------------------------------
export interface Location {
  name: string;
  transform: readonly number[];     // 16 floats, row-major 4x4, translation in the last row
  category?: string;
  emptyTag?: boolean;               // '<Category />' (default) vs '<Category></Category>'
}

const LOC_RX = /    <Location>\r\n        <Name>([\s\S]*?)<\/Name>\r\n        (?:<Category \/>|<Category>([\s\S]*?)<\/Category>)\r\n        <Transform>([\s\S]*?)<\/Transform>\r\n    <\/Location>\r\n/y;

export function readLoc(d: Uint8Array): Location[] {
  const t = decodeUtf8(d);
  const open = '<LocationTable>\r\n', close = '</LocationTable>\r\n';
  if (!t.startsWith(open) || !t.endsWith(close)) throw new Error('not a location table');
  const body = t.slice(open.length, t.length - close.length);
  const out: Location[] = [];
  const rx = new RegExp(LOC_RX.source, 'y');
  let pos = 0;
  while (pos < body.length) {
    rx.lastIndex = pos;
    const m = rx.exec(body);
    if (!m) throw new Error('location table: unexpected text');
    pos = rx.lastIndex;
    out.push({ name: m[1], transform: m[3].split(', ').map(Number), category: m[2] ?? '', emptyTag: m[2] === undefined });
  }
  return out;
}

export function writeLoc(locs: readonly Location[]): Uint8Array {
  const s = ['<LocationTable>\r\n'];
  for (const L of locs) {
    const category = L.category ?? '';
    const cat = (L.emptyTag ?? true) && !category ? '<Category />' : `<Category>${category}</Category>`;
    s.push(`    <Location>\r\n        <Name>${L.name}</Name>\r\n        ${cat}\r\n        ` +
      `<Transform>${L.transform.map(fmt6).join(', ')}</Transform>\r\n    </Location>\r\n`);
  }
  s.push('</LocationTable>\r\n');
  return utf8(s.join(''));
}

/** Row-major 4x4 with a yaw about +Y and the position in the last row. */
export function spawnTransform(x: number, y: number, z: number, yawDeg = 0): number[] {
  const r = yawDeg * (Math.PI / 180);
  const c = Math.cos(r), s = Math.sin(r);
  return [c, 0.0, -s, 0.0, 0.0, 1.0, 0.0, 0.0, s, 0.0, c, 0.0, x, y, z, 1.0];
}

// ---- generator --------------------------------------------------------------------------------
export type Kind = 'Pres' | 'Sim' | 'Tex';
export const KINDS: readonly [Kind, string][] = [['Pres', 'cPres'], ['Sim', 'cSim'], ['Tex', 'cTex']];
const TILE_RX = /^c(?:Pres|Sim|Tex)_(-?\d+)_(-?\d+)(?:_\w+)?$/;

/** One stream file of a group: name, chunk list [(asset id, arena)], stream length, bounds. */
export interface Tile {
  name: string;
  arenas: [bigint, Uint8Array][];
  streamSize: number;
  content?: Box | null;
  yrange?: [number, number] | null;
}

export function tileCenter(name: string): [number, number] | null {
  const m = TILE_RX.exec(name);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null;
}

/** Our stream group word (stable, derived from the DIST name). */
export function groupHash(dist: string, kind: string): number {
  const h = fnv1_64(`${dist}_${kind}`);
  return Number((h ^ (h >> 32n)) & 0xFFFFFFFFn);
}

export interface GenerateOptions {
  cell?: number;
  platform?: number;
  alignment?: number;
  sizeIncludesHeader?: boolean;
  group?: number | null;
  /** reproduce the community packs' missing-Global group bug (tests only; sk3 LEGACY_MISSING_GLOBAL_GROUP) */
  legacyMissingGlobalGroup?: boolean;
  /** sk3 env SK3_UNIQUE_TILE_IDS: tile asset id = FNV-1 64 of "<name>_<DIST>" */
  uniqueTileIds?: boolean;
}

/** The four manifests of one stream group from its tiles: {'.xmm','.xsm','.xss','.xst': bytes}. */
export function generate(dist: string, kind: Kind, tiles: readonly Tile[], opt: GenerateOptions = {}): Record<string, Uint8Array> {
  const cell = opt.cell ?? 100.0, platform = opt.platform ?? 0, alignment = opt.alignment ?? 0x100;
  const sizeIncludesHeader = opt.sizeIncludesHeader ?? true;
  const prefix = KINDS.find(([k]) => k === kind)![1];
  const g = opt.group ?? groupHash(dist, kind);
  const globId = fnv1_64(`${prefix}_Global_${dist}`);
  const isG = (t: Tile) => t.name.endsWith('_Global');
  const order = [...tiles].sort((a, b) => (Number(!isG(a)) - Number(!isG(b))) || cmpStr(a.name, b.name));
  const cm: Cmap = { group: g, platform, entries: [] };
  const cs: Cspa = { group: g, cells: [] };
  const at: Atoc = { group: g, records: [] };
  const seen = new Set<bigint>();
  const half = cell / 2;
  const tileGroup = opt.legacyMissingGlobalGroup || order.some(isG) ? globId : ROOT_GROUP;
  for (const t of order) {
    const isGlobal = isG(t);
    const aid = isGlobal ? globId : opt.uniqueTileIds ? fnv1_64(`${t.name}_${dist}`) : fnv1_64(t.name);
    const size = sizeIncludesHeader ? t.streamSize : t.streamSize - alignment;
    cm.entries.push({ assetId: aid, groupId: isGlobal ? ROOT_GROUP : tileGroup, alignment, size, chunks: t.arenas.length, name: t.name });
    for (const [aId, arena] of t.arenas) {
      if (!seen.has(aId)) { seen.add(aId); at.records.push(atocRecordOfArena(aId, arena)); }
    }
    if (!isGlobal) {
      const c = tileCenter(t.name);
      if (!c) throw new Error(`${t.name}: not a <prefix>_<x>_<z>[_suffix] tile name`);
      const k: Box = t.content ?? [c[0] - half, 0.0, c[1] - half, c[0] + half, 0.0, c[1] + half];
      const [y0, y1] = t.yrange ?? [k[1], k[4]];
      cs.cells.push({ assetId: aid, box: [c[0] - half, y0, c[1] - half, c[0] + half, y1, c[1] + half], content: k });
    }
  }
  return { '.xmm': writeMmap(g), '.xsm': writeCmap(cm), '.xss': writeCspa(cs), '.xst': writeAtoc(at) };
}

