// SPDX-License-Identifier: GPL-3.0-or-later
// RW4 arenas ('\x89RW4' + 'xb2' on Xbox 360) reader; port of skate4to3 sk3/rw4.py.
import { decodeLatin1, u32be } from './bytes_util.ts';

export const DICT_ENTRY = 24;
export const SEC_DIRECTORY = 0x10004, SEC_TYPES = 0x10005, SEC_GUID = 0x10006, SEC_SUBREFS = 0x10007, SEC_ATOMS = 0x10008;

export interface Obj {
  index: number;
  ptr: number;
  size: number;
  align: number;        // dictionary +0x0C
  reloc: number;        // dictionary +0x04
  typeIndex: number;
  typeId: number;
  data: Uint8Array;
}

export interface Arena {
  data: Uint8Array;
  platform: string;
  header: Record<string, number>;   // 'h08'..'hA8' header words
  types: number[];
  objects: Obj[];
  subrefs: [number, number][];
  sections: Map<number, number>;
}

export const isBaseResourceType = (t: number) => t >= 0x10030 && t <= 0x1003F;

export function ofType(a: Arena, t: number): Obj[] {
  return a.objects.filter((o) => o.typeId === t);
}

export function parseRw4(d: Uint8Array): Arena {
  if (!(d[0] === 0x89 && d[1] === 0x52 && d[2] === 0x57 && d[3] === 0x34)) throw new Error('not an RW4 arena');
  const plat = decodeLatin1(d.subarray(4, 7));
  const H: Record<string, number> = {};
  for (let o = 0x08; o < 0xAC; o += 4) H[`h${o.toString(16).padStart(2, '0')}`] = u32be(d, o);
  const dictStart = u32be(d, 0x30), sections = u32be(d, 0x34);
  const nUsed = u32be(d, 0x24);
  const gfxSize = u32be(d, plat === 'ps3' ? 0x6C : 0x54);
  const gbase = gfxSize === 0 ? d.length : u32be(d, 0x44);
  const secs = new Map<number, number>();
  if (u32be(d, sections) === SEC_DIRECTORY) {
    const n = u32be(d, sections + 4), first = sections + u32be(d, sections + 8);
    for (let i = 0; i < n; i++) {
      const c = sections + u32be(d, first + 4 * i);
      if (c + 4 <= d.length) secs.set(u32be(d, c), c);
    }
  }
  let types: number[] = [];
  if (secs.has(SEC_TYPES)) {
    const t = secs.get(SEC_TYPES)!;
    const cnt = u32be(d, t + 4), arr = t + u32be(d, t + 8);
    types = Array.from({ length: cnt }, (_, i) => u32be(d, arr + 4 * i));
  }
  const a: Arena = { data: d, platform: plat, header: H, types, objects: [], subrefs: [], sections: secs };
  for (let i = 0; i < nUsed; i++) {
    const b = dictStart + i * DICT_ENTRY;
    const ptr = u32be(d, b), reloc = u32be(d, b + 4), size = u32be(d, b + 8), align = u32be(d, b + 12);
    const ti = u32be(d, b + 16);
    let tid = u32be(d, b + 20);
    if (ti < types.length) tid = types[ti];
    const start = (isBaseResourceType(tid) ? gbase : 0) + ptr;
    a.objects.push({ index: i, ptr, size, align, reloc, typeIndex: ti, typeId: tid, data: d.subarray(start, start + size) });
  }
  if (secs.has(SEC_SUBREFS)) {
    const s = secs.get(SEC_SUBREFS)!;
    const cnt = u32be(d, s + 4), at = u32be(d, s + 0x14);
    for (let i = 0; i < cnt; i++) a.subrefs.push([u32be(d, at + 8 * i), u32be(d, at + 8 * i + 4)]);
  }
  return a;
}

export { parseRw4 as parse };
