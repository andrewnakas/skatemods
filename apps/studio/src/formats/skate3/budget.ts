// SPDX-License-Identifier: GPL-3.0-or-later
// Per-tile triangle budget. Skate 3 streams a 100 m tile at a time into fixed pools; retail tiles
// are a few MB. A dense mod (OG Berrics: 1.07 M triangles over 4 tiles, cPres streams up to 37 MB
// per tile) overruns them and the game crashes on travel. Prims are simplified - only as much as
// their tiles are over budget, and with the error held in metres so skateable surfaces keep their
// shape - before the pack is built. Maps under budget pass through untouched.
import { MeshoptSimplifier } from 'meshoptimizer';
import type { ExportPrim } from './export.ts';

export const TILE_TRI_BUDGET = 50_000;
/** Allowed surface error, tried in order until a tile fits: 2 cm keeps ledges and coping true. */
const ERROR_STEPS_M = [0.02, 0.05, 0.1, 0.25];

export interface BudgetReport { tilesOver: number; trianglesBefore: number; trianglesAfter: number; maxTileBefore: number; stacked: number }

function tileTris(P: Float32Array, I: Uint32Array, cell: number, out: Map<string, number>, w = 1) {
  for (let t = 0; t < I.length; t += 3) {
    let x = 0, z = 0;
    for (let k = 0; k < 3; k++) { x += P[3 * I[t + k]]; z += P[3 * I[t + k] + 2]; }
    const key = `${Math.floor(x / 3 / cell)}_${Math.floor(z / 3 / cell)}`;
    out.set(key, (out.get(key) ?? 0) + w);
  }
}

async function simplifyTo(P: Float32Array, I: Uint32Array, target: number): Promise<Uint32Array> {
  if (target >= I.length / 3 || I.length < 3 * 64) return I;
  const scale = MeshoptSimplifier.getScale(P, 3) || 1;
  // Studio meshes split vertices on every UV seam (often per triangle), so unwelded every edge is
  // a border and nothing collapses. Weld by position; the result still indexes the original
  // vertices (each weld group's first), so the arrays and their UVs are kept as they are.
  const remap = MeshoptSimplifier.generatePositionRemap(P, 3);
  const W = new Uint32Array(I.length);
  for (let i = 0; i < I.length; i++) W[i] = remap[I[i]];
  let best = I;
  for (const m of ERROR_STEPS_M) {
    const [out] = MeshoptSimplifier.simplify(W, P, 3, Math.max(3, 3 * target), m / scale, []);
    best = out;
    if (out.length / 3 <= target * 1.05) break;
  }
  return best;
}

/**
 * Drop exact repeats and degenerate triangles (vertices welded by position; winding kept, so a
 * two-sided face survives). Lossless. Some mods stack the same triangles many times over - OG
 * Berrics' largest mesh is 437,253 triangles on 19,568 distinct ones - which no simplifier can
 * collapse and no tile pool can hold.
 */
export function dedupeTriangles(P: Float32Array, I: Uint32Array): Uint32Array {
  const remap = MeshoptSimplifier.generatePositionRemap(P, 3);
  const seen = new Set<string>();
  const out: number[] = [];
  for (let t = 0; t < I.length; t += 3) {
    const a = remap[I[t]], b = remap[I[t + 1]], c = remap[I[t + 2]];
    if (a === b || b === c || a === c) continue;
    // rotate so the smallest index leads: same triangle, same winding -> same key
    const k = a < b && a < c ? `${a},${b},${c}` : b < c ? `${b},${c},${a}` : `${c},${a},${b}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(I[t], I[t + 1], I[t + 2]);
  }
  return out.length === I.length ? I : Uint32Array.from(out);
}

/** Simplify prims in place so no tile holds more than `budget` triangles (render and collision copies alike). */
export async function budgetPrims(prims: ExportPrim[], cell = 100, budget = TILE_TRI_BUDGET, log: (s: string) => void = () => {}): Promise<BudgetReport> {
  await MeshoptSimplifier.ready;
  let stacked = 0;
  for (const p of prims) {
    const n = p.indices.length;
    p.indices = dedupeTriangles(p.positions, p.indices);
    stacked += (n - p.indices.length) / 3;
    if (p.collision) p.collision = { positions: p.collision.positions, indices: dedupeTriangles(p.collision.positions, p.collision.indices) };
  }
  if (stacked) log(`budget: dropped ${stacked} repeated or degenerate triangles`);
  const perTile = new Map<string, number>();
  for (const p of prims) tileTris(p.positions, p.indices, cell, perTile);
  const before = [...perTile.values()].reduce((a, b) => a + b, 0);
  const maxTile = Math.max(0, ...perTile.values());
  const over = [...perTile.values()].filter((n) => n > budget).length;
  if (!over) return { tilesOver: 0, trianglesBefore: before, trianglesAfter: before, maxTileBefore: maxTile, stacked };
  const ratio = (key: string) => Math.min(1, budget / (perTile.get(key) ?? 1));
  let after = 0;
  for (const p of prims) {
    const mine = new Map<string, number>();
    tileTris(p.positions, p.indices, cell, mine);
    const target = Math.floor([...mine].reduce((s, [k, n]) => s + n * ratio(k), 0));
    p.indices = await simplifyTo(p.positions, p.indices, target);
    if (p.collision) {
      const cm = new Map<string, number>();
      tileTris(p.collision.positions, p.collision.indices, cell, cm);
      const ct = Math.floor([...cm].reduce((s, [k, n]) => s + n * ratio(k), 0));
      p.collision = { positions: p.collision.positions, indices: await simplifyTo(p.collision.positions, p.collision.indices, ct) };
    }
    after += p.indices.length / 3;
  }
  log(`budget: ${over} tile(s) over ${budget} triangles (max ${maxTile}); ${before} -> ${after} triangles`);
  return { tilesOver: over, trianglesBefore: before, trianglesAfter: after, maxTileBefore: maxTile, stacked };
}
