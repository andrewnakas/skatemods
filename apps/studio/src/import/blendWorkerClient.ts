import type { MapIR } from '../ir';

export function readBlendInWorker(bytes: Uint8Array, name: string): Promise<{ map: MapIR; missingImages: string[]; version: string }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/blend.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = e => {
      worker.terminate();
      if (e.data.ok) resolve(e.data.result);
      else reject(new Error(e.data.error));
    };
    worker.onerror = e => { worker.terminate(); reject(new Error(e.message || 'the .blend reader crashed')); };
    worker.postMessage({ bytes, name });
  });
}
