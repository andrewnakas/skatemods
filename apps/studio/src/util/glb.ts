// Minimal glTF 2.0 binary writer and reader for static triangle meshes.
// Enough for ReSkate handshake meshes and Skate 3 builder input; no skins, morphs or Draco.
import type { Material, Mesh, Rail, Spawn, Texture } from '../ir';
import { concat, encodePng, imageInfo } from './png';

const ARRAY_BUFFER = 34962, ELEMENT_ARRAY_BUFFER = 34963;
const FLOAT = 5126, UNSIGNED_BYTE = 5121, UNSIGNED_SHORT = 5123, UNSIGNED_INT = 5125;

export interface GlbPrimitiveInput { mesh: Mesh; groupMaterials: number[] }

class BinBuilder {
  parts: Uint8Array[] = [];
  length = 0;
  views: Record<string, unknown>[] = [];
  accessors: Record<string, unknown>[] = [];

  view(bytes: Uint8Array, target?: number): number {
    const pad = (4 - (this.length % 4)) % 4;
    if (pad) { this.parts.push(new Uint8Array(pad)); this.length += pad; }
    const view: Record<string, unknown> = { buffer: 0, byteOffset: this.length, byteLength: bytes.length };
    if (target) view.target = target;
    this.parts.push(bytes);
    this.length += bytes.length;
    this.views.push(view);
    return this.views.length - 1;
  }

  accessor(data: Float32Array | Uint32Array, type: 'SCALAR' | 'VEC2' | 'VEC3', target: number, minmax = false): number {
    const comps = type === 'SCALAR' ? 1 : type === 'VEC2' ? 2 : 3;
    const bufferView = this.view(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), target);
    const acc: Record<string, unknown> = {
      bufferView, componentType: data instanceof Float32Array ? FLOAT : UNSIGNED_INT,
      count: data.length / comps, type,
    };
    if (minmax) {
      const min = Array(comps).fill(Infinity), max = Array(comps).fill(-Infinity);
      for (let i = 0; i < data.length; i++) {
        const c = i % comps;
        if (data[i] < min[c]) min[c] = data[i];
        if (data[i] > max[c]) max[c] = data[i];
      }
      if (data.length) { acc.min = min; acc.max = max; }
    }
    this.accessors.push(acc);
    return this.accessors.length - 1;
  }
}

/**
 * Writes one node with one mesh. Each MeshGroup becomes a primitive (in group order),
 * so primitive i uses materials[groupMaterials[i]]. Textures are embedded as PNG/JPEG.
 */
export interface GlbMarkers { spawns?: Spawn[]; rails?: Rail[] }

export function writeGlb(name: string, mesh: Mesh, materials: Material[], textures: Texture[], markers: GlbMarkers = {}): Uint8Array {
  const bin = new BinBuilder();
  const gltfMaterials: Record<string, unknown>[] = [];
  const images: Record<string, unknown>[] = [];
  const gltfTextures: Record<string, unknown>[] = [];
  const matIndex = new Map<number, number>();
  const texIndex = new Map<number, number>();

  const textureRef = (t: number | undefined): number | undefined => {
    // A texture needs TEXCOORD_0; collision-only meshes often have none.
    if (t === undefined || !textures[t] || !mesh.uvs) return undefined;
    if (!texIndex.has(t)) {
      const tex = textures[t];
      const encoded = textureBytes(tex);
      if (!encoded) return undefined;
      images.push({ bufferView: bin.view(encoded.bytes), mimeType: encoded.mime, name: tex.name });
      gltfTextures.push({ source: images.length - 1 });
      texIndex.set(t, gltfTextures.length - 1);
    }
    return texIndex.get(t);
  };

  const materialRef = (m: number): number => {
    if (!matIndex.has(m)) {
      const mat = materials[m];
      const pbr: Record<string, unknown> = {
        baseColorFactor: mat.color, metallicFactor: mat.metallic, roughnessFactor: mat.roughness,
      };
      const albedo = textureRef(mat.textures.albedo);
      if (albedo !== undefined) pbr.baseColorTexture = { index: albedo };
      const out: Record<string, unknown> = { name: mat.name, pbrMetallicRoughness: pbr };
      const normal = textureRef(mat.textures.normal);
      if (normal !== undefined) out.normalTexture = { index: normal };
      if (mat.alphaMode === 'mask') { out.alphaMode = 'MASK'; out.alphaCutoff = mat.alphaCutoff; }
      if (mat.alphaMode === 'blend') out.alphaMode = 'BLEND';
      if (mat.doubleSided) out.doubleSided = true;
      if (mat.emissive > 0) out.emissiveFactor = [mat.emissive, mat.emissive, mat.emissive];
      gltfMaterials.push(out);
      matIndex.set(m, gltfMaterials.length - 1);
    }
    return matIndex.get(m)!;
  };

  // Each primitive gets only the vertices it uses (as Blender's glTF exporter does). Sharing one
  // vertex buffer across hundreds of primitives makes importers copy it once per primitive.
  const normalsOk = !!mesh.normals && validNormals(mesh.normals);
  const shared = mesh.groups.length <= 1;
  const sharedAttributes = shared ? attributesFor(bin, mesh, null, normalsOk) : null;
  const primitives = mesh.groups.filter(g => g.count > 0).map(g => {
    const slice = mesh.indices.subarray(g.start, g.start + g.count);
    let attributes = sharedAttributes, indices: Uint32Array = slice;
    if (!attributes) {
      const remap = new Map<number, number>();
      const used: number[] = [];
      indices = new Uint32Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        let v = remap.get(slice[i]);
        if (v === undefined) { v = used.length; used.push(slice[i]); remap.set(slice[i], v); }
        indices[i] = v;
      }
      attributes = attributesFor(bin, mesh, used, normalsOk);
    } else indices = slice.slice();
    return {
      attributes,
      indices: bin.accessor(indices, 'SCALAR', ELEMENT_ARRAY_BUFFER),
      material: materials[g.material] ? materialRef(g.material) : undefined,
      mode: 4,
    };
  });

  // Spawns as empty nodes facing local -Z (how Blender's glTF export writes empties), and rails
  // as LINE_STRIP meshes named rail_*, so a GLB round trip through the studio keeps both.
  const nodes: Record<string, unknown>[] = [{ name, mesh: 0 }];
  const meshes: Record<string, unknown>[] = [{ name, primitives }];
  for (const s of markers.spawns ?? []) {
    const half = ((s.yaw + 180) * Math.PI) / 360;
    nodes.push({ name: s.name.toLowerCase().startsWith('spawn') ? s.name : `spawn_${s.name}`, translation: s.position, rotation: [0, Math.sin(half), 0, Math.cos(half)] });
  }
  for (const r of markers.rails ?? []) {
    if (r.points.length < 2) continue;
    const pts = new Float32Array((r.closed ? [...r.points, r.points[0]] : r.points).flat());
    meshes.push({ name: r.name, primitives: [{ attributes: { POSITION: bin.accessor(pts, 'VEC3', ARRAY_BUFFER, true) }, mode: 3 }] });
    nodes.push({ name: `rail_${r.name}`, mesh: meshes.length - 1 });
  }

  const json: Record<string, unknown> = {
    asset: { version: '2.0', generator: 'skatemods map studio' },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    accessors: bin.accessors,
    bufferViews: bin.views,
    buffers: [{ byteLength: 0 }],
  };
  if (gltfMaterials.length) json.materials = gltfMaterials;
  if (images.length) { json.images = images; json.textures = gltfTextures; json.samplers = [{}]; }
  for (const t of gltfTextures) (t as Record<string, unknown>).sampler = 0;

  const binBytes = concat(bin.parts);
  const binPadded = concat([binBytes, new Uint8Array((4 - (binBytes.length % 4)) % 4)]);
  (json.buffers as { byteLength: number }[])[0].byteLength = binPadded.length;
  let jsonBytes: Uint8Array = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  if (jsonPad) jsonBytes = concat([jsonBytes, new TextEncoder().encode(' '.repeat(jsonPad))]);

  const total = 12 + 8 + jsonBytes.length + 8 + binPadded.length;
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x46546c67, true); v.setUint32(4, 2, true); v.setUint32(8, total, true);
  v.setUint32(12, jsonBytes.length, true); v.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  const b = 20 + jsonBytes.length;
  v.setUint32(b, binPadded.length, true); v.setUint32(b + 4, 0x004e4942, true);
  out.set(binPadded, b + 8);
  return out;
}

function attributesFor(bin: BinBuilder, mesh: Mesh, used: number[] | null, normalsOk: boolean): Record<string, number> {
  const pick = (src: Float32Array, n: number) => {
    if (!used) return src;
    const out = new Float32Array(used.length * n);
    for (let i = 0; i < used.length; i++) for (let k = 0; k < n; k++) out[i * n + k] = src[used[i] * n + k];
    return out;
  };
  const a: Record<string, number> = { POSITION: bin.accessor(pick(mesh.positions, 3), 'VEC3', ARRAY_BUFFER, true) };
  if (mesh.normals && normalsOk) a.NORMAL = bin.accessor(pick(mesh.normals, 3), 'VEC3', ARRAY_BUFFER);
  if (mesh.uvs) a.TEXCOORD_0 = bin.accessor(pick(mesh.uvs, 2), 'VEC2', ARRAY_BUFFER);
  if (mesh.uv2) a.TEXCOORD_1 = bin.accessor(pick(mesh.uv2, 2), 'VEC2', ARRAY_BUFFER);
  return a;
}

/** glTF requires unit-length normals; one bad vertex fails strict readers (SharpGLTF). */
function validNormals(n: Float32Array): boolean {
  for (let i = 0; i < n.length; i += 3) {
    const l = n[i] * n[i] + n[i + 1] * n[i + 1] + n[i + 2] * n[i + 2];
    if (!(Math.abs(l - 1) < 0.01)) return false;
  }
  return true;
}

/** PNG/JPEG bytes for a texture: passes through encoded PNG/JPEG, otherwise encodes rgba. */
export function textureBytes(tex: Texture): { mime: string; bytes: Uint8Array; ext: string } | null {
  if (tex.encoded && (tex.encoded.mime === 'image/png' || tex.encoded.mime === 'image/jpeg'))
    return { ...tex.encoded, ext: tex.encoded.mime === 'image/png' ? 'png' : 'jpg' };
  if (tex.rgba) return { mime: 'image/png', bytes: encodePng(tex.width, tex.height, tex.rgba), ext: 'png' };
  return null;
}

export interface GlbMeshRead {
  name: string;
  /** Node world matrix (column-major) applied to this mesh, identity when absent. */
  matrix: number[];
  primitives: { positions: Float32Array; normals?: Float32Array; uvs?: Float32Array; indices: Uint32Array; material?: number }[];
}

export interface GlbRead {
  json: any;
  meshes: GlbMeshRead[];
  materials: { name: string; color: [number, number, number, number]; roughness: number; metallic: number; texture?: number; alphaMode?: string; alphaCutoff?: number; doubleSided?: boolean }[];
  images: { name: string; mime: string; bytes: Uint8Array }[];
  /** glTF texture index -> image index. */
  textureImage: number[];
}

/** Reads a GLB with plain (non-sparse, non-compressed) accessors. */
export function readGlb(bytes: Uint8Array): GlbRead {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (v.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB file');
  let pos = 12, json: any = null, bin: Uint8Array | null = null;
  while (pos < bytes.length) {
    const len = v.getUint32(pos, true), type = v.getUint32(pos + 4, true);
    const data = bytes.subarray(pos + 8, pos + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(data));
    else if (type === 0x004e4942) bin = data;
    pos += 8 + len;
  }
  if (!json) throw new Error('GLB has no JSON chunk');
  const viewBytes = (i: number): Uint8Array => {
    const bv = json.bufferViews[i];
    if (!bin) throw new Error('GLB has no BIN chunk');
    return bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
  };
  const read = (i: number): Float32Array | Uint32Array => {
    const acc = json.accessors[i];
    const comps = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[acc.type];
    const n = acc.count * comps;
    const bv = json.bufferViews[acc.bufferView];
    const raw = viewBytes(acc.bufferView);
    const dv = new DataView(raw.buffer, raw.byteOffset + (acc.byteOffset ?? 0));
    const size = acc.componentType === FLOAT || acc.componentType === UNSIGNED_INT ? 4 : acc.componentType === UNSIGNED_SHORT ? 2 : 1;
    const stride = bv.byteStride ?? comps * size;
    const out = acc.componentType === FLOAT ? new Float32Array(n) : new Uint32Array(n);
    for (let e = 0; e < acc.count; e++) for (let c = 0; c < comps; c++) {
      const o = e * stride + c * size;
      out[e * comps + c] =
        acc.componentType === FLOAT ? dv.getFloat32(o, true)
        : acc.componentType === UNSIGNED_INT ? dv.getUint32(o, true)
        : acc.componentType === UNSIGNED_SHORT ? dv.getUint16(o, true)
        : acc.componentType === UNSIGNED_BYTE ? dv.getUint8(o) : 0;
    }
    return out;
  };

  const meshes: GlbMeshRead[] = [];
  const visit = (nodeIndex: number, parent: number[]) => {
    const node = json.nodes[nodeIndex];
    const local = node.matrix ?? compose(node.translation, node.rotation, node.scale);
    const world = multiply(parent, local);
    if (node.mesh !== undefined) {
      const m = json.meshes[node.mesh];
      meshes.push({
        name: node.name ?? m.name ?? `mesh${node.mesh}`,
        matrix: world,
        primitives: m.primitives.filter((p: any) => (p.mode ?? 4) === 4).map((p: any) => {
          const positions = read(p.attributes.POSITION) as Float32Array;
          const indices = p.indices !== undefined
            ? Uint32Array.from(read(p.indices))
            : Uint32Array.from({ length: positions.length / 3 }, (_, i) => i);
          return {
            positions, indices, material: p.material,
            normals: p.attributes.NORMAL !== undefined ? read(p.attributes.NORMAL) as Float32Array : undefined,
            uvs: p.attributes.TEXCOORD_0 !== undefined ? toFloatUv(read(p.attributes.TEXCOORD_0), json.accessors[p.attributes.TEXCOORD_0]) : undefined,
          };
        }),
      });
    }
    for (const c of node.children ?? []) visit(c, world);
  };
  const scene = json.scenes?.[json.scene ?? 0];
  const roots: number[] = scene?.nodes ?? json.nodes?.map((_: unknown, i: number) => i) ?? [];
  for (const r of roots) visit(r, IDENTITY16);

  const images = (json.images ?? []).map((img: any, i: number) => {
    const bytes = img.bufferView !== undefined ? viewBytes(img.bufferView).slice() : new Uint8Array();
    return { name: img.name ?? `image${i}`, mime: img.mimeType ?? imageInfo(bytes)?.mime ?? 'image/png', bytes };
  });
  const materials = (json.materials ?? []).map((m: any, i: number) => ({
    name: m.name ?? `material${i}`,
    color: (m.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1]) as [number, number, number, number],
    roughness: m.pbrMetallicRoughness?.roughnessFactor ?? 1,
    metallic: m.pbrMetallicRoughness?.metallicFactor ?? 1,
    texture: m.pbrMetallicRoughness?.baseColorTexture?.index,
    alphaMode: m.alphaMode, alphaCutoff: m.alphaCutoff, doubleSided: m.doubleSided,
  }));
  const textureImage = (json.textures ?? []).map((t: any) => t.source);
  return { json, meshes, materials, images, textureImage };
}

function toFloatUv(data: Float32Array | Uint32Array, acc: any): Float32Array {
  if (data instanceof Float32Array) return data;
  const scale = acc.componentType === UNSIGNED_SHORT ? 65535 : 255;
  return Float32Array.from(data, x => (acc.normalized ? x / scale : x));
}

const IDENTITY16 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function multiply(a: number[], b: number[]): number[] {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}

export function compose(t: number[] = [0, 0, 0], q: number[] = [0, 0, 0, 1], s: number[] = [1, 1, 1]): number[] {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}
