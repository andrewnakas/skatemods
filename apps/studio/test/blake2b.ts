// node test/blake2b.ts : known answers frozen from Python's hashlib and sk3/assemble.py ids (test/golden/blake2b.json).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blake2b, h64, h32, tileTextureId, contentKey } from '../src/formats/skate3/blake2b.ts';
const G = JSON.parse(readFileSync(new URL('./golden/blake2b.json', import.meta.url), 'utf8'));
const hx = (b: Uint8Array) => Buffer.from(b).toString('hex');
for (const n of [0, 1, 3, 127, 128, 129, 255, 256, 1000, 100000]) {
  const data = new Uint8Array(n).map((_, i) => (i * 31 + 7) & 255);
  for (const L of [4, 8, 16, 64]) assert.equal(hx(blake2b(data, L)), G.blake2b[`${n}:${L}`], `n=${n} L=${L}`);
}
assert.equal(h64('tex', 'default:normal').toString(), G.ids.h64_tex_default_normal);
assert.equal(h32('cPres', '50_-150', 3).toString(), G.ids.h32_cpres);
assert.equal(tileTextureId(h64('tex', 'abc'), -150, 250).toString(), G.ids.tile_texture_id);
assert.equal(h64('spline', '50_50', 7).toString(), G.ids.h64_spline);
assert.equal(contentKey(new TextEncoder().encode('png bytes')), G.content_key_png_bytes);
console.log('blake2b / h64 / h32 / tile ids: all match the frozen Python answers');
