// SPDX-License-Identifier: GPL-3.0-or-later
// RW4 arena writer (Xbox 360, 'xb2'); port of skate4to3 sk3/rw4_write.py. build(spec) -> bytes.
//
// A spec holds the arena id, the objects in dictionary order (typeId, align, data) and the subref
// records (object index, byte offset); the type registry, header words, section block, placement
// of objects / dictionary / subrefs / graphics region are derived here.
//   0x00 header (0xAC); 0xAC sections 0x10004..0x10008; main objects in dictionary order, each at
//   its own alignment; dictionary (24 B per object); subref records then 24 zero bytes per record;
//   h44: graphics region (base resources 0x10030-0x1003F), ptr relative to h44.
import type { Arena } from './rw4.ts';
import { u32be } from './bytes_util.ts';

export const HEADER_SIZE = 0xAC;
export const MAGIC = new Uint8Array([0x89, 0x52, 0x57, 0x34]);
// 0x08-0x17: identical in every retail arena ('\r\n\x1a\n\x01\x20\x04\x00454\x00000\x00')
export const FIXED_08 = new Uint8Array([0x0D, 0x0A, 0x1A, 0x0A, 0x01, 0x20, 0x04, 0x00, 0x34, 0x35, 0x34, 0x00, 0x30, 0x30, 0x30, 0x00]);

export const REGISTRY_SMALL: readonly number[] = [0x0, 0x10030, 0x10031, 0x10032, 0x10033, 0x10010, 0x200e8, 0xeb0008, 0xeb000b];
export const REGISTRY_FULL: readonly number[] = [
  0x0, 0x10030, 0x10031, 0x10032, 0x10033, 0x10010,
  0xeb0000, 0xeb0001, 0xeb0003, 0xeb0004, 0xeb0005, 0xeb0006, 0xeb000a, 0xeb000d, 0xeb0019,
  0xeb0007, 0xeb0008, 0xeb000c, 0xeb0009, 0xeb000b, 0xeb000e, 0xeb0011, 0xeb000f, 0xeb0010,
  0xeb0012, 0xeb0022, 0xeb0013, 0xeb0014, 0xeb0015, 0xeb0016, 0xeb001a, 0xeb001c, 0xeb001d,
  0xeb001b, 0xeb001e, 0xeb001f, 0xeb0021, 0xeb0017, 0xeb0020, 0xeb0024, 0xeb0023, 0xeb0025,
  0xeb0026, 0xeb0027, 0xeb0028, 0xeb0029, 0xeb0018, 0xec0010, 0x10000, 0x10002, 0x200eb,
  0x200ea, 0x200e9, 0x20081, 0x200e8, 0x80002, 0x80001, 0x80006, 0x80003, 0x80004, 0x40006,
  0x40007, 0x1000f];
/** (types, header 0x6C word) */
export const REGISTRIES: readonly [readonly number[], number][] = [[REGISTRY_SMALL, 0x304], [REGISTRY_FULL, 0xAC]];

export const isBaseResource = (t: number) => t >= 0x10030 && t <= 0x1003F;

const alignUp = (x: number, a: number) => Math.ceil(x / a) * a;

export interface SpecObject {
  typeId: number;
  align: number;
  data: Uint8Array;
}

export interface Spec {
  arenaId: number;
  objects: SpecObject[];                        // dictionary order
  subrefs?: [number, number][];                 // (object index, byte offset)
  types?: readonly number[] | null;             // null: shortest known registry covering the objects
  headerOverrides?: Map<number, number>;        // {offset: u32}; experiments only
}

export function pickRegistry(typeIds: Iterable<number>): [readonly number[], number] {
  const used = new Set(typeIds);
  for (const [reg, h6c] of REGISTRIES) {
    const s = new Set(reg);
    if ([...used].every((t) => s.has(t))) return [reg, h6c];
  }
  const full = new Set(REGISTRY_FULL);
  throw new Error(`no known registry holds types ${[...used].filter((t) => !full.has(t)).sort((a, b) => a - b).map((t) => '0x' + t.toString(16))}`);
}

function sameList(a: readonly number[], b: readonly number[]) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export function buildRw4(spec: Spec): Uint8Array {
  const objs = spec.objects;
  const subrefs = spec.subrefs ?? [];
  let types: readonly number[], h6c: number;
  if (spec.types == null) {
    [types, h6c] = pickRegistry(objs.map((o) => o.typeId));
  } else {
    types = [...spec.types];
    h6c = REGISTRIES.find(([r]) => sameList(r, types))?.[1] ?? 0xAC;
  }
  const tindex = new Map<number, number>();
  types.forEach((t, i) => tindex.set(t, i));   // last index wins, as a Python dict comprehension
  const n = objs.length, ns = subrefs.length;

  const sec = HEADER_SIZE;
  const sizes = [0x0C + 4 * 4, 0x0C + 4 * types.length, 0x24, 0x1C, 0x0C];
  const offs = sizes.map((_, i) => sizes.slice(0, i).reduce((a, b) => a + b, 0));
  const atomsEnd = sec + sizes.reduce((a, b) => a + b, 0);

  const ptrs = new Array<number>(n).fill(0);
  let p = atomsEnd;
  objs.forEach((o, i) => {
    if (!isBaseResource(o.typeId)) { p = alignUp(p, o.align); ptrs[i] = p; p += o.data.length; }
  });
  const dictAt = alignUp(p, 4);
  const recAt = dictAt + 24 * n;
  const recEnd = recAt + 8 * ns;
  const mainEnd = recEnd + 24 * ns;

  let g = 0;
  objs.forEach((o, i) => {
    if (isBaseResource(o.typeId)) { g = alignUp(g, o.align); ptrs[i] = g; g += o.data.length; }
  });
  const brAligns = objs.filter((o) => isBaseResource(o.typeId)).map((o) => o.align);
  const mainAligns = objs.filter((o) => !isBaseResource(o.typeId)).map((o) => o.align);

  const out = new Uint8Array(mainEnd + g);
  const dvo = new DataView(out.buffer);
  const W = (off: number, ...v: number[]) => { v.forEach((x, k) => dvo.setUint32(off + 4 * k, x >>> 0, false)); };

  out.set(MAGIC, 0);
  out.set([0x78, 0x62, 0x32, 0x00], 4);   // 'xb2\0'
  out.set(FIXED_08, 8);
  const H = new Map<number, number>([
    [0x1C, spec.arenaId], [0x20, n], [0x24, n], [0x28, 0x10], [0x30, dictAt], [0x34, sec],
    [0x44, mainEnd], [0x48, mainAligns.length ? Math.max(...mainAligns) : 0x10], [0x50, 1],
    [0x54, g], [0x58, brAligns.length ? Math.max(...brAligns) : 1], [0x60, 1], [0x68, 1], [0x6C, h6c], [0x70, 4],
    [0x78, 1], [0x80, 1], [0x88, 1], [0x90, 1]]);
  if (spec.headerOverrides) for (const [k, v] of spec.headerOverrides) H.set(k, v);
  for (const [off, v] of H) W(off, v);

  W(sec, 0x10004, 4, 0x0C, ...offs.slice(1));
  W(sec + offs[1], 0x10005, types.length, 0x0C, ...types);
  W(sec + offs[2], 0x10006, 3, 0x18, spec.arenaId, 0xFFB00000, spec.arenaId, 0, 0, 0);
  W(sec + offs[3], 0x10007, ns, 0, 0, recEnd, recAt, ns);
  W(sec + offs[4], 0x10008, 0, 0);

  objs.forEach((o, i) => {
    const at = (isBaseResource(o.typeId) ? mainEnd : 0) + ptrs[i];
    out.set(o.data, at);
    const ti = tindex.get(o.typeId);
    if (ti === undefined) throw new Error(`type 0x${o.typeId.toString(16)} not in the registry`);
    W(dictAt + 24 * i, ptrs[i], 0, o.data.length, o.align, ti, o.typeId);
  });
  subrefs.forEach(([idx, off], k) => W(recAt + 8 * k, idx, off));
  return out;
}

/** Everything a generator would supply, read back from a parsed arena. */
export function specFromArena(a: Arena): Spec {
  return {
    arenaId: u32be(a.data, 0x1C),
    objects: a.objects.map((o) => ({ typeId: o.typeId, align: o.align, data: o.data })),
    subrefs: a.subrefs.map(([i, o]) => [i, o] as [number, number]),
  };
}

export { buildRw4 as build };
export { buildRw4 as buildArena };   // drop-in for writers_rw4shim.ts buildArena
