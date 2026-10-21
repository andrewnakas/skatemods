// SPDX-License-Identifier: GPL-3.0-or-later
// SFIL stream files (.xsf); port of skate4to3 sk3/sfil.py.
//
//   0x00 'SFIL'  0x04 version 3  0x08 0  0x0C group hash  0x10 align  0x14 group count (1)
//   0x18 platform (2 = EA Xbox form, 0 = raw form)  0x1C tail word; zero padding to `align`
//   chunk: u64 asset id, u32 payload size, u32 payload offset (= align), u32 chunk size; zeros to
//   the payload; zeros after it. Payload: a raw RW4 arena, or EA's Xbox two-section form (0x50-byte
//   descriptor, main {raw size = arena h44, stored size, RefPack flag} at 0, graphics at 0x20, then
//   the stored main and graphics bytes). EA compresses a section exactly when raw size >= 2048.
import { ByteWriter, bytesEqual, concat, dv, u32be, u64be } from './bytes_util.ts';
import * as refpack from './refpack.ts';

export const MAGIC = new Uint8Array([0x53, 0x46, 0x49, 0x4C]);   // 'SFIL'
export const XBOX_DESC = 0x50;
export const EA_ALIGN = 0x80;
export const RAW_ALIGN = 0x100;
export const PLATFORM_XBOX = 2;
export const PLATFORM_RAW = 0;
export const COMPRESS_MIN = 2048;

export type Form = 'raw' | 'xbox2';

export interface Asset {
  id: bigint;
  arena: Uint8Array;
  form?: Form;                                           // default 'raw'
  compressed?: [boolean | null, boolean | null];         // RefPack flags as read; null = decide
  stored?: [Uint8Array, Uint8Array] | null;              // stored bytes as read, for exact rewrite
  source?: Uint8Array | null;                            // the arena those stored bytes decode to
}

export interface Header {
  group: number;
  align?: number;          // default EA_ALIGN
  platform?: number;       // default PLATFORM_XBOX
  tail?: number;
  version?: number;        // default 3
  groups?: number;         // default 1
  padOver?: boolean;       // chunk size = offset + (size // align + 1) * align (community raw packs)
}

function isRw4(p: Uint8Array): boolean {
  return p[0] === 0x89 && p[1] === 0x52 && p[2] === 0x57 && p[3] === 0x34;
}

export function payloadSplit(p: Uint8Array): Asset {
  const mainSt = u32be(p, 4), mainC = u32be(p, 8);
  const gfxSt = u32be(p, 0x24), gfxC = u32be(p, 0x28);
  const m = p.subarray(XBOX_DESC, XBOX_DESC + mainSt);
  const g = p.subarray(XBOX_DESC + mainSt, XBOX_DESC + mainSt + gfxSt);
  const mr = mainC ? refpack.decompress(m) : m;
  const gr = gfxSt ? (gfxC ? refpack.decompress(g) : g) : new Uint8Array(0);
  const arena = concat([mr, gr]);
  return { id: 0n, arena, form: 'xbox2', compressed: [Boolean(mainC), Boolean(gfxC)], stored: [m, g], source: arena };
}

export function payloadToArena(p: Uint8Array): [Uint8Array, Form] {
  if (isRw4(p)) return [p, 'raw'];
  return [payloadSplit(p).arena, 'xbox2'];
}

export function readSfil(data: Uint8Array): [Required<Header>, Asset[]] {
  for (let i = 0; i < 4; i++) if (data[i] !== MAGIC[i]) throw new Error('not an SFIL stream');
  const hdr: Required<Header> = {
    version: u32be(data, 4), group: u32be(data, 12), align: u32be(data, 16), groups: u32be(data, 20),
    platform: u32be(data, 24), tail: u32be(data, 28), padOver: false,
  };
  const al = hdr.align;
  const out: Asset[] = [];
  let off = al;
  while (off + 0x20 <= data.length) {
    const aid = u64be(data, off);
    const size = u32be(data, off + 8), doff = u32be(data, off + 12), csize = u32be(data, off + 16);
    if (!size || !doff || off + doff + size > data.length) break;
    const p = data.subarray(off + doff, off + doff + size);
    if (isRw4(p)) out.push({ id: aid, arena: p, form: 'raw' });
    else { const a = payloadSplit(p); a.id = aid; out.push(a); }
    if (size % al === 0 && csize === doff + size + al) hdr.padOver = true;
    off += csize || Math.ceil((doff + size) / al) * al;
  }
  return [hdr, out];
}

function section(raw: Uint8Array, flag: boolean | null | undefined, stored: Uint8Array | null,
  compress: boolean, depth: number): [Uint8Array, boolean] {
  if (stored !== null) return [stored, Boolean(flag)];
  const use = flag === null || flag === undefined ? raw.length >= COMPRESS_MIN : flag;
  if (use && compress) return [refpack.compress(raw, depth), true];
  return [raw, false];
}

export function xboxPayload(a: Asset, compress = true, depth = 0): Uint8Array {
  const arena = a.arena;
  const h44 = u32be(arena, 0x44);
  const main = arena.subarray(0, h44), gfx = arena.subarray(h44);
  const keep = !!a.stored && !!a.source && bytesEqual(a.source, arena);
  const comp = a.compressed ?? [null, null];
  const [ms, mc] = section(main, comp[0], keep ? a.stored![0] : null, compress, depth);
  let gs: Uint8Array = new Uint8Array(0), gc = false;
  if (gfx.length) [gs, gc] = section(gfx, comp[1], keep ? a.stored![1] : null, compress, depth);
  const desc = new Uint8Array(XBOX_DESC);
  const d = dv(desc);
  d.setUint32(0, main.length); d.setUint32(4, ms.length); d.setUint32(8, mc ? 1 : 0);
  d.setUint32(0x20, gfx.length); d.setUint32(0x24, gs.length); d.setUint32(0x28, gc ? 1 : 0);
  return concat([desc, ms, gs]);
}

/** Serialise a stream as byte parts. `form` forces every payload to 'raw' or 'xbox2'. */
export function writeSfilParts(h: Header, assets: readonly Asset[], form: Form | null = null,
  compress = true, depth = 0): Uint8Array[] {
  const al = h.align ?? EA_ALIGN;
  const head = new ByteWriter(al);
  head.bytes(MAGIC).u32(h.version ?? 3, 0, h.group >>> 0, al, h.groups ?? 1, h.platform ?? PLATFORM_XBOX, (h.tail ?? 0) >>> 0);
  head.zeros(al - head.length);
  const parts: Uint8Array[] = [head.finish()];
  for (const a of assets) {
    const f = form ?? a.form ?? 'raw';
    const p = f === 'raw' ? a.arena : xboxPayload(a, compress, depth);
    const csize = Math.floor((al + p.length + (h.padOver ? al : al - 1)) / al) * al;
    const chunk = new ByteWriter(al);
    chunk.u64(BigInt.asUintN(64, a.id)).u32(p.length, al, csize).zeros(al - 20);
    parts.push(chunk.finish(), p, new Uint8Array(csize - al - p.length));
  }
  return parts;
}

export function writeSfil(h: Header, assets: readonly Asset[], form: Form | null = null,
  compress = true, depth = 0): Uint8Array {
  return concat(writeSfilParts(h, assets, form, compress, depth));
}

/** The raw container form: align 0x100, platform 0, arenas stored as-is. */
export function rawStream(group: number, assets: readonly Asset[], tail = 0): Uint8Array {
  return writeSfil({ group, align: RAW_ALIGN, platform: PLATFORM_RAW, tail, padOver: true }, assets, 'raw');
}

/** EA's own Xbox form: align 0x80, platform 2, two-section payloads, RefPack >= 2048 bytes. */
export function eaStream(group: number, assets: readonly Asset[], tail = 0, compress = true, depth = 0): Uint8Array {
  return writeSfil({ group, align: EA_ALIGN, platform: PLATFORM_XBOX, tail }, assets, 'xbox2', compress, depth);
}
