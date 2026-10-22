// SPDX-License-Identifier: GPL-3.0-or-later
// DLC pack metadata and the pack generator; port of skate4to3 sk3/dlc.py (writers + the readers
// the generator needs). A pack is `<PKG>/<slug>_00000000.big` (EB v3, DLC flags, path directory)
// plus a 328-byte `.header` whose content id equals the package directory name.
// Every file is generated from the map's own inputs and names (slug, DIST name, location keys).
import { attribKey } from './attrib_hash.ts';
import * as big from './big.ts';
import {
  ascii, ByteWriter, cmpStr, concat, decodeLatin1, f32be, fromHex, indexOfByte, latin1, u32be, u64be,
} from './bytes_util.ts';
import * as mf from './manifests.ts';
import { parseRw4 } from './rw4.ts';
import { buildRw4, specFromArena, type Spec, type SpecObject } from './rw4_write.ts';
import * as sfil from './sfil.ts';
import * as vault from './vault.ts';

export const XML_HEAD = '<?xml version="1.0" encoding="us-ascii"?>';

type XZ = [number, number];
type Mat = readonly number[];   // 16 floats, row-major, translation in row 4

// ---- boundary (data/boundary/*.xml) -----------------------------------------------------------
export function writeBoundary(points: readonly XZ[]): Uint8Array {
  const s = [XML_HEAD, '<Boundary>', ...points.map(([x, z]) => `  <Point>${x}, ${z}</Point>`), '</Boundary>', ''];
  return ascii(s.join('\r\n'));
}

export function readBoundary(d: Uint8Array): XZ[] {
  const t = decodeLatin1(d);
  const pts = [...t.matchAll(/<Point>(.*?)<\/Point>/g)].map((m) => m[1].split(', ').map((v) => parseInt(v, 10)) as XZ);
  if (decodeLatin1(writeBoundary(pts)) !== t) throw new Error('boundary: unexpected layout');
  return pts;
}

/** Tile-centre extents widened by half a cell: (minx,minz) (maxx,minz) (maxx,maxz) (minx,maxz). */
export function boundaryRect(centers: readonly XZ[], cell: number): XZ[] {
  const h = Math.floor(cell / 2);
  const xs = centers.map((c) => c[0]), zs = centers.map((c) => c[1]);
  const x0 = Math.min(...xs) - h, x1 = Math.max(...xs) + h, z0 = Math.min(...zs) - h, z1 = Math.max(...zs) + h;
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
}

// ---- stream tile tables (data/stream/*.xml) ---------------------------------------------------
export interface StreamTiles {
  tiles: [XZ, XZ[]][];       // [(center, [tile, ...])]
  countAttr?: boolean;       // '<StreamTiles Count="n">' (per-location files)
  newline?: string;          // default CRLF
}

export function writeStreamTiles(st: StreamTiles): Uint8Array {
  const nl = st.newline ?? '\r\n';
  const s = [XML_HEAD, st.countAttr ? `<StreamTiles Count="${st.tiles.length}">` : '<StreamTiles>'];
  for (const [c, ts] of st.tiles) {
    s.push('  <StreamTile>', `    <Center>${c[0]}, ${c[1]}</Center>`);
    for (const [x, z] of ts) s.push(`    <Tile>${x}, ${z}</Tile>`);
    s.push('  </StreamTile>');
  }
  s.push('</StreamTiles>', '');
  return ascii(s.join(nl));
}

const cmpXZ = (a: XZ, b: XZ) => a[0] - b[0] || a[1] - b[1];

function uniqSorted(centers: readonly XZ[]): XZ[] {
  const seen = new Set<string>();
  const out: XZ[] = [];
  for (const c of centers) {
    const k = `${c[0]},${c[1]}`;
    if (!seen.has(k)) { seen.add(k); out.push([c[0], c[1]]); }
  }
  return out.sort(cmpXZ);
}

/** Per tile, the existing tiles of its 3x3 ring, both sorted by (x, z). */
export function neighbourTable(centers: readonly XZ[], cell: number): StreamTiles {
  const S = uniqSorted(centers);
  return { tiles: S.map((c) => [c, S.filter((p) => (p[0] !== c[0] || p[1] !== c[1]) &&
    Math.abs(p[0] - c[0]) <= cell && Math.abs(p[1] - c[1]) <= cell)] as [XZ, XZ[]]) };
}

/** A location's preload list: the `limit` nearest tiles (centre included), by distance, x, z. */
export function preloadList(center: XZ, centers: readonly XZ[], limit = 63): StreamTiles {
  const dist = (p: XZ) => Math.hypot(p[0] - center[0], p[1] - center[1]);
  const order = uniqSorted(centers).map((p) => [dist(p), p] as [number, XZ])
    .sort((a, b) => a[0] - b[0] || cmpXZ(a[1], b[1])).map((x) => x[1]);
  return { tiles: [[center, order.slice(0, limit)]], countAttr: true };
}

// ---- language strings (fe/languages/<lang>/LANGUAGE_*.BIN, little-endian) ---------------------
export const LANG_ID = 0x00039000;
export const HIST_ID = 0x00039001;

/** String-table key: h = 0xFFFFFFFF; h = h*33 + byte. */
export function stringId(text: string): number {
  let h = 0xFFFFFFFF;
  for (const b of ascii(text)) h = (Math.imul(h, 33) + b) >>> 0;
  return h;
}

export interface Language {
  name: string;                 // the 16-byte table name
  entries: [number, string][];  // [(hash, text)] in pool order of first use
  w0c?: number;                 // default 0x1C
}

export function readLanguage(d: Uint8Array): Language {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const lid = v.getUint32(0, true), size = v.getUint32(4, true), count = v.getUint32(8, true);
  const w0c = v.getUint32(12, true), pool = v.getUint32(16, true);
  if (lid !== LANG_ID || size !== d.length - 8) throw new Error('not a language table');
  const raw = d.subarray(0x14, 0x24);
  const k = raw.indexOf(0);
  const name = decodeLatin1(k < 0 ? raw : raw.subarray(0, k));
  const ents: [number, number][] = [];
  for (let i = 0; i < count; i++) ents.push([v.getUint32(0x24 + 8 * i, true), v.getUint32(0x28 + 8 * i, true)]);
  const base = pool + 8;
  const texts = new Map<number, string>();
  for (const [h, o] of ents) texts.set(h, decodeLatin1(d.subarray(base + o, indexOfByte(d, 0, base + o))));
  const order = ents.map((e, i) => [e, i] as [[number, number], number]).sort((a, b) => a[0][1] - b[0][1] || a[1] - b[1]);
  return { name, entries: order.map(([[h]]) => [h, texts.get(h)!]), w0c };
}

export function writeLanguage(L: Language): Uint8Array {
  const pool = new ByteWriter();
  const at = new Map<string, number>();
  for (const [, t] of L.entries) if (!at.has(t)) { at.set(t, pool.length); pool.bytes(latin1(t)).u8(0); }
  const ents = L.entries.map(([h, t]) => [h, at.get(t)!] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const head = 0x24 + 8 * ents.length;
  const body = new ByteWriter();
  body.u32le(LANG_ID, 0, ents.length, L.w0c ?? 0x1C, head - 8);
  const nm = ascii(L.name);
  body.bytes(nm).zeros(Math.max(0, 16 - nm.length));
  for (const [h, o] of ents) body.u32le(h, o);
  body.bytes(pool.finish());
  body.align(4);
  const out = body.finish();
  new DataView(out.buffer).setUint32(4, out.length - 8, true);
  return out;
}

/** Character table of a language (community form: count 256, all-zero table). */
export function writeHistogram(table: [number, Uint8Array] | null = null): Uint8Array {
  const w = new ByteWriter(6160).u32le(HIST_ID, 6148, table === null ? 256 : table[0]);
  return w.bytes(table === null ? new Uint8Array(6144) : table[1]).finish();
}

/** The 5 strings per location + 3 per pack every community pack carries. */
export function locationStrings(slug: string, display: string, locations: readonly [string, string][]): Language {
  const S = slug.toUpperCase();
  const ents: [number, string][] = [];
  for (const [key, title] of locations) {
    const K = key.toUpperCase();
    const full = `${display} - ${title}`;
    for (const lab of [`ID_LOCATION_${S}_${K}`, `ID_WORLD_${S}_${K}`, `dist_${slug}_${key}dlc`, `ID_DLC_${S}_${K}_SUMMARY_TITLE`]) {
      ents.push([stringId(lab), full]);
    }
    ents.push([stringId(`ID_MAP_LOCATION_DESC_${S}_${K}`), `${full} freeskate location.`]);
  }
  ents.push([stringId(`ID_MAP_SECTION_${S}_MAPS`), 'Maps']);
  ents.push([stringId(`ID_MAP_HELPER_${S}`), `${display} freeskate maps.`]);
  ents.push([stringId(`ID_MAP_CATEGORY_${S}`), display]);
  const first = new Map<string, number>();
  for (const [, t] of ents) if (!first.has(t)) first.set(t, first.size);
  const sorted = ents.map((e, i) => [e, i] as [[number, string], number])
    .sort((a, b) => first.get(a[0][1])! - first.get(b[0][1])! || a[1] - b[1]).map((x) => x[0]);
  return { name: slug.slice(0, 15), entries: sorted };
}

// ---- unlocks -----------------------------------------------------------------------------------
export function productUnlock(slug: string): Uint8Array {
  return ascii(`DLC_PRODUCT,${slug.toUpperCase().padEnd(16, '0')}\n`);
}

// ---- vault chunk codec --------------------------------------------------------------------------
export function chunks(d: Uint8Array): [string, Uint8Array][] {
  const out: [string, Uint8Array][] = [];
  let off = 0;
  while (off < d.length) {
    const tag = decodeLatin1(d.subarray(off, off + 4)), size = u32be(d, off + 4);
    if (size < 8 || off + size > d.length) throw new Error(`bad chunk at 0x${off.toString(16)}`);
    out.push([tag, d.subarray(off + 8, off + size)]);
    off += size;
  }
  return out;
}

export function joinChunks(cs: readonly [string, Uint8Array][]): Uint8Array {
  const w = new ByteWriter();
  for (const [t, p] of cs) w.bytes(latin1(t)).u32(p.length + 8).bytes(p);
  return w.finish();
}

// ---- locator arenas (global_locators/*.rx2) ----------------------------------------------------
/** The eb0009 object of a locator arena. */
export interface Locator {
  name: string;
  matrix: Mat;
  locatorId: bigint;
  spawns: [string, Mat][];
  world?: string;            // default 'world'
}

function box(m: Mat): number[] {
  const x = m[12], y = m[13], z = m[14];
  return [x - 1, y - 1, z - 1, 0.0, x + 1, y + 1, z + 1, 0.0];
}

export function writeLocatorObject(L: Locator): Uint8Array {
  const n = L.spawns.length;
  const poolAt = 0xA0 + 0x70 * n;
  const pool = new ByteWriter();
  pool.bytes(ascii(L.name)).u8(0);
  const worldAt = poolAt + pool.length;
  pool.bytes(ascii(L.world ?? 'world')).u8(0);
  const names: number[] = [];
  for (const [nm] of L.spawns) { names.push(poolAt + pool.length); pool.bytes(ascii(nm)).u8(0); }
  const out = new ByteWriter(poolAt + pool.length);
  out.u32(1, n, 0, 0x20, 0xA0, poolAt, 0, 0);
  out.f32(...L.matrix).f32(...box(L.matrix));
  out.u32(n, 0xA0, poolAt, worldAt).u64(BigInt.asUintN(64, L.locatorId)).zeros(8);
  L.spawns.forEach(([, m], i) => { out.f32(...m).f32(...box(m)).u32(names[i]).zeros(12); });
  return out.bytes(pool.finish()).finish();
}

export function parseLocatorObject(d: Uint8Array): Locator {
  const n = u32be(d, 4), root = u32be(d, 12), recs = u32be(d, 16), poolAt = u32be(d, 20);
  const s = (o: number) => decodeLatin1(d.subarray(o, indexOfByte(d, 0, o)));
  const mat = (o: number) => Array.from({ length: 16 }, (_, k) => f32be(d, o + 4 * k));
  const worldAt = u32be(d, 0x8C), lid = u64be(d, 0x90);
  const spawns: [string, Mat][] = [];
  for (let i = 0; i < n; i++) {
    const b = recs + 0x70 * i;
    spawns.push([s(u32be(d, b + 0x60)), mat(b)]);
  }
  return { name: s(poolAt), matrix: mat(root), locatorId: lid, spawns, world: s(worldAt) };
}

const f32 = Math.fround;

/** The six spawn points community locators carry around a locator: +-x, +-z, two diagonals. */
export function spawnRing(name: string, base: string, m: Mat, step = 2.0): [string, Mat][] {
  const offs: XZ[] = [[step, 0], [-step, 0], [0, step], [0, -step], [step, step], [-step, -step]];
  return offs.map(([dx, dz], i) => {
    const q = [...m];
    q[12] = f32(m[12] + dx * m[0] + dz * m[2]);
    q[13] = f32(m[13] + dx * m[4] + dz * m[6]);
    q[14] = f32(m[14] + dx * m[8] + dz * m[10]);
    return [`${name}::${base}_spawn_${i + 1}`, q] as [string, Mat];
  });
}

/** A locator .rx2 from a template arena: object 1 rebuilt from `L`, locator id in object 2 +0x1C. */
export function locatorArena(template: Uint8Array, L: Locator): Uint8Array {
  const a = parseRw4(template);
  const spec = specFromArena(a);
  spec.objects = a.objects.map((o, i): SpecObject => {
    const so = spec.objects[i];
    let data = so.data;
    if (o.typeId === 0xEB0009) data = writeLocatorObject(L);
    else if (o.typeId === 0xEB000B) {
      data = concat([data.subarray(0, 0x1C), new ByteWriter(8).u64(BigInt.asUintN(64, L.locatorId)).finish(), data.subarray(0x24)]);
    }
    return { typeId: so.typeId, align: so.align, data };
  });
  return buildRw4(spec);
}

// eb0008 head object of every locator arena
export const LOCATOR_HEAD = fromHex('000000190000000d0000000000000000');
// the 25 type ids every eb000b import/export table lists (count 2 each in locator arenas)
export const LOCATOR_TABLE_TYPES: readonly number[] = [
  0xEB0066, 0xEB0005, 0xEB0067, 0xEB0006, 0xEB0001, 0xEB000A, 0xEB0065, 0xEB0007,
  0xEB0069, 0xEB000D, 0xEB006B, 0xEB0019, 0xEB0064, 0xEB0004, 0xEB0068, 0xEB0009,
  0xEB0016, 0xEB0013, 0xEB0014, 0xEB0018, 0xEB0017, 0xEB0020, 0xEB0024, 0xEB0026,
  0xEB0027];

/** eb000b of a locator arena: import {locator id, 0xEB0068}, export {export id, 0xEB0009, object 1}. */
export function locatorTable(locatorId: bigint, exportId: bigint): Uint8Array {
  const w = new ByteWriter(0x44 + 8 * LOCATOR_TABLE_TYPES.length);
  w.u32(2, 0x14, 0x44, LOCATOR_TABLE_TYPES.length, 0x44);
  w.u32(0, 0xFEFFFFFF).u64(BigInt.asUintN(64, locatorId)).u32(0xEB0068, 0x00800000);
  w.u32(0, 0xFEFFFFFF).u64(BigInt.asUintN(64, exportId)).u32(0xEB0009, 1);
  for (const t of LOCATOR_TABLE_TYPES) w.u32(t, 2);
  return w.finish();
}

/** (arena id, export id) of a generated locator arena. */
export function locatorOwnIds(name: string): [number, bigint] {
  return [Number(attribKey(name + '.arena') & 0xFFFFFFFFn), attribKey(name + '.export')];
}

/** A locator .rx2 from first principles: eb0008 head, eb0009 locator, eb000b table, one subref. */
export function buildLocatorArena(L: Locator, arenaId: number | null = null, exportId: bigint | null = null): Uint8Array {
  const [a, x] = locatorOwnIds(L.name);
  const spec: Spec = {
    arenaId: arenaId ?? a,
    objects: [
      { typeId: 0xEB0008, align: 16, data: LOCATOR_HEAD },
      { typeId: 0xEB0009, align: 16, data: writeLocatorObject(L) },
      { typeId: 0xEB000B, align: 16, data: locatorTable(L.locatorId, exportId ?? x) },
    ],
    subrefs: [[1, 0x20]],
  };
  return buildRw4(spec);
}

/** `<DIST[:12]>_[0x<attribKey(name)>]` */
export function locatorFileStem(dist: string, name: string): string {
  return `${dist.slice(0, 12)}_[0x${attribKey(name).toString(16).padStart(16, '0')}]`;
}

// ---- the content header ------------------------------------------------------------------------
export const HEADER_SIZE = 328;
export const TITLE_ID = 0x454108E6;

/** The 328-byte XCONTENT header beside a raw .big (content id = package directory name). */
export function writeHeader(display: string, contentId: string): Uint8Array {
  if (contentId.length > 42) throw new Error('content id longer than 42');
  const h = new Uint8Array(HEADER_SIZE);
  const v = new DataView(h.buffer);
  v.setUint32(0, 1); v.setUint32(4, 2);
  const nmFull = new Uint8Array(display.length * 2);
  for (let i = 0; i < display.length; i++) { const c = display.charCodeAt(i); nmFull[2 * i] = c >> 8; nmFull[2 * i + 1] = c & 0xFF; }
  h.set(nmFull.subarray(0, 0x108 - 8 - 2), 8);
  h.set(ascii(contentId), 0x108);
  v.setUint32(HEADER_SIZE - 12, TITLE_ID);
  return h;
}

export function contentIdFor(name: string): string {
  return (name.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'SKATE3PACK').slice(0, 42);
}

// ---- inventory ---------------------------------------------------------------------------------
export const CATEGORIES: readonly [RegExp, string][] = [
  [/^data\/boundary\/freeskate_dlc_.*\.xml$/, 'boundary'],
  [/^data\/content\/global_locators\/.*\.loc$/, 'locator table'],
  [/^data\/content\/global_locators\/.*\.rx2$/, 'locator arena'],
  [/^data\/content\/missions\/.*\.p(mm|sm|ss|st)$/, 'mission manifest (empty)'],
  [/^data\/content\/world\/stream\/.*\.xsf$/, 'stream'],
  [/^data\/content\/world\/stream\/.*\.x(mm|sm|ss|st)$/, 'DIST manifest'],
  [/^data\/content\/world\/stream\/.*\.loc$/, 'location table'],
  [/^data\/db\/.*\.vaultlist\.xml$/, 'vault list'],
  [/^data\/db\/.*\.vlt$/, 'vault'],
  [/^data\/db\/.*\.bin$/, 'vault data'],
  [/^data\/db\/.*\.opt$/, 'vault options'],
  [/^data\/fe\/languages\/.*HISTOGRAM.*\.BIN$/, 'language histogram'],
  [/^data\/fe\/languages\/.*\.BIN$/, 'language strings'],
  [/^data\/stream\/freeskate_dlc_.*\.xml$/, 'location preload list'],
  [/^data\/stream\/.*\.xml$/, 'neighbour table'],
  [/^data\/unlocks\/.*_product\d+\.unlock$/, 'product unlock'],
  [/^data\/unlocks\/.*\.unlock$/, 'unlock list'],
];

export function category(path: string): string {
  for (const [rx, name] of CATEGORIES) if (rx.test(path)) return name;
  return 'other';
}

// ---- names + generator -------------------------------------------------------------------------
export interface Spot {
  title: string;
  pos: [number, number, number];      // metres, game space
  yaw?: number;                       // degrees about +Y
  matrix?: Mat | null;                // explicit 4x4 (row-major) instead of pos + yaw
  key?: string | null;                // location key (default: slug for the first, spot<i> after)
}

export interface PackNames {
  slug: string;
  dist: string;
  keys: string[];                     // location keys, main first
}

/** A working pack used as a template: its names, vault files and locator arenas. */
export interface Template extends PackNames {
  vaults: Map<string, Uint8Array>;                 // data/db/** path -> bytes
  locators: Map<string, [string, Uint8Array]>;     // locator name -> (file stem, arena bytes)
}

/** Default slug: the display name's letters and digits, lower case. */
export function slugFor(display: string): string {
  let s = display.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (s.length < 4) s = (s + 'pack').slice(0, Math.max(4, s.length));
  return s;
}

/** Default DIST name: DIST_ + the display name's words capitalised. */
export function distFor(display: string): string {
  const words = display.match(/[A-Za-z0-9]+/g) ?? [];
  return 'DIST_' + (words.map((w) => w.slice(0, 1).toUpperCase() + w.slice(1)).join('') || 'Map');
}

export function defaultKeys(slug: string, n: number): string[] {
  return [slug, ...Array.from({ length: Math.max(0, n - 1) }, (_, i) => `spot${i + 1}`)];
}

export function namesFor(display: string, spots: readonly Spot[], slug: string | null = null, dist: string | null = null): PackNames {
  const sl = slug || slugFor(display);
  const keys = defaultKeys(sl, spots.length).map((k, i) => spots[i].key || k);
  if (new Set(keys).size !== keys.length) throw new Error(`duplicate location keys ${keys}`);
  return { slug: sl, dist: dist || distFor(display), keys };
}

/** Read a working single-world pack as a template (slug from its unlock file, DIST from its
 *  stream folder, keys from its Sim location table, vaults and locator arenas verbatim). */
export function readTemplate(packBig: Uint8Array): Template {
  const a = big.readBig(packBig);
  const files = new Map(a.entries.map((e) => [big.entryPath(e), e] as [string, big.Entry]));
  const dists = [...new Set(a.entries.filter((e) => e.root.startsWith('data/content/world/stream/'))
    .map((e) => e.root.slice(e.root.lastIndexOf('/') + 1)))].sort(cmpStr);
  if (dists.length !== 1) throw new Error(`${dists.length} worlds; a template must hold exactly one`);
  const dist = dists[0];
  const loc = [...files.keys()].find((p) => p.endsWith('_Sim.loc') && p.includes('/world/stream/'));
  if (!loc) throw new Error('template: no Sim location table');
  const unl = [...files.keys()].filter((p) => p.startsWith('data/unlocks/') && !/_product\d+/.test(p));
  const slug = unl[0].slice(unl[0].lastIndexOf('/') + 1, -'.unlock'.length);
  const esc = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(`^freeskate_${esc}_(.+)_locator$`);
  const keys = mf.readLoc(big.readEntry(a, files.get(loc)!)).map((L) => rx.exec(L.name)).filter((m) => m).map((m) => m![1]);
  const vaults = new Map<string, Uint8Array>();
  for (const [p, e] of files) if (p.startsWith('data/db/')) vaults.set(p, big.readEntry(a, e));
  const locs = new Map<string, [string, Uint8Array]>();
  for (const [p, e] of files) {
    if (p.startsWith('data/content/global_locators/') && p.endsWith('.loc')) {
      const nm = mf.readLoc(big.readEntry(a, e))[0].name;
      locs.set(nm, [p.slice(p.lastIndexOf('/') + 1, -4), big.readEntry(a, files.get(p.slice(0, -4) + '.rx2')!)]);
    }
  }
  return { slug, dist, keys, vaults, locators: locs };
}

export function tileBoundsDefault(name: string, cell: number, y: [number, number] = [-100.0, 300.0]): mf.Box {
  const c = mf.tileCenter(name)!;
  const h = cell / 2;
  return [c[0] - h, y[0], c[1] - h, c[0] + h, y[1], c[1] + h];
}

/** Python round(): half to even. */
function pyRound(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

export function spotCenter(pos: readonly number[], cell: number, rule: 'containing' | 'community' = 'containing'): XZ {
  if (rule === 'containing') {
    return [Math.floor(pos[0] / cell) * cell + Math.floor(cell / 2), Math.floor(pos[2] / cell) * cell + Math.floor(cell / 2)];
  }
  return [pyRound(pos[0] / cell) * cell - Math.floor(cell / 2), pyRound(pos[2] / cell) * cell - Math.floor(cell / 2)];
}

export type TileArenas = [string, [bigint, Uint8Array][]][];   // [(tile name, [(asset id, arena)])]

export interface BuildOptions {
  cell?: number;                                   // default 100
  content?: Record<string, mf.Box>;                // CSPA content boxes per tile name
  centerRule?: 'containing' | 'community';
  streamForm?: 'raw' | 'xbox2';
  group?: Partial<Record<mf.Kind, number>>;
  tail?: Partial<Record<mf.Kind, number>>;
  dlcTables?: boolean;                             // default true
  vaultVersion?: bigint;
  preloadLimit?: number;                           // sk3 env SK3_PRELOAD_LIMIT, default 63
  manifestOptions?: Pick<mf.GenerateOptions, 'legacyMissingGlobalGroup' | 'uniqueTileIds'>;
  /** drop each tile's arena bytes once its stream file is built (the manifests need only a summary); empties the
   *  caller's arena lists, so only for a caller that is done with them */
  releaseArenas?: boolean;
}

function isTemplate(n: PackNames | Template): n is Template {
  return (n as Template).vaults instanceof Map;
}

/** Every file of a pack for a new map: {path: bytes} (insertion order = sk3/dlc.py build_files). */
export function buildFiles(display: string, tiles: Partial<Record<mf.Kind, TileArenas>>, spots: readonly Spot[],
  names: PackNames | Template, opt: BuildOptions = {}): Map<string, Uint8Array> {
  const cell = opt.cell ?? 100, content = opt.content ?? {}, centerRule = opt.centerRule ?? 'containing';
  const streamForm = opt.streamForm ?? 'raw', dlcTables = opt.dlcTables ?? true;
  const tpl = isTemplate(names) ? names : null;
  const S = names.slug, D = names.dist, keys = [...names.keys];
  if (tpl === null && keys.length !== spots.length) throw new Error(`${spots.length} spots for ${keys.length} location keys`);
  const root = `data/content/world/stream/${D}`;
  const out = new Map<string, Uint8Array>();
  for (const [kind] of mf.KINDS) {
    const tl = tiles[kind] ?? [];
    const g = opt.group?.[kind] ?? mf.groupHash(D, kind);
    const mt: mf.Tile[] = [];
    for (const [name, arenas] of tl) {
      const assets: sfil.Asset[] = arenas.map(([id, arena]) => ({ id, arena }));
      const x = streamForm === 'raw'
        ? sfil.rawStream(g, assets, opt.tail?.[kind] ?? (((tl.length & 0xFF) << 24) >>> 0))
        : sfil.eaStream(g, assets);
      out.set(`${root}/${name}.xsf`, x);
      const k = content[name] ?? (name.endsWith('_Global') ? null : tileBoundsDefault(name, cell));
      if (opt.releaseArenas) {
        const summary = arenas.map(([id, a]) => [id, mf.arenaSummary(a)] as [bigint, mf.ArenaSummary]);
        arenas.length = 0;
        mt.push({ name, arenas: summary, streamSize: x.length, content: k });
      } else mt.push({ name, arenas, streamSize: x.length, content: k });
    }
    const gen = mf.generate(D, kind, mt, {
      cell, platform: streamForm === 'raw' && mt.length ? 0 : 2, alignment: streamForm === 'raw' ? 0x100 : 0x80,
      sizeIncludesHeader: streamForm === 'raw', group: g, ...opt.manifestOptions,
    });
    for (const [ext, b] of Object.entries(gen)) out.set(`${root}/${D}_${kind}${ext}`, b);
  }
  const cs: XZ[] = [];
  for (const k of ['Pres', 'Sim'] as const) for (const [n] of tiles[k] ?? []) { const c = mf.tileCenter(n); if (c) cs.push(c); }
  const centers = uniqSorted(cs);
  const locs: [string, Spot][] = [[keys[0], spots[0]], ...keys.slice(1).map((k, i) =>
    [k, i + 1 < spots.length ? spots[i + 1] : spots[0]] as [string, Spot])];
  const titles: [string, string][] = locs.map(([k], i) => [k, i < spots.length ? locs[i][1].title : `${spots[0].title} ${i + 1}`]);
  const table: mf.Location[] = [];
  const nb = writeStreamTiles(neighbourTable(centers, cell));
  for (const [key, sp] of locs) {
    const m = sp.matrix ?? mf.spawnTransform(sp.pos[0], sp.pos[1], sp.pos[2], sp.yaw ?? 0);
    const base = `freeskate_${S}_${key}`;
    for (const [nm, ring] of [[`${base}_locator`, true], [`Z_${S}_${key}_Start`, false]] as [string, boolean][]) {
      const L: Locator = { name: nm, matrix: m, locatorId: attribKey(nm), spawns: ring ? spawnRing(nm, base, m) : [] };
      let stem: string, rx2: Uint8Array;
      if (tpl !== null) {
        const t = tpl.locators.get(nm);
        if (!t) throw new Error(`template has no locator ${nm}`);
        stem = t[0];
        rx2 = locatorArena(t[1], L);
      } else {
        stem = locatorFileStem(D, nm);
        rx2 = buildLocatorArena(L);
      }
      const gl = `data/content/global_locators/DLC_BAM/${D}/${stem}`;
      out.set(gl + '.loc', mf.writeLoc([{ name: nm, transform: m }]));
      out.set(gl + '.rx2', rx2);
      table.push({ name: nm, transform: m });
    }
    const locName = `freeskate_dlc_${S}_${key}`;
    out.set(`data/boundary/${locName}.xml`, writeBoundary(boundaryRect(centers, cell)));
    out.set(`data/stream/${locName}.xml`, writeStreamTiles(preloadList(spotCenter(sp.pos, cell, centerRule), centers, opt.preloadLimit ?? 63)));
    if (dlcTables) {
      out.set(`data/stream/dist_${S}_${key}dlc_Pres.xml`, nb);
      out.set(`data/stream/dist_${S}_${key}dlc_Sim.xml`, nb);
    }
    const mis = `data/content/missions/freeskate_${S}_${key}/freeskate_${S}_${key}`;
    for (const kind of ['Pres', 'Sim', 'Tex']) {
      const g = kind === 'Pres' ? 0x5634DD36 : 0x5634DD26;
      out.set(`${mis}_${kind}.pmm`, mf.writeMmap(g));
      out.set(`${mis}_${kind}.psm`, mf.writeCmap({ group: g, platform: 3, entries: [] }));
      out.set(`${mis}_${kind}.pss`, mf.writeCspa({ group: g, cells: [] }));
      out.set(`${mis}_${kind}.pst`, mf.writeAtoc({ group: g, records: [] }));
    }
  }
  out.set(`${root}/${D}_Sim.loc`, mf.writeLoc(table));
  out.set(`data/stream/${D}_Pres.xml`, nb);
  out.set(`data/stream/${D}_Sim.xml`, nb);
  const lang = locationStrings(S, display, titles);
  out.set(`data/fe/languages/english/LANGUAGE_English_${S}_skate3ng-dlc_${S}_minimal.BIN`, writeLanguage(lang));
  out.set(`data/fe/languages/english/LANGUAGE_English_HISTOGRAM_skate3ng-dlc_${S}_minimal.BIN`, writeHistogram());
  out.set(`data/unlocks/${S}.unlock`, new Uint8Array(0));
  out.set(`data/unlocks/${S}0000_product00000000.unlock`, productUnlock(S));
  if (tpl !== null) {
    for (const [p, b] of tpl.vaults) out.set(p, b);
  } else {
    for (const [p, b] of vault.dlcVaults(S, keys, D, opt.vaultVersion ?? vault.VERSION_PACK)) out.set('data/db/' + p, b);
  }
  return out;
}

export interface PackOutput {
  contentId: string;               // the package directory name
  bigName: string;                 // <slug>_00000000.big
  headerName: string;              // <slug>_00000000.header
  bigParts: Uint8Array[];          // the .big as parts (feed to a Blob)
  bigSize: number;
  header: Uint8Array;
}

/** <CONTENTID>/<slug>_00000000.big + .header beside it (sk3/dlc.py write_pack, in memory). */
export function writePack(files: Map<string, Uint8Array>, slug: string, display: string, contentId: string | null = null): PackOutput {
  const cid = contentId || contentIdFor(display);
  const srcs = [...files].map(([p, b]) => big.sourceOf(p, b));
  const { parts, size } = big.writeBigParts(srcs, { flags: big.FLAGS_DLC });
  return { contentId: cid, bigName: `${slug}_00000000.big`, headerName: `${slug}_00000000.header`, bigParts: parts, bigSize: size,
    header: writeHeader(display, cid) };
}
