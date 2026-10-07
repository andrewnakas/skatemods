// MapIR: the one in-memory map every importer produces and every exporter consumes.
// World space is Y-up, metres, right-handed (the same as .skate, ReSkate map.json and
// Skate 3 PSG world space). Importers convert from Z-up / centimetre sources.

export type Vec3 = [number, number, number];
/** Column-major 4x4 (three.js Matrix4.elements order). */
export type Mat4 = number[];

export const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Gameplay surface, shared by every target. See surfaces.ts for per-format ids. */
export type SurfaceId =
  | 'default' | 'concrete' | 'smooth_concrete' | 'asphalt' | 'brick' | 'wood' | 'metal'
  | 'metal_grate' | 'marble' | 'plastic' | 'glass' | 'grass' | 'dirt' | 'water';

/**
 * How an object collides. Names follow ReSkate Studio's COLLISION_MODES:
 * mesh = exact triangles, convex = convex pieces, hull = one convex envelope,
 * none = visual only, water = exact faces with water behaviour.
 */
export type CollisionMode = 'mesh' | 'convex' | 'hull' | 'none' | 'water';

export interface Texture {
  name: string;
  width: number;
  height: number;
  /** Decoded RGBA8, top row first. Present unless only `encoded` is known. */
  rgba?: Uint8Array;
  /** Original file bytes (PNG/JPEG/...) when the source had them; exporters may pass these through. */
  encoded?: { mime: string; bytes: Uint8Array };
  srgb: boolean;
}

export interface Material {
  name: string;
  /** Linear RGBA multiplier. */
  color: [number, number, number, number];
  roughness: number;
  metallic: number;
  emissive: number;
  /** Indices into MapIR.textures. */
  textures: { albedo?: number; normal?: number; orm?: number; emissive?: number; lightmap?: number };
  alphaMode: 'opaque' | 'mask' | 'blend';
  alphaCutoff: number;
  doubleSided: boolean;
  /** Surface used when an object does not set one. */
  surface: SurfaceId;
}

export interface MeshGroup { start: number; count: number; material: number }

export interface Mesh {
  positions: Float32Array; // xyz per vertex
  normals?: Float32Array;  // xyz per vertex
  uvs?: Float32Array;      // uv per vertex, v=0 at the top of the image (glTF convention)
  uv2?: Float32Array;      // lightmap uv
  indices: Uint32Array;    // triangles
  /** Index ranges per material. Covers all of `indices`. */
  groups: MeshGroup[];
}

export interface MapObject {
  name: string;
  mesh: Mesh;
  /** Local-to-world. */
  transform: Mat4;
  render: boolean;
  collision: { mode: CollisionMode; surface?: SurfaceId };
  /** Format-specific data an importer wants carried to the same format's exporter. */
  extra?: Record<string, unknown>;
}

export interface Rail {
  name: string;
  points: Vec3[];
  closed: boolean;
  surface?: SurfaceId;
  extra?: Record<string, unknown>;
}

/**
 * Yaw in degrees about +Y. 0 faces +Z; positive turns toward +X
 * (yaw = atan2(forward.x, forward.z)), which is how ReSkate's map.json stores it.
 * Position is where the skater's wheels touch the ground.
 */
export interface Spawn { name: string; position: Vec3; yaw: number }

export interface Light {
  name: string;
  kind: 'point' | 'spot' | 'sun';
  position: Vec3;
  direction?: Vec3;
  color: Vec3;
  intensity: number;
  range?: number;
}

export interface MapIR {
  name: string;
  textures: Texture[];
  materials: Material[];
  objects: MapObject[];
  rails: Rail[];
  spawns: Spawn[];
  lights: Light[];
  /** Where the map came from, e.g. "blend 4.5", "skate SKATE15", "reskate handshake". */
  source: string;
  warnings: string[];
  /** Whole-map format-specific passthrough, keyed by format ("skate", "reskate", "skate3"). */
  extra?: Record<string, unknown>;
}

export function emptyMap(name: string, source: string): MapIR {
  return { name, textures: [], materials: [], objects: [], rails: [], spawns: [], lights: [], source, warnings: [] };
}

export function defaultMaterial(name = 'default'): Material {
  return {
    name, color: [1, 1, 1, 1], roughness: 0.8, metallic: 0, emissive: 0, textures: {},
    alphaMode: 'opaque', alphaCutoff: 0.5, doubleSided: false, surface: 'concrete',
  };
}

export function triangleCount(map: MapIR): number {
  return map.objects.reduce((n, o) => n + o.mesh.indices.length / 3, 0);
}

/** Applies `m` to point `p`. */
export function transformPoint(m: Mat4, p: Vec3): Vec3 {
  const [x, y, z] = p;
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

/** Basic structural checks shared by importers and exporters. Returns problems, empty when fine. */
export function validate(map: MapIR): string[] {
  const problems: string[] = [];
  map.objects.forEach((o, i) => {
    const m = o.mesh;
    const verts = m.positions.length / 3;
    if (m.indices.length % 3) problems.push(`${o.name}: index count is not a multiple of 3`);
    for (const idx of m.indices) if (idx >= verts) { problems.push(`${o.name}: index out of range`); break; }
    if (m.normals && m.normals.length !== m.positions.length) problems.push(`${o.name}: normal count mismatch`);
    if (m.uvs && m.uvs.length / 2 !== verts) problems.push(`${o.name}: uv count mismatch`);
    let covered = 0;
    for (const g of m.groups) {
      if (g.material < 0 || g.material >= map.materials.length) problems.push(`${o.name}: group ${i} material out of range`);
      covered += g.count;
    }
    if (covered !== m.indices.length) problems.push(`${o.name}: material groups cover ${covered} of ${m.indices.length} indices`);
  });
  for (const s of map.spawns) if (!s.position.every(Number.isFinite)) problems.push(`spawn ${s.name}: non-finite position`);
  return problems;
}
