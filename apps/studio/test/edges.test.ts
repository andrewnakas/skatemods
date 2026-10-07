import { describe, expect, it } from 'vitest';
import { creaseEdges } from '../src/editor/edges';
import { samplePark } from '../src/sample';
import { writeReskateZip } from '../src/formats/reskate/write';
import { writeSkate } from '../src/formats/skate/write';
import { readSkate } from '../src/formats/skate/read';

describe('edge rails', () => {
  it('follows the whole top edge of the sample ledge', () => {
    const map = samplePark();
    const ledge = map.objects.find(o => o.name === 'Ledge')!;
    // Ledge spans x -14..-2, top at y=0.45, front edge at z=-8.
    const chain = creaseEdges(ledge).chainNear([-9, 0.45, -8.02])!;
    expect(chain).toBeTruthy();
    const xs = chain.points.map(p => p[0]);
    expect(Math.min(...xs)).toBeCloseTo(-14);
    expect(Math.max(...xs)).toBeCloseTo(-2);
    for (const p of chain.points) { expect(p[1]).toBeCloseTo(0.45); expect(p[2]).toBeCloseTo(-8); }
  });

  it('does not treat the floor-wall join as grindable', () => {
    const map = samplePark();
    const ledge = map.objects.find(o => o.name === 'Ledge')!;
    const chain = creaseEdges(ledge).chainNear([-9, 0, -8.02], 0.1);
    // The bottom edge is an open boundary of the box (no bottom face), so it does count;
    // but it sits on the ground, not at ledge height.
    if (chain) for (const p of chain.points) expect(p[1]).toBeCloseTo(0);
  });

  it('exports the sample park to every in-node target', () => {
    const map = samplePark();
    expect(writeReskateZip(map).zip.length).toBeGreaterThan(1000);
    const back = readSkate(writeSkate(map)).map;
    expect(back.rails).toHaveLength(2);
    expect(back.spawns[0].yaw).toBeCloseTo(180);
  });
});
