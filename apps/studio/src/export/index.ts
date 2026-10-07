import type { MapIR, Mesh } from '../ir';
import { transformPoint } from '../ir';
import { writeGlb } from '../util/glb';

export type Target = 'skate' | 'reskate' | 'skate3' | 'glb';

export interface TargetInfo {
  id: Target;
  label: string;
  file: string;
  /** Where the result goes and what you still need. */
  note: string;
  heavy?: boolean;
}

export const TARGETS: TargetInfo[] = [
  { id: 'reskate', label: 'ReSkate (skate.)', file: '.zip', note: 'ReSkate Studio map folder plus a build script. Building needs skate. and ReSkate Studio on Windows.' },
  { id: 'skate', label: 'Skate 3 Rust engine', file: '.skate', note: 'Loads directly in the Rust engine and in the browser player.' },
  { id: 'skate3', label: 'Skate 3 (Xbox 360, recomp)', file: '.big', note: 'Standalone DLC pack for skate3recomp with the Level Loader, Xenia or an Xbox 360. PS3 output is not available yet.', heavy: true },
  { id: 'glb', label: 'glTF (GLB)', file: '.glb', note: 'The whole map as one GLB, for Blender or any 3D tool.' },
];

export interface ExportOutput { name: string; bytes: Uint8Array; warnings: string[] }

/** Bakes every rendered object into world space as one mesh (materials kept per group). */
export function mergeMap(map: MapIR, which: 'render' | 'collision' | 'all' = 'render'): Mesh {
  const objects = map.objects.filter(o => which === 'all' || (which === 'render' ? o.render : o.collision.mode !== 'none'));
  let vcount = 0, icount = 0;
  for (const o of objects) { vcount += o.mesh.positions.length / 3; icount += o.mesh.indices.length; }
  const positions = new Float32Array(vcount * 3), normals = new Float32Array(vcount * 3), uvs = new Float32Array(vcount * 2);
  const byMaterial = new Map<number, number[]>();
  let vbase = 0;
  for (const o of objects) {
    const m = o.mesh, t = o.transform;
    // Normal matrix: inverse transpose of the upper 3x3 (uniform-scale shortcut is not safe).
    const nm = normalMatrix(t);
    for (let i = 0; i < m.positions.length / 3; i++) {
      const p = transformPoint(t, [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]]);
      positions.set(p, (vbase + i) * 3);
      if (m.normals) {
        const n = m.normals;
        const x = nm[0] * n[i * 3] + nm[3] * n[i * 3 + 1] + nm[6] * n[i * 3 + 2];
        const y = nm[1] * n[i * 3] + nm[4] * n[i * 3 + 1] + nm[7] * n[i * 3 + 2];
        const z = nm[2] * n[i * 3] + nm[5] * n[i * 3 + 1] + nm[8] * n[i * 3 + 2];
        const l = Math.hypot(x, y, z) || 1;
        normals.set([x / l, y / l, z / l], (vbase + i) * 3);
      }
      if (m.uvs) uvs.set([m.uvs[i * 2], m.uvs[i * 2 + 1]], (vbase + i) * 2);
    }
    const flip = det3(t) < 0;
    for (const g of m.groups) {
      const list = byMaterial.get(g.material) ?? byMaterial.set(g.material, []).get(g.material)!;
      for (let i = g.start; i < g.start + g.count; i += 3) {
        const a = m.indices[i] + vbase, b = m.indices[i + 1] + vbase, c = m.indices[i + 2] + vbase;
        if (flip) list.push(a, c, b); else list.push(a, b, c);
      }
    }
    vbase += m.positions.length / 3;
  }
  const indices = new Uint32Array(icount);
  const groups: Mesh['groups'] = [];
  let o = 0;
  for (const [material, list] of byMaterial) {
    indices.set(list, o);
    groups.push({ start: o, count: list.length, material });
    o += list.length;
  }
  return { positions, normals, uvs, indices, groups };
}

function det3(m: number[]): number {
  return m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
}

function normalMatrix(m: number[]): number[] {
  const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const D = -(b * i - c * h), E = a * i - c * g, F = -(a * h - b * g);
  const G = b * f - c * e, H = -(a * f - c * d), I = a * e - b * d;
  const det = a * A + b * B + c * C || 1;
  // inverse transpose == cofactor / det
  return [A / det, B / det, C / det, D / det, E / det, F / det, G / det, H / det, I / det];
}

export async function exportMap(map: MapIR, target: Target, progress: (t: string) => void = () => {}): Promise<ExportOutput> {
  const safe = map.name.replace(/[^A-Za-z0-9._-]+/g, '_') || 'map';
  switch (target) {
    case 'reskate': {
      const { writeReskateZip } = await import('../formats/reskate/write');
      const { zip, warnings } = writeReskateZip(map, { folder: safe });
      return { name: `${safe}_reskate.zip`, bytes: zip, warnings };
    }
    case 'skate': {
      const { decodeTextures } = await import('../formats/skate/decode');
      const { writeSkateWithReport } = await import('../formats/skate/write');
      progress('Decoding textures');
      await decodeTextures(map);
      progress('Writing .skate');
      const { bytes, warnings } = writeSkateWithReport(map);
      return { name: `${safe}.skate`, bytes, warnings };
    }
    case 'glb': {
      const mesh = mergeMap(map);
      return { name: `${safe}.glb`, bytes: writeGlb(map.name, mesh, map.materials, map.textures), warnings: [] };
    }
    case 'skate3': {
      const { writeSkate3 } = await import('../formats/skate3/client');
      return writeSkate3(map, progress);
    }
  }
}
