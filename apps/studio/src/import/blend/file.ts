// Low-level .blend container: header, compression, file blocks (BHead), SDNA and a
// struct view that reads fields by name. Pure TS (runs in a Web Worker).
//
// Layouts handled:
//   legacy header  "BLENDER" + '_'|'-' (4/8-byte pointers) + 'v'|'V' (endianness) + "405"
//     BHead4      { int code, len; uint old;     int SDNAnr, nr; }           20 bytes
//     SmallBHead8 { int code, len; uint64 old;   int SDNAnr, nr; }           24 bytes
//   Blender 5.x  "BLENDER17-01v0500" (17 bytes: header size, format version 01, version)
//     LargeBHead8 { int code, SDNAnr; uint64 old; int64 len, nr; }           32 bytes
// Compression: zstd (Blender >= 3.0, multi-frame) and gzip (older).

import { gunzipSync } from 'fflate';
import { decompress as zstdDecompress } from 'fzstd';

export interface BHead {
  /** Block code, NULs stripped: "OB", "ME", "DATA", "DNA1", "ENDB", ... */
  code: string;
  sdna: number;
  /** Old memory address the block had when written (the key pointers refer to). */
  old: number;
  len: number;
  nr: number;
  /** Absolute offset of the block's data in `BlendFile.bytes`. */
  offset: number;
  /** Index of the ID block this block belongs to (itself for ID blocks), -1 before the first ID. */
  owner: number;
  index: number;
}

export interface DnaField {
  /** Bare member name: "*next" -> "next", "name[64]" -> "name", "(*func)()" -> "func". */
  name: string;
  /** Raw member name as stored in SDNA. */
  raw: string;
  type: string;
  offset: number;
  size: number;
  isPtr: boolean;
  /** Array dimensions, [] for scalars. */
  dims: number[];
  /** Element count (product of dims, 1 for scalars). */
  count: number;
  /** Size of one element (pointer size for pointers). */
  elemSize: number;
}

export interface DnaStruct {
  index: number;
  type: string;
  size: number;
  fields: DnaField[];
  byName: Map<string, DnaField>;
}

export class BlendError extends Error {}

const FLOAT_TYPES = new Set(['float', 'double']);
const UNSIGNED_TYPES = new Set(['char', 'uchar', 'ushort', 'uint', 'ulong', 'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t', 'bool']);

const td = new TextDecoder('utf-8', { fatal: false });
const latin1 = new TextDecoder('latin1');

export function decompressBlend(input: Uint8Array): Uint8Array {
  if (input.length >= 4 && input[0] === 0x28 && input[1] === 0xb5 && input[2] === 0x2f && input[3] === 0xfd) {
    return zstdDecompress(input);
  }
  if (input.length >= 2 && input[0] === 0x1f && input[1] === 0x8b) return gunzipSync(input);
  return input;
}

function parseMemberName(raw: string): { name: string; isPtr: boolean; isFunc: boolean; dims: number[] } {
  const isFunc = raw.includes('(');
  const isPtr = raw.includes('*');
  const m = /[A-Za-z_][A-Za-z0-9_]*/.exec(raw);
  const name = m ? m[0] : raw;
  const dims: number[] = [];
  const re = /\[(\d+)\]/g;
  let d: RegExpExecArray | null;
  while ((d = re.exec(raw))) dims.push(parseInt(d[1], 10));
  return { name, isPtr, isFunc, dims };
}

export class BlendFile {
  readonly bytes: Uint8Array;
  readonly dv: DataView;
  readonly le: boolean;
  readonly ptrSize: 4 | 8;
  /** File version as stored in the header, e.g. 405 or 500. */
  readonly fileVersion: number;
  /** 0 = legacy header, 1 = Blender 5.x large header. */
  readonly formatVersion: number;
  readonly blocks: BHead[] = [];
  readonly structs: DnaStruct[] = [];
  readonly types: string[] = [];
  readonly typeSizes: number[] = [];
  readonly structByType = new Map<string, DnaStruct>();
  /** Old pointer -> ID block (global) and first DATA block with that pointer. */
  private readonly global = new Map<number, BHead>();
  /** Per owning ID: old pointer -> DATA block. */
  private readonly scoped = new Map<number, Map<number, BHead>>();
  private sortedStarts: BHead[] | null = null;

  constructor(input: Uint8Array) {
    const bytes = decompressBlend(input);
    this.bytes = bytes;
    this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 12 || latin1.decode(bytes.subarray(0, 7)) !== 'BLENDER') {
      throw new BlendError('Not a .blend file (missing BLENDER header)');
    }
    const c7 = String.fromCharCode(bytes[7]);
    let pos: number;
    let headType: 'b4' | 's8' | 'l8';
    if (c7 === '_' || c7 === '-') {
      this.ptrSize = c7 === '_' ? 4 : 8;
      const e = String.fromCharCode(bytes[8]);
      if (e !== 'v' && e !== 'V') throw new BlendError('Bad endianness byte in .blend header');
      this.le = e === 'v';
      this.fileVersion = parseInt(latin1.decode(bytes.subarray(9, 12)), 10);
      this.formatVersion = 0;
      pos = 12;
      headType = this.ptrSize === 4 ? 'b4' : 's8';
    } else {
      const hdr = latin1.decode(bytes.subarray(0, Math.min(17, bytes.length)));
      const m = /^BLENDER(\d\d)-(\d\d)v(\d{4})$/.exec(hdr);
      if (!m || parseInt(m[1], 10) !== 17) throw new BlendError(`Unsupported .blend header "${hdr}"`);
      this.formatVersion = parseInt(m[2], 10);
      if (this.formatVersion !== 1) throw new BlendError(`Unsupported .blend format version ${this.formatVersion}`);
      this.ptrSize = 8;
      this.le = true;
      this.fileVersion = parseInt(m[3], 10);
      pos = 17;
      headType = 'l8';
    }
    if (!Number.isFinite(this.fileVersion)) throw new BlendError('Bad version in .blend header');
    this.readBlocks(pos, headType);
    const dna = this.blocks.find((b) => b.code === 'DNA1');
    if (!dna) throw new BlendError('.blend file has no DNA1 block');
    this.parseSdna(dna.offset, dna.offset + dna.len);
  }

  /** "4.5", "2.93", "5.0". */
  get versionString(): string {
    return `${Math.floor(this.fileVersion / 100)}.${this.fileVersion % 100}`;
  }

  // ---- primitive reads ----
  u8(o: number): number { return this.bytes[o]; }
  i8(o: number): number { return this.dv.getInt8(o); }
  i16(o: number): number { return this.dv.getInt16(o, this.le); }
  u16(o: number): number { return this.dv.getUint16(o, this.le); }
  i32(o: number): number { return this.dv.getInt32(o, this.le); }
  u32(o: number): number { return this.dv.getUint32(o, this.le); }
  f32(o: number): number { return this.dv.getFloat32(o, this.le); }
  f64(o: number): number { return this.dv.getFloat64(o, this.le); }
  i64(o: number): number {
    const lo = this.dv.getUint32(o + (this.le ? 0 : 4), this.le);
    const hi = this.dv.getInt32(o + (this.le ? 4 : 0), this.le);
    return hi * 4294967296 + lo;
  }
  u64(o: number): number {
    const lo = this.dv.getUint32(o + (this.le ? 0 : 4), this.le);
    const hi = this.dv.getUint32(o + (this.le ? 4 : 0), this.le);
    return hi * 4294967296 + lo;
  }
  /**
   * Reads a pointer as a JS number. Real addresses (older files) stay below 2^53 and are
   * returned exactly; Blender 5.x writes 64-bit hashed ids instead, which are interned to
   * unique negative numbers so they stay lossless map keys.
   */
  ptr(o: number): number {
    if (this.ptrSize === 4) return this.u32(o);
    const lo = this.dv.getUint32(o + (this.le ? 0 : 4), this.le);
    const hi = this.dv.getUint32(o + (this.le ? 4 : 0), this.le);
    if (hi < 0x200000) return hi * 4294967296 + lo;
    const key = hi * 4294967296 + lo; // lossy, only used as the first-level key
    let bucket = this.wide.get(key);
    if (!bucket) this.wide.set(key, (bucket = []));
    for (const e of bucket) if (e[0] === hi && e[1] === lo) return e[2];
    const id = -(++this.wideCount);
    bucket.push([hi, lo, id]);
    return id;
  }
  private readonly wide = new Map<number, Array<[number, number, number]>>();
  private wideCount = 0;
  cstr(o: number, max: number): string {
    let end = o;
    const lim = Math.min(this.bytes.length, o + max);
    while (end < lim && this.bytes[end] !== 0) end++;
    return td.decode(this.bytes.subarray(o, end));
  }

  private readBlocks(start: number, type: 'b4' | 's8' | 'l8'): void {
    let pos = start;
    let owner = -1;
    const n = this.bytes.length;
    const headSize = type === 'b4' ? 20 : type === 's8' ? 24 : 32;
    while (pos + 4 <= n) {
      const code = latin1.decode(this.bytes.subarray(pos, pos + 4)).replace(/\0+$/, '');
      if (code === 'ENDB') break;
      if (pos + headSize > n) throw new BlendError('Truncated .blend block header');
      let len: number, old: number, sdna: number, nr: number;
      if (type === 'b4') {
        len = this.i32(pos + 4); old = this.u32(pos + 8); sdna = this.i32(pos + 12); nr = this.i32(pos + 16);
      } else if (type === 's8') {
        len = this.i32(pos + 4); old = this.ptr(pos + 8); sdna = this.i32(pos + 16); nr = this.i32(pos + 20);
      } else {
        sdna = this.i32(pos + 4); old = this.ptr(pos + 8); len = this.i64(pos + 16); nr = this.i64(pos + 24);
      }
      const offset = pos + headSize;
      if (len < 0 || offset + len > n) throw new BlendError(`Corrupt .blend block "${code}"`);
      const index = this.blocks.length;
      const isId = code !== 'DATA' && code !== 'DNA1' && code !== 'REND' && code !== 'TEST' && code !== 'GLOB' && code !== 'USER';
      if (isId) owner = index;
      const b: BHead = { code, sdna, old, len, nr, offset, owner: code === 'DATA' ? owner : (isId ? index : -1), index };
      this.blocks.push(b);
      if (old !== 0) {
        if (code === 'DATA' && owner >= 0) {
          let m = this.scoped.get(owner);
          if (!m) this.scoped.set(owner, (m = new Map()));
          if (!m.has(old)) m.set(old, b);
          if (!this.global.has(old)) this.global.set(old, b);
        } else if (isId) {
          this.global.set(old, b);
        } else if (!this.global.has(old)) {
          this.global.set(old, b);
        }
      }
      pos = offset + len;
    }
  }

  private parseSdna(start: number, end: number): void {
    let p = start;
    const tag = () => latin1.decode(this.bytes.subarray(p, p + 4));
    const align4 = () => { p = start + ((p - start + 3) & ~3); };
    const readStrings = (count: number): string[] => {
      const out: string[] = new Array(count);
      for (let i = 0; i < count; i++) {
        let e = p;
        while (e < end && this.bytes[e] !== 0) e++;
        out[i] = latin1.decode(this.bytes.subarray(p, e));
        p = e + 1;
      }
      return out;
    };
    if (tag() !== 'SDNA') throw new BlendError('Bad SDNA block');
    p += 4;
    if (tag() !== 'NAME') throw new BlendError('Bad SDNA NAME');
    p += 4;
    const names = readStrings(this.i32((p += 4) - 4));
    align4();
    if (tag() !== 'TYPE') throw new BlendError('Bad SDNA TYPE');
    p += 4;
    const types = readStrings(this.i32((p += 4) - 4));
    align4();
    if (tag() !== 'TLEN') throw new BlendError('Bad SDNA TLEN');
    p += 4;
    for (let i = 0; i < types.length; i++) { this.typeSizes.push(this.u16(p)); p += 2; }
    align4();
    if (tag() !== 'STRC') throw new BlendError('Bad SDNA STRC');
    p += 4;
    const nStructs = this.i32(p); p += 4;
    this.types.push(...types);
    // The "float gravity [3]" legacy parse quirk (see dna_genfile.cc).
    for (let i = 1; i < names.length; i++) if (names[i] === '[3]' && names[i - 1] === 'Cvi') names[i] = 'gravity[3]';
    for (let s = 0; s < nStructs; s++) {
      const typeIdx = this.i16(p); const nFields = this.i16(p + 2); p += 4;
      const fields: DnaField[] = [];
      const byName = new Map<string, DnaField>();
      let off = 0;
      for (let f = 0; f < nFields; f++) {
        const ft = this.i16(p); const fn = this.i16(p + 2); p += 4;
        const raw = names[fn];
        const pm = parseMemberName(raw);
        const isPtr = pm.isPtr || pm.isFunc;
        const count = pm.dims.reduce((a, b) => a * b, 1);
        const elemSize = isPtr ? this.ptrSize : this.typeSizes[ft];
        const field: DnaField = { name: pm.name, raw, type: types[ft], offset: off, size: elemSize * count, isPtr, dims: pm.dims, count, elemSize };
        fields.push(field);
        if (!byName.has(pm.name)) byName.set(pm.name, field);
        off += field.size;
      }
      const st: DnaStruct = { index: s, type: types[typeIdx], size: this.typeSizes[typeIdx], fields, byName };
      this.structs.push(st);
      this.structByType.set(st.type, st);
    }
  }

  // ---- pointer resolution ----

  /** Finds the block an old pointer refers to, preferring blocks owned by `scope` (an ID block index). */
  resolve(ptr: number, scope = -1): { block: BHead; offset: number } | null {
    if (!ptr) return null;
    const s = scope >= 0 ? this.scoped.get(scope)?.get(ptr) : undefined;
    const b = s ?? this.global.get(ptr);
    if (b) return { block: b, offset: b.offset };
    // Pointer into the middle of a block (rare: e.g. an element of an array).
    if (ptr < 0) return null; // hashed ids have no address arithmetic
    if (!this.sortedStarts) this.sortedStarts = this.blocks.filter((x) => x.old > 0).sort((a, b) => a.old - b.old);
    const arr = this.sortedStarts;
    let lo = 0, hi = arr.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].old <= ptr) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (best >= 0) {
      const cand = arr[best];
      const d = ptr - cand.old;
      if (d < cand.len) return { block: cand, offset: cand.offset + d };
    }
    return null;
  }

  block(ptr: number, scope = -1): BHead | null { return this.resolve(ptr, scope)?.block ?? null; }

  /** Raw bytes a pointer refers to, through the end of its block. */
  data(ptr: number, scope = -1): Uint8Array | null {
    const r = this.resolve(ptr, scope);
    if (!r) return null;
    return this.bytes.subarray(r.offset, r.block.offset + r.block.len);
  }

  struct(type: string): DnaStruct | undefined { return this.structByType.get(type); }

  /** View of a block's first struct (using the block's SDNA type unless `type` is given). */
  viewBlock(b: BHead, type?: string, offset = b.offset): StructView | null {
    const st = type ? this.structByType.get(type) : this.structs[b.sdna];
    if (!st) return null;
    return new StructView(this, st, offset, b.owner >= 0 ? b.owner : b.index);
  }

  /** View of the struct a pointer refers to. */
  view(ptr: number, scope = -1, type?: string): StructView | null {
    const r = this.resolve(ptr, scope);
    if (!r) return null;
    // Prefer the block's own SDNA struct when it matches (or no type is known).
    const own = this.structs[r.block.sdna];
    const st = type ? (own && own.type === type ? own : this.structByType.get(type)) : own;
    if (!st) return null;
    const owner = r.block.owner >= 0 ? r.block.owner : r.block.index;
    const v = new StructView(this, st, r.offset, owner);
    v.addr = ptr;
    return v;
  }

  /** Array of `count` pointers stored at `ptr`. */
  ptrArray(ptr: number, count: number, scope = -1): number[] {
    const r = this.resolve(ptr, scope);
    if (!r) return [];
    const out: number[] = [];
    const end = r.block.offset + r.block.len;
    for (let i = 0; i < count && r.offset + (i + 1) * this.ptrSize <= end; i++) out.push(this.ptr(r.offset + i * this.ptrSize));
    return out;
  }

  /** Walks a ListBase-style linked list (each element starts with a `next` pointer). */
  list(first: number, scope: number, type?: string, limit = 1_000_000): StructView[] {
    const out: StructView[] = [];
    const seen = new Set<number>();
    let p = first;
    while (p && !seen.has(p) && out.length < limit) {
      seen.add(p);
      const v = this.view(p, scope, type);
      if (!v) break;
      out.push(v);
      p = this.ptr(v.offset);
    }
    return out;
  }

  /** Blocks whose code is `code` (ID blocks: "OB", "ME", "MA", ...). */
  idBlocks(code: string): BHead[] { return this.blocks.filter((b) => b.code === code); }
}

/** Reads one struct instance in the file by member name. */
export class StructView {
  /** Old pointer this view was reached through (0 when unknown). */
  addr = 0;
  constructor(readonly file: BlendFile, readonly def: DnaStruct, readonly offset: number, readonly scope: number) {}

  get type(): string { return this.def.type; }

  field(name: string | string[]): DnaField | undefined {
    if (typeof name === 'string') return this.def.byName.get(name);
    for (const n of name) { const f = this.def.byName.get(n); if (f) return f; }
    return undefined;
  }

  has(name: string | string[]): boolean { return this.field(name) !== undefined; }

  private readNum(f: DnaField, o: number): number {
    const F = this.file;
    if (f.isPtr) return F.ptr(o);
    if (FLOAT_TYPES.has(f.type)) return f.elemSize === 8 ? F.f64(o) : F.f32(o);
    const unsigned = UNSIGNED_TYPES.has(f.type);
    switch (f.elemSize) {
      case 1: return unsigned ? F.u8(o) : F.i8(o);
      case 2: return unsigned ? F.u16(o) : F.i16(o);
      case 4: return unsigned ? F.u32(o) : F.i32(o);
      case 8: return unsigned ? F.u64(o) : F.i64(o);
      default: return 0;
    }
  }

  /** Numeric member (element `i` of an array member). Missing members give `def`. */
  num(name: string | string[], def = 0, i = 0): number {
    const f = this.field(name);
    if (!f || i >= f.count) return def;
    return this.readNum(f, this.offset + f.offset + i * f.elemSize);
  }

  /** All elements of a numeric array member, flattened. */
  nums(name: string | string[]): number[] {
    const f = this.field(name);
    if (!f) return [];
    const out: number[] = [];
    for (let i = 0; i < f.count; i++) out.push(this.readNum(f, this.offset + f.offset + i * f.elemSize));
    return out;
  }

  ptr(name: string | string[], i = 0): number {
    const f = this.field(name);
    if (!f || !f.isPtr || i >= f.count) return 0;
    return this.file.ptr(this.offset + f.offset + i * f.elemSize);
  }

  /** char[N] member as a string. */
  str(name: string | string[]): string {
    const f = this.field(name);
    if (!f) return '';
    if (f.isPtr) return this.derefString(name);
    return this.file.cstr(this.offset + f.offset, f.size);
  }

  /** `char *` member pointing at a NUL-terminated string block. */
  derefString(name: string | string[]): string {
    const p = this.ptr(name);
    if (!p) return '';
    const r = this.file.resolve(p, this.scope);
    if (!r) return '';
    return this.file.cstr(r.offset, r.block.offset + r.block.len - r.offset);
  }

  /** Embedded (non-pointer) struct member. */
  sub(name: string | string[]): StructView | null {
    const f = this.field(name);
    if (!f || f.isPtr) return null;
    const st = this.file.struct(f.type);
    if (!st) return null;
    return new StructView(this.file, st, this.offset + f.offset, this.scope);
  }

  /** Struct a pointer member refers to. */
  deref(name: string | string[], type?: string): StructView | null {
    const f = this.field(name);
    if (!f || !f.isPtr) return null;
    const p = this.file.ptr(this.offset + f.offset);
    const t = type ?? (this.file.struct(f.type) ? f.type : undefined);
    return this.file.view(p, this.scope, t);
  }

  /** `first` pointer of a ListBase member (works whatever the ListBase type is called). */
  listFirst(name: string | string[]): number {
    const f = this.field(name);
    if (!f) return 0;
    return this.file.ptr(this.offset + f.offset);
  }

  /** Elements of a ListBase member. */
  list(name: string | string[], type?: string): StructView[] {
    return this.file.list(this.listFirst(name), this.scope, type);
  }

  /** Absolute byte offset of a member. */
  at(name: string | string[]): number {
    const f = this.field(name);
    return f ? this.offset + f.offset : -1;
  }
}
