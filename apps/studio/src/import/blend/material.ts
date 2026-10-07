// Material + Image datablocks -> IR materials and textures.

import { defaultMaterial, type MapIR, type Material, type Texture } from '../../ir';
import type { BlendFile, StructView } from './file';
import { idName, idProperties, type IDValue } from './idprop';

const IMA_SRC_GENERATED = 4;
const MA_BL_CULL_BACKFACE = 1 << 2;
const MA_BM_CLIP = 3, MA_BM_BLEND = 5;

export function sniffImage(bytes: Uint8Array): { mime: string; width: number; height: number } {
  const b = bytes;
  const be32 = (o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { mime: 'image/png', width: be32(16), height: be32(20) };
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let o = 2;
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) { o++; continue; }
      const m = b[o + 1];
      if (m === 0xff) { o++; continue; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { o += 2; continue; }
      const len = (b[o + 2] << 8) | b[o + 3];
      // SOF0..SOF15 except DHT (C4), JPG (C8), DAC (CC).
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { mime: 'image/jpeg', height: (b[o + 5] << 8) | b[o + 6], width: (b[o + 7] << 8) | b[o + 8] };
      }
      o += 2 + len;
    }
    return { mime: 'image/jpeg', width: 0, height: 0 };
  }
  if (b.length >= 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    return { mime: 'image/gif', width: b[6] | (b[7] << 8), height: b[8] | (b[9] << 8) };
  }
  if (b.length >= 26 && b[0] === 0x42 && b[1] === 0x4d) {
    const le32 = (o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24);
    return { mime: 'image/bmp', width: le32(18), height: Math.abs(le32(22)) };
  }
  if (b.length >= 30 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) {
    const tag = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (tag === 'VP8X') return { mime: 'image/webp', width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    if (tag === 'VP8 ') return { mime: 'image/webp', width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
    if (tag === 'VP8L') {
      const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { mime: 'image/webp', width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 };
    }
    return { mime: 'image/webp', width: 0, height: 0 };
  }
  if (b.length >= 4 && b[0] === 0x76 && b[1] === 0x2f && b[2] === 0x31 && b[3] === 0x01) return { mime: 'image/x-exr', width: 0, height: 0 };
  if (b.length >= 2 && b[0] === 0x23 && b[1] === 0x3f) return { mime: 'image/vnd.radiance', width: 0, height: 0 };
  return { mime: 'application/octet-stream', width: 0, height: 0 };
}

function basename(p: string): string {
  const s = p.replace(/\\/g, '/').replace(/^\/\//, '');
  return s.slice(s.lastIndexOf('/') + 1);
}

/** Texture name used for an image whose file is not in the .blend (the file's basename). */
export function missingTextureName(filepath: string): string { return basename(filepath); }

export class MaterialReader {
  readonly missing: string[] = [];
  /** ReSkate Studio `sk8_material` PropertyGroups by material name (raw IDProperty values). */
  readonly sk8Materials: Record<string, IDValue> = {};
  private readonly matByBlock = new Map<number, number>();
  private readonly texByBlock = new Map<number, number>();
  private defaultIdx = -1;

  constructor(private readonly F: BlendFile, private readonly map: MapIR, private readonly warn: (s: string) => void) {}

  defaultMaterial(): number {
    if (this.defaultIdx < 0) {
      this.defaultIdx = this.map.materials.length;
      this.map.materials.push(defaultMaterial('default'));
    }
    return this.defaultIdx;
  }

  /** IR material index for a Material pointer (deduplicated); default material for null. */
  material(ptr: number): number {
    if (!ptr) return this.defaultMaterial();
    const block = this.F.block(ptr);
    if (!block) return this.defaultMaterial();
    const known = this.matByBlock.get(block.index);
    if (known !== undefined) return known;
    let idx: number;
    if (block.code !== 'MA') {
      idx = this.defaultMaterial();
      if (block.code === 'ID') this.warn(`Material ${this.F.cstr(block.offset + (this.F.struct('ID')?.byName.get('name')?.offset ?? 0), 66).slice(2)} is linked from a library; default material used`);
    } else {
      const v = this.F.viewBlock(block)!;
      idx = this.map.materials.length;
      this.map.materials.push(this.readMaterial(v));
    }
    this.matByBlock.set(block.index, idx);
    return idx;
  }

  private readMaterial(ma: StructView): Material {
    const name = idName(ma);
    const m = defaultMaterial(name);
    m.surface = 'default';
    // Viewport / legacy values first.
    m.color = [ma.num('r', 0.8), ma.num('g', 0.8), ma.num('b', 0.8), ma.num('a', 1)];
    m.roughness = ma.num('roughness', 0.4);
    m.metallic = ma.num('metallic', 0);
    const blendFlag = ma.num('blend_flag');
    m.doubleSided = !(blendFlag & MA_BL_CULL_BACKFACE);
    const blendMethod = ma.num('blend_method');
    m.alphaCutoff = ma.num('alpha_threshold', 0.5);
    if (ma.has('id') && ma.sub('id')?.ptr('lib')) this.warn(`Material ${name} is linked from a library`);

    const useNodes = !ma.has('use_nodes') || ma.num('use_nodes') !== 0 || this.F.fileVersion >= 500;
    const nt = useNodes ? ma.deref('nodetree', 'bNodeTree') : null;
    if (nt) this.applyNodes(nt, m);

    if (blendMethod === MA_BM_CLIP) m.alphaMode = 'mask';
    else if (m.color[3] < 0.999 || blendMethod === MA_BM_BLEND) m.alphaMode = 'blend';

    const props = idProperties(ma);
    if (props.sk8_material && typeof props.sk8_material === 'object') this.sk8Materials[name] = props.sk8_material;
    return m;
  }

  private applyNodes(nt: StructView, m: Material): void {
    const nodes = nt.list('nodes', 'bNode');
    const links = nt.list('links', 'bNodeLink');
    const linkTo = new Map<number, StructView>();
    for (const l of links) {
      if (l.num('flag') & (1 << 4)) continue; // NODE_LINK_MUTED
      linkTo.set(l.ptr('tosock'), l);
    }
    const nodeByAddr = new Map<number, StructView>();
    for (const n of nodes) nodeByAddr.set(n.addr, n);
    const idname = (n: StructView) => n.str('idname');
    const inputs = (n: StructView) => n.list('inputs', 'bNodeSocket');
    const input = (n: StructView, ...names: string[]) =>
      inputs(n).find((s) => names.includes(s.str('identifier'))) ?? inputs(n).find((s) => names.includes(s.str('name')));
    const value = (s: StructView | undefined): number[] | null => {
      if (!s) return null;
      const dv = this.F.view(s.ptr('default_value'), s.scope);
      if (!dv || !dv.has('value')) return null;
      return dv.nums('value');
    };

    // The Principled BSDF feeding the active material output, else the first one.
    let bsdf: StructView | undefined;
    const outputs = nodes.filter((n) => idname(n) === 'ShaderNodeOutputMaterial');
    const active = outputs.find((n) => n.num('flag') & (1 << 6)) ?? outputs[0]; // NODE_DO_OUTPUT
    if (active) {
      const surf = input(active, 'Surface');
      const l = surf && linkTo.get(surf.addr);
      const from = l && nodeByAddr.get(l.ptr('fromnode'));
      if (from && idname(from) === 'ShaderNodeBsdfPrincipled') bsdf = from;
    }
    bsdf ??= nodes.find((n) => idname(n) === 'ShaderNodeBsdfPrincipled');
    if (!bsdf) {
      // Diffuse / emission-only materials: take their colour.
      const other = nodes.find((n) => /^ShaderNodeBsdf|^ShaderNodeEmission$/.test(idname(n)));
      const c = other && value(input(other, 'Color'));
      if (c && c.length >= 3) m.color = [c[0], c[1], c[2], c[3] ?? 1];
      const img = other && this.upstreamImage(input(other, 'Color'), linkTo, nodeByAddr);
      if (img !== undefined) m.textures.albedo = img;
      return;
    }

    const base = input(bsdf, 'Base Color');
    const c = value(base);
    if (c && c.length >= 3) m.color = [c[0], c[1], c[2], m.color[3]];
    const rough = value(input(bsdf, 'Roughness'));
    if (rough) m.roughness = rough[0];
    const metal = value(input(bsdf, 'Metallic'));
    if (metal) m.metallic = metal[0];
    const alpha = value(input(bsdf, 'Alpha'));
    m.color[3] = alpha ? alpha[0] : 1;
    const emColor = value(input(bsdf, 'Emission Color', 'Emission'));
    const emStrength = value(input(bsdf, 'Emission Strength'));
    if (emColor) {
      const peak = Math.max(emColor[0], emColor[1], emColor[2]);
      m.emissive = peak > 0 ? peak * (emStrength ? emStrength[0] : 1) : 0;
    }
    const albedo = this.upstreamImage(base, linkTo, nodeByAddr);
    if (albedo !== undefined) {
      m.textures.albedo = albedo;
      m.color = [1, 1, 1, m.color[3]];
    }
    const normalIn = input(bsdf, 'Normal');
    const normalLink = normalIn && linkTo.get(normalIn.addr);
    const normalNode = normalLink && nodeByAddr.get(normalLink.ptr('fromnode'));
    if (normalNode && idname(normalNode) === 'ShaderNodeNormalMap') {
      const tex = this.upstreamImage(input(normalNode, 'Color'), linkTo, nodeByAddr);
      if (tex !== undefined) { m.textures.normal = tex; this.map.textures[tex].srgb = false; }
    }
  }

  /** First Image Texture node found upstream of a socket (a few hops, e.g. through a Mix node). */
  private upstreamImage(sock: StructView | undefined, linkTo: Map<number, StructView>, nodeByAddr: Map<number, StructView>): number | undefined {
    if (!sock) return undefined;
    const queue: Array<[StructView, number]> = [[sock, 0]];
    const seen = new Set<number>();
    while (queue.length) {
      const [s, depth] = queue.shift()!;
      const l = linkTo.get(s.addr);
      const n = l && nodeByAddr.get(l.ptr('fromnode'));
      if (!n || seen.has(n.addr)) continue;
      seen.add(n.addr);
      if (n.str('idname') === 'ShaderNodeTexImage') {
        const imgPtr = n.ptr('id');
        if (imgPtr) return this.texture(imgPtr);
        continue;
      }
      if (depth < 4) for (const i of n.list('inputs', 'bNodeSocket')) queue.push([i, depth + 1]);
    }
    return undefined;
  }

  /** IR texture index for an Image pointer. */
  texture(ptr: number): number | undefined {
    const block = this.F.block(ptr);
    if (!block) return undefined;
    const known = this.texByBlock.get(block.index);
    if (known !== undefined) return known;
    if (block.code !== 'IM') { this.warn('An image is linked from a library and was skipped'); return undefined; }
    const im = this.F.viewBlock(block)!;
    const name = idName(im);
    const filepath = im.str(['filepath', 'name']);
    const cs = im.sub('colorspace_settings')?.str('name') ?? '';
    const srgb = !/non-color|raw|linear|xyz|data|utility/i.test(cs);

    let packed: Uint8Array | null = null;
    const pfs = im.list('packedfiles', 'ImagePackedFile');
    const pfPtr = pfs[0]?.ptr('packedfile') || im.ptr('packedfile');
    if (pfPtr) {
      const pf = this.F.view(pfPtr, im.scope, 'PackedFile');
      if (pf) {
        const data = this.F.data(pf.ptr('data'), im.scope);
        const size = pf.num('size');
        if (data) packed = data.subarray(0, size > 0 ? Math.min(size, data.length) : data.length);
      }
    }
    let tex: Texture;
    if (packed) {
      const info = sniffImage(packed);
      tex = { name, width: info.width || im.num('gen_x'), height: info.height || im.num('gen_y'), encoded: { mime: info.mime, bytes: packed.slice() }, srgb };
    } else if (im.num('source') === IMA_SRC_GENERATED) {
      // Unpacked generated image: only its fill colour is known.
      const c = im.nums('gen_color');
      const to8 = (v: number) => Math.round(Math.min(1, Math.max(0, v ?? 1)) * 255);
      tex = { name, width: 1, height: 1, rgba: new Uint8Array([to8(c[0]), to8(c[1]), to8(c[2]), to8(c[3])]), srgb };
      this.warn(`Image ${name} is a generated image that is not packed; its fill colour is used`);
    } else {
      tex = { name: missingTextureName(filepath || name), width: 0, height: 0, srgb };
      const key = filepath || name;
      if (!this.missing.includes(key)) this.missing.push(key);
    }
    const idx = this.map.textures.length;
    this.map.textures.push(tex);
    this.texByBlock.set(block.index, idx);
    return idx;
  }
}

/**
 * Supplies the bytes of an image that was not packed in the .blend (one listed in
 * `missingImages`). Matches by file name, case-insensitively. Returns how many textures
 * were filled.
 */
export function attachImage(map: MapIR, fileName: string, bytes: Uint8Array): number {
  const want = basename(fileName).toLowerCase();
  const info = sniffImage(bytes);
  let n = 0;
  for (const t of map.textures) {
    if (t.encoded || t.rgba) continue;
    if (t.name.toLowerCase() !== want) continue;
    t.encoded = { mime: info.mime, bytes };
    t.width = info.width;
    t.height = info.height;
    n++;
  }
  return n;
}
