import type { MapIR } from '../ir';
import { imageInfo } from '../util/png';
import type { InputFile } from './index';

const base = (p: string) => p.replace(/\\/g, '/').split('/').pop()!.toLowerCase();

/**
 * Fills textures that have no pixel data from dropped files with the same file name.
 * Returns the names still missing.
 */
export function attachImages(map: MapIR, missing: string[], files: InputFile[]): string[] {
  const byName = new Map(files.map(f => [base(f.path), f]));
  for (const tex of map.textures) {
    if (tex.rgba || tex.encoded) continue;
    const f = byName.get(base(tex.name));
    if (!f) continue;
    const info = imageInfo(f.bytes);
    if (!info) continue;
    tex.encoded = { mime: info.mime, bytes: f.bytes };
    tex.width = info.width;
    tex.height = info.height;
  }
  return missing.filter(m => !byName.has(base(m)));
}
