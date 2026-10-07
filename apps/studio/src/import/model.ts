// Any three.js-loadable model -> MapIR. Sibling files (textures, .bin, .mtl) resolve by name.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js';
import { threeToIR } from '../three/toIR';
import { ext, type ImportResult, type InputFile } from './index';

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  bmp: 'image/bmp', tga: 'image/x-tga', bin: 'application/octet-stream', gltf: 'model/gltf+json',
};

export async function loadModel(main: InputFile, files: InputFile[]): Promise<ImportResult> {
  const urls = new Map<string, string>();
  const created: string[] = [];
  for (const f of files) {
    const url = URL.createObjectURL(new Blob([f.bytes as BlobPart], { type: MIME[ext(f.path)] ?? 'application/octet-stream' }));
    created.push(url);
    const name = f.path.split('/').pop()!.toLowerCase();
    urls.set(f.path.toLowerCase(), url);
    if (!urls.has(name)) urls.set(name, url);
  }
  const manager = new THREE.LoadingManager();
  const missing = new Set<string>();
  manager.setURLModifier(url => {
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;
    const clean = decodeURIComponent(url).replace(/\\/g, '/').split('?')[0];
    const name = clean.split('/').pop()!.toLowerCase();
    const hit = urls.get(clean.toLowerCase().replace(/^\.\//, '')) ?? urls.get(name);
    if (!hit) missing.add(name);
    return hit ?? url;
  });
  manager.addHandler(/\.tga$/i, new TGALoader(manager));

  const mainName = main.path.split('/').pop()!;
  const mainUrl = urls.get(main.path.toLowerCase())!;
  const kind = ext(main.path);
  const name = mainName.replace(/\.[^.]+$/, '');
  let root: THREE.Object3D;
  let zUp = false, flipV = true, scale = 1, axisUnknown = false;

  try {
    if (kind === 'glb' || kind === 'gltf') {
      const loader = new GLTFLoader(manager);
      const draco = new DRACOLoader(manager);
      draco.setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
      loader.setDRACOLoader(draco);
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(mainUrl);
      root = gltf.scene;
      flipV = false;
      draco.dispose();
    } else if (kind === 'fbx') {
      root = await new FBXLoader(manager).loadAsync(mainUrl);
      // FBXLoader keeps file units; most exports are centimetres. Guess from size.
      scale = guessFbxScale(root);
    } else if (kind === 'obj') {
      const loader = new OBJLoader(manager);
      const mtlFile = files.find(f => ext(f.path) === 'mtl');
      if (mtlFile) {
        const mtl = new MTLLoader(manager).parse(new TextDecoder().decode(mtlFile.bytes), '');
        mtl.preload();
        loader.setMaterials(mtl);
      }
      root = loader.parse(new TextDecoder().decode(main.bytes));
      axisUnknown = true;
    } else if (kind === 'dae') {
      const dae = await new ColladaLoader(manager).loadAsync(mainUrl);
      root = dae!.scene; // ColladaLoader already applies the file's up axis and units
    } else if (kind === 'stl' || kind === 'ply') {
      const geom = kind === 'stl' ? new STLLoader(manager).parse(main.bytes.slice().buffer) : new PLYLoader(manager).parse(main.bytes.slice().buffer);
      geom.computeVertexNormals();
      const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ name: 'default', color: geom.attributes.color ? 0xffffff : 0xbbbbbb }));
      mesh.name = name;
      root = mesh;
      zUp = true; // CAD and Blender STL/PLY exports are Z up
      axisUnknown = true;
    } else if (kind === '3mf') {
      root = await new ThreeMFLoader(manager).loadAsync(mainUrl); // 3MF is Z-up; the loader rotates
    } else throw new Error(`.${kind} is not supported`);

    await waitForTextures(manager);
    const map = await threeToIR(root, name, { zUp, flipV, scale });
    map.source = `model .${kind}`;
    if (scale !== 1) map.warnings.push(`Scaled by ${scale} (FBX in centimetres). Change it under Map if the skater looks wrong.`);
    if (missing.size) map.warnings.push(`Missing files: ${[...missing].join(', ')}. Drop them in with the model.`);
    return { map, kind: 'model', axisUnknown };
  } finally {
    setTimeout(() => created.forEach(u => URL.revokeObjectURL(u)), 5000);
  }
}

function waitForTextures(manager: THREE.LoadingManager): Promise<void> {
  return new Promise(resolve => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    manager.onLoad = finish;
    // If nothing was queued, onLoad never fires.
    setTimeout(finish, 1500);
  });
}

function guessFbxScale(root: THREE.Object3D): number {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3()).length();
  // A skate spot is tens to hundreds of metres. Thousands of units means centimetres.
  return size > 2000 ? 0.01 : 1;
}
