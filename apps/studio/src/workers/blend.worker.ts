import { readBlend } from '../import/blend';

self.onmessage = (e: MessageEvent<{ bytes: Uint8Array; name: string }>) => {
  try {
    const result = readBlend(e.data.bytes, { name: e.data.name });
    const transfer: ArrayBuffer[] = [];
    for (const o of result.map.objects) for (const a of [o.mesh.positions, o.mesh.normals, o.mesh.uvs, o.mesh.uv2, o.mesh.indices])
      if (a && a.buffer instanceof ArrayBuffer && !transfer.includes(a.buffer)) transfer.push(a.buffer);
    (self as unknown as Worker).postMessage({ ok: true, result }, transfer);
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
