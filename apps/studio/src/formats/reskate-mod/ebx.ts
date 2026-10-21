// SPDX-License-Identifier: GPL-3.0-or-later
// skate. RIFF EBX partitions, read through their own RFL2 reflection (port of skate4to3/sk4/ebx.py).
// Chunks: EBXD (instance data, offsets relative to the payload rounded up to 16), EFIX (fixups),
// RFL2 (types/fields/enums/names). Pointer, CString and array fields hold a SIGNED int32 self-relative
// offset in the low half of 8 bytes; an odd pointer is an import, index = v >> 1.

import { hex } from './frostbite.ts';

const K_INHERITED = 0, K_STRUCT = 2, K_POINTER = 3, K_CSTRING = 7, K_ENUM = 8, K_GUID = 21, K_SHA1 = 22, K_RESREF = 23;
const ARRAY = 0x08;
const PRIM: Record<number, number> = { 10: 1, 11: 1, 12: 1, 13: 2, 14: 2, 15: 4, 16: 4, 17: 8, 18: 8, 19: 4, 20: 8 };
const SCALAR_SIZE: Record<number, number> = { [K_POINTER]: 8, [K_CSTRING]: 8, [K_ENUM]: 4, [K_GUID]: 16, [K_SHA1]: 20, [K_RESREF]: 8 };

/** Reference into another partition. */
export interface EbxImport { $import: true; partition: string; instance: string }
/** Reference to an instance inside this partition (index into `instances`). */
export interface EbxRef { $ref: number }
export type EbxValue = number | bigint | boolean | string | null | EbxImport | EbxRef | EbxValue[] | { [k: string]: EbxValue };
export type EbxObject = { [k: string]: EbxValue };

export const isImport = (v: unknown): v is EbxImport => !!v && typeof v === 'object' && (v as EbxImport).$import === true;

type TypeRow = [nameHash: number, fieldStart: number, fieldCount: number, flags: number, size: number, align: number];
type FieldRow = [nameHash: number, offset: number, flags: number, typeRef: number];

export class Partition {
  d: Uint8Array; dv: DataView; base: number;
  typeGuids: string[] = []; types: TypeRow[] = []; fields: FieldRow[] = [];
  names = new Map<number, string>(); enums = new Map<number, Map<number, string>>(); typeIndex = new Map<string, number>();
  partitionGuid = ''; imports: EbxImport[] = []; dataContainers: number[] = [];
  instances: [offset: number, type: number][] = [];
  addr = new Map<number, number>();

  constructor(d: Uint8Array) {
    this.d = d;
    this.dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
    const tag = (o: number) => String.fromCharCode(d[o], d[o + 1], d[o + 2], d[o + 3]);
    if (tag(0) !== 'RIFF' || (tag(8) !== 'EBX\0' && tag(8) !== 'EBXS')) throw new Error('not a RIFF EBX partition');
    const chunks = new Map<string, [number, number]>();
    let p = 12;
    while (p + 8 <= d.length) {
      const size = this.u32(p + 4);
      chunks.set(tag(p), [p + 8, size]);
      p += 8 + size;
      p += p & 1;
    }
    const ebxd = chunks.get('EBXD'), rfl2 = chunks.get('RFL2'), efix = chunks.get('EFIX');
    if (!ebxd || !rfl2 || !efix) throw new Error('EBX chunk missing');
    this.base = (ebxd[0] + 15) & ~15;
    this.readRfl2(rfl2[0]);
    const efixTypes = this.readEfix(efix[0]);
    const byGuid = new Map(this.typeGuids.map((g, i) => [g, i]));
    const map = efixTypes.map((g) => byGuid.get(g) ?? -1);
    for (const off of this.dataContainers) {
      const ti = Number(this.dv.getBigUint64(this.base + off, true));
      this.instances.push([off, map[ti] ?? -1]);
    }
    this.instances.forEach(([off], i) => this.addr.set(this.base + off, i));
  }

  private u32(o: number) { return this.dv.getUint32(o, true); }
  private cstr(o: number) { let e = o; while (this.d[e]) e++; return new TextDecoder().decode(this.d.subarray(o, e)); }

  private readRfl2(q: number) {
    let n = this.u32(q); q += 4;
    for (let i = 0; i < n; i++) this.typeGuids.push(hex(this.d, q + 20 * i, 16));
    q += 20 * n;
    n = this.u32(q); q += 4;
    for (let i = 0; i < n; i++) {
      const o = q + 16 * i;
      this.types.push([this.u32(o), this.u32(o + 4), this.dv.getUint16(o + 8, true), this.dv.getUint16(o + 10, true), this.dv.getUint16(o + 12, true), this.dv.getUint16(o + 14, true)]);
    }
    q += 16 * n;
    n = this.u32(q); q += 4;
    for (let i = 0; i < n; i++) {
      const o = q + 12 * i;
      this.fields.push([this.u32(o), this.u32(o + 4), this.dv.getUint16(o + 8, true), this.dv.getUint16(o + 10, true)]);
    }
    q += 12 * n;
    n = this.u32(q); q += 4;
    const enums: [number, number, number][] = [];
    for (let i = 0; i < n; i++) enums.push([this.u32(q + 12 * i), this.u32(q + 12 * i + 4), this.u32(q + 12 * i + 8)]);
    q += 12 * n;
    n = this.u32(q); q += 4;
    const values: [number, number][] = [];
    for (let i = 0; i < n; i++) values.push([this.u32(q + 8 * i), this.u32(q + 8 * i + 4)]);
    q += 8 * n;
    n = this.u32(q); q += 4;
    const sbase = q + 8 * n;
    for (let i = 0; i < n; i++) this.names.set(this.u32(q + 8 * i), this.cstr(sbase + this.u32(q + 8 * i + 4)));
    for (const [h, c, s] of enums) {
      const m = new Map<number, string>();
      for (const [vh, v] of values.slice(s, s + c)) m.set(v, this.names.get(vh) ?? String(v));
      this.enums.set(h, m);
    }
    this.types.forEach((t, i) => { const nm = this.names.get(t[0]); if (nm !== undefined) this.typeIndex.set(nm, i); });   // last wins, as in ebx.py
  }

  private readEfix(q: number): string[] {
    this.partitionGuid = hex(this.d, q, 16); q += 16;
    let n = this.u32(q); q += 4;
    const efixTypes: string[] = [];
    for (let i = 0; i < n; i++) efixTypes.push(hex(this.d, q + 16 * i, 16));
    q += 16 * n;
    n = this.u32(q); q += 4 + 4 * n;          // type signatures
    q += 4;                                   // exported count
    const tabs: number[][] = [];
    for (let t = 0; t < 3; t++) {
      n = this.u32(q); q += 4;
      tabs.push(Array.from({ length: n }, (_, i) => this.u32(q + 4 * i)));
      q += 4 * n;
    }
    this.dataContainers = tabs[0];
    n = this.u32(q); q += 4;
    for (let i = 0; i < n; i++) this.imports.push({ $import: true, partition: hex(this.d, q + 32 * i, 16), instance: hex(this.d, q + 32 * i + 16, 16) });
    return efixTypes;
  }

  typeName(t: number): string { return t < 0 ? 'unknown' : this.names.get(this.types[t][0]) ?? `type${t}`; }

  instancesOf(name: string): number[] {
    const t = this.typeIndex.get(name);
    if (t === undefined) return [];
    const out: number[] = [];
    this.instances.forEach(([, ti], i) => { if (ti === t) out.push(i); });
    return out;
  }

  read(i: number): EbxObject {
    const [off, t] = this.instances[i];
    const out: EbxObject = { $type: this.typeName(t) };
    if (t >= 0) this.readType(t, this.base + off, out);
    return out;
  }

  private readType(t: number, addr: number, out: EbxObject) {
    const [, fstart, fcount] = this.types[t];
    for (const [fh, foff, flags, ref] of this.fields.slice(fstart, fstart + fcount)) {
      const kind = (flags >> 5) & 0x1F;
      if (kind === K_INHERITED) { if (ref !== 0xFFFF) this.readType(ref, addr, out); continue; }
      out[this.names.get(fh) ?? `field_${fh.toString(16).padStart(8, '0')}`] = this.field(kind, (flags & ARRAY) !== 0, ref, addr + foff);
    }
  }

  private field(kind: number, isArray: boolean, ref: number, a: number): EbxValue {
    if (!isArray) return this.scalar(kind, ref, a);
    const v = this.dv.getInt32(a, true);
    if (v === 0) return [];
    const data = a + v;
    const count = this.u32(data - 4);
    const size = kind === K_STRUCT ? this.types[ref][4] : (PRIM[kind] ?? SCALAR_SIZE[kind]);
    if (!size) return `<array of kind ${kind}>`;
    const out: EbxValue[] = [];
    for (let k = 0; k < count; k++) out.push(this.scalar(kind, ref, data + k * size));
    return out;
  }

  private scalar(kind: number, ref: number, a: number): EbxValue {
    const dv = this.dv;
    switch (kind) {
      case 10: return dv.getUint8(a) !== 0;
      case 11: return dv.getInt8(a);
      case 12: return dv.getUint8(a);
      case 13: return dv.getInt16(a, true);
      case 14: return dv.getUint16(a, true);
      case 15: return dv.getInt32(a, true);
      case 16: return dv.getUint32(a, true);
      case 17: return dv.getBigInt64(a, true);
      case 18: return dv.getBigUint64(a, true);
      case 19: return dv.getFloat32(a, true);
      case 20: return dv.getFloat64(a, true);
      case K_STRUCT: { const o: EbxObject = {}; this.readType(ref, a, o); return o; }
      case K_POINTER: {
        const v = dv.getInt32(a, true);
        if (v === 0) return null;
        if (v & 1) return this.imports[dv.getUint32(a, true) >>> 1] ?? null;
        return { $ref: this.addr.get(a + v) ?? -1 };
      }
      case K_CSTRING: { const v = dv.getInt32(a, true); return v === 0 ? '' : this.cstr(a + v); }
      case K_ENUM: {
        const v = dv.getUint32(a, true);
        return ref !== 0xFFFF ? (this.enums.get(this.types[ref][0])?.get(v) ?? v) : v;
      }
      case K_GUID: return hex(this.d, a, 16);
      case K_SHA1: return hex(this.d, a, 20);
      case K_RESREF: return dv.getBigUint64(a, true);
      default: return `<kind ${kind}>`;
    }
  }
}
