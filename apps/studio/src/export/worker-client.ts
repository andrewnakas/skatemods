import type { MapIR } from '../ir';
import type { ExportOutput, Target } from './index';

/** Runs an export off the main thread; the map is copied, not transferred, so the editor keeps it. */
export function exportInWorker(map: MapIR, target: Target, progress: (t: string) => void): Promise<ExportOutput> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/export.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = e => {
      if (e.data.progress) return progress(e.data.progress);
      worker.terminate();
      if (e.data.ok) resolve(e.data.out); else reject(new Error(e.data.error));
    };
    worker.onerror = e => { worker.terminate(); reject(new Error(e.message || 'export crashed')); };
    worker.postMessage({ map, target });
  });
}
