// SPDX-License-Identifier: GPL-3.0-or-later
// Skate 3 AttribSys vaults: `.vlt` (records) + `.bin` (data) + `.opt` (empty); port of skate4to3
// sk3/vault.py layers 1 (file codec), 3 (encoder; `decode` needs the retail schema and is not
// ported) and 4 (the DLC generator `dlcVaults`). All words big-endian; keys are attribKey(name).
import { attribKey } from './attrib_hash.ts';
import {
  ascii, ByteWriter, concat, cstr, decodeLatin1, fromHex, latin1, toHex, u32be, u64be, u16be, padTo,
} from './bytes_util.ts';

// export record types (ExpN word 2)
export const EXP_COLLECTION = 0xAD303B8F42B3307En;
export const EXP_CLASS = 0x2A7895AC4A876152n;
export const EXP_DATABASE = 0x0B38846845E9C175n;

// entry flag bits (u16 at entry +0xE)
export const F_INLINE = 0x4000;
export const F_COMPLEX = 0x0800;
export const F_ARRAY = 0x0200;

export const VERSION_PACK = 0x693CDCC3F57ADB28n;
export const VERSION_RETAIL = 0xB2157AD88EF77187n;

const a_ = (n: number, a: number) => Math.ceil(n / a) * a;

// ================================================================================ 1. file codec
export type Ptr = [offset: number, kind: number, arg: number, target: bigint];
export type Export = [id: bigint, type: bigint, size: number, offset: number];

export interface Vlt {
  version: bigint;
  strn: Uint8Array;                 // StrN payload (8 zero bytes everywhere measured)
  deps: [bigint, string][];         // [(hash, name)]
  datn: Uint8Array;
  datnAt: number;                   // file offset of the DatN payload
  exports: Export[];
  ptrs: Ptr[];                      // incl. the kind-0 terminator
  endc?: Uint8Array;                // default 8 zero bytes
}

export function chunkList(d: Uint8Array): [[string, number, Uint8Array][], number] {
  const out: [string, number, Uint8Array][] = [];
  let off = 0;
  while (off < d.length) {
    const tag = decodeLatin1(d.subarray(off, off + 4)), size = u32be(d, off + 4);
    if (size < 8 || off + size > d.length) break;
    out.push([tag, off, d.subarray(off + 8, off + size)]);
    off += size;
  }
  return [out, off];
}

function pad16(b: Uint8Array): Uint8Array {
  return concat([b, new Uint8Array(padTo(b.length + 8, 16))]);
}

function chunk(tag: string, payload: Uint8Array): Uint8Array {
  return new ByteWriter(payload.length + 8).bytes(latin1(tag)).u32(payload.length + 8).bytes(payload).finish();
}

/** u64 count, u64 hashes, u32 name offsets (padded to 8), names NUL-terminated. */
export function depnPayload(deps: readonly [bigint, string][]): Uint8Array {
  const n = deps.length;
  const p = new ByteWriter().u64(BigInt(n));
  for (const [h] of deps) p.u64(h);
  const pool = new ByteWriter();
  const offs: number[] = [];
  for (const [, nm] of deps) { offs.push(pool.length); pool.bytes(latin1(nm)).u8(0); }
  p.u32(...offs).zeros(padTo(4 * n, 8));
  return p.bytes(pool.finish()).finish();
}

export function readVlt(d: Uint8Array): Vlt {
  const [cs, end] = chunkList(d);
  if (end !== d.length) throw new Error('vlt: trailing bytes');
  const tags = cs.map((c) => c[0]).join(',');
  if (tags !== 'Vers,StrN,DepN,DatN,ExpN,PtrN,EndC') throw new Error(`vlt: chunks ${tags}`);
  const by = new Map(cs.map(([t, o, p]) => [t, [o, p] as [number, Uint8Array]]));
  const version = u64be(by.get('Vers')![1], 0);
  let p = by.get('DepN')![1];
  let n = Number(u64be(p, 0));
  const hs = Array.from({ length: n }, (_, i) => u64be(p, 8 + 8 * i));
  const offs = Array.from({ length: n }, (_, i) => u32be(p, 8 + 8 * n + 4 * i));
  const base = 8 + 8 * n + a_(4 * n, 8);
  const pp = p;
  const names = offs.map((o) => cstr(pp, base + o));
  p = by.get('ExpN')![1];
  n = Number(u64be(p, 0));
  const exports: Export[] = [];
  for (let i = 0; i < n; i++) {
    const b = 8 + 24 * i;
    exports.push([u64be(p, b), u64be(p, b + 8), u32be(p, b + 16), u32be(p, b + 20)]);
  }
  p = by.get('PtrN')![1];
  const ptrs: Ptr[] = [];
  for (let i = 0; i < Math.floor(p.length / 16); i++) {
    const e: Ptr = [u32be(p, 16 * i), u16be(p, 16 * i + 4), u16be(p, 16 * i + 6), u64be(p, 16 * i + 8)];
    ptrs.push(e);
    if (e[1] === 0) break;
  }
  const v: Vlt = { version, strn: by.get('StrN')![1], deps: hs.map((h, i) => [h, names[i]] as [bigint, string]),
    datn: by.get('DatN')![1], datnAt: by.get('DatN')![0] + 8, exports, ptrs, endc: by.get('EndC')![1] };
  const re = writeVlt(v);
  if (re.length !== d.length || re.some((x, i) => x !== d[i])) throw new Error('vlt: layout not reproduced');
  return v;
}

export function writeVlt(v: Vlt): Uint8Array {
  const parts = [chunk('Vers', new ByteWriter(8).u64(v.version).finish()), chunk('StrN', v.strn),
    chunk('DepN', pad16(depnPayload(v.deps)))];
  const at = parts.reduce((s, x) => s + x.length, 0) + 8;
  if (at !== v.datnAt) throw new Error(`vlt: DatN would start at 0x${at.toString(16)}, not 0x${v.datnAt.toString(16)}`);
  parts.push(chunk('DatN', pad16(v.datn)));
  const ex = new ByteWriter().u64(BigInt(v.exports.length));
  for (const [id, ty, size, off] of v.exports) ex.u64(id, ty).u32(size, off);
  parts.push(chunk('ExpN', pad16(ex.finish())));
  const pt = new ByteWriter();
  for (const [o, k, a, t] of v.ptrs) pt.u32(o).u16(k).u16(a).u64(t);
  parts.push(chunk('PtrN', pad16(pt.finish())));
  parts.push(chunk('EndC', v.endc ?? new Uint8Array(8)));
  return concat(parts);
}

/** `.bin`: a StrE chunk, EndC, then (EA layout) the data area. */
export interface Bin {
  stre: Uint8Array;
  tail?: Uint8Array;
  endc?: Uint8Array;
}

export function readBin(d: Uint8Array): Bin {
  const tag = decodeLatin1(d.subarray(0, 4)), size = u32be(d, 4);
  if (tag !== 'StrE' || decodeLatin1(d.subarray(size, size + 4)) !== 'EndC') throw new Error('bin: not StrE + EndC');
  const esz = u32be(d, size + 4);
  return { stre: d.subarray(8, size), tail: d.subarray(size + esz), endc: d.subarray(size + 8, size + esz) };
}

export function writeBin(b: Bin): Uint8Array {
  return concat([chunk('StrE', b.stre), chunk('EndC', b.endc ?? new Uint8Array(8)), b.tail ?? new Uint8Array(0)]);
}

export const OPT: Uint8Array = chunk('EndC', new Uint8Array(8));

// ================================================================================ 3. database
/** A pointer to a NUL-terminated string in the .bin. */
export class Text {
  s: string;
  constructor(s: string) { this.s = s; }
}

/** A data block in the .bin; `strings` = pointer slots in it {offset: text}. */
export class Blob {
  data: Uint8Array;
  align: number;
  strings: Map<number, Text>;
  es: number;          // element size of an array (0: not an array)
  constructor(data: Uint8Array, align = 4, strings: Map<number, Text> = new Map(), es = 0) {
    this.data = data; this.align = align; this.strings = strings; this.es = es;
  }

  /** Offset of a slot inside its element (EA sorts the .bin pointer table by it). */
  member(o: number): number {
    return this.es ? (((o - 8) % this.es) + this.es) % this.es : o;
  }
}

/** An out-of-line value whose pointer is .bin offset 0 (community builders' unserialisable structs). */
export const BIN0: unique symbol = Symbol('BIN0');
export type Bin0 = typeof BIN0;

export type Value = number | Text | Blob | Bin0;

export interface Entry {
  key: bigint;
  type: bigint;
  flags: number;
  value: Value;
}

export interface Collection {
  kind: 'collection';
  key: bigint;
  cls: bigint;
  parent: bigint;
  entries: Entry[];
  types: bigint[];          // stored type list (static-field types first)
  ntypes: number;           // u16 at +0x24
  capacity: number;         // u32 at +0x18
  w1c: number;              // u32 at +0x1C
  layout: Blob | null;
  w2c: number;
  eid: bigint;              // ExpN id = attribKey('<class name>/<collection name>')
}

export interface RawItem {
  kind: 'raw';
  eid: bigint;
  type: bigint;
  data: Uint8Array;
}

export interface Database {
  vltName: string;
  binName: string;
  items: (Collection | RawItem)[];
  version?: bigint;          // default VERSION_RETAIL
  form?: 'ea' | 'pack';      // default 'ea'
}

export function collectionRecord(col: Collection, layoutWord = 0): Uint8Array {
  const tidx = new Map<bigint, number>();
  col.types.forEach((t, i) => tidx.set(t, i));
  const out = new ByteWriter(0x30 + 8 * col.types.length + 16 * col.entries.length);
  out.u64(col.key, col.cls, col.parent).u32(col.capacity, col.w1c, col.entries.length)
    .u16(col.ntypes).u16(col.types.length).u32(layoutWord, col.w2c);
  for (const t of col.types) out.u64(t);
  for (const e of col.entries) {
    const val = typeof e.value === 'number' ? e.value : 0;
    out.u64(e.key).u32(val >>> 0).u16(tidx.get(e.type)!).u16(e.flags);
  }
  return out.finish();
}

/** (vlt bytes, bin bytes) in EA's layout (see sk3/vault.py encode). */
export function encode(db: Database): [Uint8Array, Uint8Array] {
  const cols = db.items.filter((c): c is Collection => c.kind === 'collection');
  const pool = new ByteWriter();
  const at = new Map<string, number>();
  const use = (t: Text) => {
    if (!at.has(t.s)) { at.set(t.s, 8 + pool.length); pool.bytes(latin1(t.s)).u8(0); }
  };
  const sortedStrings = (b: Blob) => [...b.strings.entries()].sort((x, y) => x[0] - y[0]);
  for (const c of cols) {
    if (c.layout) for (const [, t] of sortedStrings(c.layout)) use(t);
    for (const e of c.entries) {
      if (e.value instanceof Text) use(e.value);
      else if (e.value instanceof Blob) for (const [, t] of sortedStrings(e.value)) use(t);
    }
  }
  const stre = pool.zeros(padTo(pool.length + 8, 16)).finish();
  const data = new ByteWriter();
  const base = 8 + stre.length + 16;
  const bslots = new Map<number, [number, number]>();
  const placeLayout = new Map<Collection, number>();
  const placeEntry = new Map<Collection, Map<number, number>>();
  const put = (blob: Blob) => {
    const o = a_(base + data.length, blob.align) - base;
    data.zeros(o - data.length);
    data.bytes(blob.data);
    for (const [so, t] of blob.strings) bslots.set(base + o + so, [blob.member(so), at.get(t.s)!]);
    return base + o;
  };
  for (const c of cols) {
    if (c.layout !== null) placeLayout.set(c, put(c.layout));
    const m = new Map<number, number>();
    c.entries.forEach((e, i) => { if (e.value instanceof Blob) m.set(i, put(e.value)); });
    placeEntry.set(c, m);
  }
  const binf = writeBin({ stre, tail: data.finish() });

  const deps: [bigint, string][] = [db.vltName, db.binName].filter((n) => n).map((n) => [attribKey(n), n]);
  const head = 16 + 16 + 8 + pad16(depnPayload(deps)).length;
  const datnAt = head + 8;
  const datn = new ByteWriter();
  const exports: Export[] = [];
  const vslots = new Map<number, number>();
  const lslots = new Map<number, number>();
  for (const it of db.items) {
    const off = datnAt + datn.length;
    let rec: Uint8Array;
    if (it.kind === 'collection') {
      rec = collectionRecord(it, 0);
      if (it.layout !== null) vslots.set(off + 0x28, placeLayout.get(it)!);
      const eb = off + 0x30 + 8 * it.types.length;
      it.entries.forEach((e, i) => {
        if (e.value instanceof Text) vslots.set(eb + 16 * i + 8, at.get(e.value.s)!);
        else if (e.value instanceof Blob) vslots.set(eb + 16 * i + 8, placeEntry.get(it)!.get(i)!);
        else if (e.value === BIN0) vslots.set(eb + 16 * i + 8, 0);
      });
      for (const sl of vslots.keys()) if (!lslots.has(sl)) lslots.set(sl, off);
      exports.push([it.eid, EXP_COLLECTION, rec.length, off]);
    } else {
      rec = it.data;
      exports.push([it.eid, it.type, rec.length, off]);
    }
    datn.bytes(rec);
  }
  const ptrs: Ptr[] = [];
  const anyComplex = cols.some((c) => c.entries.some((e) => e.flags & F_COMPLEX));
  if (bslots.size || ((db.form ?? 'ea') === 'ea' && anyComplex)) {
    ptrs.push([0, 2, 1, 0n]);
    const bs = [...bslots.entries()].sort((x, y) => (x[1][0] - y[1][0]) || (x[0] - y[0]));
    for (const [s, [, t]] of bs) ptrs.push([s, 3, 1, BigInt(t)]);
  }
  ptrs.push([0, 2, 0, 0n]);
  const vs = [...vslots.entries()].sort((x, y) => ((x[0] - lslots.get(x[0])!) - (y[0] - lslots.get(y[0])!)) || (x[0] - y[0]));
  for (const [s, t] of vs) ptrs.push([s, 3, 1, BigInt(t)]);
  ptrs.push([0, 0, 0, 0n]);
  const v: Vlt = { version: db.version ?? VERSION_RETAIL, strn: new Uint8Array(8), deps, datn: datn.finish(), datnAt, exports, ptrs };
  return [writeVlt(v), binf];
}

// ================================================================================ 4. DLC generator
// What a single-world DLC pack's db/ holds (measured on SUMMERCAMP, ISLEOFGROM, SUMMERCAMPHD).
type VSpec =
  | number
  | Bin0
  | readonly ['T', string]
  | readonly ['R', string, string]
  | readonly ['VR', string, string]
  | readonly ['CR', string]
  | readonly ['B', string, number, number, Record<number, string>]
  | readonly ['LUA', string];
type ESpec = readonly [bigint, string, number, VSpec];
type CSpec = readonly [string, string, string | null, number, readonly ESpec[], VSpec?];

/** Python str.format with named fields only ({{ and }} escapes supported). */
function pyFormat(s: string, kw: Record<string, string>): string {
  return s.replace(/\{\{|\}\}|\{([^{}]*)\}/g, (m, name: string | undefined) => {
    if (m === '{{') return '{';
    if (m === '}}') return '}';
    if (name === undefined || !(name in kw)) throw new Error(`format: KeyError ${name}`);
    return kw[name];
  });
}

/** Python str.isalnum for one character (Unicode letters and numbers). */
const isAlnum = (ch: string) => /^[\p{L}\p{N}]$/u.test(ch);

/** Python str.upper (JS toUpperCase matches it for the ASCII/Latin text slugs use). */
const upper = (s: string) => s.toUpperCase();

class SpecCtx {
  slug: string;
  keys: string[];
  dist: string;
  s4: string;
  product: string;

  constructor(slug: string, keys: readonly string[], dist: string) {
    this.slug = slug; this.keys = [...keys]; this.dist = dist;
    this.s4 = slug.slice(0, 4);
    const alnum = [...upper(slug)].filter(isAlnum).join('');
    this.product = alnum.slice(0, 7).padEnd(16, '0');
  }

  fmt(s: string, key?: string): string {
    const k = key ?? this.keys[0];
    return pyFormat(s, {
      slug: this.slug, SLUG: upper(this.slug), s4: this.s4, S4: upper(this.s4), dist: this.dist, key: k,
      KEY: upper(k), key0: this.keys[0], KEY0: upper(this.keys[0]), product: this.product,
    });
  }
}

const _t = (s: string) => ['T', s] as const;
const _r = (cls: string, name: string) => ['R', cls, name] as const;           // Attrib::RefSpec
const _vr = (cls: string, name: string) => ['VR', cls, name] as const;         // tVaultedRefSpec
const _cr = (name: string) => ['CR', name] as const;                           // ClassRefSpec_*
const hex4 = (n: number) => n.toString(16).padStart(4, '0');
const _arr = (es: number, align: number) => ['B', `0000 0000 ${hex4(es)} 0000`, align, es, {}] as const;
const _b = (hexs: string, align: number, es = 0, s: Record<number, string> = {}) => ['B', hexs, align, es, s] as const;
const zz = (n: number) => '00'.repeat(n);

const R0 = ['B', zz(24), 8, 0, {}] as const;
const CR0 = ['B', zz(16), 8, 0, {}] as const;
const TRUE = 0x01000000;    // Bool is the first byte of the inline word

// static (layout) field types per class, in layout offset order, and layout sizes (retail schema)
const STATIC: Record<string, [string[], number]> = {
  challenge_local_data: [['Sk8::Audio::eSk8Characters'], 4],
  fe_locations: [['EA::Reflection::Text', 'Sk8::Challenge::tLocationID'], 12],
  worldpainter_fe_location_triggers: [['EA::Reflection::Text'], 4],
};

const _E = 'EA::Reflection::';
const _C = 'Sk8::Challenge::';

// challenge_local_data 'default' (identical to retail challenge_local_data_framework.vlt 'default')
const CLD_DEFAULT: readonly ESpec[] = [
  [0x3b2db72e60aaa38en, 'EA::Reflection::Bool', 0x4000, 0],
  [0xdd99f44939e70af9n, 'EA::Reflection::Bool', 0x4000, TRUE],
  [0xfc19949149740049n, 'EA::Reflection::Int32', 0x0200, _arr(4, 4)],
  [0x117191727d1f3c41n, 'EA::Reflection::Bool', 0x4000, TRUE],
  [0x4c89d137b3d2944en, 'EA::Reflection::Bool', 0x4000, 0],
  [0xf80366582ab8737fn, 'EA::Reflection::Bool', 0x4000, 0],
  [0xbeafe2539cc67a68n, 'EA::Reflection::Bool', 0x4000, 0],
  [0xd35023f4c43a6421n, 'EA::Reflection::Bool', 0x4000, 0],
  [0xb01eaf6b0ea7373cn, 'EA::Reflection::Bool', 0x4000, 0],
  [0x832e0fef78ebb33dn, 'EA::Reflection::Text', 0x4000, _t('ID_CHALLENGE_CENTRAL_MESSAGE_OBJECTIVE_RETURNTOCHAL')],
  [0xecec13cea2899d81n, 'Attrib::RefSpec', 0x0a00, _arr(24, 8)],
  [0xe14decee593e36d4n, 'Attrib::RefSpec', 0x0a00, _arr(24, 8)],
  [0x0abdc707fc5ddf63n, 'EA::Reflection::Bool', 0x4000, 0],
  [0x137f56d7c41456f1n, 'EA::Reflection::Bool', 0x4000, TRUE],
  [0xbb120dfb026bb636n, 'EA::Reflection::Bool', 0x4000, 0],
  [0xd46d537ac3775c5dn, 'EA::Reflection::Bool', 0x4000, 0],
  [0x44754347a934fdcdn, 'Sk8::Audio::eChallengeMusicType', 0x4000, 0],
  [0x7c99551d913fcb8fn, 'EA::Reflection::Text', 0x4000, _t('')],
  [0x23f394473183c613n, 'EA::Reflection::Bool', 0x4000, TRUE],
  [0xb017c5144a4be44fn, 'EA::Reflection::UInt8', 0x4000, 0],
  [0x1a7274067ce13f22n, 'EA::Reflection::Text', 0x4000, _t('')],
  [0x533baabdfe3b8a70n, 'EA::Reflection::Bool', 0x4000, TRUE],
  [0x87db489867267a56n, 'EA::Reflection::Float', 0x4000, 0x3fc00000],
  [0x16e7e79b28332502n, 'EA::Reflection::Bool', 0x4000, TRUE],
  [0x53688086474e81ebn, 'EA::Reflection::Bool', 0x4000, 0],
  [0x133aad27f05343f8n, 'EA::Reflection::Bool', 0x4000, 0],
  [0xf3a508058ae5148dn, 'EA::Reflection::Bool', 0x4000, 0],
  [0xa4a69fc7384cbf93n, 'EA::Reflection::Float', 0x4000, 0x40533333],
  [0xdcc1cc2cefbd33ben, 'Attrib::Gen::ClassRefSpec_livingworld_categorygroups', 0x0800,
    _b('f91e58de56973cb80000000000000000', 8)],
  [0x291d6d1b65aeffd2n, 'Sk8::Challenge::tObjectiveStatusField', 0x4000, 0],
  [0xe82a28be11734cfan, 'EA::Reflection::Bool', 0x4000, TRUE],
  [0x8dd0bda08407e230n, 'EA::Reflection::Int32', 0x4000, 5],
  [0x7b834a07530629fan, 'EA::Reflection::Float', 0x4000, 0x40466666],
  [0xbe79e831558f2113n, 'Attrib::RefSpec', 0x0800, R0],
  [0x97cd1fc9b27a1e3cn, 'EA::Reflection::Bool', 0x4000, 0],
  [0xe57648e80501973en, 'Attrib::RefSpec', 0x0a00, _arr(24, 8)],
  [0x1070acf7360e007en, 'EA::Reflection::Bool', 0x4000, 0],
  [0xb0d9b6b916d223e6n, 'EA::Reflection::Bool', 0x4000, TRUE],
  [0x42cf56ddea069244n, 'EA::Reflection::Bool', 0x4000, 0],
  [0xcaf082b3a11f4afbn, 'EA::Reflection::Float', 0x4000, 0x40400000],
  [0x59cd0b9449d19c3cn, 'EA::Reflection::Text', 0x4000, _t('ID_COMMON_NONE')],
  [0x48427451aef34906n, 'Attrib::RefSpec', 0x0800, R0],
  [0xf59b3a4d0f2009e6n, 'EA::Reflection::Bool', 0x4000, 0],
  [0x5f3d2f4ca4031e5bn, 'EA::Reflection::Bool', 0x4000, 0],
  [0x59f6a63f5900a8c9n, 'EA::Reflection::Bool', 0x4000, 0],
];

export const ACTIVITIES = ['gap_tag', 'accumulation', 'simultrick', 'tricklist', 'survival'] as const;
// eFreeskateType per activity in the challenge_global_data collections
const ACT_TYPE: Record<string, number> = { gap_tag: 0, accumulation: 0, simultrick: 3, tricklist: 0, survival: 0 };

/** challenges collection: its name, the global-data RefSpec and the local-data vault ref. */
function challengeEntries(name: string): ESpec[] {
  return [[0x942ab8aee4b414edn, _E + 'Text', 0x4000, _t(name)],
    [0x24491bf00316aa45n, 'Attrib::RefSpec', 0x0800, _r('challenge_global_data', name)],
    [0xd7bb2b160caf8ed6n, 'AttribSysUtils::tVaultedRefSpec', 0x0800, _vr('challenge_local_data', name)]];
}

const hex16 = (k: bigint) => k.toString(16).padStart(16, '0');

/** challengebanks/dlc_<s4>.vlt: 'default' copies, the dlc_<s4> tree, then 2 per location. */
function challengebank(sp: SpecCtx): CSpec[] {
  const s4 = 'dlc_{s4}';
  const hlTail = latin1(sp.fmt('dlc_{s4}\0dlc_{s4}_freeskate_acti'));
  const out: CSpec[] = [
    ['challenges', 'default', null, 0, [
      [0x942ab8aee4b414edn, _E + 'Text', 0x4000, _t('default')],
      [0x8c5669e5a6864831n, _E + 'UInt64', 0x0000, _b(zz(8), 8)],
      [0x24491bf00316aa45n, 'Attrib::RefSpec', 0x0800, _r('challenge_global_data', 'default')],
      [0xd7bb2b160caf8ed6n, 'AttribSysUtils::tVaultedRefSpec', 0x0800, _vr('challenge_local_data', 'default')]]],
    ['challenge_objective', 'default', null, 1, [
      [0x942ab8aee4b414edn, _E + 'Text', 0x4000, _t('default')],
      [0xe73c9cf0f75a6fcdn, _C + 'tChallengePresentationEvent', 0x0200, _arr(16, 4)],
      [0xd7332063be5cc0ebn, _C + 'eTriggerActivationMode', 0x4000, 0],
      [0xd404ba3319e2c389n, _C + 'tChallengePresentationEvent', 0x0200, _arr(16, 4)],
      [0xb053106604767956n, _E + 'Bool', 0x4000, 0],
      [0x607ec72f932997c1n, _C + 'tChallengePresentationEvent', 0x0200, _arr(16, 4)],
      [0x40d40861dd9a6cc6n, _C + 'tObjectiveDefinition', 0x0200, _arr(20, 4)],
      [0xb69af085f7a6d275n, 'Attrib::RefSpec', 0x0a00, _arr(24, 8)],
      // bytes 0x70.. of this 0x90-byte struct are the strings that follow it in the community
      // builders' .bin (they write 0x70 bytes); kept so the game reads the same value
      [0x928f9d693922d585n, _C + 'tHighlightDefinition', 0x0000,
        _b(zz(69) + '10000000000000001000000000000000100000000000000014000000000000001800000000000000500000'
          + toHex(hlTail), 16, 0, { 0: '' })],
      [0xbc7d59ecbb20868dn, _E + 'Bool', 0x4000, 0],
      [0xe13d9c326e4d98d5n, _C + 'tObjectiveDefinition', 0x0000, _b(zz(20), 4)],
      [0xd4965ed3bd43ec44n, _C + 'tObjectiveTriggers', 0x0000, _b(zz(20), 4)],
      [0x41cbf3f0889de6b3n, 'LuaState::tCompiledLua', 0x0000, _b(zz(12), 4)],
      [0xe0b77cde569c8c0bn, _E + 'Bool', 0x4000, 0],
      [0x16f350c53880eaa9n, _C + 'eVisualIndicatorMode', 0x4000, 0],
      [0x7ae8fef77a54bb91n, _C + 'tVisualEditorData', 0x0a00, _arr(80, 8)]]],
    ['challenges', s4, 'default', 0, [
      [0x942ab8aee4b414edn, _E + 'Text', 0x4000, _t(s4)],
      [0x8c5669e5a6864831n, _E + 'UInt64', 0x0000, _b('0000000000000800', 8)],
      [0x24491bf00316aa45n, 'Attrib::RefSpec', 0x0800, _r('challenge_global_data', s4)],
      [0xd7bb2b160caf8ed6n, 'AttribSysUtils::tVaultedRefSpec', 0x0800, _vr('challenge_local_data', s4)]]],
    ['challenge_global_data', s4, 'default', 0, []],
    ['challenge_failure_objective', s4, 'default', 0, [[0x942ab8aee4b414edn, _E + 'Text', 0x4000, _t(s4)]]],
    ['challenge_objective', s4, 'default', 0, [[0x942ab8aee4b414edn, _E + 'Text', 0x4000, _t(s4)]]],
    ['challenge_objectives_group', s4, 'default', 0, []],
    ['challenges', s4 + '_freeskate_locations', s4, 0, [
      [0x942ab8aee4b414edn, _E + 'Text', 0x4000, _t(s4 + '_freeskate_locations')],
      [0x24491bf00316aa45n, 'Attrib::RefSpec', 0x0800, _r('challenge_global_data', 'freeskate_locations')],
      [0xd7bb2b160caf8ed6n, 'AttribSysUtils::tVaultedRefSpec', 0x0800, _vr('challenge_local_data', 'freeskate_locations')],
      [0x7867a00c3a6f893cn, 'AttribSysUtils::tVaultedRefSpec', 0x0800, _vr('challenge_stategraph', 'freeskate')]]],
    ['challenge_global_data', s4 + '_freeskate_locations', s4, 1, [
      [0xf9a9a1dded84a643n, _E + 'Bool', 0x4000, TRUE],
      [0x02b828ccdb4785e4n, _C + 'eChallengeTypes', 0x4000, 0x16],
      [0xfd40e4a31027c984n, _E + 'Bool', 0x4000, 0],
      [0x6b0bd2bae508b742n, _E + 'Text', 0x4000, _t('')],
      [0x797427ed230c9980n, 'Sk8::FE::tFEScreenShot', 0x4000, _t('default')],
      [0x122db7b0f026dbecn, _C + 'eGlobalType', 0x4000, 0],
      [0x8022ba64cb8e431dn, _E + 'Float', 0x4000, 0x40400000],
      [0xbca0ade94b04b8a7n, _E + 'Text', 0x4000, _t('ID_MISSION_TEMPLATE_ONLINE_FREESKATE_TITLE')],
      [0xf1c6d5fa4a23951en, _C + 'tLocationID', 0x4000, _t('')],
      [0xa6e8924715a15cecn, _C + 'tLocationID', 0x4000, _t('')],
      [0xa996afe8845cacabn, 'Sk8::HUD::eHUDComponent', 0x0200, _b('000100010004000000000009', 4, 4)],
      [0x876bf0819aa58858n, _C + 'tRequiredChallengeHull', 0x0200, _arr(4, 4)],
      [0xe2a50788b6c20c92n, _E + 'Text', 0x4000, _t('ID_LOCATION_{SLUG}_{KEY0}')]]],
    ['challenges', s4 + '_freeskate_activities', s4, 0, challengeEntries(s4 + '_freeskate_activities')],
    ['challenge_global_data', s4 + '_freeskate_activities', s4, 2, [
      [0xf9a9a1dded84a643n, _E + 'Bool', 0x4000, TRUE],
      [0x858d73cd6085c8ecn, _E + 'Bool', 0x4000, TRUE],
      [0x02b828ccdb4785e4n, _C + 'eChallengeTypes', 0x4000, 0x2a],
      [0xfd40e4a31027c984n, _E + 'Bool', 0x4000, 0],
      [0x6b0bd2bae508b742n, _E + 'Text', 0x4000, _t('')],
      [0x198a0e276e56a9d6n, _E + 'Bool', 0x4000, TRUE],
      [0x89add2c42d6d58aen, _C + 'tWorldLocationID', 0x0800, _b(zz(32), 8)],
      [0x89b3580572f41da3n, _E + 'Bool', 0x4000, 0],
      [0x85d6b2c6ae61dd8bn, _C + 'eFreeskateType', 0x4000, 1],
      [0x122db7b0f026dbecn, _C + 'eGlobalType', 0x4000, 0],
      [0x8022ba64cb8e431dn, _E + 'Float', 0x4000, 0x40400000],
      [0xf1c6d5fa4a23951en, _C + 'tLocationID', 0x4000, _t('default')],
      [0xc95dcfb60acf8393n, _E + 'Text', 0x4000, _t('')],
      [0xa6e8924715a15cecn, _C + 'tLocationID', 0x4000, _t('default')],
      [0xa996afe8845cacabn, 'Sk8::HUD::eHUDComponent', 0x0200, _b('000100010004000000000009', 4, 4)],
      [0x9233a3e52805d3fcn, 'Attrib::Gen::ClassRefSpec_challenges', 0x0800, CR0],
      [0x876bf0819aa58858n, _C + 'tRequiredChallengeHull', 0x0200, _arr(4, 4)],
      [0x4c807b9c7f6c6f47n, _E + 'Bool', 0x4000, TRUE],
      [0xe2a50788b6c20c92n, _E + 'Text', 0x4000, _t('')]]],
    ['challenge_failure_objective', s4 + '_freeskate_activities', s4, 0,
      [[0x942ab8aee4b414edn, _E + 'Text', 0x4000, _t(s4 + '_freeskate_activities')]]],
  ];
  for (const act of ACTIVITIES) {
    const nm = `${s4}_freeskate_activities_${act}`;
    const par = s4 + '_freeskate_activities';
    out.push(
      ['challenges', nm, par, 0, challengeEntries(nm)],
      ['challenge_global_data', nm, par, 0, [
        // {class f788504a8d922ced, collection 'challenge_spotfound', 0}
        [0xe616acdf5a36bfacn, _C + 'tChallengeIconDefinition', 0x0800,
          _b(`f788504a8d922ced${hex16(attribKey('challenge_spotfound'))}0000000000000000`, 8)],
        [0x85d6b2c6ae61dd8bn, _C + 'eFreeskateType', 0x4000, ACT_TYPE[act]],
        [0x50d9293b818507ecn, 'Attrib::Gen::ClassRefSpec_map_category', 0x0800, _cr('{slug}dlc_maps')],
        [0xc4b345415e8537ben, 'Attrib::RefSpec', 0x0a00, _arr(24, 8)]]],
      ['challenge_failure_objective', nm, par, 0, [[0x942ab8aee4b414edn, _E + 'Text', 0x4000, _t(nm)]]],
    );
  }
  for (const k of sp.keys) {
    const nm = 'freeskate_dlc_{slug}_' + k;
    out.push(
      ['challenges', nm, s4 + '_freeskate_locations', 0, challengeEntries(nm)],
      ['challenge_global_data', nm, s4 + '_freeskate_locations', 0, [
        [0x6b0bd2bae508b742n, _E + 'Text', 0x4000, _t('ID_MAP_LOCATION_DESC_{SLUG}_' + upper(k))],
        [0xf1c6d5fa4a23951en, _C + 'tLocationID', 0x4000, _t(`freeskate_{slug}_${k}_locator`)],
        [0x50d9293b818507ecn, 'Attrib::Gen::ClassRefSpec_map_category', 0x0800, _cr('{slug}dlc_maps')],
        [0xa6e8924715a15cecn, _C + 'tLocationID', 0x4000, _t(`freeskate_{slug}_${k}_locator`)],
        [0xe2a50788b6c20c92n, _E + 'Text', 0x4000, _t('ID_LOCATION_{SLUG}_' + upper(k))],
        [0x7565cd2a80e93a5en, 'Attrib::Gen::ClassRefSpec_world', 0x0800, _cr(`dist_{slug}_${k}dlc`)]]],
    );
  }
  return out;
}

/** dlc_<s4>_local_data_framework.vlt (4 unserialisable struct values kept as BIN0). */
function framework(): CSpec[] {
  const s4 = 'dlc_{s4}';
  const act = s4 + '_freeskate_activities';
  const i16 = _E + 'Int16';
  return [
    ['challenge_local_data', s4, 'default', 0, [[0x9ddc567540219accn, _E + 'Bool', 0x4000, 0]]],
    ['challenge_local_data', s4 + '_freeskate_locations', s4, 0, [[0x9ddc567540219accn, _E + 'Bool', 0x4000, 0]]],
    ['challenge_local_data', act, s4, 1, [
      [0xa11c61a038b61108n, _E + 'Bool', 0x4000, TRUE],
      [0x91506d129d7148b7n, _E + 'Bool', 0x4000, TRUE],
      [0x7df9623ea16b2932n, _C + 'tSpeechInfo', 0x0000, BIN0],
      [0x48843e3b3e4f7cbfn, _E + 'Bool', 0x4000, TRUE],
      [0x242e4a29261117c8n, i16, 0x4000, 0x50000],
      [0x928f9d693922d585n, _C + 'tHighlightDefinition', 0x0000, BIN0],
      [0xe9d6e1f231d1c3a8n, _E + 'Text', 0x4000, _t('ID_CHALLENGE_CENTRAL_MESSAGE_OBJECTIVE_OBJCOMPLETE')],
      [0x742d630146648434n, i16, 0x4000, 0],
      [0xcb837eef50958fbbn, _E + 'Bool', 0x4000, TRUE],
      [0xf89bfdfc88990f17n, _E + 'Float', 0x4000, 0x43340000],
      [0xc468ed9ce2ff4984n, _E + 'Float', 0x4000, 0x3f800000]]],
    ['challenge_local_data', act + '_gap_tag', act, 0, [[0x242e4a29261117c8n, i16, 0x4000, 0xf0000]]],
    ['challenge_local_data', act + '_accumulation', act, 0, [
      [0xa74fec89c254dc43n, _C + 'eFreeskateAccumulationType', 0x4000, 0],
      [0x242e4a29261117c8n, i16, 0x4000, 0x320000],
      [0xe2210cb6d497fefbn, _E + 'Int32', 0x4000, 0]]],
    ['challenge_local_data', act + '_simultrick', act, 0, [
      [0x242e4a29261117c8n, i16, 0x4000, 0xf0000],
      [0x476fcc173ec88c7dn, _E + 'Float', 0x4000, 0x40000000],
      [0x928f9d693922d585n, _C + 'tHighlightDefinition', 0x0000, BIN0]]],
    ['challenge_local_data', act + '_tricklist', act, 1, [
      [0xa11c61a038b61108n, _E + 'Bool', 0x4000, TRUE],
      [0x91506d129d7148b7n, _E + 'Bool', 0x4000, TRUE],
      [0x48843e3b3e4f7cbfn, _E + 'Bool', 0x4000, TRUE],
      [0x242e4a29261117c8n, i16, 0x4000, 0xa0000],
      [0x928f9d693922d585n, _C + 'tHighlightDefinition', 0x0000, BIN0],
      [0xe9d6e1f231d1c3a8n, _E + 'Text', 0x4000, _t('ID_CHALLENGE_CENTRAL_MESSAGE_OBJECTIVE_OBJCOMPLETE')],
      [0x291d6d1b65aeffd2n, _C + 'tObjectiveStatusField', 0x4000, 8],
      [0xe82a28be11734cfan, _E + 'Bool', 0x4000, TRUE],
      [0x2837e2dd59106c10n, _C + 'tObjectiveStatusField', 0x4000, 6],
      [0x742d630146648434n, i16, 0x4000, 0],
      [0xf89bfdfc88990f17n, _E + 'Float', 0x4000, 0x43960000]]],
    ['challenge_local_data', act + '_survival', act, 0, [
      [0x242e4a29261117c8n, i16, 0x4000, 0xa0000],
      [0xe2210cb6d497fefbn, _E + 'Int32', 0x4000, 0],
      [0x047210029098973cn, _E + 'Int32', 0x4000, 0],
      [0x476fcc173ec88c7dn, _E + 'Float', 0x4000, 0x40000000]]],
  ];
}

// the 4 RefSpecs of every 'world' collection, measured constant in all packs
const WORLD_REFS = '00040004001800009f0d024cd713a9dc316a03931530b5e600000000000000009f0d024cd713a9dc'
  + '647c0aa898f5bfdf00000000000000009f0d024cd713a9dc4630e94e4119a5b6000000000000000'
  + '09f0d024cd713a9dc520c455a5ccd67760000000000000000';

const LUA_FE = 'do\r\n    if( item.ClassKey == Attrib.ClassName.fe_locations ) then\r\n{body}    end\r\n'
  + '    return false;\r\nend;';
const LUA_FE_ITEM = '        if( LocationFilterHelpers.IsLocationInWorld( item, "{world}" ) ) then\r\n'
  + '            return true;\r\n        end\r\n';
const LUA_ONLINE = 'do\r\n\tif( item.ClassKey == Attrib.ClassName.challenges )then\r\n'
  + '\t\tif( item.GlobalData.ChallengeType == Challenge.eChallengeTypes.OnlineFreeSkate )then\r\n'
  + '\t\t\tif( item.GlobalData.World.IsSkatePark == false and (\r\n{body}\r\n'
  + '\t\t\t) )then\r\n\t\t\t\treturn true;\r\n\t\t\tend\r\n\t\tend\r\n\tend\r\n\t\r\n'
  + '\treturn false;\r\nend;';
const LUA_ONLINE_ITEM = '\t\t\t\tLocationFilterHelpers.IsLocationInWorld( item, "{world}" )';

/** LuaState::tCompiledLua (as sk3/vault.py _lua: slots {0: source, 8: ''}). */
function lua(code: string) {
  return _b(zz(8) + code.length.toString(16).padStart(8, '0'), 4, 0, { 0: code, 8: '' });
}

/** dlc_<slug>_minimal.vlt. */
function minimal(sp: SpecCtx): CSpec[] {
  const worlds = sp.keys.map((k) => `dist_{slug}_${k}dlc`);
  const out: CSpec[] = [];
  sp.keys.forEach((k, i) => {
    const w = worlds[i];
    out.push(
      ['world', w, 'default_dlc', 1, [
        [0x942ab8aee4b414edn, _E + 'Text', 0x4000, _t(w)],
        [0x99d6e51c9e20a663n, 'Attrib::RefSpec', 0x0800, R0],
        [0xd076621a896e5bfan, 'Attrib::RefSpec', 0x0a00, _b(WORLD_REFS, 8, 24)],
        [0xb88a4034d63e905en, 'Attrib::Types::Vector2', 0x0000, _b(zz(8), 4)],
        // {ptr -> 'map1024', 0, 0x802, -850, 1050, -1250, 512, 512}: constant in all packs
        [0x20bbc594cd2faef8n, 'Sk8::FE::tMapInfo', 0x0000,
          _b('0000000000000802fffffcae0000041afffffb1e0000020000000200', 4, 0, { 0: 'map1024' })],
        [0x095e1d9778f0c6f4n, _E + 'Text', 0x4000, _t('ID_WORLD_{SLUG}_' + upper(k))],
        [0x50d9293b818507ecn, 'Attrib::Gen::ClassRefSpec_map_category', 0x0800, _cr('{slug}dlc_maps')],
        [0x457c324498c79533n, _E + 'Bool', 0x4000, 0],
        [0x095d7c0ca40a34ean, _E + 'Text', 0x4000, _t('{dist}')],
        [0xc978fe3dbaccbb4an, _E + 'Text', 0x4000, _t('{s4}')],
        [0xc7a0a84f018e87ban, _E + 'Text', 0x4000, _t('world/models/DIST_skybox_downtown')],
        [0x2a0bf629355afb15n, _E + 'Text', 0x4000, _t('world/models/DIST_skybox_downtown_Textures')],
        [0x295c85d2b2997ed3n, _E + 'Text', 0x4000, _t('world{dist}.big')],
        [0x2a655e8a29c1f642n, _E + 'Text', 0x4000, _t('{dist}')]]],
      ['worldpainter_fe_location_triggers', w, 'default_dlc', 0, [], _b(zz(4), 4)],
      ['aud_worlddata', w, 'default', 0, [
        [0x65fa976ef23a314en, _E + 'Text', 0x0200, _arr(4, 4)],
        [0x6e7e3bd211d61f25n, 'Attrib::RefSpec', 0x0800, R0]]],
      ['aud_bigfiles', w, 'default', 0, [
        [0x16cec9e052a8b9ban, _E + 'Text', 0x4000, _t('data/audio/english/')],
        [0x12dfb2bdd9356640n, _E + 'Text', 0x4000, _t('')],
        [0x1179ae4eb7022f99n, _E + 'Text', 0x4000, _t('')],
        [0xcbdf09a8387553e2n, _E + 'Text', 0x4000, _t('')],
        [0xdab4f65f7d523075n, _E + 'Bool', 0x4000, 0],
        [0x83a22dd9978c45dcn, _E + 'Bool', 0x4000, 0],
        [0x3c336b8972f26c0fn, _E + 'Int32', 0x4000, 0]]],
    );
  });
  out.push(
    ['map_category', '{slug}dlc', 'world', 0, [
      [0x942ab8aee4b414edn, _E + 'Text', 0x4000, _t('{slug}dlc')],
      [0x465698dd3cc73ca2n, _E + 'Text', 0x4000, _t('ID_MAP_CATEGORY_{SLUG}')],
      [0x1349bb6ec1d1e751n, _E + 'Int32', 0x4000, 0x4e20]]],
    ['map_category', '{slug}dlc_maps', '{slug}dlc', 0, [
      [0x942ab8aee4b414edn, _E + 'Text', 0x4000, _t('{slug}dlc_maps')],
      [0x465698dd3cc73ca2n, _E + 'Text', 0x4000, _t('ID_MAP_SECTION_{SLUG}_MAPS')],
      [0x1349bb6ec1d1e751n, _E + 'Int32', 0x4000, 0x4e84]]],
  );
  sp.keys.forEach((k, i) => {
    const w = worlds[i];
    const lay = _b(zz(12), 4, 0, { 0: w, 4: `Z_{slug}_${k}_Start`, 8: 'ID_LOCATION_{SLUG}_' + upper(k) });
    out.push(['fe_locations', w, 'default_dlc', 0, [
      [0x6b0bd2bae508b742n, _E + 'Text', 0x4000, _t('ID_MAP_LOCATION_DESC_{SLUG}_' + upper(k))],
      [0x786a2d24f475342bn, _E + 'Text', 0x4000, _t('')],
      [0x50d9293b818507ecn, 'Attrib::Gen::ClassRefSpec_map_category', 0x0800, _cr('{slug}dlc_maps')],
      [0x90e678b6961730e1n, _E + 'Bool', 0x4000, TRUE],
      [0x7565cd2a80e93a5en, 'Attrib::Gen::ClassRefSpec_world', 0x0800, _cr(w)]], lay]);
  });
  const wn = worlds.map((w) => sp.fmt(w));
  const fe = LUA_FE.replace('{body}', () => wn.map((w) => LUA_FE_ITEM.split('{world}').join(w)).join(''));
  const onl = LUA_ONLINE.replace('{body}', () => wn.map((w) => LUA_ONLINE_ITEM.split('{world}').join(w)).join(' or\r\n'));
  out.push(
    ['map_filter', '{slug}dlc', 'default_dlc', 0, [
      [0x942ab8aee4b414edn, _E + 'Text', 0x4000, _t('{slug}dlc')],
      [0x5fbb2c3f59fc6f1an, _E + 'Text', 0x4000, _t('ID_MAP_HELPER_{SLUG}')],
      [0x5604268225257009n, 'LuaState::tCompiledLua', 0x0000, ['LUA', fe]],
      [0x6766efd84d74f4f0n, _E + 'Text', 0x4000, _t('ID_MAP_CATEGORY_{SLUG}')]]],
    ['map_filter', 'freeskate_locations_{slug}dlc', 'freeskate_locations', 0, [
      [0x942ab8aee4b414edn, _E + 'Text', 0x4000, _t('freeskate_locations_{slug}dlc')],
      [0x5fbb2c3f59fc6f1an, _E + 'Text', 0x4000, _t('ID_MAP_HELPER_{SLUG}')],
      [0x5604268225257009n, 'LuaState::tCompiledLua', 0x0000, ['LUA', onl]],
      [0x6766efd84d74f4f0n, _E + 'Text', 0x4000, _t('ID_MAP_CATEGORY_{SLUG}')]]],
    ['map_listing', 'progression_locations_dlc_{slug}', 'progression_locations', 0, [
      [0xe0762ea3f90c9eebn, 'Attrib::RefSpec', 0x0800, _r('map_filter', '{slug}dlc')],
      [0x982bd1eae2334504n, _E + 'Int16', 0x4000, 0x70000]]],
    ['dlc_mapping', 'pack_{slug}', 'default', 0, [
      [0x481d3fe849c4d988n, _E + 'UInt16', 0x0200, _b('0001000100020000000b', 4, 2)],
      [0xb080be5f9f596243n, 'Sk8::BE::tUnlockableItemInfo', 0x0200, _arr(8, 4)],
      [0xad4e064704b8f1a9n, _E + 'Text', 0x4000, _t('{product}')],
      [0xc90d657030918fdbn, 'Sk8::BE::tUnlockableItemInfo', 0x0200, _arr(8, 4)],
      [0x2bdfe21a12094b1dn, 'Sk8::BE::tUnlockableItemInfo', 0x0200, _arr(8, 4)]]],
    ['progression_summary_group', 'dlc_{slug}', 'default', 0, []],
  );
  for (const k of sp.keys) {
    out.push(['progression_summary_group', `{slug}_${k}_dlc`, 'dlc_{slug}', 0, [
      [0x4acbee23f4d5a7b5n, 'Attrib::Gen::ClassRefSpec_progression_group', 0x0a00, _arr(16, 8)],
      [0x692f97ff95563bb4n, _E + 'Int16', 0x4000, 0xe0000],
      [0x786255b8ff426a3dn, 'Attrib::Gen::ClassRefSpec_fe_map_icons', 0x0800, _cr('teleport')],
      [0xe2a50788b6c20c92n, _E + 'Text', 0x4000, _t(`ID_DLC_{SLUG}_${upper(k)}_SUMMARY_TITLE`)]]]);
  }
  out.push(['map_listing', 'online_freeskate_{slug}dlc', 'online_freeskate', 0, [
    [0xe0762ea3f90c9eebn, 'Attrib::RefSpec', 0x0800, _r('map_filter', 'freeskate_locations_{slug}dlc')],
    [0x982bd1eae2334504n, _E + 'Int16', 0x4000, 0xb0000]]]);
  return out;
}

// the milestone reward's collection name is not known, so new packs use ours
export const MILESTONE_NAME = 'dlc_{s4}_milestone_01';

function progressionbank(milestone: string | null): CSpec[] {
  const s4 = 'dlc_{s4}';
  const T_ = _E + 'Text';
  return [
    ['progression_state', 'default', null, 0, [
      [0x9c374581090b6c85n, _C + 'tChallengePresentationEvent', 0x0200, _arr(16, 4)]]],
    ['progression_handler', 'default', null, 0, [[0xc3cd4b4183274819n, 'Attrib::Blob', 0x0000, _b('000000fa00000000', 4)]]],
    ['progression_rewards', 'default', null, 1, [
      [0x3dbc2f9c0083df86n, 'Sk8::BE::eUNLOCK_CATEGORY', 0x4000, 0xc],
      [0x8915e3fcb76529ban, T_, 0x4000, _t('none')],
      [0xec2ed691df1c9f4cn, T_, 0x4000, _t('#Description HAL ID')],
      [0xaa753a536859233dn, T_, 0x4000, _t('#MISSING HALID')],
      [0x786255b8ff426a3dn, T_, 0x4000, _t('missingtexture')],
      [0xf950c13d02f83230n, 'Sk8::Audio::eSk8Characters', 0x4000, 0x68],
      [0xcbd4a095bed89d19n, _E + 'Int32', 0x4000, 0]]],
    ['progression_stategraph', 'default', null, 0, [[0x942ab8aee4b414edn, T_, 0x4000, _t('default')]]],
    ['progression_action', 'default', null, 0, [
      [0x942ab8aee4b414edn, T_, 0x4000, _t('default')],
      [0xec7a860a5187b15dn, _E + 'Bool', 0x4000, 0]]],
    ['progression_group', 'default', null, 0, [[0x942ab8aee4b414edn, T_, 0x4000, _t('default')]]],
    ['progression_state', s4, 'default', 0, []],
    ['progression_handler', s4, 'default', 0, []],
    ['progression_rewards', s4, 'default', 0, []],
    ['progression_stategraph', s4, 'default', 0, [[0x942ab8aee4b414edn, T_, 0x4000, _t(s4)]]],
    ['progression_action', s4, 'default', 0, [[0x942ab8aee4b414edn, T_, 0x4000, _t(s4)]]],
    ['progression_group', s4, 'default', 0, [[0x942ab8aee4b414edn, T_, 0x4000, _t(s4)]]],
    ['progression_rewards', s4 + '_challenges', s4, 0, []],
    ['progression_rewards', s4 + '_ots_unlock', s4 + '_challenges', 0, [
      [0xaa753a536859233dn, T_, 0x4000, _t('ID_DLC_{S4}_OTS_UNLOCK')],
      [0x786255b8ff426a3dn, T_, 0x4000, _t('fe\\source\\images\\unlocks\\unlock_challenge_spot')],
      [0xe373a52fb7d81920n, _E + 'Bool', 0x4000, TRUE]]],
    ['progression_rewards', s4 + '_milestones', s4, 0, []],
    ['progression_rewards', milestone || MILESTONE_NAME, s4 + '_milestones', 0, [
      [0x3dbc2f9c0083df86n, 'Sk8::BE::eUNLOCK_CATEGORY', 0x4000, 0xc],
      [0x8915e3fcb76529ban, T_, 0x4000, _t('milestone_placeholder')],
      [0xec2ed691df1c9f4cn, T_, 0x4000, _t('ID_DLC_{S4}_MILESTONE_1_DESC')],
      [0xaa753a536859233dn, T_, 0x4000, _t('ID_DLC_{S4}_MILESTONE_1_TITLE')],
      [0x786255b8ff426a3dn, T_, 0x4000, _t('fe\\source\\images\\unlocks\\unlock_milestone1')],
      [0xe373a52fb7d81920n, _E + 'Bool', 0x4000, 0]]],
  ];
}

function value(sp: SpecCtx, v: VSpec): Value {
  if (typeof v === 'number' || v === BIN0) return v;
  switch (v[0]) {
    case 'T': return new Text(sp.fmt(v[1]));
    case 'R': return new Blob(new ByteWriter(24).u64(attribKey(v[1]), attribKey(sp.fmt(v[2]))).zeros(8).finish(), 8);
    case 'VR': return new Blob(new ByteWriter(32).u64(attribKey(v[1]), attribKey(sp.fmt(v[2]))).zeros(16).finish(), 8,
      new Map([[24, new Text('')]]));
    case 'CR': return new Blob(new ByteWriter(16).u64(attribKey(sp.fmt(v[1]))).zeros(8).finish(), 8);
    case 'LUA': return value(sp, lua(v[1]));
    case 'B': {
      const [, hexs, align, es, strs] = v;
      const m = new Map<number, Text>();
      for (const [o, t] of Object.entries(strs)) m.set(Number(o), new Text(t.includes('{') ? sp.fmt(t) : t));
      return new Blob(fromHex(hexs.split(' ').join('')), align, m, es);
    }
  }
  throw new Error('bad value spec');
}

/** EA's type list: static-field types, then entry types in first-use order, padded to even. */
function typesOf(cls: string, entries: readonly ESpec[]): [bigint[], bigint[]] {
  const t: bigint[] = [];
  for (const name of [...(STATIC[cls]?.[0] ?? []), ...entries.map((e) => e[1])]) {
    const k = attribKey(name);
    if (!t.includes(k)) t.push(k);
  }
  return [t, [...t, ...new Array<bigint>(t.length % 2).fill(0n)]];
}

function collection(sp: SpecCtx, spec: CSpec): Collection {
  const [cls, name, parent, w1c, entries] = spec;
  let layout: VSpec | undefined = spec.length > 5 ? spec[5] : undefined;
  if (layout === undefined && cls in STATIC) layout = _b(zz(STATIC[cls][1]), 4);
  const nm = sp.fmt(name);
  const [used, types] = typesOf(cls, entries);
  const lv = layout !== undefined ? value(sp, layout) : null;
  return {
    kind: 'collection', key: attribKey(nm), cls: attribKey(cls), parent: parent ? attribKey(sp.fmt(parent)) : 0n,
    entries: entries.map(([k, t, fl, v]) => ({ key: k, type: attribKey(t), flags: fl, value: value(sp, v) })),
    types, ntypes: used.length, capacity: entries.length, w1c, layout: lv instanceof Blob ? lv : null, w2c: 0,
    eid: attribKey(`${cls}/${nm}`),
  };
}

/** Every data/db/ file of a single-world DLC pack: {path under data/db/: bytes}.
 *  slug: pack slug; keys: location keys (keys[0] = main location); dist: DIST name. */
export function dlcVaults(slug: string, keys: readonly string[], dist: string, version: bigint = VERSION_PACK,
  milestone: string | null = null): Map<string, Uint8Array> {
  const sp = new SpecCtx(slug, keys, dist);
  const s4 = sp.s4;
  const out = new Map<string, Uint8Array>();
  const vault = (path: string, specs: readonly CSpec[]) => {
    const stem = path.slice(path.lastIndexOf('/') + 1);
    const db: Database = { vltName: stem + '.vlt', binName: stem + '.bin', items: specs.map((x) => collection(sp, x)), version };
    const [v, b] = encode(db);
    out.set(path + '.vlt', v); out.set(path + '.bin', b); out.set(path + '.opt', OPT);
  };
  for (const nm of [`dlc_${s4}_freeskate_activities`, ...ACTIVITIES.map((a) => `dlc_${s4}_freeskate_activities_${a}`),
    `dlc_${s4}_freeskate_locations`]) {
    vault('challenge_local_data/' + nm, [['challenge_local_data', 'default', null, 2, CLD_DEFAULT, _b('00000028', 4)]]);
  }
  for (const k of keys) {
    const nm = `freeskate_dlc_${slug}_${k}`;
    vault('challenge_local_data/' + nm, [['challenge_local_data', nm, 'dlc_{s4}_freeskate_locations', 0, []]]);
  }
  vault(`challengebanks/dlc_${s4}`, challengebank(sp));
  vault(`progressionbanks/dlc_${s4}`, progressionbank(milestone));
  vault(`dlc_${s4}_local_data_framework`, framework());
  vault(`dlc_${slug}_minimal`, minimal(sp));
  out.set(`dlc_${slug}_minimal.vaultlist.xml`, vaultList([`dlc_${slug}_minimal.vlt`, `dlc_${s4}_local_data_framework.vlt`,
    `challengebanks\\dlc_${s4}.vlt`, `progressionbanks\\dlc_${s4}.vlt`]));
  return out;
}

/** `<slug>.vaultlist.xml`: the vaults the game loads directly (CRLF, 2-space indent). */
export function vaultList(files: readonly string[]): Uint8Array {
  const s = ['<?xml version="1.0" encoding="utf-8"?>', '<VaultList>', ...files.map((f) => `  <VaultFile>${f}</VaultFile>`),
    '</VaultList>', ''];
  return ascii(s.join('\r\n'));
}
