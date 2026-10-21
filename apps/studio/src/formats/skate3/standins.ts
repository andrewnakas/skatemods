// SPDX-License-Identifier: GPL-3.0-or-later
// Generated stand-in textures for materials a mod borrows from the base game (or leaves untextured).
// Every pixel here is computed from a seed and a small palette; no game data is used.

export type StandinClass =
  | 'concrete' | 'asphalt' | 'wood' | 'metal' | 'rust' | 'brick' | 'tile' | 'grass' | 'dirt' | 'sand'
  | 'rock' | 'paint' | 'plastic' | 'fabric' | 'glass' | 'water' | 'foliage' | 'default';

const RULES: [StandinClass, RegExp][] = [
  ['foliage', /leaf|leaves|foliage|fern|bush|hedge|tree|ivy|plant|flower/],
  ['grass', /grass|lawn|turf/],
  ['water', /water|pool(?!.*(coping|deck))/],
  ['glass', /glass|window/],
  ['asphalt', /asphalt|tarmac|road|street/],
  ['concrete', /concrete|cement|curb|kerb|sidewalk|pavement|ledge|plaza/],
  ['brick', /brick|masonry/],
  ['tile', /tile|ceramic/],
  ['rust', /rust|corrod/],
  ['metal', /metal|steel|iron|alumin|chrome|rail|pipe|grate/],
  ['wood', /wood|plank|lumber|timber|ply|bench|deck|ramp/],
  ['sand', /sand|beach/],
  ['dirt', /dirt|mud|soil|ground|trail|gravel/],
  ['rock', /rock|stone|cliff|boulder|mountain/],
  ['paint', /paint|graffiti|sign|decal/],
  ['plastic', /plastic|rubber/],
  ['fabric', /fabric|textile|cloth|canvas/],
];

/** Pick a class from material / texture names (first rule that matches any name wins). */
export function classify(...names: (string | undefined)[]): StandinClass {
  const s = names.filter(Boolean).join(' ').toLowerCase();
  for (const [c, rx] of RULES) if (rx.test(s)) return c;
  return 'default';
}

interface Recipe { a: [number, number, number]; b: [number, number, number]; scale: number; octaves: number; grain: number; stripes?: number; bricks?: boolean; alpha?: number }
const RECIPES: Record<StandinClass, Recipe> = {
  concrete: { a: [150, 148, 142], b: [118, 116, 112], scale: 24, octaves: 5, grain: 18 },
  asphalt: { a: [72, 72, 74], b: [46, 46, 48], scale: 6, octaves: 4, grain: 30 },
  wood: { a: [150, 108, 66], b: [104, 70, 40], scale: 40, octaves: 3, grain: 10, stripes: 22 },
  metal: { a: [160, 164, 168], b: [118, 122, 128], scale: 60, octaves: 3, grain: 8 },
  rust: { a: [140, 78, 40], b: [92, 52, 32], scale: 18, octaves: 5, grain: 20 },
  brick: { a: [150, 70, 52], b: [112, 50, 40], scale: 20, octaves: 3, grain: 14, bricks: true },
  tile: { a: [200, 200, 196], b: [170, 170, 166], scale: 50, octaves: 2, grain: 6, bricks: true },
  grass: { a: [86, 124, 54], b: [54, 88, 34], scale: 10, octaves: 5, grain: 26 },
  dirt: { a: [128, 100, 72], b: [92, 70, 50], scale: 14, octaves: 5, grain: 22 },
  sand: { a: [206, 186, 146], b: [180, 160, 122], scale: 10, octaves: 4, grain: 16 },
  rock: { a: [124, 120, 114], b: [80, 78, 74], scale: 12, octaves: 6, grain: 20 },
  paint: { a: [176, 60, 52], b: [150, 48, 42], scale: 40, octaves: 2, grain: 6 },
  plastic: { a: [60, 110, 170], b: [50, 96, 150], scale: 60, octaves: 2, grain: 4 },
  fabric: { a: [120, 96, 140], b: [96, 76, 112], scale: 30, octaves: 2, grain: 12, stripes: 64 },
  glass: { a: [150, 180, 196], b: [120, 150, 170], scale: 60, octaves: 2, grain: 2, alpha: 120 },
  water: { a: [40, 90, 120], b: [28, 66, 92], scale: 8, octaves: 4, grain: 4 },
  foliage: { a: [70, 110, 44], b: [40, 72, 28], scale: 16, octaves: 4, grain: 30 },
  default: { a: [140, 140, 140], b: [110, 110, 110], scale: 24, octaves: 4, grain: 10 },
};

function hash(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Tileable value noise on a period-sized lattice. */
function noise(x: number, y: number, period: number, seed: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const w = (i: number) => ((i % period) + period) % period;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = hash(w(x0), w(y0), seed), b = hash(w(x0 + 1), w(y0), seed), c = hash(w(x0), w(y0 + 1), seed), d = hash(w(x0 + 1), w(y0 + 1), seed);
  const u = s(fx), v = s(fy);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function heightField(r: Recipe, size: number, seed: number): Float32Array {
  const hgt = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let f = 0, amp = 1, tot = 0, period = Math.max(2, Math.round(size / r.scale));
    for (let o = 0; o < r.octaves; o++) {
      f += amp * noise((x / size) * period, (y / size) * period, period, seed + o);
      tot += amp; amp *= 0.5; period *= 2;
    }
    let v = f / tot;
    if (r.stripes) v = 0.6 * v + 0.4 * (0.5 + 0.5 * Math.sin((y / size) * Math.PI * 2 * r.stripes + v * 6));
    if (r.bricks) {
      const rows = 8, cols = 4, ry = (y / size) * rows, row = Math.floor(ry);
      const rx = (x / size) * cols + (row % 2) * 0.5;
      const mortar = Math.min(ry - row, 1 - (ry - row)) < 0.06 || Math.min(rx % 1, 1 - (rx % 1)) < 0.03;
      v = mortar ? 0.15 : 0.45 + 0.55 * v;
    }
    hgt[y * size + x] = v;
  }
  return hgt;
}

export interface StandinSet { cls: StandinClass; size: number; albedo: Uint8Array; normal: Uint8Array }

const cache = new Map<string, StandinSet>();

/** Albedo (RGBA) + tangent normal map for a class, tileable, deterministic. */
export function standin(cls: StandinClass, size = 256): StandinSet {
  const k = `${cls}:${size}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const r = RECIPES[cls];
  const seed = [...cls].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) & 0xffff;
  const hgt = heightField(r, size, seed);
  const albedo = new Uint8Array(size * size * 4), normal = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, v = hgt[i];
    const g = (hash(x, y, seed + 99) - 0.5) * r.grain;
    for (let c = 0; c < 3; c++) albedo[4 * i + c] = Math.max(0, Math.min(255, Math.round(r.b[c] + (r.a[c] - r.b[c]) * v + g)));
    albedo[4 * i + 3] = r.alpha ?? 255;
    const dx = hgt[y * size + ((x + 1) % size)] - hgt[y * size + ((x + size - 1) % size)];
    const dy = hgt[((y + 1) % size) * size + x] - hgt[((y + size - 1) % size) * size + x];
    const nx = -dx * 2, ny = -dy * 2, nz = 1, l = Math.hypot(nx, ny, nz);
    normal[4 * i] = Math.round((nx / l * 0.5 + 0.5) * 255);
    normal[4 * i + 1] = Math.round((ny / l * 0.5 + 0.5) * 255);
    normal[4 * i + 2] = Math.round((nz / l * 0.5 + 0.5) * 255);
    normal[4 * i + 3] = 255;
  }
  const s = { cls, size, albedo, normal };
  cache.set(k, s);
  return s;
}
