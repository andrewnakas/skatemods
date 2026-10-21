// node test/extent_probe.ts <mod folder>: world bounds of the exported prims, a Y histogram, spawns.
import { folderSource } from './node_source.ts';
import { exportMod } from '../src/formats/skate3/export.ts';
const ex = await exportMod(folderSource(process.argv[2]), { log: () => {} });
const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], hist = new Map<number, number>();
for (const p of ex.prims) for (let i = 0; i < p.positions.length; i += 3) for (let k = 0; k < 3; k++) {
  const v = p.positions[i + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v;
  if (k === 1) { const b = Math.floor(v / 1000); hist.set(b, (hist.get(b) ?? 0) + 1); }
}
console.log('min', lo.map(Math.round), 'max', hi.map(Math.round));
console.log('y km histogram', [...hist].sort((a, b) => a[0] - b[0]).map(([b, n]) => `${b}:${n}`).join(' '));
for (const s of ex.spawns) console.log('spawn', s.name, s.x.toFixed(0), s.y.toFixed(0), s.z.toFixed(0));
