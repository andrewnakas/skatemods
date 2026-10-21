// SPDX-License-Identifier: GPL-3.0-or-later
// Studio terrain materials map uv0 straight down: U and V are linear in world x/z (measured on
// DM Jumpline: R^2 = 1, terrain_rock 0.0714 repeats/m, ground 0.1, trail 0.125). ReSkate draws that
// fine on slopes it projects in the shader; drawn with the raw uv0, one texel smears down a cliff.
// Find such materials by measurement (not by name) and re-project their steep faces sideways at
// the same texel density, the way sk4/export_glb.py triplanar() does for virtual-texture terrain.

export interface PlanarFit {
  /** U = u[0]*x + u[1]*y + u[2]*z + u[3]; V likewise */
  u: number[]; v: number[];
  r2: [number, number];
  /** share of vertices on the fit (Studio prims can mix planar terrain with unwrapped meshes) */
  fitShare: number;
  inlier: Uint8Array;
  /** dominant axis of each face normal: 0 = x, 1 = y (flat), 2 = z */
  faceAxis: Uint8Array;
  planar: boolean;
}

/** Spacing of half floats around |x| (the source mesh stores uv0 as halves). */
const halfStep = (x: number) => Math.pow(2, Math.max(-14, Math.floor(Math.log2(Math.max(Math.abs(x), 1e-6)))) - 10);

function solve4(A: number[][], b: number[]): number[] | null {
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < 4; c++) {
    let p = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 4; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k < 5; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[4] / M[i][i]);
}

/** Least squares of uv against [x, y, z, 1] over the selected vertices (centred for conditioning). */
function lsq(P: Float32Array, UV: Float32Array, sel: Uint8Array): { u: number[]; v: number[] } | null {
  let n = 0, mx = 0, my = 0, mz = 0;
  for (let i = 0; i < sel.length; i++) if (sel[i]) { n++; mx += P[3 * i]; my += P[3 * i + 1]; mz += P[3 * i + 2]; }
  if (n < 8) return null;
  mx /= n; my /= n; mz /= n;
  const A = [0, 1, 2, 3].map(() => [0, 0, 0, 0]), bu = [0, 0, 0, 0], bv = [0, 0, 0, 0];
  for (let i = 0; i < sel.length; i++) {
    if (!sel[i]) continue;
    const r = [P[3 * i] - mx, P[3 * i + 1] - my, P[3 * i + 2] - mz, 1];
    for (let a = 0; a < 4; a++) { for (let b = 0; b < 4; b++) A[a][b] += r[a] * r[b]; bu[a] += r[a] * UV[2 * i]; bv[a] += r[a] * UV[2 * i + 1]; }
  }
  // a flat patch has no y spread: regularise so the y coefficient goes to 0 instead of blowing up
  for (let a = 0; a < 3; a++) A[a][a] += 1e-9 * n;
  const cu = solve4(A, bu), cv = solve4(A, bv);
  if (!cu || !cv) return null;
  const un = (c: number[]) => [c[0], c[1], c[2], c[3] - c[0] * mx - c[1] * my - c[2] * mz];
  return { u: un(cu), v: un(cv) };
}

const ev = (c: number[], x: number, y: number, z: number) => c[0] * x + c[1] * y + c[2] * z + c[3];

export function faceAxes(P: Float32Array, I: Uint32Array): Uint8Array {
  const nt = I.length / 3, ax = new Uint8Array(nt);
  for (let t = 0; t < nt; t++) {
    const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2];
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = Math.abs(uy * vz - uz * vy), ny = Math.abs(uz * vx - ux * vz), nz = Math.abs(ux * vy - uy * vx);
    ax[t] = ny >= nx && ny >= nz ? 1 : nx >= nz ? 0 : 2;
  }
  return ax;
}

export function fitPlanar(P: Float32Array, UV: Float32Array, I: Uint32Array): PlanarFit {
  const nv = P.length / 3;
  const faceAxis = faceAxes(P, I);
  let sel = new Uint8Array(nv).fill(1);
  let fit = lsq(P, UV, sel);
  const none: PlanarFit = { u: [0, 0, 0, 0], v: [0, 0, 0, 0], r2: [0, 0], fitShare: 0, inlier: new Uint8Array(nv), faceAxis, planar: false };
  if (!fit) return none;
  // drop vertices off the fit (other meshes sharing the material), refit on the rest
  for (let pass = 0; pass < 4 && fit; pass++) {
    const tol = pass < 2 ? 0.25 * (2 - pass) : 0;
    const next = new Uint8Array(nv);
    for (let i = 0; i < nv; i++) {
      const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2], u = UV[2 * i], v = UV[2 * i + 1];
      const du = Math.abs(ev(fit.u, x, y, z) - u), dv = Math.abs(ev(fit.v, x, y, z) - v);
      next[i] = du <= tol + 1.5 * halfStep(u) + 2e-3 && dv <= tol + 1.5 * halfStep(v) + 2e-3 ? 1 : 0;
    }
    sel = next;
    fit = lsq(P, UV, sel);
  }
  if (!fit) return none;
  let n = 0, su = 0, sv = 0, su2 = 0, sv2 = 0, eu = 0, evv = 0;
  for (let i = 0; i < nv; i++) {
    if (!sel[i]) continue;
    const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2], u = UV[2 * i], v = UV[2 * i + 1];
    n++; su += u; sv += v; su2 += u * u; sv2 += v * v;
    eu += (ev(fit.u, x, y, z) - u) ** 2; evv += (ev(fit.v, x, y, z) - v) ** 2;
  }
  const varU = su2 - su * su / Math.max(n, 1), varV = sv2 - sv * sv / Math.max(n, 1);
  const r2: [number, number] = [varU > 0 ? 1 - eu / varU : 0, varV > 0 ? 1 - evv / varV : 0];
  // a top-down projection: no y term, and x/z map onto a non-degenerate texel grid
  const horiz = Math.abs(fit.u[0] * fit.v[2] - fit.u[2] * fit.v[0]);
  const yTerm = Math.hypot(fit.u[1], fit.v[1]);
  const fitShare = n / nv;
  const planar = n >= 32 && fitShare >= 0.25 && r2[0] > 0.999 && r2[1] > 0.999 && horiz > 1e-6 && yTerm < 0.05 * Math.sqrt(horiz);
  return { ...fit, r2, fitShare, inlier: sel, faceAxis, planar };
}

const SIDE_CELL = 8;

export interface Reprojected { positions: Float32Array; normals: Float32Array; uv0: Float32Array; indices: Uint32Array; steepFaces: number }

/**
 * Re-project a planar-mapped prim: steep faces on the fit take the projection with the horizontal
 * axis they face swapped for height (same density, texture upright), flat faces on the fit take the
 * fit itself (recovers the precision the half-float source lost at |uv| ~ 100); faces off the fit
 * keep their uv0. Vertices are duplicated only where the projection changes.
 */
export function reproject(P: Float32Array, N: Float32Array, UV: Float32Array, I: Uint32Array, f: PlanarFit): Reprojected {
  const nt = I.length / 3;
  const remap = new Map<number, number>();
  const oP: number[] = [], oN: number[] = [], oU: number[] = [], oI = new Uint32Array(I.length);
  // the vertical swap keeps V decreasing with height: pick the sign from V's coefficient on the swapped axis
  const sgn = (c: number) => (Math.abs(c) > 1e-9 ? -Math.sign(c) : 1);
  const sx = sgn(f.v[0]), sz = sgn(f.v[2]);
  // per-face x-or-z choice turns a diagonal cliff into a checkerboard of seams; choose it per
  // SIDE_CELL cube from the area-weighted normals of the steep faces in it
  const cellOf = (t: number) => {
    const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2];
    return `${Math.floor((P[a] + P[b] + P[c]) / 3 / SIDE_CELL)},${Math.floor((P[a + 1] + P[b + 1] + P[c + 1]) / 3 / SIDE_CELL)},${Math.floor((P[a + 2] + P[b + 2] + P[c + 2]) / 3 / SIDE_CELL)}`;
  };
  const votes = new Map<string, [number, number]>();
  for (let t = 0; t < nt; t++) {
    if (f.faceAxis[t] === 1) continue;
    const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2];
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const k = cellOf(t), w = votes.get(k) ?? votes.set(k, [0, 0]).get(k)!;
    w[0] += Math.abs(uy * vz - uz * vy); w[1] += Math.abs(ux * vy - uy * vx);
  }
  let steep = 0;
  for (let t = 0; t < nt; t++) {
    const on = f.inlier[I[3 * t]] && f.inlier[I[3 * t + 1]] && f.inlier[I[3 * t + 2]];
    let mode = !on ? 0 : f.faceAxis[t] === 1 ? 1 : 2;
    if (mode === 2) { const w = votes.get(cellOf(t))!; mode = w[0] >= w[1] ? 2 : 3; }
    if (mode >= 2) steep++;
    for (let j = 0; j < 3; j++) {
      const v = I[3 * t + j], key = v * 4 + mode;
      let o = remap.get(key);
      if (o === undefined) {
        o = oP.length / 3;
        remap.set(key, o);
        const x = P[3 * v], y = P[3 * v + 1], z = P[3 * v + 2];
        oP.push(x, y, z); oN.push(N[3 * v], N[3 * v + 1], N[3 * v + 2]);
        if (mode === 0) oU.push(UV[2 * v], UV[2 * v + 1]);
        else {
          const X = mode === 2 ? sx * y : x, Z = mode === 3 ? sz * y : z;
          oU.push(f.u[0] * X + f.u[2] * Z + f.u[3], f.v[0] * X + f.v[2] * Z + f.v[3]);
        }
      }
      oI[3 * t + j] = o;
    }
  }
  return { positions: Float32Array.from(oP), normals: Float32Array.from(oN), uv0: Float32Array.from(oU), indices: oI, steepFaces: steep };
}
