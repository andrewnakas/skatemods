// .skmproj: a zip holding the MapIR as JSON plus raw typed arrays, so work can be
// saved, resumed and shared. Also backs the IndexedDB autosave.
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { MapIR } from './ir';

const TYPED = ['positions', 'normals', 'uvs', 'uv2', 'indices'] as const;

export function saveProject(map: MapIR): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const objects = map.objects.map((o, i) => {
    const mesh: Record<string, unknown> = { groups: o.mesh.groups };
    for (const k of TYPED) {
      const a = o.mesh[k];
      if (!a) continue;
      const path = `mesh/${i}.${k}`;
      files[path] = new Uint8Array(a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength));
      mesh[k] = { path, type: a instanceof Uint32Array ? 'u32' : 'f32' };
    }
    return { ...o, mesh, extra: plain(o.extra) };
  });
  const textures = map.textures.map((t, i) => {
    const out: Record<string, unknown> = { name: t.name, width: t.width, height: t.height, srgb: t.srgb };
    if (t.encoded) { files[`tex/${i}.enc`] = t.encoded.bytes; out.encoded = { mime: t.encoded.mime, path: `tex/${i}.enc` }; }
    else if (t.rgba) { files[`tex/${i}.rgba`] = t.rgba; out.rgba = `tex/${i}.rgba`; }
    return out;
  });
  const doc = { format: 'skmproj', version: 1, map: { ...map, objects, textures, extra: plain(map.extra) } };
  files['project.json'] = strToU8(JSON.stringify(doc));
  return zipSync(files, { level: 1 });
}

export function loadProject(bytes: Uint8Array): MapIR {
  const files = unzipSync(bytes);
  const doc = JSON.parse(strFromU8(files['project.json']));
  if (doc.format !== 'skmproj') throw new Error('not a Map Studio project');
  const map = doc.map as MapIR;
  map.objects = map.objects.map((o: any) => {
    const mesh: any = { groups: o.mesh.groups };
    for (const k of TYPED) {
      const ref = o.mesh[k];
      if (!ref) continue;
      const b = files[ref.path].slice();
      mesh[k] = ref.type === 'u32' ? new Uint32Array(b.buffer) : new Float32Array(b.buffer);
    }
    return { ...o, mesh };
  });
  map.textures = (map.textures as any[]).map(t => ({
    name: t.name, width: t.width, height: t.height, srgb: t.srgb,
    encoded: t.encoded ? { mime: t.encoded.mime, bytes: files[t.encoded.path] } : undefined,
    rgba: t.rgba ? files[t.rgba] : undefined,
  }));
  return map;
}

/** Drops typed arrays and other binary data from format passthrough before JSON. */
function plain(x: unknown): any {
  if (x === undefined || x === null) return x;
  return JSON.parse(JSON.stringify(x, (_k, v) => (ArrayBuffer.isView(v) ? Array.from(v as unknown as ArrayLike<number>) : v)));
}

// IndexedDB autosave. Every call is wrapped: private windows and blocked storage just skip it.
const DB = 'map-studio', STORE = 'autosave';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function autosave(map: MapIR): Promise<void> {
  try {
    const db = await open();
    const bytes = saveProject(map);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ name: map.name, saved: Date.now(), bytes }, 'last');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { /* storage unavailable */ }
}

export async function loadAutosave(): Promise<{ name: string; saved: number; bytes: Uint8Array } | null> {
  try {
    const db = await open();
    const value = await new Promise<any>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get('last');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return value ?? null;
  } catch { return null; }
}

export async function clearAutosave(): Promise<void> {
  try {
    const db = await open();
    db.transaction(STORE, 'readwrite').objectStore(STORE).delete('last');
    db.close();
  } catch { /* ignore */ }
}
