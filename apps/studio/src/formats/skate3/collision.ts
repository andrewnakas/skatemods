// SPDX-License-Identifier: GPL-3.0-or-later
// Skate 3 collision object model (cSim_* arenas): the types of skate4to3 sk3/collision.py that the
// writer encodes (clustered mesh 0x80006 + KD tree, volume, box aggregate, model, instances,
// import table). Layout facts: the collision.py docstring and specs/sk3_collision.md.
// The binary parsers / MeshQuery are not ported (writer-only port).

export const T_VOLUME = 0x80001, T_MESH = 0x80006;
export const T_IMPORTS = 0xeb000b, T_HDR = 0xeb0008, T_INSTANCE = 0xeb000d, T_MESHREF = 0xeb000a;
export const T_SPLINES = 0xeb0004, T_PROPS = 0xeb001d;

export const UNIT_TRI = 0x01, UNIT_EDGES = 0x20, UNIT_GROUP = 0x40, UNIT_SURFACE = 0x80;
export const BRANCH = 0xFFFFFFFF;

type V3 = [number, number, number];

/** (flags, (v0, v1, v2), (e0, e1, e2), surface or null) */
export type Unit = [number, number[], number[], number | null];

export interface Cluster {
  vertex_mode: number;              // 1: i32 offset + u16 per axis, 2: i32 per axis
  offset: V3 | null;                // mode 1 only
  qverts: number[][];               // (n, 3) quantised coordinates (before the offset)
  units: Unit[];
  normal_count: number;
}

export interface Node {
  parent: number;
  axis: number;
  children: [[number, number], [number, number]];   // (content, index) x2
  extents: [number, number];                        // (left max, right min)
}

export interface ClusteredMesh {
  bbox: [V3, V3];
  max_leaf: number | null;          // 0x24 unit-index bits (null = derive on encode)
  granularity: number;
  flags: number;
  tree_bbox: [V3, V3];
  nodes: Node[];
  clusters: Cluster[];
  node_ptr: number;
  n_entries: number;
}

export interface Volume { matrix: number[]; vtype: number; geometry: number; tail: number[] }

export interface BoxAggregate {
  bbox: [V3, V3]; w24: number; volumes: Volume[]; node_ptr: number; nodes: Node[]; n_entries: number;
  tree_bbox: [V3, V3]; tree_pad: number;
}

export interface CollisionModel { bounding: number; volumes: number[] }

export interface Instance {
  matrix: number[]; bbox: [V3, V3];
  ids: bigint[];                    // 4 x u64
  flags: number;
  strings: string[];                // (name, s1, s2, s3)
}
export interface InstanceList { kind: number; instances: Instance[] }

/** eb000b rows (id, type, value) + the per-type list */
export interface ImportTable { entries: [bigint, number, number][]; types: number[] }

export function unitSize(flags: number): number {
  const nv = (flags & 0x0F) === UNIT_TRI ? 3 : 4;
  return 1 + nv + (flags & UNIT_EDGES ? nv : 0) + (flags & UNIT_GROUP ? 2 : 0) + (flags & UNIT_SURFACE ? 2 : 0);
}
