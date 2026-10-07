import type { CollisionMode, SurfaceId } from './ir';

export interface SurfaceInfo { id: SurfaceId; label: string; color: number }

/** Shown in the editor; colors tint the collision overlay. */
export const SURFACES: SurfaceInfo[] = [
  { id: 'concrete', label: 'Concrete', color: 0x9a9a92 },
  { id: 'smooth_concrete', label: 'Smooth concrete', color: 0xc4c2b8 },
  { id: 'asphalt', label: 'Asphalt', color: 0x4a4a4e },
  { id: 'brick', label: 'Brick', color: 0xa0523d },
  { id: 'wood', label: 'Wood', color: 0xb98a4e },
  { id: 'metal', label: 'Metal', color: 0x8fa3b3 },
  { id: 'metal_grate', label: 'Metal grate', color: 0x6f8190 },
  { id: 'marble', label: 'Marble', color: 0xe6e1d6 },
  { id: 'plastic', label: 'Plastic', color: 0xd8c84a },
  { id: 'glass', label: 'Glass', color: 0x9fd6e0 },
  { id: 'grass', label: 'Grass', color: 0x5f9a3c },
  { id: 'dirt', label: 'Dirt', color: 0x7a5a3a },
  { id: 'water', label: 'Water', color: 0x2f6fb0 },
  { id: 'default', label: 'Default', color: 0xb0b0b0 },
];

export const COLLISION_MODES: { id: CollisionMode; label: string; hint: string }[] = [
  { id: 'mesh', label: 'Exact triangles', hint: 'Floors, walls, bowls: the faces as modelled' },
  { id: 'convex', label: 'Convex pieces', hint: 'Props: split into convex parts' },
  { id: 'hull', label: 'Single hull', hint: 'Wrap the object in one convex shape' },
  { id: 'none', label: 'None', hint: 'Visual only, skate through it' },
  { id: 'water', label: 'Water', hint: 'Exact faces that float the skater' },
];

/**
 * ReSkate (skate.) MaterialDecl.Packed values, from ReSkate Studio's
 * NATIVE_COLLISION_MATERIALS table (Native/Blender/sk8_map_export.py).
 * Identifier in map.json is `material_${packed padded to 4}`.
 */
export const RESKATE_PACKED: Record<SurfaceId, number> = {
  default: 32,
  concrete: 96,
  smooth_concrete: 800,
  asphalt: 160,
  brick: 2016,
  wood: 3680,      // Wood Thick Rough
  metal: 352,
  metal_grate: 1632,
  marble: 480,
  plastic: 3296,
  glass: 2144,
  grass: 608,
  dirt: 3488,      // Earth
  water: 15730592, // Water + Water
};
/** Metal Rail + surface analysis (smooth grind), Studio's default for grind curves. */
export const RESKATE_RAIL_PACKED = 37227424;

export function reskateMaterialId(packed: number): string {
  return `material_${String(packed).padStart(4, '0')}`;
}

export function surfaceFromReskatePacked(packed: number): SurfaceId {
  for (const [id, p] of Object.entries(RESKATE_PACKED)) if (p === packed) return id as SurfaceId;
  return 'default';
}

const NAME_HINTS: [RegExp, SurfaceId][] = [
  [/grate/i, 'metal_grate'],
  [/rail|metal|steel|iron|alu/i, 'metal'],
  [/wood|plank|ply/i, 'wood'],
  [/brick/i, 'brick'],
  [/asphalt|road|tarmac/i, 'asphalt'],
  [/marble|tile/i, 'marble'],
  [/glass|window/i, 'glass'],
  [/grass|lawn/i, 'grass'],
  [/dirt|soil|mud|sand|earth/i, 'dirt'],
  [/water|pool|ocean|river/i, 'water'],
  [/plastic/i, 'plastic'],
  [/smooth|polish/i, 'smooth_concrete'],
  [/concrete|cement|stone|pave/i, 'concrete'],
];

/** Guesses a surface from a material or object name; concrete when nothing matches. */
export function guessSurface(name: string): SurfaceId {
  for (const [re, id] of NAME_HINTS) if (re.test(name)) return id;
  return 'concrete';
}
