// three.js scene graph (from any three loader) -> MapIR.
import * as THREE from 'three';
import type { MapIR, Material, Mesh, Texture } from '../ir';
import { defaultMaterial, emptyMap } from '../ir';
import { guessSurface } from '../surfaces';

export interface ToIROptions {
  /** Multiply all positions (e.g. 0.01 for centimetre FBX). */
  scale?: number;
  /** Source is Z-up (Blender/CAD OBJ, STL): rotate to Y-up. */
  zUp?: boolean;
  /** UVs use OpenGL convention (v=0 at the bottom), as from OBJ/FBX/DAE loaders: flip to glTF's. */
  flipV?: boolean;
}

/** Reads pixels of any three texture image (ImageBitmap, HTMLImageElement, canvas, data). */
async function texturePixels(tex: THREE.Texture): Promise<{ width: number; height: number; rgba: Uint8Array } | null> {
  const img = tex.image as any;
  if (!img) return null;
  if (img.data && img.width && img.height) {
    const d = img.data as ArrayLike<number>;
    if (d.length === img.width * img.height * 4) return { width: img.width, height: img.height, rgba: Uint8Array.from(d) };
    return null;
  }
  const width = img.width ?? img.naturalWidth, height = img.height ?? img.naturalHeight;
  if (!width || !height) return null;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // ImageBitmapLoader images come pre-flipped when flipY was requested; draw as-is (top row first).
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, width, height).data;
  return { width, height, rgba: new Uint8Array(data.buffer.slice(0)) };
}

export async function threeToIR(root: THREE.Object3D, name: string, opts: ToIROptions = {}): Promise<MapIR> {
  const map = emptyMap(name, 'model');
  root.updateMatrixWorld(true);
  const fix = new THREE.Matrix4();
  if (opts.zUp) fix.makeRotationX(-Math.PI / 2);
  if (opts.scale && opts.scale !== 1) fix.premultiply(new THREE.Matrix4().makeScale(opts.scale, opts.scale, opts.scale));

  const texIndex = new Map<THREE.Texture, number>();
  const matIndex = new Map<THREE.Material, number>();
  const pending: Promise<void>[] = [];

  const addTexture = (tex: THREE.Texture | null | undefined, srgb: boolean): number | undefined => {
    if (!tex) return undefined;
    if (texIndex.has(tex)) return texIndex.get(tex);
    const entry: Texture = { name: tex.name || (tex.image as any)?.src?.split('/').pop() || `texture_${map.textures.length}`, width: 0, height: 0, srgb };
    map.textures.push(entry);
    texIndex.set(tex, map.textures.length - 1);
    pending.push(texturePixels(tex).then(px => {
      if (px) { entry.width = px.width; entry.height = px.height; entry.rgba = px.rgba; }
      else map.warnings.push(`texture ${entry.name}: could not read pixels`);
    }).catch(e => { map.warnings.push(`texture ${entry.name}: ${e}`); }));
    return map.textures.length - 1;
  };

  const addMaterial = (m: THREE.Material): number => {
    if (matIndex.has(m)) return matIndex.get(m)!;
    const any = m as any;
    const mat: Material = defaultMaterial(m.name || `material_${map.materials.length}`);
    if (any.color) { const c = any.color as THREE.Color; mat.color = [c.r, c.g, c.b, m.opacity ?? 1]; }
    if (typeof any.roughness === 'number') mat.roughness = any.roughness;
    else if (typeof any.shininess === 'number') mat.roughness = Math.max(0.05, 1 - Math.min(any.shininess, 100) / 100);
    if (typeof any.metalness === 'number') mat.metallic = any.metalness;
    if (any.emissive && any.emissive.getHex() !== 0) mat.emissive = (any.emissiveIntensity ?? 1);
    mat.textures.albedo = addTexture(any.map, true);
    mat.textures.normal = addTexture(any.normalMap, false);
    if (m.transparent) mat.alphaMode = 'blend';
    else if (m.alphaTest > 0) { mat.alphaMode = 'mask'; mat.alphaCutoff = m.alphaTest; }
    mat.doubleSided = m.side === THREE.DoubleSide;
    mat.surface = guessSurface(mat.name);
    map.materials.push(mat);
    matIndex.set(m, map.materials.length - 1);
    return map.materials.length - 1;
  };

  const used = new Set<string>();
  root.traverse(obj => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!obj.visible) return;
    let geom = mesh.geometry as THREE.BufferGeometry;
    if (!geom?.attributes?.position) return;
    if (!geom.index) geom = indexed(geom);
    const pos = geom.attributes.position as THREE.BufferAttribute;
    const nrm = geom.attributes.normal as THREE.BufferAttribute | undefined;
    const uv = geom.attributes.uv as THREE.BufferAttribute | undefined;
    const uv2 = (geom.attributes.uv1 ?? geom.attributes.uv2) as THREE.BufferAttribute | undefined;
    const index = geom.index!;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const groups = geom.groups.length ? geom.groups : [{ start: 0, count: index.count, materialIndex: 0 }];

    const ir: Mesh = {
      positions: toFloat(pos, 3),
      normals: nrm ? toFloat(nrm, 3) : undefined,
      uvs: uv ? flipped(toFloat(uv, 2), opts.flipV) : undefined,
      uv2: uv2 ? flipped(toFloat(uv2, 2), opts.flipV) : undefined,
      indices: Uint32Array.from({ length: index.count }, (_, i) => index.getX(i)),
      groups: [],
    };
    // Groups may overlap or leave gaps; rebuild indices so groups tile them exactly.
    const out: number[] = [];
    for (const g of groups) {
      const start = out.length;
      const end = Math.min(g.start + g.count, index.count);
      for (let i = g.start; i < end; i++) out.push(index.getX(i));
      const m = mats[g.materialIndex ?? 0] ?? mats[0];
      ir.groups.push({ start, count: out.length - start, material: m ? addMaterial(m) : ensureDefault(map) });
    }
    ir.indices = Uint32Array.from(out);
    if (!ir.normals) ir.normals = computeNormals(ir.positions, ir.indices);

    const world = new THREE.Matrix4().multiplyMatrices(fix, obj.matrixWorld);
    let base = obj.name || mesh.geometry.name || 'mesh';
    let n = 1, uniqueName = base;
    while (used.has(uniqueName)) uniqueName = `${base}.${String(++n).padStart(3, '0')}`;
    used.add(uniqueName);
    const lname = uniqueName.toLowerCase();
    const collisionOnly = /(^|[_.\-\s])(col|collision|ucx|ucp)([_.\-\s]|$)/.test(lname);
    map.objects.push({
      name: uniqueName,
      mesh: ir,
      transform: world.elements.slice(),
      render: !collisionOnly,
      collision: { mode: /water/.test(lname) ? 'water' : 'mesh' },
    });
  });

  // Empties named spawn* / curves named rail* in glTF exports from Blender.
  root.traverse(obj => {
    if ((obj as THREE.Mesh).isMesh) return;
    const lname = obj.name.toLowerCase();
    if (lname.startsWith('spawn')) {
      const world = new THREE.Matrix4().multiplyMatrices(fix, obj.matrixWorld);
      const p = new THREE.Vector3().setFromMatrixPosition(world);
      // A Blender empty faces its +Y, which glTF's Y-up export turns into local -Z.
      const f = new THREE.Vector3(0, 0, -1).transformDirection(world);
      map.spawns.push({ name: obj.name, position: [p.x, p.y, p.z], yaw: (Math.atan2(f.x, f.z) * 180) / Math.PI });
    }
    if ((obj as THREE.Line).isLine && /rail|grind/.test(lname)) {
      const line = obj as THREE.Line;
      const world = new THREE.Matrix4().multiplyMatrices(fix, obj.matrixWorld);
      const pos = line.geometry.attributes.position;
      const pts: [number, number, number][] = [];
      for (let i = 0; i < pos.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(world);
        pts.push([v.x, v.y, v.z]);
      }
      map.rails.push({ name: obj.name, points: pts, closed: !!(line as any).isLineLoop });
    }
  });

  await Promise.all(pending);
  return map;
}

function ensureDefault(map: MapIR): number {
  const i = map.materials.findIndex(m => m.name === 'default');
  if (i >= 0) return i;
  map.materials.push(defaultMaterial());
  return map.materials.length - 1;
}

function toFloat(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, size: number): Float32Array {
  const out = new Float32Array(attr.count * size);
  for (let i = 0; i < attr.count; i++) {
    out[i * size] = attr.getX(i);
    if (size > 1) out[i * size + 1] = attr.getY(i);
    if (size > 2) out[i * size + 2] = attr.getZ(i);
  }
  return out;
}

function flipped(uv: Float32Array, flip?: boolean): Float32Array {
  if (flip) for (let i = 1; i < uv.length; i += 2) uv[i] = 1 - uv[i];
  return uv;
}

function indexed(geom: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geom.clone();
  const count = g.attributes.position.count;
  g.setIndex(Array.from({ length: count }, (_, i) => i));
  return g;
}

export function computeNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const n = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}
