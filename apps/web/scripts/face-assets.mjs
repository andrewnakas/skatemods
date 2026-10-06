// Puts what /face/ runs on the phone under public/face/mediapipe/ (gitignored): the MediaPipe
// vision WASM from node_modules and two models, pinned by SHA-256 and cached between builds.
// Self-hosted so the scan itself needs nothing from another site. Runs before `astro build`/`dev`.
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const out = new URL('../public/face/mediapipe/', import.meta.url);
const wasm = new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url);
const models = [
  ['face_landmarker.task', 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff'],
  ['selfie_multiclass.tflite', 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
    'c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0'],
];
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

await mkdir(out, { recursive: true });
for (const name of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm'])
  await copyFile(new URL(name, wasm), new URL(name, out));
for (const [name, url, want] of models) {
  const file = new URL(name, out);
  if (existsSync(file) && sha(await readFile(file)) === want) continue;
  let last;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (sha(buf) !== want) throw new Error(`${name}: SHA-256 ${sha(buf)} is not the pinned ${want}`);
      await writeFile(file, buf);
      last = null;
      break;
    } catch (error) { last = error; await new Promise((r) => setTimeout(r, attempt * 2000)); }
  }
  if (last) throw last;
}
console.log('face assets ready');
