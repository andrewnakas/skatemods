// Browser-only pre-step for writeSkate: decode textures that only carry their
// original PNG/JPEG bytes into RGBA8 (top row first, unpremultiplied, no
// colour conversion). Uses createImageBitmap + OffscreenCanvas, so it runs in
// windows and workers but not in Node; writeSkate itself stays synchronous.
import type { MapIR, Texture } from '../../ir';

export async function decodeTexture(t: Texture): Promise<void> {
  if (t.rgba || !t.encoded) return;
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') {
    throw new Error('decodeTextures needs createImageBitmap and OffscreenCanvas (browser or worker)');
  }
  const blob = new Blob([t.encoded.bytes as Uint8Array<ArrayBuffer>], { type: t.encoded.mime });
  const bitmap = await createImageBitmap(blob, {
    imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none',
  });
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D canvas unavailable');
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    t.width = bitmap.width;
    t.height = bitmap.height;
    t.rgba = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  } finally {
    bitmap.close();
  }
}

/** Fills `rgba` on every texture that only has `encoded` bytes. Mutates `map`. */
export async function decodeTextures(map: MapIR): Promise<void> {
  await Promise.all(map.textures.map((t) => decodeTexture(t)));
}
