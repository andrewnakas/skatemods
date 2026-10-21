// SPDX-License-Identifier: GPL-3.0-or-later
// skate. (Frostbite) containers as a ReSkate Studio map mod ships them: superbundle TOCs, CAS block
// runs, binary bundle manifests and the shaderblock depot. Ported from skate4to3/sk4 (superbundle.py,
// cas.py, binarybundle.py, depot.py); layouts measured in skate4to3/specs/SKATE_FORMATS.md.

import { krakenDecompress } from '../kraken/kraken.ts';

/** Random-access file source: an unzipped mod folder, a dropped folder, or OPFS copies of a zip. */
export interface ModSource {
  /** Paths relative to the mod root, '/' separated. */
  list(): string[];
  read(path: string, offset: number, length: number): Promise<Uint8Array>;
  size(path: string): number;
}

const be32 = (d: Uint8Array, o: number) => ((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) >>> 0;
const le32 = (d: Uint8Array, o: number) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
export const hex = (d: Uint8Array, o = 0, n = d.length - o) => {
  let s = '';
  for (let i = 0; i < n; i++) s += d[o + i].toString(16).padStart(2, '0');
  return s;
};
const revHex = (d: Uint8Array, o: number, n: number) => {
  let s = '';
  for (let i = n - 1; i >= 0; i--) s += d[o + i].toString(16).padStart(2, '0');
  return s;
};

// ------------------------------------------------------------------------------------------------ TOC
const TOC_BASE = 0x22C;
/** (package word & 0xFFFF, high half of word 2) -> install package folder. */
const PACKAGES: Record<string, string> = {
  'bc80:e699': 'initialinstallpackage',
  '7837:152c': 'defaultinstallpackage',
};
/** Bit 16 of the package word marks the mod's own CAS files (0x17837 = its defaultinstallpackage). */
const MOD_FLAG = 0x10000;

/** Where a range lives: `own` = the mod's CAS (readable), otherwise a base-game package (not here). */
export interface CasRange { own: boolean; cas: string; offset: number; size: number }
export interface Bundle { index: number; entries: CasRange[] }
export interface TocChunk extends CasRange { guid: string }

function casRange(a: number, b: number, off: number, size: number): CasRange {
  const pkg = PACKAGES[`${(a & 0xFFFF).toString(16)}:${(b >>> 16).toString(16)}`] ?? `pkg_${a.toString(16)}_${(b >>> 16).toString(16)}`;
  return { own: (a & MOD_FLAG) !== 0, cas: `Win32/configurations/layout/${pkg}/cas_${String(b & 0xFFFF).padStart(2, '0')}.cas`, offset: off, size };
}

export class Toc {
  d: Uint8Array;
  hdrFields: number; bundleData: number; bundlesCount: number; chunkGuids: number; chunksCount: number; chunkRecords: number;
  constructor(d: Uint8Array) {
    this.d = d;
    const u = (o: number) => be32(d, TOC_BASE + o);
    this.hdrFields = u(0) / 4;
    if (this.hdrFields !== 12 && this.hdrFields !== 15) throw new Error(`TOC header of ${this.hdrFields} words`);
    const h = Array.from({ length: this.hdrFields }, (_, i) => u(i * 4));
    this.bundleData = h[1]; this.bundlesCount = h[2]; this.chunkGuids = h[4]; this.chunksCount = h[5]; this.chunkRecords = h[6];
  }
  /** Not a binary superbundle (the flag byte at the payload start). */
  static isBinary(d: Uint8Array): boolean { return d.length > TOC_BASE && !(d[TOC_BASE] & 0x80); }

  *chunks(): Generator<TocChunk> {
    for (let i = 0; i < this.chunksCount; i++) {
      const g = TOC_BASE + this.chunkGuids + i * 20;
      const idx = be32(this.d, g + 16);
      if (idx === 0xFFFFFFFF) continue;
      const o = TOC_BASE + this.chunkRecords + ((idx & 0x7FFFFFFF) >>> 2) * 16;
      yield { guid: revHex(this.d, g, 16), ...casRange(be32(this.d, o), be32(this.d, o + 4), be32(this.d, o + 8), be32(this.d, o + 12)) };
    }
  }

  bundle(i: number): Bundle {
    const o = TOC_BASE + this.bundleData + i * 16;
    const sizef = be32(this.d, o + 4), off = be32(this.d, o + 12);
    const p = this.d.subarray(TOC_BASE + off, TOC_BASE + off + (sizef & 0xFFFFFF));
    const flagsOff = be32(p, 8), count = be32(p, 12);
    let pos = be32(p, 16);
    const entries: CasRange[] = [];
    let a = 0, b = 0;
    for (let e = 0; e < count; e++) {
      if (p[flagsOff + e] & 0x80) { a = be32(p, pos); b = be32(p, pos + 4); pos += 8; }
      entries.push(casRange(a, b, be32(p, pos), be32(p, pos + 4)));
      pos += 8;
    }
    if (pos !== flagsOff) throw new Error(`bundle ${i}: entry walk ended at ${pos}, flags at ${flagsOff}`);
    return { index: i, entries };
  }
}

// ------------------------------------------------------------------------------------------------ CAS
/** Decode a CAS range: 8-byte BE block headers, type 0x11 Kraken or 0x00 stored. */
export function decodeBlocks(data: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let p = 0, total = 0;
  while (p < data.length) {
    if (p + 8 > data.length) throw new Error('truncated CAS block header');
    const dec = be32(data, p), typ = data[p + 4], comp = ((data[p + 5] & 0x0F) << 16) | (data[p + 6] << 8) | data[p + 7];
    if (comp === 0) throw new Error('zero-size CAS block');
    const pl = data.subarray(p + 8, p + 8 + comp);
    if (typ === 0x11) parts.push(krakenDecompress(pl, dec));
    else if (typ === 0x00) { if (pl.length !== dec) throw new Error('stored block size'); parts.push(pl); }
    else throw new Error(`CAS block type 0x${typ.toString(16)}`);
    total += dec; p += 8 + comp;
  }
  if (parts.length === 1) return parts[0];
  const out = new Uint8Array(total);
  let q = 0;
  for (const x of parts) { out.set(x, q); q += x.length; }
  return out;
}

// --------------------------------------------------------------------------------------- bundle manifest
export interface ManifestRes { name: string; size: number; type: number; meta: Uint8Array; rid: bigint }
export interface ManifestChunk { guid: string; logicalOffset: number; logicalSize: number }
export interface Manifest { ebx: { name: string; size: number }[]; res: ManifestRes[]; chunks: ManifestChunk[] }

export function parseManifest(m: Uint8Array): Manifest {
  if (be32(m, 4) !== 0xD68E799D) throw new Error('bad bundle manifest magic');
  const dv = new DataView(m.buffer, m.byteOffset, m.byteLength);
  const [total, nebx, nres, nchk, soff] = [0, 1, 2, 3, 4].map((i) => le32(m, 8 + 4 * i));
  if (nebx + nres + nchk !== total) throw new Error('manifest counts');
  let p = 36 + total * 20;
  const sbase = soff + 4;
  const td = new TextDecoder();
  const name = (o: number) => { const a = sbase + o; let e = a; while (m[e]) e++; return td.decode(m.subarray(a, e)); };
  const ebx = [];
  for (let i = 0; i < nebx; i++) ebx.push({ name: name(le32(m, p + 8 * i)), size: le32(m, p + 8 * i + 4) });
  const resRaw = p + nebx * 8;
  const rtype = resRaw + nres * 8, rmeta = rtype + nres * 4, rrid = rmeta + nres * 16;
  const res: ManifestRes[] = [];
  for (let i = 0; i < nres; i++) {
    res.push({ name: name(le32(m, resRaw + 8 * i)), size: le32(m, resRaw + 8 * i + 4), type: le32(m, rtype + 4 * i),
      meta: m.slice(rmeta + 16 * i, rmeta + 16 * i + 16), rid: dv.getBigUint64(rrid + 8 * i, true) });
  }
  p = rrid + nres * 8;
  const chunks: ManifestChunk[] = [];
  for (let i = 0; i < nchk; i++) {
    chunks.push({ guid: hex(m, p, 16), logicalOffset: le32(m, p + 16), logicalSize: le32(m, p + 20) });
    p += 24;
  }
  if (p !== sbase) throw new Error(`manifest tables end at ${p}, strings at ${sbase}`);
  return { ebx, res, chunks };
}

// -------------------------------------------------------------------------------------------- depot
export const DEPOT_RES = 0x73312045;
export const TEXTURE_PARAM = 0x14C5FC30;
export const VEC3_PARAM = 0x885EFF59;
const ELEMENT: Record<number, number> = {
  0x566E2DD0: 1, 0x57F970CA: 4, 0x2BB65C2D: 4, 0x36ED3444: 4, 0x8E4A817E: 4, 0x7826E998: 4,
  0x2A36E9D5: 8, 0x885EFF59: 12, 0x7F999829: 16,
};
export interface DepotParam { hash: bigint; type: number; count: number; tag: number; raw: Uint8Array }
/** [(instance guid, partition guid)] of a texture parameter. */
export function paramTextures(p: DepotParam): [string, string][] {
  if (p.type !== TEXTURE_PARAM) return [];
  const out: [string, string][] = [];
  for (let i = 0; i + 32 <= p.raw.length; i += 32) out.push([hex(p.raw, i, 16), hex(p.raw, i + 16, 16)]);
  return out;
}
export function paramFloats(p: DepotParam): number[] {
  const dv = new DataView(p.raw.buffer, p.raw.byteOffset, p.raw.byteLength);
  return Array.from({ length: p.raw.length >> 2 }, (_, i) => dv.getFloat32(4 * i, true));
}

function depotBlock(b: Uint8Array): DepotParam[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const n = dv.getUint32(0, true);
  let p = 4;
  const out: DepotParam[] = [];
  for (let i = 0; i < n; i++) {
    const hash = dv.getBigUint64(p, true), type = dv.getUint32(p + 8, true), count = dv.getUint16(p + 12, true), tag = dv.getUint16(p + 14, true);
    p += 16;
    let len: number;
    if (type === TEXTURE_PARAM) { p += 1; len = 32 * count; }
    else {
      const k = dv.getUint32(p, true);
      p += 4;
      const el = ELEMENT[type];
      if (el === undefined) throw new Error(`depot element type 0x${type.toString(16)}`);
      len = k * el;
    }
    out.push({ hash, type, count, tag, raw: b.subarray(p, p + len) });
    p += len;
  }
  return out;
}

/** material (depot) key -> parameters. */
export function parseDepot(d: Uint8Array, meta: Uint8Array): Map<bigint, DepotParam[]> {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const nkeys = le32(meta, 12);
  const kt = Number(dv.getBigUint64(0, true));
  const blocks = new Map<number, DepotParam[]>(), out = new Map<bigint, DepotParam[]>();
  for (let k = 0; k < nkeys; k++) {
    const key = dv.getBigUint64(kt + 16 * k, true), dp = Number(dv.getBigUint64(kt + 16 * k + 8, true));
    let blk = blocks.get(dp);
    if (!blk) {
      const bp = Number(dv.getBigUint64(dp, true)), bs = Number(dv.getBigUint64(dp + 16, true));
      blk = depotBlock(d.subarray(bp, bp + bs));
      blocks.set(dp, blk);
    }
    out.set(key, blk);
  }
  return out;
}
