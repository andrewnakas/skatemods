// Copies runtime decoders three.js loads by URL into public/ (gitignored).
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const draco = join(root, 'node_modules/three/examples/jsm/libs/draco/gltf');
const out = join(root, 'public/draco');
if (existsSync(draco)) {
  mkdirSync(out, { recursive: true });
  cpSync(draco, out, { recursive: true });
}
