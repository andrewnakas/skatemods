// Grind rail geometry. Targets that have no native rail records (ReSkate) get an
// invisible collision prism hanging under each rail, the way ReSkate Studio builds grind
// curves: 8 sides (45 degree creases the grind finder picks up), top corner on the line.
import type { Vec3 } from './ir';

export const RAIL_SIDES = 8;
export const RAIL_RADIUS = 0.03;
const TOLERANCE = 0.003;
const MIN_SPACING = 0.02;
const SPLIT_COS = Math.cos((75 * Math.PI) / 180);

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: Vec3): Vec3 => { const l = len(a); return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 0]; };

/** Douglas-Peucker simplification. */
export function simplify(points: Vec3[], tolerance = TOLERANCE): Vec3[] {
  if (points.length < 3) return points.slice();
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    const start = points[first], span = sub(points[last], start), l2 = dot(span, span);
    let worst = -1, worstIndex = -1;
    for (let i = first + 1; i < last; i++) {
      let off = sub(points[i], start);
      if (l2 > 1e-12) off = sub(off, scale(span, Math.max(0, Math.min(1, dot(off, span) / l2))));
      const d = len(off);
      if (d > worst) { worst = d; worstIndex = i; }
    }
    if (worstIndex >= 0 && worst > tolerance) {
      keep[worstIndex] = true;
      stack.push([first, worstIndex], [worstIndex, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Splits a rail into runs at corners sharper than 75 degrees (the game never grinds round those). */
export function railRuns(points: Vec3[], closed: boolean): { points: Vec3[]; closed: boolean }[] {
  const simplified = simplify(closed && points.length ? [...points, points[0]] : points);
  if (simplified.length < 2) return [];
  let merged: Vec3[] = [simplified[0]];
  for (const p of simplified.slice(1, -1)) if (len(sub(p, merged[merged.length - 1])) >= MIN_SPACING) merged.push(p);
  const last = simplified[simplified.length - 1];
  if (merged.length > 1 && len(sub(last, merged[merged.length - 1])) < MIN_SPACING) merged[merged.length - 1] = last;
  else merged.push(last);
  if (closed) { merged.pop(); closed = merged.length >= 3; }
  if (merged.length < 2 || (!closed && len(sub(merged[merged.length - 1], merged[0])) < 1e-6)) return [];

  let count = merged.length;
  const sharp = (i: number) => {
    const before = norm(sub(merged[i], merged[(i - 1 + count) % count]));
    const after = norm(sub(merged[(i + 1) % count], merged[i]));
    return dot(before, after) < SPLIT_COS;
  };
  if (closed) {
    const corners = merged.map((_, i) => i).filter(sharp);
    if (!corners.length) return [{ points: merged, closed: true }];
    merged = [...merged.slice(corners[0]), ...merged.slice(0, corners[0] + 1)];
    count = merged.length;
  }
  const runs: { points: Vec3[]; closed: boolean }[] = [];
  let start = 0;
  for (let i = 1; i < count - 1; i++) if (sharp(i)) { runs.push({ points: merged.slice(start, i + 1), closed: false }); start = i; }
  runs.push({ points: merged.slice(start), closed: false });
  return runs.filter(r => r.points.length >= 2);
}

/** Open-ended prism under a run, Y up. Returns flat positions and triangle indices. */
export function railPrism(points: Vec3[], closed: boolean, radius = RAIL_RADIUS, sides = RAIL_SIDES) {
  const count = points.length;
  const segments = closed ? count : count - 1;
  const dirs: Vec3[] = [];
  for (let i = 0; i < segments; i++) dirs.push(norm(sub(points[(i + 1) % count], points[i])));
  const worldUp: Vec3 = [0, 1, 0];
  const positions: number[] = [];
  let previousUp: Vec3 | null = null;
  for (let i = 0; i < count; i++) {
    const before = closed ? dirs[(i - 1 + segments) % segments] : dirs[Math.max(0, i - 1)];
    const after = closed ? dirs[i % segments] : dirs[Math.min(i, segments - 1)];
    let tangent = add(before, after);
    tangent = len(tangent) > 1e-6 ? norm(tangent) : after;
    let up = sub(worldUp, scale(tangent, dot(worldUp, tangent)));
    if (len(up) < 1e-3) {
      const fb: Vec3 = previousUp ?? [0, 0, 1];
      up = sub(fb, scale(tangent, dot(fb, tangent)));
    }
    up = norm(up);
    previousUp = up;
    const side = cross(tangent, up);
    let bend = sub(after, before);
    bend = sub(bend, scale(tangent, dot(bend, tangent)));
    let stretch = 0;
    if (len(bend) > 1e-6) { bend = norm(bend); stretch = 1 / Math.max(0.5, Math.min(1, dot(before, tangent))) - 1; }
    const ring: Vec3[] = [];
    for (let c = 0; c < sides; c++) {
      const a = (2 * Math.PI * c) / sides;
      let off = scale(add(scale(up, Math.cos(a)), scale(side, Math.sin(a))), radius);
      if (stretch) off = add(off, scale(bend, dot(off, bend) * stretch));
      ring.push(off);
    }
    const centre = sub(points[i], ring[0]);
    for (const off of ring) positions.push(...add(centre, off));
  }
  const indices: number[] = [];
  for (let i = 0; i < segments; i++) {
    const here = i * sides, there = ((i + 1) % count) * sides;
    for (let c = 0; c < sides; c++) {
      const f = (c + 1) % sides;
      indices.push(here + c, here + f, there + f, here + c, there + f, there + c);
    }
  }
  return { positions, indices };
}

/** All prisms for one rail, merged. */
export function railMesh(points: Vec3[], closed: boolean, radius = RAIL_RADIUS) {
  const positions: number[] = [], indices: number[] = [];
  for (const run of railRuns(points, closed)) {
    const p = railPrism(run.points, run.closed, radius);
    const base = positions.length / 3;
    positions.push(...p.positions);
    for (const i of p.indices) indices.push(base + i);
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}
