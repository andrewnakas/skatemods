// node test/export_glbs.ts <mod folder> <glb dir>: MapExport -> skate4to3 GLB folder (block_*.glb, blenrose_materials.json,
// splines.json, d2s3_spawns.json, d2s3_tiles.json) so the Python assemble/build_pack can be run on the same content (A/B).
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { folderSource } from './node_source.ts';
import { exportMod } from '../src/formats/skate3/export.ts';
const out = process.argv[3]; mkdirSync(out, { recursive: true });
function png(w: number, h: number, rgba: Uint8Array): Buffer {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw, { level: 1 })), chunk('IEND', Buffer.alloc(0))]);
}
const ex = await exportMod(folderSource(process.argv[2]), { log: console.log });
// one GLB per prim keeps it simple
ex.prims.forEach((p, i) => {
  const bins: Buffer[] = []; const views: any[] = []; const acc: any[] = []; let off = 0;
  const add = (b: Buffer) => { const pad = (4 - (b.length % 4)) % 4; views.push({ buffer: 0, byteOffset: off, byteLength: b.length }); bins.push(b, Buffer.alloc(pad)); off += b.length + pad; return views.length - 1; };
  const fa = (a: Float32Array, k: number, type: string) => { acc.push({ bufferView: add(Buffer.from(a.buffer, a.byteOffset, a.byteLength)), componentType: 5126, count: a.length / k, type }); return acc.length - 1; };
  const attrs: any = { POSITION: fa(p.positions, 3, 'VEC3'), NORMAL: fa(p.normals, 3, 'VEC3'), TEXCOORD_0: fa(p.uv0, 2, 'VEC2') };
  if (p.uv1) attrs.TEXCOORD_1 = fa(p.uv1, 2, 'VEC2');
  acc.push({ bufferView: add(Buffer.from(p.indices.buffer, p.indices.byteOffset, p.indices.byteLength)), componentType: 5125, count: p.indices.length, type: 'SCALAR' });
  const ind = acc.length - 1;
  const images: any[] = [], textures: any[] = [];
  const tex = (im: any) => { if (!im) return undefined; images.push({ bufferView: add(png(im.w, im.h, im.rgba)), mimeType: 'image/png' }); textures.push({ source: images.length - 1 }); return { index: textures.length - 1 }; };
  const mat: any = { name: p.material, pbrMetallicRoughness: {} };
  const d = tex(p.images.diffuse); if (d) mat.pbrMetallicRoughness.baseColorTexture = d;
  const n = tex(p.images.normal); if (n) mat.normalTexture = n;
  const l = tex(p.images.lightmap); if (l) mat.emissiveTexture = l;
  const j = { asset: { version: '2.0' }, buffers: [{ byteLength: off }], bufferViews: views, accessors: acc, images, textures, materials: [mat],
    meshes: [{ primitives: [{ attributes: attrs, indices: ind, material: 0 }] }], nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0 };
  let js = Buffer.from(JSON.stringify(j)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
  const bin = Buffer.concat(bins);
  const h = Buffer.alloc(12); h.write('glTF', 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const c = (len: number, t: number) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(t, 4); return b; };
  writeFileSync(`${out}/block_${String(i).padStart(3, '0')}.glb`, Buffer.concat([h, c(js.length, 0x4E4F534A), js, c(bin.length, 0x004E4942), bin]));
});
const mats: any = {};
for (const [k, m] of Object.entries(ex.materials)) mats[k] = { collision: { physics_surface: '0' }, exclude_collision: m.excludeCollision, exclude_pres: m.excludePres, material_name: 'environmentsimple.default' };
writeFileSync(`${out}/blenrose_materials.json`, JSON.stringify(mats));
writeFileSync(`${out}/splines.json`, JSON.stringify({ splines: ex.splines.map((l) => ({ points: l })) }));
writeFileSync(`${out}/d2s3_spawns.json`, JSON.stringify(ex.spawns));
writeFileSync(`${out}/d2s3_tiles.json`, '{}');
console.log('wrote', ex.prims.length, 'glbs to', out);
