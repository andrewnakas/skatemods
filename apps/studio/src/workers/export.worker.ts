import { exportMap, type Target } from '../export';
import type { MapIR } from '../ir';

self.onmessage = async (e: MessageEvent<{ map: MapIR; target: Target }>) => {
  const post = (msg: unknown, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);
  try {
    const out = await exportMap(e.data.map, e.data.target, text => post({ progress: text }));
    post({ ok: true, out }, [out.bytes.buffer as ArrayBuffer]);
  } catch (err) {
    post({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
