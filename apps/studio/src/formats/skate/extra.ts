// Shapes of the .skate passthrough data kept on MapIR so .skate -> MapIR ->
// .skate keeps everything MapIR has no field for.
import type { SurfaceId } from '../../ir';
import type { SkateDoor, SkateExtension, SkateLight, SkateMaterial, SkateRoute } from './types';

/** `map.extra.skate`. */
export interface SkateMapExtra {
  version: number;
  /** Environment floats as read (12, 14 or 45). The writer pads to 45 with exporter defaults. */
  environment: number[];
  /** Exact heading in radians, reused while `spawns[0].yaw` still equals `spawnYaw`. */
  heading: number;
  spawnYaw: number;
  /** Index-aligned with `map.materials`. */
  materials: SkateMaterialExtra[];
  /** Index-aligned with `map.lights`. */
  lights: SkateLight[];
  doors: SkateDoor[];
  routes: SkateRoute[];
  /** All extension blocks (MOBJ, WMET, WCFG, BMAT, SKYB, RWCM, BGRP, ...) in file order. */
  extensions: SkateExtension[];
}

/** Material fields MapIR has no slot for. `surface` is the MapIR surface derived at read time. */
export interface SkateMaterialExtra {
  raw: SkateMaterial;
  surface: SurfaceId;
}

/** `object.extra.skate` on the render object built from the base geometry. */
export interface SkateRenderExtra {
  kind: 'render';
  /** Original UV0 / lightmap / decal UVs in .skate convention (v = 0 at the bottom). */
  uvs: Float32Array;
  lightmapUvs: Float32Array;
  decalUvs: Float32Array | null;
  /** 4 bytes per vertex (snorm8 binormal + handedness); null before v12. */
  tangentFrames: Uint8Array | null;
  /** One-based material id per vertex as read. */
  vertexMaterials: Uint32Array;
}

/** `object.extra.skate` on the collision object built from the collision triangle list. */
export interface SkateCollisionExtra {
  kind: 'collision';
  /** Per-triangle surface/group word (non-zero). */
  surfaces: Uint32Array;
  /** Per-triangle one-based material id; its audio/physics/pattern is the gameplay surface. */
  materials: Uint32Array;
  /** Per-triangle raw 4-byte edge word (3 native edge codes + present flag); null before v11. */
  edgeCodes: Uint8Array | null;
  /** Triangle corners as read; edge codes are only reused while positions still match. */
  points: Float32Array;
}

/** `rail.extra.skate` for native-spline rails. */
export interface SkateRailExtra {
  native: Uint8Array;
  /** JSON of the sampled points; the native spline is written back while points are unchanged. */
  sampled: string;
}

export function isSkateMapExtra(v: unknown): v is SkateMapExtra {
  return !!v && typeof v === 'object' && Array.isArray((v as SkateMapExtra).materials)
    && Array.isArray((v as SkateMapExtra).extensions);
}
