import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { writeReskateZip, buildHandshake } from '../../src/formats/reskate/write';
import { readReskateHandshake } from '../../src/formats/reskate/read';
import { validate } from '../../src/ir';
import { samplePark } from '../fixtures';

describe('ReSkate handshake', () => {
  it('writes a map.json that passes the checks reskate_cli makes', () => {
    const { mapJson, files } = buildHandshake(samplePark());
    expect(mapJson.format).toBe(1);
    expect(mapJson.up).toBe('y');
    const objects = mapJson.objects as any[];
    expect(objects.length).toBe(3); // ground, box, rail prism
    for (const o of objects) {
      expect(o.transform).toHaveLength(12);
      const mesh = o.mesh ?? o.collision_mesh;
      expect(files[mesh]).toBeInstanceOf(Uint8Array);
    }
    const sd = mapJson.streaming_distances as any;
    expect(sd.near < sd.medium && sd.medium < sd.far).toBe(true);
    expect((mapJson.spawn as any).position).toHaveLength(3);
    expect((mapJson.travel_points as any[])[0].stop_name).toBe('Ledges');
    expect(JSON.stringify(mapJson)).not.toMatch(/NaN|Infinity/);
    expect(Object.keys(files).some(f => f.startsWith('textures/checker'))).toBe(true);
  });

  it('round-trips through the zip', () => {
    const src = samplePark();
    const { zip } = writeReskateZip(src);
    const files = unzipSync(zip);
    expect(Object.keys(files)).toContain('Sample_Park/map.json');
    expect(Object.keys(files)).toContain('Build Sample_Park.bat');
    const back = readReskateHandshake(files);
    expect(validate(back)).toEqual([]);
    expect(back.objects.map(o => o.name)).toEqual(['Ground', 'Box']);
    expect(back.objects[1].collision).toEqual({ mode: 'hull', surface: 'wood' });
    expect(back.objects[0].transform[13]).toBeCloseTo(-0.25);
    expect(back.objects[0].mesh.indices.length).toBe(36);
    expect(back.rails).toHaveLength(1);
    expect(back.rails[0].points[0]).toEqual([-5, expect.closeTo(0.6, 5), 0]);
    expect(back.rails[0].points.at(-1)![2]).toBeCloseTo(6);
    expect(back.spawns.map(s => s.name)).toEqual(['spawn', 'Ledges']);
    expect(back.materials[0].textures.albedo).toBe(0);
    expect(back.textures[0].width).toBe(2);
  });
});
