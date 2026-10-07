// MapIR -> three.js objects for the viewport.
import * as THREE from 'three';
import type { MapIR, MapObject, Texture } from '../ir';
import { SURFACES } from '../surfaces';

export type ViewMode = 'textured' | 'surfaces' | 'collision';

export async function textureToThree(tex: Texture): Promise<THREE.Texture | null> {
  if (tex.rgba && tex.width && tex.height) {
    const t = new THREE.DataTexture(tex.rgba, tex.width, tex.height, THREE.RGBAFormat);
    t.flipY = false;
    t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = tex.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  }
  if (tex.encoded && typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(new Blob([tex.encoded.bytes as BlobPart], { type: tex.encoded.mime }));
      const t = new THREE.Texture(bmp as any);
      t.flipY = false;
      t.needsUpdate = true;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = tex.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      return t;
    } catch { return null; }
  }
  return null;
}

export function geometryFor(obj: MapObject): THREE.BufferGeometry {
  const m = obj.mesh;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  if (m.normals) g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
  if (m.uvs) g.setAttribute('uv', new THREE.BufferAttribute(m.uvs, 2));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  // Material slots follow group order; materialsFor() returns one material per group.
  m.groups.forEach((grp, i) => g.addGroup(grp.start, grp.count, i));
  if (!m.normals) g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

const surfaceColor = new Map(SURFACES.map(s => [s.id, s.color]));

export class SceneBuilder {
  textures: (THREE.Texture | null)[] = [];
  materials: THREE.MeshStandardMaterial[] = [];

  async load(map: MapIR) {
    this.dispose();
    this.textures = await Promise.all(map.textures.map(textureToThree));
    this.materials = map.materials.map(m => {
      const mat = new THREE.MeshStandardMaterial({
        name: m.name,
        color: new THREE.Color(m.color[0], m.color[1], m.color[2]),
        roughness: m.roughness,
        metalness: m.metallic,
        side: m.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
        transparent: m.alphaMode === 'blend',
        opacity: m.alphaMode === 'blend' ? m.color[3] : 1,
        alphaTest: m.alphaMode === 'mask' ? m.alphaCutoff : 0,
      });
      const t = m.textures.albedo !== undefined ? this.textures[m.textures.albedo] : null;
      if (t) mat.map = t;
      return mat;
    });
  }

  /** Materials for one object in the requested view mode. */
  materialsFor(map: MapIR, obj: MapObject, mode: ViewMode): THREE.Material | THREE.Material[] {
    if (mode === 'textured') {
      const fallback = new THREE.MeshStandardMaterial({ color: 0xbbbbbb });
      return obj.mesh.groups.map(g => this.materials[g.material] ?? fallback);
    }
    const none = obj.collision.mode === 'none';
    return obj.mesh.groups.map(g => {
      const surface = obj.collision.surface ?? map.materials[g.material]?.surface ?? 'concrete';
      const color = mode === 'surfaces' ? surfaceColor.get(surface) ?? 0xb0b0b0
        : ({ mesh: 0x8a9a8a, convex: 0x6c8fb3, hull: 0xb38a6c, none: 0xcccccc, water: 0x2f6fb0 } as const)[obj.collision.mode];
      return new THREE.MeshStandardMaterial({
        color, roughness: 0.9, flatShading: true,
        transparent: none, opacity: none ? 0.25 : 1, depthWrite: !none,
      });
    });
  }

  dispose() {
    for (const t of this.textures) t?.dispose();
    for (const m of this.materials) m.dispose();
    this.textures = [];
    this.materials = [];
  }
}
