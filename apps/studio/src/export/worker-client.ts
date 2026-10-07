import type { MapIR } from '../ir';
import type { ExportOutput, Target } from './index';

/** Runs an export off the main thread; the map is copied, not transferred, so the editor keeps it. */
export async function exportInWorker(map: MapIR, target: Target, progress: (t: string) => void): Promise<ExportOutput> {
  if (target === 'skate3') {
    // The .NET runtime stalls during startup inside a Web Worker, so Skate 3 builds run on the
    // page. Yield first so the busy indicator paints before the (synchronous) build blocks.
    const { exportMap } = await import('./index');
    await new Promise(r => setTimeout(r, 50));
    return exportMap(map, target, progress);
  }
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
