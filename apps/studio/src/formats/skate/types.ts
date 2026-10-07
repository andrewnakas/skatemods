// TypeScript mirror of skate-data's `SkateMap` (crates/skate-data/src/skate_map.rs).
// Field names follow the Rust structs in camelCase. Per-vertex and per-triangle
// records are stored struct-of-arrays (typed arrays) instead of one object per
// vertex so multi-million-vertex retail maps stay cheap; the values are the
// exact f32/u32 bits from the file.

export type SkateVersion = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

export interface SkateMaterial {
  name: string;
  flags: number;
  friction: number;
  restitution: number;
  color: [number, number, number];
  roughness: number;
  emissive: number;
  /** Albedo, indirect (lightmap), normal, ORM, emissive. One-based, zero = absent. */
  textures: [number, number, number, number, number];
  indirectStrength: number;
  /** 0 opaque, 1 mask (cutout), 2 blend. */
  alphaMode: number;
  alphaCutoff: number;
  /** Native audio surface 0..127 (addon names it "Wheel / Grind Sound"). */
  audio: number;
  /** Native physics surface 0..13. */
  physics: number;
  /** Native contact pattern 0..15. */
  pattern: number;
  /** v13+: 0..3. */
  depthLayer: number | null;
  /** v12+ retail shader definition bytes, excluding the leading "enabled" u32. */
  retailDefinition: Uint8Array | null;
}

export interface SkateTexture {
  name: string;
  width: number;
  height: number;
  /** 1 = sRGB albedo, 0 = linear/data. */
  colorSpace: number;
  /** RGBA8, bottom row first (OpenGL / Blender order). Empty for 0x0 placeholders. */
  rgba: Uint8Array;
}

/** `Vec<Vertex>`, struct-of-arrays. */
export interface SkateVertices {
  count: number;
  positions: Float32Array;   // 3 per vertex
  normals: Float32Array;     // 3 per vertex
  uvs: Float32Array;         // 2 per vertex, v = 0 at the bottom of the image
  lightmapUvs: Float32Array; // 2 per vertex
  /** One-based material id per vertex. */
  materials: Uint32Array;
  /** v12+: 2 per vertex, else null. */
  decalUvs: Float32Array | null;
  /** v12+: 4 bytes per vertex (snorm8 binormal xyz + handedness), else null. */
  tangentFrames: Uint8Array | null;
}

/** `Vec<Collision>`, struct-of-arrays. */
export interface SkateCollision {
  count: number;
  /** 9 floats per triangle: a, b, c. */
  points: Float32Array;
  /** Non-zero group id per triangle (the exporter writes the 1-based source object ordinal). */
  surfaces: Uint32Array;
  /** One-based material id per triangle; audio/physics/pattern come from that material. */
  materials: Uint32Array;
  /**
   * v11+: the raw 4-byte edge word per triangle. Bytes 0..2 are the native edge
   * codes and byte 3 is the "present" flag (Rust's `native_edges` is Some when
   * byte 3 != 0). Null for v1..10. Kept whole so a rewrite is byte-exact.
   */
  edgeWords: Uint8Array | null;
}

export interface SkateGeometry {
  vertices: SkateVertices;
  indices: Uint32Array;
  collision: SkateCollision;
}

export interface SkateRail {
  name: string;
  closed: boolean;
  /** Polyline points (representation 0). Empty for native rails. */
  points: [number, number, number][];
  /**
   * Representation 1: 24-byte header (spline id u64, type signature u64, flags,
   * trailing word) + u32 segment count + 120 bytes per segment (30 f32 words).
   */
  native: Uint8Array | null;
}

export interface SkateDoor {
  name: string;
  /** Hinge position/axis, closed width/depth axes, local min/max. */
  frame: [number, number, number][];
  /** Minimum/maximum/initial angle, mass, damping. */
  motion: [number, number, number, number, number];
  /** Spring, max angular speed, contact impulse scale (absent before v5). */
  response: [number, number, number] | null;
  friction: number;
  restitution: number;
  surface: number;
  geometry: SkateGeometry;
}

export interface SkateLight {
  name: string;
  /** 0 point, 1 spot, 2 area. */
  kind: number;
  position: [number, number, number];
  direction: [number, number, number];
  color: [number, number, number];
  intensity: number;
  range: number;
  radius: number;
  innerCos: number;
  outerCos: number;
}

export interface SkateRoute {
  rail: SkateRail;
  skaters: number;
  speed: number;
  spacing: number;
}

export interface SkateExtension {
  /** Four ASCII characters, e.g. "MOBJ", "WMET", "WCFG", "BMAT", "SKYB", "RWCM", "BGRP". */
  tag: string;
  schema: number;
  payload: Uint8Array;
}

export interface SkateMap {
  version: number;
  name: string;
  spawn: [number, number, number];
  /** Radians about +Y. See read.ts for the yaw convention. */
  heading: number;
  /** Authored environment floats in wire order (12, 14 or 45). */
  environment: number[];
  materials: SkateMaterial[];
  textures: SkateTexture[];
  geometry: SkateGeometry;
  rails: SkateRail[];
  doors: SkateDoor[];
  lights: SkateLight[];
  routes: SkateRoute[];
  extensions: SkateExtension[];
}
