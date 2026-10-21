// SPDX-License-Identifier: GPL-3.0-or-later
// node test/sk3_render_write.golden.ts : the render-arena writer port against the Python oracle.
import * as RW from '../src/formats/skate3/render_write.ts';
import type { RenderPart } from '../src/formats/skate3/render_write.ts';
import { halfBits } from '../src/formats/skate3/num_util.ts';
import { check, haveCase, loadCase, summary } from './sk3_golden_util.ts';

function parts(raw: any[]): RenderPart[] {
  return raw.map(p => ({ ...p }));
}

{
  const c = loadCase('render_synth');
  const ps = parts(c.inputs.parts);
  check(c, 'arena', RW.buildRenderArena(ps, 0x13579BDF, 'synthModel'));
  check(c, 'arena_one_part', RW.buildRenderArena(ps.slice(0, 1), 7, 'Model'));
}
if (haveCase('render_real')) {
  const c = loadCase('render_real');
  check(c, 'arena', RW.buildRenderArena(parts(c.inputs.parts), c.inputs.arena_id, c.inputs.name));
}
{
  const c = loadCase('render_encoders');
  const i = c.inputs;
  const hv: Float64Array = i.half;
  const hb = new Uint8Array(2 * hv.length);
  hv.forEach((x, k) => new DataView(hb.buffer).setUint16(2 * k, halfBits(x)));
  check(c, 'half', hb);
  const rows = (a: Float64Array, w: number) => Array.from({ length: a.length / w }, (_, k) => Array.from(a.subarray(w * k, w * k + w)));
  check(c, 'probes', RW.encProbes({ rec_off: i.probes.rec_off, fill: i.probes.fill, records: rows(i.probes.records, 40) }));
  check(c, 'quads', RW.encQuads({ rec_off: 0x10, fill: [0, 0], records: i.quads.records.map((r: any) => ({
    points: rows(r.points, 4), axis: Array.from(r.axis as Float64Array), guid: r.guid, w: r.w, tag: r.tag })) }));
  check(c, 'guid_quads', RW.encGuidQuads({ rec_off: 0x10, fill: [0, 0], records: i.guid_quads }));
  const pts = rows(i.polys.points, 4);
  check(c, 'polys', RW.encPolys({ bbox: Array.from(i.polys.bbox as Float64Array), rec_off: 0x30, fill: [0, 0],
    points: Array.from({ length: pts.length / 4 }, (_, k) => pts.slice(4 * k, 4 * k + 4)) }));
  check(c, 'exports_noindex', RW.encExports({ entries: [
    { name: 'alpha', hash: 1, guid: 0xABCDEF0123456789n, type: 0xeb0001, value: 3 },
    { name: null, hash: RW.NO_HASH, guid: 5n, type: 0xeb0066, value: 0x800001 },
    { name: 'alpha', hash: 2, guid: 6n, type: 0xeb0005, value: 1 }], index: [], string_pad: new Uint8Array([7, 8]) }));
}
summary('render_write');
