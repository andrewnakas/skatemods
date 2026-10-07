import type { MapIR, Mesh } from '../src/ir';
import { defaultMaterial, emptyMap, IDENTITY } from '../src/ir';

/** Axis-aligned box mesh centred on the origin. */
export function box(sx: number, sy: number, sz: number, material = 0): Mesh {
  const x = sx / 2, y = sy / 2, z = sz / 2;
  const faces: [number[], number[]][] = [
    [[1, 0, 0], [x, -y, -z, x, y, -z, x, y, z, x, -y, z]],
    [[-1, 0, 0], [-x, -y, z, -x, y, z, -x, y, -z, -x, -y, -z]],
    [[0, 1, 0], [-x, y, -z, -x, y, z, x, y, z, x, y, -z]],
    [[0, -1, 0], [-x, -y, z, -x, -y, -z, x, -y, -z, x, -y, z]],
    [[0, 0, 1], [x, -y, z, x, y, z, -x, y, z, -x, -y, z]],
    [[0, 0, -1], [-x, -y, -z, -x, y, -z, x, y, -z, x, -y, -z]],
  ];
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  faces.forEach(([n, p], f) => {
    positions.push(...p);
    for (let i = 0; i < 4; i++) normals.push(...n);
    uvs.push(0, 1, 0, 0, 1, 0, 1, 1);
    const b = f * 4;
    indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  return {
    positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices), groups: [{ start: 0, count: indices.length, material }],
  };
}

export function samplePark(): MapIR {
  const map = emptyMap('Sample Park', 'test');
  map.materials.push({ ...defaultMaterial('Concrete'), surface: 'concrete' }, { ...defaultMaterial('Wood'), surface: 'wood', color: [0.7, 0.5, 0.3, 1] });
  map.textures.push({ name: 'checker.png', width: 2, height: 2, rgba: new Uint8Array([255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255]), srgb: true });
  map.materials[0].textures.albedo = 0;
  map.objects.push({ name: 'Ground', mesh: box(40, 0.5, 40, 0), transform: [...IDENTITY.slice(0, 12), 0, -0.25, 0, 1], render: true, collision: { mode: 'mesh' } });
  map.objects.push({ name: 'Box', mesh: box(2, 0.5, 4, 1), transform: [...IDENTITY.slice(0, 12), 5, 0.25, 0, 1], render: true, collision: { mode: 'hull', surface: 'wood' } });
  map.rails.push({ name: 'Rail', points: [[-5, 0.6, 0], [-5, 0.6, 6]], closed: false });
  map.spawns.push({ name: 'spawn', position: [0, 0, -10], yaw: 0 }, { name: 'Ledges', position: [5, 0, -5], yaw: 90 });
  return map;
}
