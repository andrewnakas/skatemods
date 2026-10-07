// Whole-map transforms (fix axis, rescale, recentre) applied after import.
import type { MapIR, Mat4, Vec3 } from './ir';
import { transformPoint } from './ir';

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}

export const Z_UP_TO_Y_UP: Mat4 = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1];

export function scaleMatrix(s: number): Mat4 { return [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]; }
export function translateMatrix(t: Vec3): Mat4 { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, t[0], t[1], t[2], 1]; }

/** Applies `m` (rotation, uniform scale, translation) to everything in the map. */
export function applyToMap(map: MapIR, m: Mat4) {
  for (const o of map.objects) o.transform = multiply(m, o.transform);
  for (const r of map.rails) r.points = r.points.map(p => transformPoint(m, p));
  const fwd = (yaw: number): Vec3 => [Math.sin((yaw * Math.PI) / 180), 0, Math.cos((yaw * Math.PI) / 180)];
  for (const s of map.spawns) {
    const f = fwd(s.yaw);
    const d: Vec3 = [m[0] * f[0] + m[4] * f[1] + m[8] * f[2], m[1] * f[0] + m[5] * f[1] + m[9] * f[2], m[2] * f[0] + m[6] * f[1] + m[10] * f[2]];
    s.position = transformPoint(m, s.position);
    if (Math.hypot(d[0], d[2]) > 1e-6) s.yaw = (Math.atan2(d[0], d[2]) * 180) / Math.PI;
  }
  for (const l of map.lights) l.position = transformPoint(m, l.position);
}

/** World-space bounds of all object vertices. */
export function bounds(map: MapIR): { min: Vec3; max: Vec3 } | null {
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const o of map.objects) {
    const p = o.mesh.positions;
    // Transform the local AABB corners instead of every vertex.
    const lmin = [Infinity, Infinity, Infinity], lmax = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) {
      if (p[i + k] < lmin[k]) lmin[k] = p[i + k];
      if (p[i + k] > lmax[k]) lmax[k] = p[i + k];
    }
    if (!Number.isFinite(lmin[0])) continue;
    for (let c = 0; c < 8; c++) {
      const w = transformPoint(o.transform, [c & 1 ? lmax[0] : lmin[0], c & 2 ? lmax[1] : lmin[1], c & 4 ? lmax[2] : lmin[2]]);
      for (let k = 0; k < 3; k++) { if (w[k] < min[k]) min[k] = w[k]; if (w[k] > max[k]) max[k] = w[k]; }
    }
  }
  return Number.isFinite(min[0]) ? { min, max } : null;
}

/** Moves the map so its footprint is centred on the origin and its lowest point is at y=0. */
export function recentre(map: MapIR) {
  const b = bounds(map);
  if (!b) return;
  applyToMap(map, translateMatrix([-(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2]));
}
