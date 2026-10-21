// node test/uv_fit_probe.ts <mod folder>: per material, how well uv0 fits a world-space planar
// projection (U,V ~ a*x + b*y + c*z + d) and how many faces are steep - finds top-down-mapped terrain.
import { folderSource } from './node_source.ts';
import { exportMod } from '../src/formats/skate3/export.ts';
import { fitPlanar } from '../src/formats/skate3/uv_project.ts';

const ex = await exportMod(folderSource(process.argv[2]), { log: () => {}, maxTexture: 16 });
const rows: string[] = [];
for (const p of ex.prims) {
  const f = fitPlanar(p.positions, p.uv0, p.indices);
  const nt = p.indices.length / 3;
  let steep = 0;
  for (let t = 0; t < nt; t++) if (f.faceAxis[t] !== 1) steep++;
  let umax = 0;
  for (const v of p.uv0) umax = Math.max(umax, Math.abs(v));
  rows.push(`${p.material.slice(0, 48).padEnd(48)} tris ${String(nt).padStart(7)} steep ${(100 * steep / nt).toFixed(0).padStart(3)}% ` +
    `R2 ${f.r2.map((r) => r.toFixed(4)).join('/')} fitVerts ${(100 * f.fitShare).toFixed(0).padStart(3)}% ` +
    `U=${f.u.map((c) => c.toFixed(4)).join(',')} V=${f.v.map((c) => c.toFixed(4)).join(',')} |uv|max ${umax.toFixed(1)} planar ${f.planar}`);
}
console.log(rows.sort().join('\n'));
