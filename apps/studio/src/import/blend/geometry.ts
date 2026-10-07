// Matrix helpers, Blender object transforms, polygon triangulation and the
// per-corner -> welded vertex mesh builder used by the .blend importer.

import type { Mat4, Mesh, MeshGroup, Vec3 } from '../../ir';

// ---- 4x4 column-major matrices (same layout as Blender's float[4][4] and three.js) ----

export function identity(): number[] { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }

export function mul(a: ArrayLike<number>, b: ArrayLike<number>): number[] {
  const o = new Array<number>(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

/** 3x3 (column-major, 9 floats) into a 4x4 with translation. */
function mat3to4(m: number[], t: Vec3): number[] {
  return [m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, t[0], t[1], t[2], 1];
}

function mul3(a: number[], b: number[]): number[] {
  const o = new Array<number>(9);
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) o[c * 3 + r] = a[r] * b[c * 3] + a[3 + r] * b[c * 3 + 1] + a[6 + r] * b[c * 3 + 2];
  return o;
}

function rotAxis3(axis: 0 | 1 | 2, ang: number): number[] {
  const c = Math.cos(ang), s = Math.sin(ang);
  if (axis === 0) return [1, 0, 0, 0, c, s, 0, -s, c];
  if (axis === 1) return [c, 0, -s, 0, 1, 0, s, 0, c];
  return [c, s, 0, -s, c, 0, 0, 0, 1];
}

/** Blender rotmode 1..6 = XYZ, XZY, YXZ, YZX, ZXY, ZYX (the axis applied first is listed first). */
const EULER_ORDERS: Array<[0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2]> = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

export function eulerToMat3(e: number[], mode: number): number[] {
  const order = EULER_ORDERS[mode - 1] ?? EULER_ORDERS[0];
  let m = rotAxis3(order[0], e[order[0]]);
  m = mul3(rotAxis3(order[1], e[order[1]]), m);
  m = mul3(rotAxis3(order[2], e[order[2]]), m);
  return m;
}

/** Blender quaternion order: w, x, y, z. Normalised first. */
export function quatToMat3(q: number[]): number[] {
  let [w, x, y, z] = q;
  const len = Math.hypot(w, x, y, z);
  if (len < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  w /= len; x /= len; y /= len; z /= len;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y),
    2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x),
    2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y),
  ];
}

export function axisAngleToMat3(axis: number[], angle: number): number[] {
  const len = Math.hypot(axis[0], axis[1], axis[2]);
  if (len < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const h = angle / 2, s = Math.sin(h) / len;
  return quatToMat3([Math.cos(h), axis[0] * s, axis[1] * s, axis[2] * s]);
}

export interface LocRotScale {
  loc: number[]; dloc: number[];
  rot: number[]; drot: number[];
  quat: number[]; dquat: number[];
  rotAxis: number[]; rotAngle: number; drotAxis: number[]; drotAngle: number;
  rotmode: number;
  scale: number[]; dscale: number[];
}

/** BKE_object_to_mat4: T(loc + dloc) * (drot * rot) * S(scale * dscale). */
export function localMatrix(o: LocRotScale): number[] {
  let r: number[], d: number[];
  if (o.rotmode > 0) { r = eulerToMat3(o.rot, o.rotmode); d = eulerToMat3(o.drot, o.rotmode); }
  else if (o.rotmode === -1) { r = axisAngleToMat3(o.rotAxis, o.rotAngle); d = axisAngleToMat3(o.drotAxis, o.drotAngle); }
  else { r = quatToMat3(o.quat); d = quatToMat3(o.dquat); }
  const rot = mul3(d, r);
  const s = [0, 1, 2].map((i) => (o.scale[i] ?? 1) * (o.dscale[i] ?? 1));
  const m = rot.map((v, i) => v * s[Math.floor(i / 3)]);
  return mat3to4(m, [o.loc[0] + o.dloc[0], o.loc[1] + o.dloc[1], o.loc[2] + o.dloc[2]]);
}

/** Blender Z-up -> game Y-up: (x, y, z) -> (x, z, -y). */
export const BLENDER_TO_GAME: number[] = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1];
export const GAME_TO_BLENDER: number[] = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1];

/** Re-expresses a Blender-space matrix in game space: C * M * C^-1. */
export function toGameMatrix(m: ArrayLike<number>): Mat4 {
  return mul(mul(BLENDER_TO_GAME, m), GAME_TO_BLENDER);
}

export function conv(v: ArrayLike<number>): Vec3 { return [v[0], v[2], -v[1]]; }

export function applyPoint(m: ArrayLike<number>, x: number, y: number, z: number): Vec3 {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

// ---- triangulation ----

/**
 * Triangulates one polygon given its corner positions (xyz, already gathered).
 * Returns corner-local index triples. Triangles keep the polygon's winding.
 * Ear clipping on the polygon projected to its dominant plane; falls back to a fan.
 */
export function triangulatePolygon(pts: ArrayLike<number>, n: number, out: number[]): void {
  if (n < 3) return;
  if (n === 3) { out.push(0, 1, 2); return; }
  // Newell normal.
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = pts[i * 3], ay = pts[i * 3 + 1], az = pts[i * 3 + 2];
    const bx = pts[j * 3], by = pts[j * 3 + 1], bz = pts[j * 3 + 2];
    nx += (ay - by) * (az + bz); ny += (az - bz) * (ax + bx); nz += (ax - bx) * (ay + by);
  }
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
  // Drop the dominant axis; keep the winding counter-clockwise in 2D.
  let u: number, v: number, sign: number;
  if (az >= ax && az >= ay) { u = 0; v = 1; sign = nz >= 0 ? 1 : -1; }
  else if (ax >= ay) { u = 1; v = 2; sign = nx >= 0 ? 1 : -1; }
  else { u = 2; v = 0; sign = ny >= 0 ? 1 : -1; }
  const xs = new Float64Array(n), ys = new Float64Array(n);
  for (let i = 0; i < n; i++) { xs[i] = pts[i * 3 + u]; ys[i] = pts[i * 3 + v] * sign; }
  if (ax + ay + az < 1e-20) { for (let i = 1; i < n - 1; i++) out.push(0, i, i + 1); return; }

  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(i);
  const cross = (a: number, b: number, c: number) => (xs[b] - xs[a]) * (ys[c] - ys[a]) - (ys[b] - ys[a]) * (xs[c] - xs[a]);
  const inside = (p: number, a: number, b: number, c: number) => {
    const d1 = cross(a, b, p), d2 = cross(b, c, p), d3 = cross(c, a, p);
    return d1 >= 0 && d2 >= 0 && d3 >= 0;
  };
  const start = out.length;
  let guard = 0;
  while (idx.length > 3 && guard++ < n * n + 10) {
    let clipped = false;
    for (let k = 0; k < idx.length; k++) {
      const a = idx[(k + idx.length - 1) % idx.length], b = idx[k], c = idx[(k + 1) % idx.length];
      if (cross(a, b, c) <= 0) continue; // reflex or degenerate
      let ok = true;
      for (const p of idx) {
        if (p === a || p === b || p === c) continue;
        if (xs[p] === xs[a] && ys[p] === ys[a]) continue;
        if (xs[p] === xs[b] && ys[p] === ys[b]) continue;
        if (xs[p] === xs[c] && ys[p] === ys[c]) continue;
        if (inside(p, a, b, c)) { ok = false; break; }
      }
      if (!ok) continue;
      out.push(a, b, c);
      idx.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) {
      // No proper ear: drop one collinear vertex (zero-area ear) and keep going.
      let k = 0;
      for (; k < idx.length; k++) {
        const a = idx[(k + idx.length - 1) % idx.length], b = idx[k], c = idx[(k + 1) % idx.length];
        if (cross(a, b, c) === 0) break;
      }
      if (k === idx.length) break;
      idx.splice(k, 1);
    }
  }
  if (idx.length === 3) { out.push(idx[0], idx[1], idx[2]); return; }
  // Degenerate / self-intersecting: fan the remainder (or the whole polygon).
  if (idx.length > 3) {
    out.length = start;
    for (let i = 1; i < n - 1; i++) out.push(0, i, i + 1);
  }
}

// ---- mesh building ----

export interface PolyMeshInput {
  /** Blender-space local positions, xyz per vertex. */
  positions: ArrayLike<number>;
  /** faces + 1 offsets into cornerVerts. */
  faceOffsets: ArrayLike<number>;
  cornerVerts: ArrayLike<number>;
  /** Per face material slot (0 when absent). */
  materialIndex?: ArrayLike<number>;
  /** Per face flat shading flag. */
  sharpFace?: ArrayLike<number | boolean>;
  /** Per corner uv (u, v with v=0 at the bottom, Blender convention). */
  uv?: ArrayLike<number>;
  uv2?: ArrayLike<number>;
}

/**
 * Builds an IR mesh (game space). Every face corner becomes a vertex, then corners with the
 * same source vertex, uv(s) and normal are welded. Normals: smooth (area weighted) unless
 * the face is sharp. `slotToMaterial` maps a material slot to an IR material index.
 */
export function buildMesh(src: PolyMeshInput, slotToMaterial: (slot: number) => number): Mesh {
  const P = src.positions;
  const nVerts = Math.floor(P.length / 3);
  const nFaces = Math.max(0, src.faceOffsets.length - 1);
  const CV = src.cornerVerts;

  // Face normals (Newell, length = 2 * area) and smooth vertex normals.
  const faceN = new Float64Array(nFaces * 3);
  const vertN = new Float64Array(nVerts * 3);
  for (let f = 0; f < nFaces; f++) {
    const s = src.faceOffsets[f], e = src.faceOffsets[f + 1];
    let nx = 0, ny = 0, nz = 0;
    for (let c = s; c < e; c++) {
      const a = CV[c] * 3, b = CV[c + 1 < e ? c + 1 : s] * 3;
      nx += (P[a + 1] - P[b + 1]) * (P[a + 2] + P[b + 2]);
      ny += (P[a + 2] - P[b + 2]) * (P[a] + P[b]);
      nz += (P[a] - P[b]) * (P[a + 1] + P[b + 1]);
    }
    faceN[f * 3] = nx; faceN[f * 3 + 1] = ny; faceN[f * 3 + 2] = nz;
    for (let c = s; c < e; c++) { const v = CV[c] * 3; vertN[v] += nx; vertN[v + 1] += ny; vertN[v + 2] += nz; }
  }
  const norm = (a: Float64Array, i: number) => {
    const l = Math.hypot(a[i], a[i + 1], a[i + 2]);
    if (l > 0) { a[i] /= l; a[i + 1] /= l; a[i + 2] /= l; } else { a[i + 2] = 1; }
  };
  for (let f = 0; f < nFaces; f++) norm(faceN, f * 3);
  for (let v = 0; v < nVerts; v++) norm(vertN, v * 3);

  // Welding: per source vertex, a linked list of output vertices.
  const head = new Int32Array(nVerts).fill(-1);
  const next: number[] = [];
  const outSrc: number[] = [];
  const outN: number[] = [];
  const outUV: number[] = [];
  const outUV2: number[] = [];
  const hasUV = !!src.uv, hasUV2 = !!src.uv2;
  const uv = src.uv, uv2 = src.uv2;

  const vertexFor = (c: number, f: number, sharp: boolean): number => {
    const v = CV[c];
    const nb = sharp ? faceN : vertN, ni = sharp ? f * 3 : v * 3;
    const nx = nb[ni], ny = nb[ni + 1], nz = nb[ni + 2];
    const u0 = hasUV ? uv![c * 2] : 0, v0 = hasUV ? uv![c * 2 + 1] : 0;
    const u1 = hasUV2 ? uv2![c * 2] : 0, v1 = hasUV2 ? uv2![c * 2 + 1] : 0;
    for (let o = head[v]; o >= 0; o = next[o]) {
      if (outN[o * 3] !== nx || outN[o * 3 + 1] !== ny || outN[o * 3 + 2] !== nz) continue;
      if (hasUV && (outUV[o * 2] !== u0 || outUV[o * 2 + 1] !== v0)) continue;
      if (hasUV2 && (outUV2[o * 2] !== u1 || outUV2[o * 2 + 1] !== v1)) continue;
      return o;
    }
    const o = outSrc.length;
    outSrc.push(v);
    outN.push(nx, ny, nz);
    if (hasUV) outUV.push(u0, v0);
    if (hasUV2) outUV2.push(u1, v1);
    next.push(head[v]);
    head[v] = o;
    return o;
  };

  // Triangles bucketed by IR material.
  const buckets = new Map<number, number[]>();
  const tri: number[] = [];
  const pts: number[] = [];
  for (let f = 0; f < nFaces; f++) {
    const s = src.faceOffsets[f], e = src.faceOffsets[f + 1], n = e - s;
    if (n < 3) continue;
    const sharp = !!(src.sharpFace && src.sharpFace[f]);
    const mat = slotToMaterial(src.materialIndex ? src.materialIndex[f] : 0);
    let bucket = buckets.get(mat);
    if (!bucket) buckets.set(mat, (bucket = []));
    tri.length = 0;
    if (n === 3) tri.push(0, 1, 2);
    else {
      pts.length = 0;
      for (let c = s; c < e; c++) { const v = CV[c] * 3; pts.push(P[v], P[v + 1], P[v + 2]); }
      triangulatePolygon(pts, n, tri);
    }
    const local: number[] = new Array(n);
    for (let k = 0; k < n; k++) local[k] = vertexFor(s + k, f, sharp);
    for (const k of tri) bucket.push(local[k]);
  }

  const count = outSrc.length;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  for (let o = 0; o < count; o++) {
    const v = outSrc[o] * 3;
    positions[o * 3] = P[v]; positions[o * 3 + 1] = P[v + 2]; positions[o * 3 + 2] = -P[v + 1];
    normals[o * 3] = outN[o * 3]; normals[o * 3 + 1] = outN[o * 3 + 2]; normals[o * 3 + 2] = -outN[o * 3 + 1];
  }
  const flipV = (a: number[]) => { const r = new Float32Array(a.length); for (let i = 0; i < a.length; i += 2) { r[i] = a[i]; r[i + 1] = 1 - a[i + 1]; } return r; };

  const mats = [...buckets.keys()].sort((a, b) => a - b);
  let total = 0;
  for (const m of mats) total += buckets.get(m)!.length;
  const indices = new Uint32Array(total);
  const groups: MeshGroup[] = [];
  let at = 0;
  for (const m of mats) {
    const b = buckets.get(m)!;
    if (!b.length) continue;
    indices.set(b, at);
    groups.push({ start: at, count: b.length, material: m });
    at += b.length;
  }
  const mesh: Mesh = { positions, normals, indices, groups };
  if (hasUV) mesh.uvs = flipV(outUV);
  if (hasUV2) mesh.uv2 = flipV(outUV2);
  return mesh;
}
