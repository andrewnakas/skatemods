// Playability checks against skate.'s skater limits. The rule set and the limit values come
// from Skaterino by Rinoversal (github.com/Rinoversal/Skaterino, GPL-3.0), whose limits were
// dumped from skate.'s gameplay/skatephysicstuning with ReSkate Studio. This is a separate
// TypeScript implementation of the rules its README describes, run on MapIR in the browser.
import type { MapIR, Vec3 } from './ir';
import { weld } from './editor/edges';

export const LIMITS = {
  skaterHeight: 1.81,
  ollieMax: 1.575,
  bailSpeedDown: 15,
  gravity: 9.81,
  creaseDeg: 30,
  comfortableDrop: 6,
  stairRiser: [0.15, 0.19] as const,
  ledge: [0.3, 0.5] as const,
};
const BAIL_DROP = (LIMITS.bailSpeedDown ** 2) / (2 * LIMITS.gravity); // about 11.5 m

export interface CheckResult {
  id: 'scale' | 'drops' | 'ledges' | 'ramps' | 'overlays' | 'rails' | 'rooftops' | 'spawn';
  level: 'ok' | 'warn' | 'info';
  text: string;
  /** World positions to highlight. */
  points: Vec3[];
}

interface Tri { a: Vec3; b: Vec3; c: Vec3; n: Vec3; area: number; obj: number }

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const centroid = (t: Tri): Vec3 => [(t.a[0] + t.b[0] + t.c[0]) / 3, (t.a[1] + t.b[1] + t.c[1]) / 3, (t.a[2] + t.b[2] + t.c[2]) / 3];

/** Uniform XZ grid over triangles for vertical ray casts. */
class Grid {
  cells = new Map<string, number[]>();
  constructor(public tris: Tri[], public size = 2) {
    tris.forEach((t, i) => {
      const x0 = Math.floor(Math.min(t.a[0], t.b[0], t.c[0]) / size), x1 = Math.floor(Math.max(t.a[0], t.b[0], t.c[0]) / size);
      const z0 = Math.floor(Math.min(t.a[2], t.b[2], t.c[2]) / size), z1 = Math.floor(Math.max(t.a[2], t.b[2], t.c[2]) / size);
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > 4096) return; // giant triangle: skip from grid, handled by `big`
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const k = `${x},${z}`;
        const l = this.cells.get(k);
        if (l) l.push(i); else this.cells.set(k, [i]);
      }
    });
    this.big = tris.map((t, i) => i).filter(i => {
      const t = tris[i];
      const w = (Math.max(t.a[0], t.b[0], t.c[0]) - Math.min(t.a[0], t.b[0], t.c[0])) / size;
      const d = (Math.max(t.a[2], t.b[2], t.c[2]) - Math.min(t.a[2], t.b[2], t.c[2])) / size;
      return (w + 1) * (d + 1) > 4096;
    });
  }
  big: number[];

  near(x: number, z: number): number[] {
    return [...(this.cells.get(`${Math.floor(x / this.size)},${Math.floor(z / this.size)}`) ?? []), ...this.big];
  }

  /** Highest surface below (x, fromY, z), or null. */
  down(x: number, fromY: number, z: number): number | null {
    let best: number | null = null;
    for (const i of this.near(x, z)) {
      const t = this.tris[i];
      if (Math.abs(t.n[1]) < 1e-4) continue;
      const y = heightAt(t, x, z);
      if (y === null || y > fromY + 1e-3) continue;
      if (best === null || y > best) best = y;
    }
    return best;
  }
}

/** Height of the triangle's plane at (x, z) if (x, z) is inside its XZ projection. */
function heightAt(t: Tri, x: number, z: number): number | null {
  const [ax, , az] = t.a, [bx, , bz] = t.b, [cx, , cz] = t.c;
  const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  if (Math.abs(d) < 1e-12) return null;
  const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
  const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
  const l3 = 1 - l1 - l2;
  if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) return null;
  return l1 * t.a[1] + l2 * t.b[1] + l3 * t.c[1];
}

function mode(values: { v: number; w: number }[], bin = 0.01): number | null {
  if (!values.length) return null;
  const h = new Map<number, number>();
  for (const { v, w } of values) { const k = Math.round(v / bin); h.set(k, (h.get(k) ?? 0) + w); }
  let best = 0, bestW = -1;
  for (const [k, w] of h) if (w > bestW) { bestW = w; best = k; }
  return best * bin;
}

export function runChecks(map: MapIR, scale = 1): CheckResult[] {
  const tris: Tri[] = [];
  const welded: { verts: Vec3[]; tris: Uint32Array; obj: number }[] = [];
  map.objects.forEach((o, oi) => {
    if (o.collision.mode === 'none') return;
    const w = weld(o);
    if (scale !== 1) for (const v of w.verts) { v[0] *= scale; v[1] *= scale; v[2] *= scale; }
    welded.push({ ...w, obj: oi });
    for (let i = 0; i < w.tris.length; i += 3) {
      const a = w.verts[w.tris[i]], b = w.verts[w.tris[i + 1]], c = w.verts[w.tris[i + 2]];
      const cr = cross(sub(b, a), sub(c, a));
      const len = Math.hypot(...cr);
      if (len < 1e-10) continue;
      tris.push({ a, b, c, n: [cr[0] / len, cr[1] / len, cr[2] / len], area: len / 2, obj: oi });
    }
  });
  const results: CheckResult[] = [];
  if (!tris.length) return [{ id: 'scale', level: 'warn', text: 'No collision geometry to check.', points: [] }];
  const grid = new Grid(tris);

  // Scale, from stair risers (upright faces 12-25 cm tall).
  const risers: { v: number; w: number }[] = [], ledges: { v: number; w: number }[] = [];
  for (const t of tris) {
    if (Math.abs(t.n[1]) > 0.1) continue;
    const h = Math.max(t.a[1], t.b[1], t.c[1]) - Math.min(t.a[1], t.b[1], t.c[1]);
    if (h >= 0.12 && h <= 0.25) risers.push({ v: h, w: t.area });
    if (h >= 0.25 && h <= 0.7) ledges.push({ v: h, w: t.area });
  }
  const riser = risers.length >= 4 ? mode(risers) : null;
  if (riser === null) results.push({ id: 'scale', level: 'info', text: 'Scale: no stairs found to measure. The skater is 1.81 m tall; compare against the spawn marker.', points: [] });
  else if (riser >= LIMITS.stairRiser[0] && riser <= LIMITS.stairRiser[1])
    results.push({ id: 'scale', level: 'ok', text: `Scale: stair risers are ${riser.toFixed(2)} m, real-world size. Keep scale ${scale.toFixed(2)}.`, points: [] });
  else {
    const fix = (0.17 / riser) * scale;
    results.push({ id: 'scale', level: 'warn', text: `Scale: stair risers are ${riser.toFixed(2)} m; real steps are 0.15-0.19 m. Try scale ${fix.toFixed(2)}.`, points: [] });
  }
  const ledge = ledges.length >= 4 ? mode(ledges) : null;
  if (ledge !== null) results.push({
    id: 'ledges', level: ledge > LIMITS.ollieMax ? 'warn' : 'info',
    text: `Ledges: most are ${ledge.toFixed(2)} m tall (real ledges 0.3-0.5 m, highest ollie ${LIMITS.ollieMax} m).`, points: [],
  });

  // Drops: step 30 cm out from every open or convex edge of a floor and measure straight down.
  const dropPoints: Vec3[] = [], roughPoints: Vec3[] = [];
  for (const w of welded) {
    const edgeFaces = new Map<string, number[]>();
    for (let f = 0; f < w.tris.length / 3; f++) for (const [u, v] of [[0, 1], [1, 2], [2, 0]]) {
      const a = w.tris[f * 3 + u], b = w.tris[f * 3 + v];
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      (edgeFaces.get(k) ?? edgeFaces.set(k, []).get(k)!).push(f);
    }
    for (const [k, faces] of edgeFaces) {
      const f = faces[0];
      const ids = [w.tris[f * 3], w.tris[f * 3 + 1], w.tris[f * 3 + 2]];
      const [p0, p1, p2] = ids.map(i => w.verts[i]);
      const n = cross(sub(p1, p0), sub(p2, p0));
      const nl = Math.hypot(...n);
      if (nl < 1e-10 || n[1] / nl < 0.7) continue; // floors only
      if (faces.length === 2) {
        const g = faces[1];
        const q = [w.tris[g * 3], w.tris[g * 3 + 1], w.tris[g * 3 + 2]].map(i => w.verts[i]);
        const gn = cross(sub(q[1], q[0]), sub(q[2], q[0]));
        if (gn[1] / (Math.hypot(...gn) || 1) > 0.7) continue; // floor continues
      }
      const [u, v] = k.split('_').map(Number);
      const a = w.verts[u], b = w.verts[v];
      const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const c = [(p0[0] + p1[0] + p2[0]) / 3, (p0[2] + p1[2] + p2[2]) / 3];
      let ox = mid[0] - c[0], oz = mid[2] - c[1];
      // Outward = perpendicular to the edge, away from the face.
      const ex = b[0] - a[0], ez = b[2] - a[2];
      let px = -ez, pz = ex;
      if (px * ox + pz * oz < 0) { px = -px; pz = -pz; }
      const pl = Math.hypot(px, pz);
      if (pl < 1e-6) continue;
      ox = mid[0] + (px / pl) * 0.3; oz = mid[2] + (pz / pl) * 0.3;
      const below = grid.down(ox, mid[1] - 0.05, oz);
      const drop = below === null ? Infinity : mid[1] - below;
      if (drop > BAIL_DROP) dropPoints.push(mid);
      else if (drop > LIMITS.comfortableDrop) roughPoints.push(mid);
    }
  }
  results.push(dropPoints.length
    ? { id: 'drops', level: 'warn', text: `Drops: ${dropPoints.length} edges drop more than ${BAIL_DROP.toFixed(0)} m (or off the map), a guaranteed bail. Fence them, add a ramp, or accept the bail.`, points: dropPoints }
    : { id: 'drops', level: 'ok', text: `Drops: nothing over ${BAIL_DROP.toFixed(0)} m.`, points: [] });
  if (roughPoints.length) results.push({ id: 'drops', level: 'info', text: `${roughPoints.length} edges drop ${LIMITS.comfortableDrop}-${BAIL_DROP.toFixed(0)} m: survivable, but rough.`, points: roughPoints });

  // Ramps: folds between sloped faces. Over 30 degrees they become grind edges.
  const sharpFolds: Vec3[] = [];
  let bumpyFolds = 0;
  for (const w of welded) {
    const edgeFaces = new Map<string, number[]>();
    for (let f = 0; f < w.tris.length / 3; f++) for (const [u, v] of [[0, 1], [1, 2], [2, 0]]) {
      const a = w.tris[f * 3 + u], b = w.tris[f * 3 + v];
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      (edgeFaces.get(k) ?? edgeFaces.set(k, []).get(k)!).push(f);
    }
    const normal = (f: number): Vec3 => {
      const [p0, p1, p2] = [w.tris[f * 3], w.tris[f * 3 + 1], w.tris[f * 3 + 2]].map(i => w.verts[i]);
      const n = cross(sub(p1, p0), sub(p2, p0));
      const l = Math.hypot(...n) || 1;
      return [n[0] / l, n[1] / l, n[2] / l];
    };
    for (const [k, faces] of edgeFaces) {
      if (faces.length !== 2) continue;
      const n1 = normal(faces[0]), n2 = normal(faces[1]);
      const sloped = (n: Vec3) => n[1] > 0.17 && n[1] < 0.97;
      if (!sloped(n1) || !sloped(n2)) continue;
      const angle = (Math.acos(Math.max(-1, Math.min(1, dot(n1, n2)))) * 180) / Math.PI;
      if (angle > LIMITS.creaseDeg) {
        const [u, v] = k.split('_').map(Number);
        const a = w.verts[u], b = w.verts[v];
        sharpFolds.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
      } else if (angle > 8) bumpyFolds++;
    }
  }
  if (sharpFolds.length) results.push({ id: 'ramps', level: 'warn', text: `Ramps: ${sharpFolds.length} folds between ramp faces are sharper than 30 degrees and will act as grind edges. Subdivide and smooth the transitions.`, points: sharpFolds });
  else if (bumpyFolds > 20) results.push({ id: 'ramps', level: 'info', text: `Ramps: ${bumpyFolds} folds of 8-30 degrees; low-poly transitions ride bumpy.`, points: [] });
  else results.push({ id: 'ramps', level: 'ok', text: 'Ramps: transitions are smooth enough.', points: [] });

  // Overlays: faces lying flat on another face within 1 cm z-fight.
  const overlayPoints: Vec3[] = [];
  const checked = new Set<number>();
  tris.forEach((t, i) => {
    if (overlayPoints.length > 2000) return;
    const c = centroid(t);
    for (const j of grid.near(c[0], c[2])) {
      if (j === i || checked.has(j)) continue;
      const o = tris[j];
      if (dot(t.n, o.n) < 0.999) continue;
      const dist = Math.abs(dot(o.n, sub(c, o.a)));
      if (dist < 1e-4 || dist > 0.01) continue;
      // Floors and roofs only, and the centroid must land inside the other face.
      if (Math.abs(o.n[1]) <= 0.5 || heightAt(o, c[0], c[2]) === null) continue;
      overlayPoints.push(c);
      checked.add(i);
      break;
    }
  });
  results.push(overlayPoints.length
    ? { id: 'overlays', level: 'warn', text: `Overlays: ${overlayPoints.length} faces sit on another face within 1 cm and will flicker. Delete the painted layer or lift it 2 cm.`, points: overlayPoints }
    : { id: 'overlays', level: 'ok', text: 'Overlays: no stacked floor faces.', points: [] });

  // Rails: height above the ground below each point.
  if (map.rails.length) {
    const reach = LIMITS.ollieMax + 0.3;
    const heights: number[] = [], high: Vec3[] = [];
    for (const r of map.rails) for (const p0 of r.points) {
      const p: Vec3 = [p0[0] * scale, p0[1] * scale, p0[2] * scale];
      const g = grid.down(p[0], p[1] - 0.05, p[2]);
      if (g === null) continue;
      const h = p[1] - g;
      heights.push(h);
      if (h > reach) high.push(p);
    }
    heights.sort((a, b) => a - b);
    const median = heights.length ? heights[heights.length >> 1] : 0;
    const share = heights.length ? Math.round((high.length / heights.length) * 100) : 0;
    results.push({
      id: 'rails', level: high.length ? 'info' : 'ok',
      text: `Rails: ${map.rails.length} rails, median ${median.toFixed(2)} m above ground; ${share}% of rail points are above ollie reach (${reach.toFixed(2)} m).`,
      points: high,
    });
  }

  // Rooftops: walkable faces far above ground level.
  const floors = tris.filter(t => t.n[1] > 0.7).map(t => ({ y: centroid(t)[1], t }));
  if (floors.length) {
    const ys = floors.map(f => f.y).sort((a, b) => a - b);
    const ground = ys[Math.floor(ys.length * 0.1)];
    const roofs = floors.filter(f => f.y > ground + BAIL_DROP).map(f => centroid(f.t));
    if (roofs.length) results.push({ id: 'rooftops', level: 'info', text: `${roofs.length} walkable faces sit more than ${BAIL_DROP.toFixed(0)} m above ground level: rooftops you can only leave by bailing.`, points: roofs });
  }

  // Spawn: on something, not inside it.
  for (const s of map.spawns) {
    const g = grid.down(s.position[0] * scale, s.position[1] * scale + 0.5, s.position[2] * scale);
    if (g === null) results.push({ id: 'spawn', level: 'warn', text: `Spawn "${s.name}" has no ground under it.`, points: [s.position] });
    else if (Math.abs(g - s.position[1] * scale) > 0.3) results.push({ id: 'spawn', level: 'warn', text: `Spawn "${s.name}" is ${(s.position[1] * scale - g).toFixed(2)} m off the ground.`, points: [s.position] });
  }
  if (!map.spawns.length) results.push({ id: 'spawn', level: 'warn', text: 'No spawn yet. Use the Spawn tool, or Auto spawn.', points: [] });
  return results;
}

/** Picks a spawn: the centre of the largest flat, open floor area near the map's middle. */
export function autoSpawn(map: MapIR): { position: Vec3; yaw: number } | null {
  let best: { score: number; p: Vec3 } | null = null;
  const all: Vec3[] = [];
  map.objects.forEach(o => { if (o.collision.mode !== 'none') for (const v of weld(o).verts) all.push(v); });
  if (!all.length) return null;
  const mid: Vec3 = [0, 0, 0];
  for (const v of all) { mid[0] += v[0]; mid[2] += v[2]; }
  mid[0] /= all.length; mid[2] /= all.length;
  for (const o of map.objects) {
    if (o.collision.mode === 'none') continue;
    const w = weld(o);
    for (let i = 0; i < w.tris.length; i += 3) {
      const a = w.verts[w.tris[i]], b = w.verts[w.tris[i + 1]], c = w.verts[w.tris[i + 2]];
      const n = cross(sub(b, a), sub(c, a));
      const l = Math.hypot(...n);
      if (l < 1e-8 || n[1] / l < 0.98) continue;
      const area = l / 2;
      const p: Vec3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
      const dist = Math.hypot(p[0] - mid[0], p[2] - mid[2]);
      const score = Math.min(area, 400) / (1 + dist * 0.05);
      if (!best || score > best.score) best = { score, p };
    }
  }
  if (!best) return null;
  const yaw = (Math.atan2(mid[0] - best.p[0], mid[2] - best.p[2]) * 180) / Math.PI;
  return { position: best.p, yaw: Number.isFinite(yaw) ? Math.round(yaw) : 0 };
}
