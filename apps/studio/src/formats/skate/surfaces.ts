// MapIR SurfaceId <-> SKATE (audio, physics, pattern) surface triples.
//
// In .skate the surface lives on the material: each collision triangle points
// at a material, and the engine packs `audio | physics << 7 | pattern << 12`
// (EncodeRwSurfaceId, crates/skate-game/src/skate_world.rs). The tables below
// come from the Blender addon (owned_world_material_addon/__init__.py:
// _AUDIO_NAMES, PHYSICS_ITEMS, PATTERN_ITEMS and the material PRESETS).
import type { SurfaceId } from '../../ir';

/** Native Skate 3 audio surface names, index = id (addon `_AUDIO_NAMES`). */
export const SKATE_AUDIO_NAMES = (
  'Undefined|Asphalt_Smooth|Asphalt_Rough|Concrete_Polished|Concrete_Rough|' +
  'Concrete_Aggregate|Wood_Ramp|Plywood|Dirt|Metal|Grass|' +
  'Metal_Solid_Round_1|Metal_Solid_Round_1_Up|Metal_Solid_Round_2|' +
  'Metal_Solid_Square_1|Metal_Solid_Square_2|Metal_Hollow_Round_1|' +
  'Metal_Hollow_Round_1_Dead|Metal_Hollow_Round_1_Dn|Metal_Hollow_Round_2|' +
  'Metal_Hollow_Round_2_Dead|Metal_Hollow_Round_2_Dn|Metal_Hollow_Round_3|' +
  'Metal_Hollow_Round_4|Metal_Hollow_Square_1|Metal_Hollow_Square_2|' +
  'Metal_Hollow_Square_3|Metal_Hollow_Square_3_Dead|Metal_Hollow_Square_4|' +
  'Metal_Hollow_1|Metal_Hollow_2|Metal_Sheet|Metal_Complex_1|Metal_Complex_2|' +
  'Metal_Complex_3|Metal_Complex_4|Metal_Complex_5|Metal_Complex_6|' +
  'Metal_Complex_7|Metal_Complex_8|Metal_Complex_Debris|Wood_1|Wood_1_Up|' +
  'Wood_2|Wood_3|Wood_3_Up|Wood_4|Plastic_1|Plastic_2|Plastic_3|Plastic_4|' +
  'Glass_Thick_Large|Glass_Thin_Small|Concrete_Curb|Concrete_Bench|Leaves|' +
  'Bush|Pottery|Paper|Cardboard|Garbage_Bag|Garbage_Spill|Bottle|' +
  'Tile_Ceramic|Marble_or_Slate|Brick_Smooth|Brick_Coarse|Manhole_Metal|' +
  'Metal_Grate_Sewer|Metal_Grate_Planter|DeepSnow|PackedSnow|Ice|Antennas|' +
  'Chandelier|Plexiglass_Small|Plexiglass_Large|Potted_Plant|Crumpled_Paper|' +
  'Cloth|Pop_Can|Paper_Cup|Wire_Cable|VolleyBall|OilDrum|DMORail|Fruit|' +
  'Plastic_Bottle|Drum_Pylon|Metal_Rail_4|Wood_5|Metal_Ramp|' +
  'Complex_Plastic_1|Max_Mappable_Surface'
).split('|');

/** Addon PHYSICS_ITEMS. */
export const SKATE_PHYSICS_NAMES = [
  'Undefined', 'Smooth', 'Rough', 'Slow', 'Slippery', 'VerySlow', 'Unrideable', 'DoNotAlign', 'Stair',
  'InstantBail', 'SlipperyRagdoll', 'BouncyRagdoll', 'Water', 'Retail13',
];

/** Addon PATTERN_ITEMS. */
export const SKATE_PATTERN_NAMES = [
  'None', 'SpiderCrack', 'Square2x2', 'Square4x4', 'Square8x8', 'Square12x12', 'Square24x24', 'IrregularSmall',
  'IrregularMedium', 'IrregularLarge', 'Slats', 'Sidewalk', 'BrickTileRandomSize', 'MiniTile', 'Special1', 'Special2',
];

export interface SkateSurface { audio: number; physics: number; pattern: number }

const audio = (name: string): number => {
  const i = SKATE_AUDIO_NAMES.indexOf(name);
  if (i < 0) throw new Error(`unknown SKATE audio surface ${name}`);
  return i;
};
const physics = (name: string): number => SKATE_PHYSICS_NAMES.indexOf(name);
const pattern = (name: string): number => SKATE_PATTERN_NAMES.indexOf(name);

/**
 * MapIR surface -> SKATE triple. Where the addon has a preset it is used
 * verbatim (CONCRETE, ROUGH_CONCRETE, ASPHALT, WOOD, METAL_SHEET, GRASS, TILE,
 * GLASS, WATER); the rest pick the matching native audio surface with the
 * addon's default physics (Smooth) and a fitting contact pattern.
 */
export const SKATE_SURFACES: Record<SurfaceId, SkateSurface> = {
  // Addon defaults for a new material: audio 3, physics 1, pattern 0 (= CONCRETE preset).
  default: { audio: audio('Concrete_Polished'), physics: physics('Smooth'), pattern: pattern('None') },
  smooth_concrete: { audio: audio('Concrete_Polished'), physics: physics('Smooth'), pattern: pattern('None') }, // CONCRETE
  concrete: { audio: audio('Concrete_Rough'), physics: physics('Rough'), pattern: pattern('None') }, // ROUGH_CONCRETE
  asphalt: { audio: audio('Asphalt_Rough'), physics: physics('Rough'), pattern: pattern('IrregularSmall') }, // ASPHALT
  brick: { audio: audio('Brick_Smooth'), physics: physics('Rough'), pattern: pattern('BrickTileRandomSize') },
  wood: { audio: audio('Wood_Ramp'), physics: physics('Smooth'), pattern: pattern('Slats') }, // WOOD
  metal: { audio: audio('Metal_Sheet'), physics: physics('Smooth'), pattern: pattern('None') }, // METAL_SHEET
  metal_grate: { audio: audio('Metal_Grate_Sewer'), physics: physics('Smooth'), pattern: pattern('None') },
  marble: { audio: audio('Marble_or_Slate'), physics: physics('Smooth'), pattern: pattern('Square8x8') },
  plastic: { audio: audio('Plastic_1'), physics: physics('Smooth'), pattern: pattern('None') },
  glass: { audio: audio('Glass_Thick_Large'), physics: physics('Smooth'), pattern: pattern('None') }, // GLASS
  grass: { audio: audio('Grass'), physics: physics('Slow'), pattern: pattern('IrregularSmall') }, // GRASS
  dirt: { audio: audio('Dirt'), physics: physics('Slow'), pattern: pattern('IrregularSmall') },
  water: { audio: audio('Undefined'), physics: physics('Water'), pattern: pattern('None') }, // WATER
};

/** Metal rail sound, for grind geometry (addon METAL_RAIL preset). */
export const SKATE_RAIL_SURFACE: SkateSurface = { audio: audio('Metal_Solid_Round_1'), physics: physics('Smooth'), pattern: pattern('None') };

export function skateSurface(id: SurfaceId): SkateSurface {
  return SKATE_SURFACES[id] ?? SKATE_SURFACES.default;
}

export function sameSkateSurface(a: SkateSurface, b: SkateSurface): boolean {
  return a.audio === b.audio && a.physics === b.physics && a.pattern === b.pattern;
}

/** The value the engine stores per collision triangle. */
export function packSkateSurface(s: SkateSurface): number {
  return (s.audio | (s.physics << 7) | (s.pattern << 12)) & 0xffff;
}

const AUDIO_HINTS: [RegExp, SurfaceId][] = [
  [/grate|manhole/i, 'metal_grate'],
  [/metal|rail|antenna|oildrum|pop_can|wire|chandelier/i, 'metal'],
  [/wood|plywood/i, 'wood'],
  [/brick/i, 'brick'],
  [/asphalt/i, 'asphalt'],
  [/marble|tile/i, 'marble'],
  [/glass|plexiglass|bottle$/i, 'glass'],
  [/plastic|pylon|volleyball/i, 'plastic'],
  [/grass|leaves|bush|plant/i, 'grass'],
  [/dirt|snow|ice/i, 'dirt'],
  [/concrete_polished/i, 'smooth_concrete'],
  [/concrete/i, 'concrete'],
];

/** SKATE triple -> closest MapIR surface (exact table match first, then by audio name). */
export function surfaceFromSkate(s: SkateSurface): SurfaceId {
  if (s.physics === physics('Water')) return 'water';
  // Prefer the specific ids over 'default' when the triple is shared.
  for (const [id, t] of Object.entries(SKATE_SURFACES) as [SurfaceId, SkateSurface][]) {
    if (id !== 'default' && sameSkateSurface(s, t)) return id;
  }
  const name = SKATE_AUDIO_NAMES[s.audio] ?? '';
  for (const [re, id] of AUDIO_HINTS) if (re.test(name)) return id;
  return 'default';
}
