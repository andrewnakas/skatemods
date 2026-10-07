// Turns whatever the user dropped into a MapIR. Heavy readers load on demand.
import { unzipSync } from 'fflate';
import type { MapIR } from '../ir';

export interface InputFile { path: string; bytes: Uint8Array }

export type InputKind = 'blend' | 'skate' | 'reskate' | 'skate3' | 'model' | 'unknown';

export interface ImportResult {
  map: MapIR;
  kind: InputKind;
  /** Images a .blend referenced but did not pack; the user can drop them in. */
  missingImages?: string[];
  /** The model needs an axis decision (OBJ/STL/PLY carry no up-axis). */
  axisUnknown?: boolean;
}

const MODEL_EXT = ['glb', 'gltf', 'fbx', 'obj', 'dae', 'stl', 'ply', '3mf'];
export const ACCEPT = ['.blend', '.skate', '.zip', '.big', '.edat', ...MODEL_EXT.map(e => '.' + e), '.json', '.mtl', '.bin', '.png', '.jpg', '.jpeg', '.tga', '.webp'].join(',');

export const ext = (p: string) => (p.split('.').pop() ?? '').toLowerCase();

/** Expands zips (one level deep, nested zips too) into a flat file list. */
export function expand(files: InputFile[]): InputFile[] {
  const out: InputFile[] = [];
  for (const f of files) {
    if (ext(f.path) === 'zip') {
      const entries = unzipSync(f.bytes);
      const inner = Object.entries(entries)
        .filter(([p, b]) => !p.endsWith('/') && !p.startsWith('__MACOSX/') && b.length)
        .map(([p, b]) => ({ path: p, bytes: b }));
      out.push(...expand(inner));
    } else out.push(f);
  }
  return out;
}

export function detect(files: InputFile[]): { kind: InputKind; main?: InputFile } {
  const by = (pred: (f: InputFile) => boolean) => files.find(pred);
  const blend = by(f => ext(f.path) === 'blend' || isBlend(f.bytes));
  if (blend) return { kind: 'blend', main: blend };
  const skate = by(f => ext(f.path) === 'skate' || isSkate(f.bytes));
  if (skate) return { kind: 'skate', main: skate };
  const mapJson = by(f => /(^|\/)map\.json$/i.test(f.path));
  if (mapJson) return { kind: 'reskate', main: mapJson };
  const big = by(f => ['big', 'edat'].includes(ext(f.path)) || isBig(f.bytes));
  if (big) return { kind: 'skate3', main: big };
  for (const e of MODEL_EXT) {
    const m = by(f => ext(f.path) === e);
    if (m) return { kind: 'model', main: m };
  }
  return { kind: 'unknown' };
}

// Uncompressed only; zstd/gzip-compressed .blend files are recognised by extension.
const isBlend = (b: Uint8Array) => String.fromCharCode(...b.subarray(0, 7)) === 'BLENDER';
const isSkate = (b: Uint8Array) => String.fromCharCode(...b.subarray(0, 5)) === 'SKATE';
const isBig = (b: Uint8Array) => (b[0] === 0x45 && b[1] === 0x42) || String.fromCharCode(...b.subarray(0, 4)) === 'BIGF' || String.fromCharCode(...b.subarray(0, 4)) === 'BIG4';

export async function importFiles(raw: InputFile[], onProgress: (t: string) => void = () => {}): Promise<ImportResult> {
  const files = expand(raw);
  const { kind, main } = detect(files);
  const baseName = (p: string) => p.split('/').pop()!.replace(/\.[^.]+$/, '');
  switch (kind) {
    case 'blend': {
      onProgress('Reading .blend');
      const { readBlendInWorker } = await import('./blendWorkerClient');
      const r = await readBlendInWorker(main!.bytes, baseName(main!.path));
      // Images referenced by path may have been dropped alongside the .blend.
      const { attachImages } = await import('./images');
      const missing = attachImages(r.map, r.missingImages, files);
      return { map: r.map, kind, missingImages: missing };
    }
    case 'skate': {
      onProgress('Reading .skate');
      const { readSkate } = await import('../formats/skate/read');
      const { map } = readSkate(main!.bytes);
      if (!map.name || map.name === 'untitled') map.name = baseName(main!.path);
      return { map, kind };
    }
    case 'reskate': {
      onProgress('Reading ReSkate map');
      const { readReskateHandshake } = await import('../formats/reskate/read');
      const record = Object.fromEntries(files.map(f => [f.path, f.bytes]));
      return { map: readReskateHandshake(record), kind };
    }
    case 'skate3': {
      onProgress('Loading the Skate 3 tools (.NET, first time only)');
      const { readSkate3 } = await import('../formats/skate3/client');
      return { map: await readSkate3(main!.bytes, baseName(main!.path), onProgress), kind };
    }
    case 'model': {
      onProgress(`Loading ${main!.path.split('/').pop()}`);
      const { loadModel } = await import('./model');
      return loadModel(main!, files);
    }
    default:
      throw new Error('Drop a .blend, .glb/.gltf, .fbx, .obj, .dae, .stl, .ply, a .skate map, a ReSkate map folder or zip, or a Skate 3 DLC .big.');
  }
}
