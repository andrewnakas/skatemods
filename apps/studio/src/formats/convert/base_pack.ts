// The CC0 base-asset pack (skate-base-cc0): base-game props a map places become the pack's original stand-ins.
// Keys are blake2b-64 of the EBX partition guid, which is all a mod knows about a base asset.
import { unzlibSync } from 'fflate';
import { blake2b } from '../skate3/blake2b.ts';

export interface PackPrim { positions: Float32Array; indices: Uint32Array; uv0: Float32Array | null; texture: string | null }
export interface PackAsset { visual: PackPrim[]; collision: PackPrim[]; collisionSurfaces: string[]; grind: number[][][] }
/** The web index is slim (class + file); name, bbox and grind then come from the GLB itself. */
export interface PackEntry { class: string; file?: string; alias?: string; name?: string; skateable?: boolean; bbox?: number[][]; grind?: number[][][] }

export interface BasePack {
  assets: Record<string, PackEntry>;
  aliases: Record<string, string>;
  /** texture partition id -> { role: c | normal | mask | opacity, file } */
  textures?: Record<string, { role: string; file: string }>;
  /** a pack file by relative path ('meshes/<id>.glb', 'textures/concrete.png') */
  file(path: string): Promise<Uint8Array>;
}

export function packId(partitionGuidHex: string): string {
  const b = new Uint8Array(16);
  for (let i = 0; i < 16; i++) b[i] = parseInt(partitionGuidHex.slice(2 * i, 2 * i + 2), 16);
  return [...blake2b(b, 8)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function resolveId(pack: BasePack, partitionGuidHex: string): string | null {
  const id = packId(partitionGuidHex);
  if (pack.assets[id]) return id;
  return pack.aliases[id] ?? null;
}

/** Our own GLB layout (gen/glb.py): nodes 'visual' and 'collision', float positions, u32 indices. */
export function readPackGlb(d: Uint8Array): PackAsset {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const jl = dv.getUint32(12, true);
  const gl = JSON.parse(new TextDecoder().decode(d.subarray(20, 20 + jl)));
  const bin = d.subarray(20 + jl + 8);
  const acc = (i: number) => {
    const a = gl.accessors[i], v = gl.bufferViews[a.bufferView];
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type as 'SCALAR' | 'VEC2' | 'VEC3'];
    const w = a.componentType === 5123 ? 2 : 4;
    const bytes = bin.slice(v.byteOffset, v.byteOffset + a.count * n * w);
    if (a.componentType === 5123) return Uint32Array.from(new Uint16Array(bytes.buffer));
    return a.componentType === 5125 ? new Uint32Array(bytes.buffer) : new Float32Array(bytes.buffer);
  };
  // TEXCOORD_0: float32, or int16 scaled back by the material's KHR_texture_transform (1/256 of a tile)
  const uvs = (i: number, mat: number | undefined): Float32Array => {
    const a = gl.accessors[i], v = gl.bufferViews[a.bufferView];
    if (a.componentType === 5126) return acc(i) as Float32Array;
    const sc = gl.materials?.[mat ?? -1]?.pbrMetallicRoughness?.baseColorTexture?.extensions?.KHR_texture_transform?.scale ?? [1, 1];
    const src = new DataView(bin.buffer, bin.byteOffset + v.byteOffset), out = new Float32Array(a.count * 2);
    for (let k = 0; k < a.count * 2; k++) out[k] = src.getInt16(k * 2, true) * sc[k & 1];
    return out;
  };
  // POSITION: float32, or KHR_mesh_quantization int16 (stride 8) under the node's scale/translation (the visual)
  const positions = (i: number, node: any): Float32Array => {
    const a = gl.accessors[i], v = gl.bufferViews[a.bufferView];
    if (a.componentType === 5126) return acc(i) as Float32Array;
    const stride = (v.byteStride ?? 6) / 2, src = new DataView(bin.buffer, bin.byteOffset + v.byteOffset);
    const s = node.scale ?? [1, 1, 1], t = node.translation ?? [0, 0, 0], out = new Float32Array(a.count * 3);
    for (let k = 0; k < a.count; k++) for (let c = 0; c < 3; c++) out[3 * k + c] = src.getInt16((k * stride + c) * 2, true) * s[c] + t[c];
    return out;
  };
  const out: PackAsset = { visual: [], collision: [], collisionSurfaces: [], grind: gl.scenes?.[0]?.extras?.grind ?? [] };
  for (const node of gl.nodes) {
    const prims: PackPrim[] = gl.meshes[node.mesh].primitives.map((p: any) => ({
      positions: positions(p.attributes.POSITION, node),
      indices: acc(p.indices) as Uint32Array,
      uv0: p.attributes.TEXCOORD_0 !== undefined ? uvs(p.attributes.TEXCOORD_0, p.material) : null,
      texture: p.material !== undefined ? gl.materials[p.material].name : null,
    }));
    if (node.name === 'visual') out.visual = prims;
    else if (node.name === 'collision') { out.collision = prims; out.collisionSurfaces = node.extras?.surfaces ?? []; }
  }
  return out;
}

/** 8-bit RGB/RGBA non-interlaced PNG (what gen/textures.py writes) -> RGBA. */
export function decodePng(d: Uint8Array): { w: number; h: number; rgba: Uint8Array } {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  let p = 8, w = 0, h = 0, ct = 0; const idat: Uint8Array[] = [];
  while (p < d.length) {
    const len = dv.getUint32(p), type = String.fromCharCode(...d.subarray(p + 4, p + 8));
    const body = d.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = dv.getUint32(p + 8); h = dv.getUint32(p + 12); ct = body[9]; if (body[8] !== 8 || body[12]) throw new Error('png: only 8-bit non-interlaced'); }
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : 0;
  if (!bpp) throw new Error(`png: colour type ${ct} not supported`);
  const z = new Uint8Array(idat.reduce((s, b) => s + b.length, 0)); let o = 0; for (const b of idat) { z.set(b, o); o += b.length; }
  const raw = unzlibSync(z), stride = w * bpp, cur = new Uint8Array(stride), prev = new Uint8Array(stride);
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0, q = 0; y < h; y++) {
    const f = raw[q++];
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0, v = raw[q++];
      let r = v;
      if (f === 1) r = v + a; else if (f === 2) r = v + b; else if (f === 3) r = v + ((a + b) >> 1);
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      cur[x] = r & 255;
    }
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, g = bpp === 1;
      rgba[i] = cur[x * bpp]; rgba[i + 1] = cur[x * bpp + (g ? 0 : 1)]; rgba[i + 2] = cur[x * bpp + (g ? 0 : 2)]; rgba[i + 3] = bpp === 4 ? cur[x * bpp + 3] : 255;
    }
    prev.set(cur);
  }
  return { w, h, rgba };
}

/** The pack served over HTTP(S) (the web layout: slim index.json + meshes/ + textures/); files fetched on demand. */
export async function urlPack(base: string, fetchFn: typeof fetch = fetch): Promise<BasePack> {
  const root = base.endsWith('/') ? base : base + '/';
  const r = await fetchFn(root + 'index.json');
  if (!r.ok) throw new Error(`base pack index: HTTP ${r.status}`);
  const ix = await r.json();
  return {
    assets: ix.assets, aliases: ix.aliases ?? {}, textures: ix.textures ?? {},
    async file(p) {
      const f = await fetchFn(root + p);
      if (!f.ok) throw new Error(`base pack ${p}: HTTP ${f.status}`);
      return new Uint8Array(await f.arrayBuffer());
    },
  };
}
