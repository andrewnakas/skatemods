// ReSkate Studio handshake (map.json + meshes/*.glb + textures/) -> MapIR.
import type { CollisionMode, MapIR, Mat4, Material, Mesh, Texture, Vec3 } from '../../ir';
import { defaultMaterial, emptyMap } from '../../ir';
import { surfaceFromReskatePacked } from '../../surfaces';
import { readGlb, type GlbRead } from '../../util/glb';
import { imageInfo } from '../../util/png';
import { RAIL_SIDES } from '../../rails';

const MODE: Record<string, CollisionMode> = {
  triangle_mesh: 'mesh', convex_parts: 'convex', hull: 'hull', none: 'none', water: 'water',
};

/** Finds map.json among zip/folder entries; returns the folder prefix it sits in. */
export function findHandshake(files: Record<string, Uint8Array>): string | null {
  const hits = Object.keys(files).filter(p => /(^|\/)map\.json$/i.test(p)).sort((a, b) => a.length - b.length);
  return hits.length ? hits[0].slice(0, -'map.json'.length) : null;
}

export function rowsToMat4(r: number[]): Mat4 {
  return [r[0], r[1], r[2], 0, r[3], r[4], r[5], 0, r[6], r[7], r[8], 0, r[9], r[10], r[11], 1];
}

export function readReskateHandshake(files: Record<string, Uint8Array>, name?: string): MapIR {
  const prefix = findHandshake(files);
  if (prefix === null) throw new Error('no map.json found');
  const doc = JSON.parse(new TextDecoder().decode(files[prefix + 'map.json']));
  if (doc.format !== 1) throw new Error(`map.json format ${doc.format} is not supported`);
  if (doc.up !== 'y') throw new Error('map.json must use Y-up coordinates');
  const folderName = prefix.replace(/\/$/, '').split('/').pop();
  const map = emptyMap(name ?? (folderName || 'ReSkate map'), 'reskate handshake');
  map.extra = { reskate: { mapJson: doc } };

  const file = (rel: string) => files[prefix + rel] ?? files[rel];
  const textureIndex = new Map<string, number>();
  const loadTexture = (rel: string | undefined, srgb = true): number | undefined => {
    if (!rel) return undefined;
    if (textureIndex.has(rel)) return textureIndex.get(rel);
    const bytes = file(rel);
    if (!bytes) { map.warnings.push(`missing texture ${rel}`); return undefined; }
    const info = imageInfo(bytes);
    const tex: Texture = {
      name: rel.split('/').pop()!, width: info?.width ?? 0, height: info?.height ?? 0,
      encoded: { mime: info?.mime ?? 'image/png', bytes }, srgb,
    };
    map.textures.push(tex);
    textureIndex.set(rel, map.textures.length - 1);
    return map.textures.length - 1;
  };

  const materialIndex = new Map<string, number>();
  const material = (key: string | undefined, glbMat?: GlbRead['materials'][number]): number => {
    const k = key ?? 'default';
    if (materialIndex.has(k)) return materialIndex.get(k)!;
    const entry = doc.materials?.[k] ?? {};
    const m: Material = defaultMaterial(k);
    if (glbMat) { m.color = glbMat.color; m.roughness = glbMat.roughness; m.metallic = glbMat.metallic; }
    if (typeof entry.roughness === 'number') m.roughness = entry.roughness;
    if (typeof entry.metallic === 'number') m.metallic = entry.metallic;
    m.alphaMode = entry.alpha === 'mask' || entry.alpha === 'blend' ? entry.alpha : glbMat?.alphaMode === 'MASK' ? 'mask' : glbMat?.alphaMode === 'BLEND' ? 'blend' : 'opaque';
    if (typeof entry.alpha_cutoff === 'number') m.alphaCutoff = entry.alpha_cutoff;
    m.doubleSided = !!(entry.double_sided ?? glbMat?.doubleSided);
    m.textures.albedo = loadTexture(entry.texture);
    m.textures.normal = loadTexture(entry.normal_texture, false);
    map.materials.push(m);
    materialIndex.set(k, map.materials.length - 1);
    return map.materials.length - 1;
  };

  const glbCache = new Map<string, GlbRead>();
  const glb = (rel: string): GlbRead | null => {
    if (!glbCache.has(rel)) {
      const bytes = file(rel);
      if (!bytes) { map.warnings.push(`missing mesh ${rel}`); return null; }
      glbCache.set(rel, readGlb(bytes));
    }
    return glbCache.get(rel)!;
  };

  for (const rec of doc.objects ?? []) {
    if (rec.placement_mode === 'retail_blueprint') {
      map.warnings.push(`${rec.name}: retail blueprint instance (${rec.retail_blueprint}) has no geometry outside skate.; skipped`);
      continue;
    }
    if (rec.grind_curve) {
      const g = glb(rec.collision_mesh ?? rec.mesh);
      const prim = g?.meshes[0]?.primitives[0];
      if (!prim) continue;
      // Each prism ring's first corner lies on the curve (see rails.ts).
      const points: Vec3[] = [];
      for (let i = 0; i + RAIL_SIDES <= prim.positions.length / 3; i += RAIL_SIDES)
        points.push([prim.positions[i * 3], prim.positions[i * 3 + 1], prim.positions[i * 3 + 2]]);
      map.rails.push({ name: String(rec.name).replace(/ \(grind curve\)$/, ''), points, closed: false });
      continue;
    }
    const rel = rec.mesh ?? rec.collision_mesh;
    const g = rel && glb(rel);
    if (!g) continue;
    const gm = g.meshes[0];
    const prim = gm?.primitives[rec.primitive ?? 0];
    if (!prim) { map.warnings.push(`${rec.name}: primitive ${rec.primitive} missing in ${rel}`); continue; }
    const glbMat = prim.material !== undefined ? g.materials[prim.material] : undefined;
    const mi = material(rec.material, glbMat);
    if (glbMat?.texture !== undefined && map.materials[mi].textures.albedo === undefined) {
      const img = g.images[g.textureImage[glbMat.texture]];
      if (img) {
        const info = imageInfo(img.bytes);
        map.textures.push({ name: img.name, width: info?.width ?? 0, height: info?.height ?? 0, encoded: { mime: img.mime, bytes: img.bytes }, srgb: true });
        map.materials[mi].textures.albedo = map.textures.length - 1;
      }
    }
    const mesh: Mesh = {
      positions: prim.positions, normals: prim.normals, uvs: prim.uvs, indices: prim.indices,
      groups: [{ start: 0, count: prim.indices.length, material: mi }],
    };
    map.objects.push({
      name: rec.name,
      mesh,
      transform: rowsToMat4(rec.transform),
      render: rec.render !== false,
      collision: {
        mode: MODE[rec.collision_mode] ?? 'mesh',
        surface: typeof rec.collision_material_packed === 'number' ? surfaceFromReskatePacked(rec.collision_material_packed) : undefined,
      },
      extra: { reskate: rec },
    });
  }

  if (doc.spawn?.position) map.spawns.push({ name: doc.spawn.name ?? 'spawn', position: doc.spawn.position, yaw: doc.spawn.yaw ?? 0 });
  for (const t of doc.travel_points ?? [])
    if (t.position) map.spawns.push({ name: t.stop_name ?? t.name ?? 'travel point', position: t.position, yaw: t.yaw ?? 0 });
  for (const l of doc.lights ?? []) {
    map.lights.push({
      name: l.name, kind: l.type === 'sun' ? 'sun' : l.type === 'spot' ? 'spot' : 'point',
      position: l.position, direction: l.direction, color: l.color_linear ?? [1, 1, 1],
      intensity: l.energy ?? 1, range: l.cutoff_distance,
    });
  }
  return map;
}
