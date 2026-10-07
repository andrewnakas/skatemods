// Grindable edges of a mesh: convex creases sharper than 30 degrees (skate.'s grind edge
// finder threshold) and open boundaries. Used by the edge-rail tool and the checks.
import type { MapObject, Vec3 } from '../ir';
import { transformPoint } from '../ir';

const CREASE_COS = Math.cos((30 * Math.PI) / 180);
const MAX_TURN_COS = Math.cos((35 * Math.PI) / 180);

export interface CreaseEdges {
  verts: Vec3[];
  edges: [number, number][];
  chainNear(p: Vec3, maxDistance?: number): { points: Vec3[]; closed: boolean } | null;
}

/** Welds vertices (1 mm) in world space and returns triangles over welded ids. */
export function weld(obj: MapObject): { verts: Vec3[]; tris: Uint32Array } {
  const pos = obj.mesh.positions, idx = obj.mesh.indices;
  const map = new Map<string, number>();
  const verts: Vec3[] = [];
  const remap = new Uint32Array(pos.length / 3);
  for (let i = 0; i < remap.length; i++) {
    const w = transformPoint(obj.transform, [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
    const key = `${Math.round(w[0] * 1000)},${Math.round(w[1] * 1000)},${Math.round(w[2] * 1000)}`;
    let id = map.get(key);
    if (id === undefined) { id = verts.length; verts.push(w); map.set(key, id); }
    remap[i] = id;
  }
  const tris = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) tris[i] = remap[idx[i]];
  return { verts, tris };
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => { const l = Math.hypot(...a); return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; };

export function creaseEdges(obj: MapObject): CreaseEdges {
  const { verts, tris } = weld(obj);
  const faceNormal: Vec3[] = [];
  const edgeFaces = new Map<string, number[]>();
  for (let f = 0; f < tris.length / 3; f++) {
    const a = tris[f * 3], b = tris[f * 3 + 1], c = tris[f * 3 + 2];
    faceNormal.push(norm(cross(sub(verts[b], verts[a]), sub(verts[c], verts[a]))));
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      if (u === v) continue;
      const key = u < v ? `${u}_${v}` : `${v}_${u}`;
      const list = edgeFaces.get(key);
      if (list) list.push(f); else edgeFaces.set(key, [f]);
    }
  }
  const edges: [number, number][] = [];
  for (const [key, faces] of edgeFaces) {
    const [u, v] = key.split('_').map(Number);
    if (faces.length === 1) { edges.push([u, v]); continue; }
    if (faces.length !== 2) continue;
    const [f1, f2] = faces;
    if (dot(faceNormal[f1], faceNormal[f2]) > CREASE_COS) continue;
    // Convex only: the far vertex of f2 must sit behind f1's plane.
    const far = [tris[f2 * 3], tris[f2 * 3 + 1], tris[f2 * 3 + 2]].find(x => x !== u && x !== v)!;
    if (dot(faceNormal[f1], sub(verts[far], verts[u])) < -1e-5) edges.push([u, v]);
  }

  const adjacency = new Map<number, number[]>();
  edges.forEach(([u, v], i) => {
    (adjacency.get(u) ?? adjacency.set(u, []).get(u)!).push(i);
    (adjacency.get(v) ?? adjacency.set(v, []).get(v)!).push(i);
  });

  const chainNear = (p: Vec3, maxDistance = 0.5) => {
    let best = -1, bestD = maxDistance;
    edges.forEach(([u, v], i) => {
      const d = segmentDistance(p, verts[u], verts[v]);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best < 0) return null;
    const used = new Set([best]);
    const grow = (from: number, to: number): number[] => {
      const out: number[] = [];
      let prev = from, cur = to;
      for (;;) {
        const dir = norm(sub(verts[cur], verts[prev]));
        let next = -1, nextEdge = -1, straightest = MAX_TURN_COS;
        for (const e of adjacency.get(cur) ?? []) {
          if (used.has(e)) continue;
          const other = edges[e][0] === cur ? edges[e][1] : edges[e][0];
          const c = dot(dir, norm(sub(verts[other], verts[cur])));
          if (c > straightest) { straightest = c; next = other; nextEdge = e; }
        }
        if (next < 0) return out;
        used.add(nextEdge);
        out.push(next);
        prev = cur; cur = next;
      }
    };
    const [u, v] = edges[best];
    const forward = grow(u, v);
    const backward = grow(v, u);
    const ids = [...backward.reverse(), u, v, ...forward];
    const closed = ids.length > 3 && ids[0] === ids[ids.length - 1];
    if (closed) ids.pop();
    return { points: ids.map(i => verts[i]), closed };
  };

  return { verts, edges, chainNear };
}

export function segmentDistance(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = sub(b, a), ap = sub(p, a);
  const t = Math.max(0, Math.min(1, dot(ap, ab) / Math.max(dot(ab, ab), 1e-12)));
  return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t);
}
