import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { MapIR, MapObject } from '../../src/ir';
import { IDENTITY, defaultMaterial, emptyMap, validate } from '../../src/ir';
import type { SkateCollisionExtra, SkateMapExtra } from '../../src/formats/skate/extra';
import { parseSkate } from '../../src/formats/skate/parse';
import { readSkate } from '../../src/formats/skate/read';
import { serializeSkate } from '../../src/formats/skate/serialize';
import { SKATE_SURFACES, surfaceFromSkate } from '../../src/formats/skate/surfaces';
import type { SkateMap } from '../../src/formats/skate/types';
import { writeSkate, writeSkateWithReport } from '../../src/formats/skate/write';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../..');
const fixture = (v: number) => readFileSync(join(here, 'fixtures', `fixture-v${String(v).padStart(2, '0')}.skate`));

// Optional: path to a build of crates/skate-data/examples/inspect_skate. When set, every file
// this suite writes is also loaded by the Rust reader.
const INSPECT = process.env.SKATE_INSPECT;
function rustAccepts(bytes: Uint8Array, label: string): void {
  if (!INSPECT || !existsSync(INSPECT)) return;
  const dir = mkdtempSync(join(tmpdir(), 'skate-'));
  const file = join(dir, `${label}.skate`);
  writeFileSync(file, bytes);
  const out = execFileSync(INSPECT, [file], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  expect(out).toContain(' v');
}

/** Ground truth printed by `inspect_skate` (skate-data example) for the sample maps. */
const SAMPLES = [
  {
    path: 'work/tools/rust-engine/maps/format-demo.skate',
    name: 'SKATE Format Demo', version: 8, vertices: 4, triangles: 2, collision: 2, textures: 2, rails: 0,
    doors: 0, lights: 0, routes: 0, spawn: [0, 0, 0], heading: 0, extensions: [] as [string, number, number][],
  },
  {
    path: 'work/spike-out/out/sunbada/skate/SunbadArtGallery.skate',
    name: 'SunbadArtGallery', version: 14, vertices: 182254, triangles: 163306, collision: 0, textures: 287, rails: 6367,
    doors: 0, lights: 0, routes: 0, spawn: [-0.84233093, 0.87202936, -1.371772], heading: 0,
    extensions: [['RWCM', 1, 4618151], ['WMET', 1, 5064399]] as [string, number, number][],
  },
  {
    path: 'work/spike-out/out/jumpcity/skate/JumpCity.skate',
    name: 'JumpCity', version: 14, vertices: 2506714, triangles: 3626903, collision: 0, textures: 45, rails: 4403,
    doors: 0, lights: 0, routes: 0, spawn: [-0.20354207, 143.8516, -0.4948578], heading: 0,
    extensions: [['RWCM', 1, 14752851], ['WMET', 1, 8922722]] as [string, number, number][],
  },
  // Produced by tools/vendor/university/tools/blender_owned_map/repack_skate_v15.py from the
  // Sunbad SKATE14 map (zstd transforms). Not in the repo; set SKATE_V15_SAMPLE to its path.
  ...(process.env.SKATE_V15_SAMPLE ? [{
    path: process.env.SKATE_V15_SAMPLE,
    name: 'SunbadArtGallery', version: 15, vertices: 182254, triangles: 163306, collision: 0, textures: 287, rails: 6367,
    doors: 0, lights: 0, routes: 0, spawn: [-0.84233093, 0.87202936, -1.371772], heading: 0,
    extensions: [['RWCM', 1, 4618151], ['WMET', 1, 5064399], ['WCFG', 1, 4]] as [string, number, number][],
  }] : []),
];

function f32(x: number): number { return Math.fround(x); }

/** Asserts two SkateMaps carry the same data (geometry bit-exact). */
function expectSameSkate(a: SkateMap, b: SkateMap, opts: { tangents?: boolean } = {}): void {
  expect(b.name).toBe(a.name);
  expect(b.spawn).toEqual(a.spawn);
  expect(b.heading).toBe(a.heading);
  expect(b.environment.slice(0, a.environment.length)).toEqual(a.environment);
  expect(b.materials.length).toBe(a.materials.length);
  a.materials.forEach((m, i) => {
    const n = b.materials[i];
    expect({ ...n, depthLayer: null, retailDefinition: null }).toEqual({ ...m, depthLayer: null, retailDefinition: null });
    if (m.depthLayer !== null) expect(n.depthLayer).toBe(m.depthLayer);
    expect(n.retailDefinition ? Array.from(n.retailDefinition) : null).toEqual(m.retailDefinition ? Array.from(m.retailDefinition) : null);
  });
  expect(b.textures.map((t) => [t.name, t.width, t.height, t.colorSpace])).toEqual(a.textures.map((t) => [t.name, t.width, t.height, t.colorSpace]));
  a.textures.forEach((t, i) => expect(Buffer.from(b.textures[i].rgba).equals(Buffer.from(t.rgba))).toBe(true));
  const va = a.geometry.vertices, vb = b.geometry.vertices;
  expect(vb.count).toBe(va.count);
  expect(vb.positions).toEqual(va.positions);
  expect(vb.normals).toEqual(va.normals);
  expect(vb.uvs).toEqual(va.uvs);
  expect(vb.lightmapUvs).toEqual(va.lightmapUvs);
  expect(vb.materials).toEqual(va.materials);
  if (va.decalUvs) expect(vb.decalUvs).toEqual(va.decalUvs);
  if (va.tangentFrames && opts.tangents !== false) expect(vb.tangentFrames).toEqual(va.tangentFrames);
  expect(b.geometry.indices).toEqual(a.geometry.indices);
  const ca = a.geometry.collision, cb = b.geometry.collision;
  expect(cb.count).toBe(ca.count);
  expect(cb.points).toEqual(ca.points);
  expect(cb.surfaces).toEqual(ca.surfaces);
  expect(cb.materials).toEqual(ca.materials);
  if (ca.edgeWords) expect(cb.edgeWords).toEqual(ca.edgeWords);
  expect(b.rails.length).toBe(a.rails.length);
  a.rails.forEach((r, i) => {
    expect(b.rails[i].name).toBe(r.name);
    expect(b.rails[i].closed).toBe(r.closed);
    expect(b.rails[i].points).toEqual(r.points);
    expect(b.rails[i].native ? Array.from(b.rails[i].native!) : null).toEqual(r.native ? Array.from(r.native) : null);
  });
  expect(b.lights).toEqual(a.lights);
  expect(b.routes).toEqual(a.routes);
  expect(b.extensions.map((e) => [e.tag, e.schema, e.payload.length])).toEqual(a.extensions.map((e) => [e.tag, e.schema, e.payload.length]));
  a.extensions.forEach((e, i) => expect(Buffer.from(b.extensions[i].payload).equals(Buffer.from(e.payload))).toBe(true));
}

describe('SKATE01..15 reader (Rust test fixtures)', () => {
  // test/skate/fixtures/fixture-vNN.skate are the exact bytes of `fixture(version)` from
  // crates/skate-data/tests/skate_map.rs (methods raw/zlib/zstd by version % 3).
  for (let version = 1; version <= 15; version++) {
    it(`reads v${version} like reads_all_documented_versions_without_moving_geometry`, () => {
      const raw = parseSkate(fixture(version));
      expect(raw.version).toBe(version);
      expect(raw.spawn).toEqual([2, 0, 3]);
      expect(raw.heading).toBe(1);
      expect(Array.from(raw.geometry.vertices.positions.subarray(6, 9))).toEqual([1, 0, 0]);
      expect(raw.geometry.collision.surfaces[0]).toBe(99);
      expect(Array.from(raw.textures[0].rgba)).toEqual([255, 128, 64, 255]);
      expect(raw.materials[0].audio).toBe(version === 1 ? 3 : 42);
      expect(raw.materials[0].physics).toBe(version === 1 ? 1 : 4);
      expect(raw.rails[0].points.length).toBe(2);
      expect(raw.lights.length).toBe(version >= 7 ? 1 : 0);
      expect(raw.routes.length).toBe(version >= 8 ? 1 : 0);
      expect(raw.environment.length).toBe(version >= 6 ? 45 : version >= 3 ? 14 : 12);
      if (version >= 12) {
        expect(new TextDecoder().decode(raw.extensions[0].payload)).toBe('{}');
        expect(Array.from(raw.geometry.vertices.tangentFrames!.subarray(0, 4))).toEqual([0, 0, 127, 127]);
      }
      if (version >= 13) expect(raw.materials[0].depthLayer).toBe(1);

      const { map } = readSkate(fixture(version));
      expect(validate(map)).toEqual([]);
      expect(map.spawns[0].yaw).toBeCloseTo(180 / Math.PI, 10);
      expect(map.objects.map((o) => [o.render, o.collision.mode])).toEqual([[true, 'none'], [false, 'mesh']]);
      expect((map.objects[1].extra!.skate as SkateCollisionExtra).surfaces[0]).toBe(99);
    });
  }

  it('rejects every truncated prefix, trailing bytes, bad versions and markers', () => {
    const data = fixture(8);
    for (let end = 0; end < data.length; end++) expect(() => parseSkate(data.subarray(0, end)), `prefix ${end}`).toThrow();
    expect(() => parseSkate(Buffer.concat([data, Buffer.from([0])]))).toThrow(/trailing/);
    const bad = Buffer.from(data);
    bad[5] = 0x39; bad[6] = 0x39;
    expect(() => parseSkate(bad)).toThrow(/version/);
    const marker = Buffer.from(data);
    marker[8] = 0;
    expect(() => parseSkate(marker)).toThrow(/endian/);
  });

  it('v15 texture back-references share pixels', () => {
    // Same surgery as v15_texture_references_preserve_order_and_reject_forward_or_wrong_size.
    const data = Buffer.from(fixture(15));
    const header = 8 + 4 + 4 + 'Fixture'.length + 49 * 4;
    data.writeUInt32LE(3, header + 4);
    const needle = Buffer.concat([u32(5), Buffer.from('Pixel')]);
    const start = data.indexOf(needle);
    const metadataEnd = start + needle.length + 12;
    const textureEnd = metadataEnd + 8 + 4;
    const refs = [0, 1].map((s) => Buffer.concat([data.subarray(start, metadataEnd), u32(11), u32(4), u32(s)]));
    const patched = Buffer.concat([data.subarray(0, textureEnd), ...refs, data.subarray(textureEnd)]);
    const raw = parseSkate(patched);
    expect(raw.textures.length).toBe(3);
    for (const t of raw.textures) expect(Array.from(t.rgba)).toEqual([255, 128, 64, 255]);
    const forward = Buffer.from(patched);
    forward.writeUInt32LE(1, textureEnd + (metadataEnd - start) + 8);
    expect(() => parseSkate(forward)).toThrow(/forward texture reference/);
  });
});

function u32(v: number): Buffer { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; }

describe('sample maps (skipped when work/ is absent)', () => {
  for (const s of SAMPLES) {
    const file = resolve(repo, s.path);
    it.skipIf(!existsSync(file))(`${s.path} matches inspect_skate`, () => {
      const bytes = readFileSync(file);
      const { map, raw } = readSkate(bytes);
      expect(raw.name).toBe(s.name);
      expect(raw.version).toBe(s.version);
      expect(raw.geometry.vertices.count).toBe(s.vertices);
      expect(raw.geometry.indices.length / 3).toBe(s.triangles);
      expect(raw.geometry.collision.count).toBe(s.collision);
      expect(raw.textures.length).toBe(s.textures);
      expect(raw.rails.length).toBe(s.rails);
      expect(raw.doors.length).toBe(s.doors);
      expect(raw.lights.length).toBe(s.lights);
      expect(raw.routes.length).toBe(s.routes);
      expect(raw.spawn).toEqual(s.spawn.map(f32));
      expect(raw.heading).toBe(s.heading);
      expect(raw.extensions.map((e) => [e.tag, e.schema, e.payload.length])).toEqual(s.extensions);

      // MapIR view.
      expect(validate(map)).toEqual([]);
      expect(map.objects[0].mesh.indices.length / 3).toBe(s.triangles);
      // Retail maps without triangle collision also get decoded RWCM collision objects.
      expect(map.objects.filter((o) => (o.extra?.skate as { kind?: string } | undefined)?.kind !== 'rwcm').length).toBe(s.collision ? 2 : 1);
      expect(map.textures.length).toBe(s.textures);
      expect(map.materials.length).toBe(raw.materials.length);
      expect(map.rails.length).toBe(s.rails);
      // Native spline rails sample to finite points near the map.
      const p = map.objects[0].mesh.positions;
      let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[i + k]); hi[k] = Math.max(hi[k], p[i + k]); }
      for (const r of map.rails) {
        expect(r.points.length).toBeGreaterThan(1);
        for (const q of r.points) for (let k = 0; k < 3; k++) {
          expect(Number.isFinite(q[k])).toBe(true);
          expect(q[k]).toBeGreaterThan(lo[k] - 50);
          expect(q[k]).toBeLessThan(hi[k] + 50);
        }
      }
    }, 300_000);
  }
});

describe('round trip .skate -> MapIR -> .skate', () => {
  for (const version of [12, 13, 14, 15]) {
    for (const out of [14, 15] as const) {
      it(`fixture v${version} -> SKATE${out}`, () => {
        const { map, raw } = readSkate(fixture(version));
        const bytes = writeSkate(map, { version: out });
        rustAccepts(bytes, `fixture-v${version}-to-${out}`);
        const again = parseSkate(bytes);
        expect(again.version).toBe(out);
        expectSameSkate(raw, again);
      });
    }
  }

  it('format-demo (v8, no decal/tangent data) keeps geometry exactly', () => {
    const file = resolve(repo, SAMPLES[0].path);
    if (!existsSync(file)) return;
    const { map, raw } = readSkate(readFileSync(file));
    for (const version of [14, 15] as const) {
      for (const compression of ['zlib', 'none'] as const) {
        const bytes = writeSkate(map, { version, compression });
        rustAccepts(bytes, `format-demo-${version}-${compression}`);
        const again = parseSkate(bytes);
        expectSameSkate(raw, again, { tangents: false });
        // v8 has no decal UVs; the writer uses UV0 like the exporter.
        expect(again.geometry.vertices.decalUvs).toEqual(raw.geometry.vertices.uvs);
      }
    }
  });

  const sunbad = resolve(repo, SAMPLES[1].path);
  it.skipIf(!existsSync(sunbad))('SunbadArtGallery (SKATE14 retail) -> SKATE14 and SKATE15', () => {
    const { map, raw } = readSkate(readFileSync(sunbad));
    for (const version of [14, 15] as const) {
      const { bytes, warnings } = writeSkateWithReport(map, { version });
      expect(warnings).toEqual([]);
      rustAccepts(bytes, `sunbad-${version}`);
      const again = parseSkate(bytes);
      expectSameSkate(raw, again);
      const ir = readSkate(bytes).map;
      expect(ir.materials.length).toBe(map.materials.length);
      expect(ir.rails.length).toBe(map.rails.length);
      expect(ir.spawns).toEqual(map.spawns);
    }
  }, 600_000);

  it('edits survive: moved spawn, changed surface, edited rail', () => {
    const { map } = readSkate(fixture(14));
    map.spawns[0] = { name: 'spawn', position: [5, 1, -2], yaw: 90 };
    expect(map.materials[0].surface).toBe('wood'); // audio 42 = Wood_1_Up
    map.materials[0].surface = 'glass';
    map.rails[0].points.push([3, 1, 0]);
    const again = readSkate(writeSkate(map)).raw;
    expect(again.spawn).toEqual([5, 1, -2]);
    expect(again.heading).toBeCloseTo(Math.PI / 2, 6);
    expect([again.materials[0].audio, again.materials[0].physics, again.materials[0].pattern])
      .toEqual([SKATE_SURFACES.glass.audio, SKATE_SURFACES.glass.physics, SKATE_SURFACES.glass.pattern]);
    expect(again.rails[0].points.length).toBe(3);
  });
});

describe('synthetic MapIR -> .skate', () => {
  function box(name: string, size: [number, number, number], at: [number, number, number]): MapObject {
    const [sx, sy, sz] = size.map((v) => v / 2);
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
    const faces: [number[], number[], number[]][] = [
      [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
      [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
      [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
    ];
    for (const [n, u, v] of faces) {
      const base = positions.length / 3;
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        positions.push((n[0] + u[0] * a + v[0] * b) * sx, (n[1] + u[1] * a + v[1] * b) * sy, (n[2] + u[2] * a + v[2] * b) * sz);
        normals.push(...n);
        uvs.push((a + 1) / 2, (1 - b) / 2);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const transform = [...IDENTITY];
    transform[12] = at[0]; transform[13] = at[1]; transform[14] = at[2];
    return {
      name,
      mesh: {
        positions: Float32Array.from(positions), normals: Float32Array.from(normals), uvs: Float32Array.from(uvs),
        indices: Uint32Array.from(indices), groups: [{ start: 0, count: 24, material: 0 }, { start: 24, count: 12, material: 1 }],
      },
      transform, render: true, collision: { mode: 'mesh' },
    };
  }

  function synthetic(): MapIR {
    const map = emptyMap('Synthetic Park', 'test');
    map.textures.push({ name: 'checker', width: 2, height: 2, srgb: true, rgba: Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]) });
    map.materials.push({ ...defaultMaterial('ground'), textures: { albedo: 0 }, surface: 'smooth_concrete' });
    map.materials.push({ ...defaultMaterial('ramp'), color: [0.8, 0.6, 0.4, 1], surface: 'wood' });
    map.objects.push(box('floor', [20, 0.5, 20], [0, -0.25, 0]));
    // Ramp: a wedge, no normals (writer computes them), collision surface override to metal.
    map.objects.push({
      name: 'ramp',
      mesh: {
        positions: Float32Array.from([0, 0, 0, 4, 0, 0, 4, 0, 4, 0, 0, 4, 4, 2, 0, 4, 2, 4]),
        indices: Uint32Array.from([0, 3, 2, 0, 2, 1, 1, 2, 5, 1, 5, 4, 0, 4, 5, 0, 5, 3]),
        groups: [{ start: 0, count: 18, material: 1 }],
      },
      transform: [...IDENTITY], render: true, collision: { mode: 'mesh', surface: 'metal' },
    });
    // Invisible wall: collision only, water mode.
    map.objects.push({ ...box('pool', [2, 1, 2], [-5, 0.5, -5]), render: false, collision: { mode: 'water' } });
    map.rails.push({ name: 'ledge', points: [[-3, 0.5, 2], [3, 0.5, 2]], closed: false });
    map.spawns.push({ name: 'start', position: [0, 0, -6], yaw: 45 });
    map.lights.push({ name: 'lamp', kind: 'point', position: [0, 4, 0], color: [1, 0.9, 0.8], intensity: 2, range: 12 });
    map.lights.push({ name: 'sun', kind: 'sun', position: [0, 0, 0], direction: [0, -1, 1], color: [1, 1, 0.9], intensity: 1.5 });
    return map;
  }

  for (const version of [14, 15] as const) {
    it(`box + ramp + rail + spawn -> SKATE${version}`, () => {
      const map = synthetic();
      expect(validate(map)).toEqual([]);
      const { bytes, warnings } = writeSkateWithReport(map, { version });
      expect(warnings).toEqual([]);
      rustAccepts(bytes, `synthetic-${version}`);
      const { map: back, raw } = readSkate(bytes);
      expect(raw.version).toBe(version);
      expect(raw.name).toBe('Synthetic Park');
      expect(raw.geometry.vertices.count).toBe(24 + 6);
      expect(raw.geometry.indices.length / 3).toBe(12 + 6);
      // floor 12 + ramp 6 + pool 12 collision triangles.
      expect(raw.geometry.collision.count).toBe(30);
      // Floor box sits at y in [-0.5, 0].
      const ys = raw.geometry.vertices.positions.filter((_, i) => i % 3 === 1);
      expect(Math.min(...ys)).toBeCloseTo(-0.5, 6);
      // ground, ramp + variants ramp#metal (ramp collision) and ground#water / ramp#water (pool).
      expect(raw.materials.map((m) => m.name)).toEqual(['ground', 'ramp', 'ramp#metal', 'ground#water', 'ramp#water']);
      const surfaceOf = (t: number) => surfaceFromSkate(raw.materials[raw.geometry.collision.materials[t] - 1]);
      expect(surfaceOf(0)).toBe('smooth_concrete');
      expect(surfaceOf(8)).toBe('wood'); // floor's second group uses the ramp material
      expect(new Set(Array.from({ length: 6 }, (_, i) => surfaceOf(12 + i)))).toEqual(new Set(['metal']));
      expect(new Set(Array.from({ length: 12 }, (_, i) => surfaceOf(18 + i)))).toEqual(new Set(['water']));
      expect(Array.from(new Set(raw.geometry.collision.surfaces))).toEqual([1, 2, 3]);
      expect(raw.rails).toEqual([{ name: 'ledge', closed: false, points: [[-3, 0.5, 2], [3, 0.5, 2]], native: null }]);
      expect(raw.spawn).toEqual([0, 0, -6]);
      expect(raw.heading).toBeCloseTo(Math.PI / 4, 6);
      expect(back.spawns[0].yaw).toBeCloseTo(45, 4);
      expect(raw.lights.map((l) => [l.name, l.kind, l.range])).toEqual([['lamp', 0, 12]]);
      expect(raw.environment[32]).toBeCloseTo(1);
      expect(raw.environment[34]).toBeCloseTo(0.9);
      expect(raw.environment[38]).toBe(1.5);
      expect(raw.environment[11]).toBeCloseTo(Math.atan2(-1, 0), 6);
      // Texture rows and V flip back to the same image.
      expect(Array.from(back.textures[0].rgba!)).toEqual(Array.from(map.textures[0].rgba!));
      expect(back.textures[0].srgb).toBe(true);
      const uvIn = map.objects[0].mesh.uvs!;
      const uvOut = back.objects[0].mesh.uvs!;
      for (let i = 0; i < uvIn.length; i++) expect(uvOut[i]).toBeCloseTo(uvIn[i], 6);
      // Tangent frames were generated for the textured floor.
      expect(raw.geometry.vertices.tangentFrames!.subarray(0, 4).some((b) => b !== 0)).toBe(true);
      // Collision object view.
      const col = back.objects[1];
      expect(col.render).toBe(false);
      expect((col.extra!.skate as SkateCollisionExtra).surfaces.length).toBe(30);
      expect((back.extra!.skate as SkateMapExtra).environment.length).toBe(45);
    });
  }

  it('duplicates vertices shared across materials and flips winding for mirrored transforms', () => {
    const map = emptyMap('shared', 'test');
    map.materials.push(defaultMaterial('a'), defaultMaterial('b'));
    const transform = [...IDENTITY];
    transform[0] = -1;
    map.objects.push({
      name: 'quad',
      mesh: {
        positions: Float32Array.from([0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1]),
        indices: Uint32Array.from([0, 3, 2, 0, 2, 1]),
        groups: [{ start: 0, count: 3, material: 0 }, { start: 3, count: 3, material: 1 }],
      },
      transform, render: true, collision: { mode: 'mesh' },
    });
    map.spawns.push({ name: 's', position: [0, 0, 0], yaw: 0 });
    const raw = parseSkate(writeSkate(map));
    expect(raw.geometry.vertices.count).toBe(6);
    // Mirrored: computed normals still point up.
    for (let i = 0; i < 6; i++) expect(raw.geometry.vertices.normals[i * 3 + 1]).toBeCloseTo(1, 6);
    const c = raw.geometry.collision.points;
    const ux = c[3] - c[0], uz = c[5] - c[2], vx = c[6] - c[0], vz = c[8] - c[2];
    expect(uz * vx - ux * vz).toBeGreaterThan(0); // cross().y > 0: still faces up
  });

  it('requires decoded textures and collision', () => {
    const map = emptyMap('t', 'test');
    map.materials.push(defaultMaterial());
    map.objects.push({
      name: 'tri', mesh: { positions: Float32Array.from([0, 0, 0, 0, 0, 1, 1, 0, 0]), indices: Uint32Array.from([0, 1, 2]), groups: [{ start: 0, count: 3, material: 0 }] },
      transform: [...IDENTITY], render: true, collision: { mode: 'none' },
    });
    expect(() => writeSkate(map)).toThrow(/collision/);
    map.objects[0].collision.mode = 'mesh';
    map.textures.push({ name: 'png', width: 1, height: 1, srgb: true, encoded: { mime: 'image/png', bytes: new Uint8Array(4) } });
    expect(() => writeSkate(map)).toThrow(/decodeTextures/);
  });

  it('raw serializer is byte-stable', () => {
    const raw = parseSkate(fixture(14));
    const a = serializeSkate(raw, { version: 15 });
    const b = serializeSkate(parseSkate(a), { version: 15 });
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});
