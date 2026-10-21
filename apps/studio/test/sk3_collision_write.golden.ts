// SPDX-License-Identifier: GPL-3.0-or-later
// node test/sk3_collision_write.golden.ts : the collision writer (clustered mesh + KD tree builder,
// tile arena) and the grind-spline writer against the Python oracle.
import assert from 'node:assert/strict';
import * as CW from '../src/formats/skate3/collision_write.ts';
import * as SP from '../src/formats/skate3/splines.ts';
import type { SplineSet } from '../src/formats/skate3/splines.ts';
import { check, haveCase, loadCase, summary } from './sk3_golden_util.ts';

const v3 = (a: ArrayLike<number>, k: number): [number, number, number] => [a[3 * k], a[3 * k + 1], a[3 * k + 2]];

{
  const c = loadCase('collision_synth');
  for (const m of c.inputs.meshes) {
    const { mesh, report } = CW.buildMesh(m.V, m.T, m.S, m.kw);
    assert.deepEqual(report, m.report, `${m.label} report`);
    check(c, m.label, CW.encodeMesh(mesh));
  }
  // the tile arena uses its own box (-1..1), as the Python case does
  const V = [-1, 0, -1, 1, 0, -1, 1, 1, -1, -1, 1, -1, -1, 0, 1, 1, 0, 1, 1, 1, 1, -1, 1, 1];
  const T = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 0, 4, 7, 0, 7, 3];
  const { mesh } = CW.buildMesh(V, T, null);
  const p = c.inputs.tile_points as number[][];
  const [id0, id1] = c.inputs.spline_ids as bigint[];
  const ss: SplineSet = { kind: 0, splines: [
    { id: id0, template: 0x2C70170700000000n, segments: p.slice(0, -1).map((a, k) => SP.straightSegment(a, p[k + 1])) },
    { id: id1, template: 0x2C70170700000000n, segments: [SP.straightSegment(p[0], p[3], 0x30)] }] };
  check(c, 'tile_arena', CW.buildTileArena(mesh, 0xC0FFEE, 'cSim_t_0', 0x123456789ABCDEF0n, {
    spline_set: ss, splines_id: 0x0FEDCBA987654321n, imports: [[0x1111n, 0xeb0069, 0x800001]] }).arena);
  check(c, 'tile_arena_plain', CW.buildTileArena(mesh, 5, 'cSim_plain', 42n,
    { instance_ids: [1n, 2n, 3n, 0xFFFFFFFFFFFFFFFFn] }).arena);
}
for (const name of ['collision_real', 'collision_real_big'].filter(haveCase)) {
  const c = loadCase(name);
  const i = c.inputs;
  const { mesh, report } = CW.buildMesh(i.V, i.T, i.S);
  assert.deepEqual(report, i.report, `${name} report`);
  const n = i.spline_points.length / 3;
  const segs = Array.from({ length: n - 1 }, (_, k) => SP.straightSegment(v3(i.spline_points, k), v3(i.spline_points, k + 1)));
  check(c, 'arena', CW.buildTileArena(mesh, i.arena_id, i.name, i.export_id, {
    spline_set: { kind: 0, splines: [{ id: i.spline_id, template: 0x2C70170700000000n, segments: segs }] },
    splines_id: i.splines_id }).arena);
}
{
  const c = loadCase('splines');
  const cv: Float64Array = c.inputs.curves;          // (40, 4, 3): a, b, c, d per segment
  const segs = Array.from({ length: 40 }, (_, k) => {
    const [a, b, cc, d] = [0, 1, 2, 3].map(j => v3(cv, 4 * k + j));
    const [mn, mx] = SP.segmentBbox(a, b, cc, d);
    return { a, b, c: cc, d, bmin: mn, bmax: mx, flags: 0x10 | (k % 3 ? 0x20 : 0) | (k % 5 === 0 ? 0x40 : 0) };
  });
  const ss: SplineSet = { kind: 1, splines: [
    ...[0, 1, 2, 3].map(k => ({ id: 0xFFFFFFFF00000000n + BigInt(k), template: 0x2C70170700000000n + BigInt(k),
      segments: segs.slice(10 * k, 10 * k + 10) })),
    { id: 77n, template: 78n, segments: [] }] };
  const enc = SP.encodeSplines(ss);
  check(c, 'curved', enc);
  // round trip without the empty spline (sk3/splines.py parse reads one segment for an empty one)
  const enc4 = SP.encodeSplines({ kind: 1, splines: ss.splines.slice(0, 4) });
  assert.deepEqual(SP.encodeSplines(SP.parseSplines(enc4)), enc4, 'parse/encode round trip');
  const pts: Float64Array = c.inputs.points;
  const st = Array.from({ length: pts.length / 3 - 1 }, (_, k) => SP.straightSegment(v3(pts, k), v3(pts, k + 1)));
  check(c, 'straight', SP.encodeSplines({ kind: 0, splines: [{ id: 1n, template: 2n, segments: st }] }));
}
summary('collision_write + splines');
