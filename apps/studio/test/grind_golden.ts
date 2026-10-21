// node test/grind_golden.ts : grindEdges vs sk4/grind_edges.py answers frozen in test/golden/grind.json (remake: test/dev/make_grind_golden.ts).
import { readFileSync } from 'node:fs';
import { meshes } from './grind_meshes.ts';
import { grindEdges } from '../src/formats/skate3/grind.ts';
const G = JSON.parse(readFileSync(new URL('./golden/grind.json', import.meta.url), 'utf8'));
let bad = 0, worst = 0, lines = 0;
meshes().forEach((m, k) => {
  const o = grindEdges(Float32Array.from(m.P), Uint32Array.from(m.T)), w: number[][][] = G.meshes[k].lines;
  lines += w.length;
  let ok = o.length === w.length;
  if (ok) w.forEach((l, i) => { if (l.length !== o[i].length) ok = false; else l.forEach((p, j) => p.forEach((v, c) => { worst = Math.max(worst, Math.abs(v - o[i][j][c])); })); });
  if (!ok || worst > 1e-4) { bad++; console.log('DIFFERS', m.name, o.length, 'vs', w.length); }
});
console.log(`${G.meshes.length - bad}/${G.meshes.length} meshes match (${lines} lines), worst coord diff ${worst.toExponential(2)}`);
if (bad) process.exit(1);
