import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'fflate';
import { decompress } from 'fzstd';
import { describe, expect, it } from 'vitest';
import { transformPoint, validate, type MapIR, type Vec3 } from '../../src/ir';
import { attachImage, BlendError, BlendFile, readBlend } from '../../src/import/blend';
import { toGameMatrix, triangulatePolygon } from '../../src/import/blend/geometry';

const FIX = join(__dirname, '..', 'fixtures', 'blend');

interface Expected {
  version: string;
  objects: Record<string, {
    vertices: number; triangles: number; area: number; matrix_world: number[];
    bbox_min: Vec3; bbox_max: Vec3; materials: Array<string | null>; modifiers: number;
    hide_render: boolean; collision_mode: string;
  }>;
  rails: Record<string, { knots: Vec3[]; closed: boolean; type: string; resolution: number }>;
  spawns: Array<{ name: string; position: Vec3; yaw: number }>;
  materials: Record<string, { base_color: number[]; roughness: number; metallic: number; alpha: number }>;
  images: Record<string, { width: number; height: number }>;
  missing_images: string[];
}

const FIXTURES = ['scene_45', 'scene_33', 'scene_52'].filter((f) => existsSync(join(FIX, `${f}.blend`)));

function load(name: string) {
  const bytes = new Uint8Array(readFileSync(join(FIX, `${name}.blend`)));
  const expected = JSON.parse(readFileSync(join(FIX, `${name}.json`), 'utf8')) as Expected;
  return { bytes, expected };
}

const close = (a: number, b: number, eps = 1e-4) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
function expectClose(actual: ArrayLike<number>, expected: ArrayLike<number>, eps = 1e-4) {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    if (!close(actual[i], expected[i], eps)) {
      throw new Error(`index ${i}: ${actual[i]} != ${expected[i]}\n actual   ${Array.from(actual).map((v) => v.toFixed(4))}\n expected ${Array.from(expected).map((v) => v.toFixed(4))}`);
    }
  }
}

function worldPoints(map: MapIR, name: string): Vec3[] {
  const o = map.objects.find((x) => x.name === name)!;
  const out: Vec3[] = [];
  for (let i = 0; i < o.mesh.positions.length; i += 3) {
    out.push(transformPoint(o.transform, [o.mesh.positions[i], o.mesh.positions[i + 1], o.mesh.positions[i + 2]]));
  }
  return out;
}

function triArea(map: MapIR, name: string): number {
  const o = map.objects.find((x) => x.name === name)!;
  const p = worldPoints(map, name);
  let a = 0;
  for (let i = 0; i < o.mesh.indices.length; i += 3) {
    const [A, B, C] = [p[o.mesh.indices[i]], p[o.mesh.indices[i + 1]], p[o.mesh.indices[i + 2]]];
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    a += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
  }
  return a;
}

/** Rewrites a 64-bit legacy-header .blend into the Blender 5.x large-header layout. */
function toLargeHeaderFormat(raw: Uint8Array): Uint8Array {
  const src = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const chunks: Uint8Array[] = [new TextEncoder().encode(`BLENDER17-01v0${new TextDecoder().decode(raw.subarray(9, 12))}`)];
  let pos = 12;
  for (;;) {
    const code = raw.subarray(pos, pos + 4);
    const len = src.getInt32(pos + 4, true);
    const head = new Uint8Array(32);
    const dv = new DataView(head.buffer);
    head.set(code, 0);
    dv.setInt32(4, src.getInt32(pos + 16, true), true); // SDNAnr
    head.set(raw.subarray(pos + 8, pos + 16), 8); // old
    dv.setInt32(16, len, true); // len (int64, positive)
    dv.setInt32(24, src.getInt32(pos + 20, true), true); // nr
    chunks.push(head, raw.subarray(pos + 24, pos + 24 + len));
    if (new TextDecoder().decode(code) === 'ENDB') break;
    pos += 24 + len;
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

describe('triangulatePolygon', () => {
  it('ear-clips a concave L shape without leaving the polygon', () => {
    const pts = [0, 0, 0, 2, 0, 0, 2, 1, 0, 1, 1, 0, 1, 2, 0, 0, 2, 0];
    const out: number[] = [];
    triangulatePolygon(pts, 6, out);
    expect(out.length).toBe(12);
    let area = 0;
    for (let i = 0; i < out.length; i += 3) {
      const [a, b, c] = [out[i], out[i + 1], out[i + 2]];
      const cross = (pts[b * 3] - pts[a * 3]) * (pts[c * 3 + 1] - pts[a * 3 + 1]) - (pts[b * 3 + 1] - pts[a * 3 + 1]) * (pts[c * 3] - pts[a * 3]);
      expect(cross).toBeGreaterThan(0); // keeps CCW winding
      area += cross / 2;
    }
    expect(area).toBeCloseTo(3, 6);
  });

  it('handles a clockwise-facing (downward) polygon and collinear points', () => {
    const pts = [0, 0, 0, 0, 1, 0, 0, 2, 0, 2, 2, 0, 2, 0, 0]; // normal -Z, collinear vertex at (0,1)
    const out: number[] = [];
    triangulatePolygon(pts, 5, out);
    let area = 0;
    for (let i = 0; i < out.length; i += 3) {
      const [a, b, c] = [out[i], out[i + 1], out[i + 2]];
      area += -((pts[b * 3] - pts[a * 3]) * (pts[c * 3 + 1] - pts[a * 3 + 1]) - (pts[b * 3 + 1] - pts[a * 3 + 1]) * (pts[c * 3] - pts[a * 3])) / 2;
    }
    expect(area).toBeCloseTo(4, 6);
  });
});

describe('BlendFile header', () => {
  it('rejects non-blend data', () => {
    expect(() => new BlendFile(new TextEncoder().encode('not a blend file at all'))).toThrow(BlendError);
  });
});

describe.each(FIXTURES)('%s', (fixture) => {
  const { bytes, expected } = load(fixture);
  const result = readBlend(bytes, { name: fixture });
  const { map } = result;

  it('reads the header and version', () => {
    expect(result.version).toBe(expected.version);
    expect(map.source).toBe(`blend ${expected.version}`);
    const f = new BlendFile(bytes);
    expect(f.ptrSize).toBe(8);
    expect(f.le).toBe(true);
  });

  it('produces a structurally valid MapIR', () => {
    expect(validate(map)).toEqual([]);
  });

  it('reads the same data from zstd, raw and gzip files', () => {
    const raw = decompress(bytes);
    expect(new TextDecoder().decode(raw.subarray(0, 7))).toBe('BLENDER');
    for (const variant of [raw, gzipSync(raw)]) {
      const other = readBlend(variant).map;
      expect(other.objects.map((o) => [o.name, o.mesh.indices.length])).toEqual(map.objects.map((o) => [o.name, o.mesh.indices.length]));
      expect(other.rails.length).toBe(map.rails.length);
    }
  });

  it('reads the Blender 5.x large block-header layout', () => {
    const raw = decompress(bytes);
    if (raw[7] !== 0x2d) return; // already the 5.x layout
    const large = toLargeHeaderFormat(raw);
    const f = new BlendFile(large);
    expect(f.formatVersion).toBe(1);
    const other = readBlend(large).map;
    expect(other.objects.map((o) => [o.name, o.mesh.indices.length])).toEqual(map.objects.map((o) => [o.name, o.mesh.indices.length]));
    expect(other.textures.map((t) => t.encoded?.bytes.length)).toEqual(map.textures.map((t) => t.encoded?.bytes.length));
  });

  it('extracts every mesh object with the right topology and placement', () => {
    expect(map.objects.map((o) => o.name).sort()).toEqual(Object.keys(expected.objects).sort());
    for (const [name, e] of Object.entries(expected.objects)) {
      const o = map.objects.find((x) => x.name === name)!;
      expect(o.mesh.indices.length / 3, `${name} triangles`).toBe(e.triangles);
      // Welding keeps one output vertex per (vertex, uv, normal); every source vertex appears.
      const unique = new Set(worldPoints(map, name).map((p) => p.map((v) => v.toFixed(4)).join(',')));
      expect(unique.size, `${name} unique positions`).toBe(e.vertices);
      expectClose(o.transform, toGameMatrix(e.matrix_world));
      const pts = worldPoints(map, name);
      const min = [0, 1, 2].map((i) => Math.min(...pts.map((p) => p[i])));
      const max = [0, 1, 2].map((i) => Math.max(...pts.map((p) => p[i])));
      expectClose(min, e.bbox_min);
      expectClose(max, e.bbox_max);
      expect(triArea(map, name)).toBeCloseTo(e.area, 3);
      expect(o.render, `${name} render`).toBe(!e.hide_render);
      const groupMats = o.mesh.groups.map((g) => map.materials[g.material].name).sort();
      expect(groupMats, `${name} materials`).toEqual(e.materials.map((m) => m ?? 'default').sort());
      expect(o.mesh.normals!.length).toBe(o.mesh.positions.length);
    }
  });

  it('rebuilds world matrices from loc/rot/scale + parents', () => {
    const rebuilt = readBlend(bytes, { recomputeMatrices: true }).map;
    for (const [name, e] of Object.entries(expected.objects)) {
      const o = rebuilt.objects.find((x) => x.name === name)!;
      expectClose(o.transform, toGameMatrix(e.matrix_world));
    }
  });

  it('splits vertices on UV seams and flips V', () => {
    const grid = map.objects.find((o) => o.name === 'UVGrid')!;
    expect(grid.mesh.uvs).toBeDefined();
    expect(grid.mesh.positions.length / 3).toBe(16); // 12 verts + 4 duplicated along the seam row
    // UV of each output vertex matches the generator's formula (u = x/3, v = y/2 [+0.25 on top row]).
    const p = grid.mesh.positions, uv = grid.mesh.uvs!;
    for (let i = 0; i < p.length / 3; i++) {
      const x = p[i * 3], y = -p[i * 3 + 2];
      expect(uv[i * 2]).toBeCloseTo(x / 3, 5);
      const v = 1 - uv[i * 2 + 1];
      const ok = close(v, y / 2) || close(v, y / 2 + 0.25);
      expect(ok).toBe(true);
    }
  });

  it('reads Principled BSDF materials and textures', () => {
    for (const [name, e] of Object.entries(expected.materials)) {
      const m = map.materials.find((x) => x.name === name);
      if (!m) continue; // only materials used by objects are imported
      expect(m.roughness).toBeCloseTo(e.roughness, 5);
      expect(m.metallic).toBeCloseTo(e.metallic, 5);
      expect(m.color[3]).toBeCloseTo(e.alpha, 5);
      if (m.textures.albedo === undefined) expectClose(m.color.slice(0, 3), e.base_color.slice(0, 3));
    }
    expect(map.materials.find((m) => m.name === 'Blue')!.alphaMode).toBe('blend');
    expect(map.materials.find((m) => m.name === 'Red')!.alphaMode).toBe('opaque');
    const checker = map.materials.find((m) => m.name === 'Checker')!;
    const tex = map.textures[checker.textures.albedo!];
    expect(tex.name).toBe('checker');
    expect(tex.encoded!.mime).toBe('image/png');
    expect([tex.width, tex.height]).toEqual([expected.images.checker.width, expected.images.checker.height]);
    expect(Array.from(tex.encoded!.bytes.subarray(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('lists unpacked images and accepts them later', () => {
    expect(result.missingImages).toEqual(expected.missing_images);
    const fresh = readBlend(bytes).map;
    const wall = fresh.textures.find((t) => t.name === 'wall.png')!;
    expect(wall.encoded).toBeUndefined();
    const png = map.textures.find((t) => t.name === 'checker')!.encoded!.bytes;
    expect(attachImage(fresh, 'C:\\Users\\me\\textures\\WALL.png', png)).toBe(1);
    expect(wall.encoded!.mime).toBe('image/png');
    expect(wall.width).toBe(expected.images.checker.width);
  });

  it('reads ReSkate Studio sk8_object settings', () => {
    for (const [name, e] of Object.entries(expected.objects)) {
      const o = map.objects.find((x) => x.name === name)!;
      const want = { triangle_mesh: 'mesh', convex_parts: 'convex', hull: 'hull', none: 'none', water: 'water' }[e.collision_mode];
      expect(o.collision.mode, name).toBe(want);
    }
    const cube = map.objects.find((o) => o.name === 'Cube')!;
    const sk8 = cube.extra!.sk8_object as Record<string, unknown>;
    expect(sk8.collision_mode).toBe(1);
    expect(Boolean(sk8.round_rail)).toBe(true);
    expect(sk8.audio_softness as number).toBeCloseTo(0.75, 5);
  });

  it('warns about modifiers', () => {
    expect(map.warnings).toContain('Pillar has 1 unapplied modifier; base mesh used');
  });

  it('reads curves as rails', () => {
    expect(map.rails.map((r) => r.name).sort()).toEqual(Object.keys(expected.rails).sort());
    for (const [name, e] of Object.entries(expected.rails)) {
      const r = map.rails.find((x) => x.name === name)!;
      expect(r.closed).toBe(e.closed);
      if (e.type === 'BEZIER') {
        expect(r.points.length).toBe((e.knots.length - 1) * e.resolution + 1);
        e.knots.forEach((k, i) => expectClose(r.points[i * e.resolution], k));
      } else {
        expect(r.points.length).toBe(e.knots.length);
        r.points.forEach((p, i) => expectClose(p, e.knots[i]));
      }
    }
  });

  it('reads spawn empties the ReSkate way', () => {
    expect(map.spawns.length).toBe(expected.spawns.length);
    for (const s of expected.spawns) {
      const got = map.spawns.find((x) => x.name === s.name)!;
      expectClose(got.position, s.position);
      expect(got.yaw).toBeCloseTo(s.yaw, 3);
    }
  });

  it('records collection membership', () => {
    const ngon = map.objects.find((o) => o.name === 'Ngon')!;
    expect((ngon.extra!.blend as { collections: string[] }).collections).toEqual(['Props']);
  });
});
