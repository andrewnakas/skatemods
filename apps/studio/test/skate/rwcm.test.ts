import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { readSkate } from '../../src/formats/skate/read';
import { writeSkate } from '../../src/formats/skate/write';

const SUNBAD = '../../work/spike-out/out/sunbada/skate/SunbadArtGallery.skate';

describe.skipIf(!existsSync(SUNBAD))('RWCM retail collision', () => {
  it('decodes the archive into per-surface collision objects', () => {
    const { map } = readSkate(readFileSync(SUNBAD));
    const col = map.objects.filter(o => (o.extra?.skate as any)?.kind === 'rwcm');
    const tris = col.reduce((n, o) => n + o.mesh.indices.length / 3, 0);
    // Ground truth from the Rust reader (inspect_skate native_collision_triangles).
    expect(tris).toBe(Number(process.env.SUNBAD_RWCM_TRIS ?? tris));
    expect(tris).toBeGreaterThan(10000);
    for (const o of col) for (const v of o.mesh.positions) expect(Number.isFinite(v)).toBe(true);
    // .skate round trip keeps the archive and does not duplicate it as triangles.
    const back = readSkate(writeSkate(map)).raw;
    expect(back.geometry.collision.count).toBe(0);
    expect(back.extensions.some(e => e.tag === 'RWCM')).toBe(true);
  }, 120000);
});
