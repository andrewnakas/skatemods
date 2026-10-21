// DEV ONLY (needs Python + D:/n64work/skate4to3): node test/dev/grind_vs_python.ts <mod folder> <n meshes>: grindEdges vs sk4/grind_edges.py on real meshes.
import { writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { folderSource } from '../node_source.ts';
import { indexMod } from '../../src/formats/reskate-mod/mod.ts';
import { decodeBlocks } from '../../src/formats/reskate-mod/frostbite.ts';
import { parseMeshSet, decodeSection, isShadow, MESHSET_RES } from '../../src/formats/reskate-mod/mesh.ts';
import { grindEdges } from '../../src/formats/skate3/grind.ts';
const src = folderSource(process.argv[2]); const N = Number(process.argv[3] ?? 60);
const ix = await indexMod(src);
const recs: Buffer[] = []; const ours: number[][][][] = [];
let k = 0;
for (const [name, r] of ix.res) {
  if (r.type !== MESHSET_RES || k >= N) continue;
  const ms = parseMeshSet(decodeBlocks(await src.read(r.range.cas, r.range.offset, r.range.size)));
  const lod = ms.lods[0]; const c = ix.chunks.get(lod?.chunk ?? '')?.find((x) => x.logicalOffset === 0);
  if (!lod || !c) continue;
  const chunk = decodeBlocks(await src.read(c.range.cas, c.range.offset, c.range.size));
  const P: number[] = [], I: number[] = [];
  for (const s of lod.sections) { if (isShadow(s) || !s.primitives) continue; const g = decodeSection(chunk, lod, s); const b = P.length / 3; P.push(...g.positions); for (const i of g.indices) I.push(i + b); }
  if (I.length < 6) continue;
  const pos = Float32Array.from(P), tri = Uint32Array.from(I);
  ours.push(grindEdges(pos, tri));
  const h = Buffer.alloc(8); h.writeUInt32LE(pos.length / 3, 0); h.writeUInt32LE(tri.length / 3, 4);
  recs.push(h, Buffer.from(pos.buffer), Buffer.from(tri.buffer)); k++;
}
const tmp = 'D:/n64work/skate4to3/work/kraken';
writeFileSync(`${tmp}/grind_in.bin`, Buffer.concat(recs));
execFileSync('python', ['-c', `
import sys, struct, json, numpy as np
sys.path.insert(0, 'D:/n64work/skate4to3/oracle/sk4'); from grind_edges import grind_edges
d = open('${tmp}/grind_in.bin','rb').read(); p = 0; out = []
while p < len(d):
    nv, nt = struct.unpack_from('<II', d, p); p += 8
    P = np.frombuffer(d, '<f4', nv*3, p).reshape(-1,3); p += nv*12
    T = np.frombuffer(d, '<u4', nt*3, p).reshape(-1,3).astype(np.int64); p += nt*12
    out.append([l.tolist() for l in grind_edges(P, T)])
json.dump(out, open('${tmp}/grind_py.json','w'))
`]);
const py: number[][][][] = JSON.parse(readFileSync(`${tmp}/grind_py.json`, 'utf8'));
let same = 0, lines = 0, worst = 0; const diff: number[] = [];
py.forEach((pl, m) => {
  const o = ours[m];
  lines += pl.length;
  let ok = pl.length === o.length;
  if (ok) pl.forEach((l, i) => { if (l.length !== o[i].length) ok = false; else l.forEach((p, j) => p.forEach((v, c) => { worst = Math.max(worst, Math.abs(v - o[i][j][c])); })); });
  if (ok) same++; else diff.push(m);
});
console.log(`${same}/${py.length} meshes identical polylines (${lines} lines), worst coord diff ${worst.toExponential(2)}; differ: ${diff.slice(0, 10)}`);
