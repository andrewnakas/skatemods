// DEV ONLY (needs Python + D:/n64work/skate4to3): freezes sk4/grind_edges.py output on test/grind_meshes.ts into test/golden/grind.json.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { meshes } from '../grind_meshes.ts';
const ms = meshes();
const py = execFileSync('python', ['-c', `
import sys, json, numpy as np
sys.path.insert(0, 'D:/n64work/skate4to3/oracle/sk4'); from grind_edges import grind_edges
out = []
for m in json.load(sys.stdin):
    P = np.array(m['P'], '<f4').reshape(-1,3); T = np.array(m['T'], np.int64).reshape(-1,3)
    out.append([l.tolist() for l in grind_edges(P, T)])
print(json.dumps(out))
`], { input: JSON.stringify(ms), encoding: 'utf8' });
const want = JSON.parse(py);
writeFileSync(new URL('../golden/grind.json', import.meta.url), JSON.stringify({ _source: 'frozen from skate4to3 sk4/grind_edges.py on test/grind_meshes.ts', meshes: ms.map((m, i) => ({ name: m.name, lines: want[i] })) }));
console.log(ms.map((m, i) => `${m.name}:${want[i].length}`).join(' '));
