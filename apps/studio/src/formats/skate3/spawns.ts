// SPDX-License-Identifier: GPL-3.0-or-later
// Spawn markers on open, flat ground (port of skate4to3/sk4/find_spawns.py `run`, minus the GLB reading):
// an up-facing ground surface, level across its 3x3 neighbourhood of 1 m cells, nothing between 0.2 m and
// 2.4 m above it, no roof within 15 m and at most 35% of the ring within 5 m walled.
import type { Vec3 } from './grind.ts';

const CLEAR_LO = 0.2, CLEAR_HI = 2.4, SUPPORT_TOL = 0.3, STAND = 0.5;
const ROOF_HI = 15.0, OPEN_RADIUS = 5, WALL_LO = 1.2, WALL_HI = 4.0, MAX_WALL_FRAC = 0.35;

export interface Spawn { name: string; kind: 'startline' | 'checkpoint'; x: number; y: number; z: number; yaw: number }

export class Grid {
  cells = new Map<number, number[]>();
  static key(ix: number, iz: number) { return (ix + 1048576) * 2097152 + (iz + 1048576); }
  heights(ix: number, iz: number): number[] { return this.cells.get(Grid.key(ix, iz)) ?? []; }
  get size() { return this.cells.size; }
  /** Is there a sample at most `depth` below p (within its 1 m cell or a neighbour)? */
  below(p: readonly number[], depth: number): boolean {
    const ix = Math.floor(p[0]), iz = Math.floor(p[2]);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++)
      if (this.heights(ix + dx, iz + dz).some((h) => h <= p[1] + 0.5 && h >= p[1] - depth)) return true;
    return false;
  }
  /** One height sample; heights within a cell are kept once per 5 cm (enough for the 0.2-0.3 m tests). */
  add(x: number, y: number, z: number) {
    const k = Grid.key(Math.floor(x), Math.floor(z));
    const q = Math.round(y * 20) / 20;
    const l = this.cells.get(k);
    if (!l) this.cells.set(k, [q]); else if (!l.includes(q)) l.push(q);
  }
  /** Points on every triangle at <= spacing (as find_spawns.surface_samples); upOnly keeps faces within ~32 deg of +Y. */
  addTriangles(P: Float32Array, T: Uint32Array, upOnly: boolean, spacing = 0.9) {
    for (let t = 0; t < T.length; t += 3) {
      const a = 3 * T[t], b = 3 * T[t + 1], c = 3 * T[t + 2];
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      if (upOnly) {
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        if (!(ny > 0.85 * Math.hypot(nx, ny, nz))) continue;
      }
      const emax = Math.max(Math.hypot(ux, uy, uz), Math.hypot(P[c] - P[b], P[c + 1] - P[b + 1], P[c + 2] - P[b + 2]), Math.hypot(vx, vy, vz));
      const s = Math.min(40, Math.max(1, Math.ceil(emax / spacing)));
      for (let i = 0; i <= s; i++) for (let j = 0; j <= s - i; j++) {
        const p = i / s, q = j / s;
        this.add(P[a] + p * ux + q * vx, P[a + 1] + p * uy + q * vy, P[a + 2] + p * uz + q * vz);
      }
    }
  }
}

function openAir(solid: Grid, ix: number, iz: number, h: number): boolean {
  for (let du = -1; du <= 1; du++) for (let dv = -1; dv <= 1; dv++)
    if (solid.heights(ix + du, iz + dv).some((s) => s > h + CLEAR_HI && s < h + ROOF_HI)) return false;
  let walls = 0, total = 0;
  for (let du = -OPEN_RADIUS; du <= OPEN_RADIUS; du++) for (let dv = -OPEN_RADIUS; dv <= OPEN_RADIUS; dv++) {
    if (Math.max(Math.abs(du), Math.abs(dv)) < 2) continue;
    total++;
    if (solid.heights(ix + du, iz + dv).some((s) => s > h + WALL_LO && s < h + WALL_HI)) walls++;
  }
  return walls <= MAX_WALL_FRAC * total;
}

function standable(ground: Grid, solid: Grid, ix: number, iz: number): number[] {
  const out: number[] = [];
  const hs = [...new Set(ground.heights(ix, iz).map((v) => Math.round(v * 4) / 4))].sort((a, b) => b - a);
  for (const h of hs) {
    let support = 0, blocked = false;
    for (let du = -1; du <= 1; du++) for (let dv = -1; dv <= 1; dv++) {
      if (ground.heights(ix + du, iz + dv).some((g) => Math.abs(g - h) <= SUPPORT_TOL)) support++;
      if (solid.heights(ix + du, iz + dv).some((s) => s > h + CLEAR_LO && s < h + CLEAR_HI)) blocked = true;
    }
    if (support >= 8 && !blocked && openAir(solid, ix, iz, h)) out.push(h);
  }
  return out;
}

function search(ground: Grid, solid: Grid, x: number, z: number, radius: number, taken: Vec3[], minGap = 6.0): Vec3 | null {
  for (let r = 0; r <= radius; r++) {
    for (let u = -r; u <= r; u++) for (let v = -r; v <= r; v++) {
      if (Math.max(Math.abs(u), Math.abs(v)) !== r) continue;
      const ix = Math.floor(x) + u, iz = Math.floor(z) + v;
      if (taken.some((t) => Math.hypot(ix + 0.5 - t[0], iz + 0.5 - t[2]) < minGap)) continue;
      const hs = standable(ground, solid, ix, iz);
      if (hs.length) return [ix + 0.5, hs[0], iz + 0.5];
    }
  }
  return null;
}

/** Centres of the densest feature clusters, densest first, at least `gap` apart. */
function featureClusters(feats: Vec3[], radius = 25, gap = 60, n = 9): [number, number, number][] {
  const score = feats.map((a) => feats.filter((b) => Math.hypot(a[0] - b[0], a[2] - b[2]) < radius).length);
  const order = feats.map((_, i) => i).sort((a, b) => score[b] - score[a] || a - b);
  const out: [number, number, number][] = [];
  for (const i of order) {
    const near = feats.filter((b) => Math.hypot(feats[i][0] - b[0], feats[i][2] - b[2]) < radius);
    const cx = near.reduce((s, p) => s + p[0], 0) / near.length, cz = near.reduce((s, p) => s + p[2], 0) / near.length;
    if (out.every((o) => Math.hypot(cx - o[0], cz - o[1]) >= gap)) out.push([cx, cz, score[i]]);
    if (out.length >= n) break;
  }
  return out;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * ground/solid: surface samples ({pts, up}) of walkable-class and all render geometry.
 * rails: grind polylines; features: skate-feature positions (rail midpoints work).
 */
export function findSpawns(ground: Grid, solid: Grid, rails: Vec3[][], features: Vec3[], name: string, checkpoints = 8,
  authored: { pos: Vec3; yaw: number } | null = null): Spawn[] {
  const spawns: Spawn[] = [], taken: Vec3[] = [];
  const all = rails.flat();
  const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
  let tx = med(all.map((p) => p[0])), tz = med(all.map((p) => p[2]));
  const clusters = features.length ? featureClusters(features) : [];
  let start: Vec3 | null = null;
  if (clusters.length) { tx = clusters[0][0]; tz = clusters[0][1]; start = search(ground, solid, tx, tz, 40, taken); }
  if (!start) start = search(ground, solid, tx, tz, 150, taken);
  if (!start) {
    // no rails or nothing standable near them: the highest open ground cell anywhere
    let best: Vec3 | null = null;
    const cells = [...ground.cells.entries()].map(([k, ys]) => [k, Math.max(...ys)] as [number, number]).sort((a, b) => b[1] - a[1]).slice(0, 6000);
    for (const [k, ymax] of cells) {
      if (best && ymax <= best[1]) break;
      const ix = Math.floor(k / 2097152) - 1048576, iz = (k % 2097152) - 1048576;
      const hs = standable(ground, solid, ix, iz);
      if (hs.length && (!best || hs[0] > best[1])) best = [ix + 0.5, hs[0], iz + 0.5];
    }
    start = best;
  }
  if (authored) {
    // the map's own spawn (already a standing position): the start, the guessed spots become checkpoints
    spawns.push({ name, kind: 'startline', x: r3(authored.pos[0]), y: r3(authored.pos[1]), z: r3(authored.pos[2]), yaw: authored.yaw });
    taken.push(authored.pos);
    if (start) { taken.push(start); spawns.push({ name: `Spot ${spawns.length}`, kind: 'checkpoint', x: r3(start[0]), y: r3(start[1] + STAND), z: r3(start[2]), yaw: 0 }); }
  } else {
    if (!start) return [];
    spawns.push({ name, kind: 'startline', x: r3(start[0]), y: r3(start[1] + STAND), z: r3(start[2]), yaw: 0 });
    taken.push(start);
  }
  for (const [cx, cz] of clusters.slice(1)) {
    if (spawns.length > checkpoints) break;
    const got = search(ground, solid, cx, cz, 25, taken);
    if (got) { taken.push(got); spawns.push({ name: `Spot ${spawns.length}`, kind: 'checkpoint', x: r3(got[0]), y: r3(got[1] + STAND), z: r3(got[2]), yaw: 0 }); }
  }
  const lens = rails.map((l) => l.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - l[i][0], p[1] - l[i][1], p[2] - l[i][2]), 0));
  for (const i of lens.map((_, i) => i).sort((a, b) => lens[b] - lens[a])) {
    if (spawns.length > checkpoints) break;
    const l = rails[i];
    let d = [l[1][0] - l[0][0], l[1][1] - l[0][1], l[1][2] - l[0][2]];
    const n = Math.hypot(d[0], d[1], d[2]) || 1;
    d = d.map((x) => x / n);
    const got = search(ground, solid, l[0][0] - 4 * d[0], l[0][2] - 4 * d[2], 4, taken);
    if (got) {
      taken.push(got);
      spawns.push({ name: `Rail ${spawns.length}`, kind: 'checkpoint', x: r3(got[0]), y: r3(got[1] + STAND), z: r3(got[2]), yaw: Math.round(Math.atan2(d[0], d[2]) * 180 / Math.PI * 100) / 100 });
    }
  }
  return spawns;
}
