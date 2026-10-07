import { describe, expect, it } from 'vitest';
import { runChecks, autoSpawn } from '../src/check';
import { emptyMap, defaultMaterial, IDENTITY, type MapIR } from '../src/ir';
import { box, samplePark } from './fixtures';

const at = (x: number, y: number, z: number) => [...IDENTITY.slice(0, 12), x, y, z, 1];

function stairs(riser: number): MapIR {
  const map = emptyMap('stairs', 'test');
  map.materials.push(defaultMaterial());
  map.objects.push({ name: 'ground', mesh: box(60, 1, 60), transform: at(0, -0.5, 0), render: true, collision: { mode: 'mesh' } });
  for (let i = 0; i < 8; i++)
    map.objects.push({ name: `step${i}`, mesh: box(3, riser, 0.3), transform: at(0, riser * (i + 0.5), i * 0.3), render: true, collision: { mode: 'mesh' } });
  map.spawns.push({ name: 'spawn', position: [0, 0, -5], yaw: 0 });
  return map;
}

describe('checks', () => {
  it('reads scale from stair risers', () => {
    const ok = runChecks(stairs(0.17)).find(r => r.id === 'scale')!;
    expect(ok.level).toBe('ok');
    const big = runChecks(stairs(0.22)).find(r => r.id === 'scale')!;
    expect(big.level).toBe('warn');
    expect(big.text).toMatch(/scale 0\.77/);
  });

  it('flags a tall drop and a floating spawn', () => {
    const map = emptyMap('tower', 'test');
    map.materials.push(defaultMaterial());
    map.objects.push({ name: 'ground', mesh: box(60, 1, 60), transform: at(0, -0.5, 0), render: true, collision: { mode: 'mesh' } });
    map.objects.push({ name: 'tower', mesh: box(4, 20, 4), transform: at(0, 10, 0), render: true, collision: { mode: 'mesh' } });
    map.spawns.push({ name: 'spawn', position: [10, 3, 10], yaw: 0 });
    const r = runChecks(map);
    expect(r.find(x => x.id === 'drops' && x.level === 'warn')?.points.length).toBeGreaterThan(0);
    expect(r.find(x => x.id === 'spawn')?.text).toMatch(/off the ground/);
    expect(r.find(x => x.id === 'rooftops')).toBeTruthy();
  });

  it('runs on the sample park and finds an auto spawn on the ground', () => {
    const map = samplePark();
    expect(runChecks(map).length).toBeGreaterThan(3);
    const s = autoSpawn(map)!;
    expect(s.position[1]).toBeCloseTo(0, 3);
  });
});
