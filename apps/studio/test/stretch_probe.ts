// node test/stretch_probe.ts <mod folder>: per material, UV density (repeats per metre, sqrt of
// uv area / world area) on steep vs flat faces, plus the share of steep faces smeared (< 1/4 of
// the flat median). A top-down-mapped cliff shows a tiny steep median and a high smeared share.
import { folderSource } from './node_source.ts';
import { exportMod } from '../src/formats/skate3/export.ts';
import { faceAxes } from '../src/formats/skate3/uv_project.ts';

const ex = await exportMod(folderSource(process.argv[2]), { log: () => {}, maxTexture: 16 });
const med = (a: number[]) => (a.length ? a.sort((x, y) => x - y)[a.length >> 1] : NaN);
let worst = 1;
for (const p of ex.prims) {
  const P = p.positions, U = p.uv0, I = p.indices, ax = faceAxes(P, I);
  const flat: number[] = [], steep: number[] = [];
  for (let t = 0; t < I.length / 3; t++) {
    const a = I[3 * t], b = I[3 * t + 1], c = I[3 * t + 2];
    const ux = P[3 * b] - P[3 * a], uy = P[3 * b + 1] - P[3 * a + 1], uz = P[3 * b + 2] - P[3 * a + 2];
    const vx = P[3 * c] - P[3 * a], vy = P[3 * c + 1] - P[3 * a + 1], vz = P[3 * c + 2] - P[3 * a + 2];
    const wa = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    const ta = Math.abs((U[2 * b] - U[2 * a]) * (U[2 * c + 1] - U[2 * a + 1]) - (U[2 * c] - U[2 * a]) * (U[2 * b + 1] - U[2 * a + 1]));
    if (wa < 1e-6) continue;
    (ax[t] === 1 ? flat : steep).push(Math.sqrt(ta / wa));
  }
  if (steep.length < 8 || flat.length < 8) continue;
  const fm = med([...flat]), sm = med([...steep]);
  const smeared = steep.filter((d) => d < fm / 4).length / steep.length;
  if (fm > 0) worst = Math.min(worst, sm / fm);
  console.log(`${p.material.slice(0, 44).padEnd(44)} flat ${fm.toFixed(4)} /m  steep ${sm.toFixed(4)} /m  ratio ${(sm / fm).toFixed(2)}  smeared ${(100 * smeared).toFixed(1)}%  (${steep.length} steep)`);
}
console.log('reprojected', JSON.stringify(ex.report.reprojected));
