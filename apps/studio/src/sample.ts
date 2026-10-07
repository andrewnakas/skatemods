// A small procedural park so people can try the tools without a file.
import type { MapIR, Mesh, Vec3 } from './ir';
import { defaultMaterial, emptyMap, IDENTITY } from './ir';
import { computeNormals } from './three/toIR';

class Builder {
  positions: number[] = [];
  uvs: number[] = [];
  indices: number[] = [];
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, uvScale = 0.5) {
    const base = this.positions.length / 3;
    this.positions.push(...a, ...b, ...c, ...d);
    const w = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * uvScale;
    const h = Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]) * uvScale;
    this.uvs.push(0, h, w, h, w, 0, 0, 0);
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  /** Box from min to max, outward-facing. */
  box(min: Vec3, max: Vec3) {
    const [x0, y0, z0] = min, [x1, y1, z1] = max;
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]); // top
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]); // +z
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]); // -z
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]); // +x
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]); // -x
  }
  mesh(material: number): Mesh {
    const positions = new Float32Array(this.positions);
    const indices = new Uint32Array(this.indices);
    return { positions, uvs: new Float32Array(this.uvs), normals: computeNormals(positions, indices), indices, groups: [{ start: 0, count: indices.length, material }] };
  }
}

function checker(name: string, a: [number, number, number], b: [number, number, number], size = 64, cells = 8): MapIR['textures'][number] {
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const on = ((Math.floor((x * cells) / size) + Math.floor((y * cells) / size)) & 1) === 0;
    const c = on ? a : b;
    const n = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1 * 10;
    rgba.set([c[0] + n, c[1] + n, c[2] + n, 255], (y * size + x) * 4);
  }
  return { name, width: size, height: size, rgba, srgb: true };
}

const at = (x: number, y: number, z: number) => [...IDENTITY.slice(0, 12), x, y, z, 1];

export function samplePark(): MapIR {
  const map = emptyMap('Sample Park', 'sample');
  map.textures.push(checker('concrete.png', [176, 172, 160], [164, 160, 148]), checker('wood.png', [186, 140, 84], [170, 126, 74], 64, 4));
  map.materials.push(
    { ...defaultMaterial('Concrete'), surface: 'concrete', textures: { albedo: 0 } },
    { ...defaultMaterial('Wood'), surface: 'wood', textures: { albedo: 1 } },
    { ...defaultMaterial('Metal'), surface: 'metal', color: [0.55, 0.6, 0.65, 1], roughness: 0.4, metallic: 0.8 },
  );

  const ground = new Builder();
  ground.quad([-40, 0, 40], [40, 0, 40], [40, 0, -40], [-40, 0, -40], 0.1);
  map.objects.push({ name: 'Ground', mesh: ground.mesh(0), transform: at(0, 0, 0), render: true, collision: { mode: 'mesh' } });

  const ledge = new Builder();
  ledge.box([-6, 0, -1], [6, 0.45, 0]);
  map.objects.push({ name: 'Ledge', mesh: ledge.mesh(0), transform: at(-8, 0, -8), render: true, collision: { mode: 'mesh' } });

  // Stairs, 7 steps of 0.17 m, with a top landing.
  const stairs = new Builder();
  for (let i = 0; i < 7; i++) stairs.box([-3, 0, i * 0.32], [3, 0.17 * (i + 1), (i + 1) * 0.32]);
  stairs.box([-3, 0, 7 * 0.32], [3, 0.17 * 7, 7 * 0.32 + 6]);
  map.objects.push({ name: 'Stairs', mesh: stairs.mesh(0), transform: at(10, 0, -12), render: true, collision: { mode: 'mesh' } });

  // Quarter pipe: 2.4 m radius, 16 facets, wooden.
  const qp = new Builder();
  const R = 2.4, steps = 16, width = 8;
  for (let i = 0; i < steps; i++) {
    const a0 = (i / steps) * (Math.PI / 2), a1 = ((i + 1) / steps) * (Math.PI / 2);
    // Profile: starts flat at z = R, ends vertical at z = 0, height R.
    const y0 = R - R * Math.cos(a0), z0 = R - R * Math.sin(a0);
    const y1 = R - R * Math.cos(a1), z1 = R - R * Math.sin(a1);
    qp.quad([-width / 2, y0, z0], [width / 2, y0, z0], [width / 2, y1, z1], [-width / 2, y1, z1]);
  }
  qp.box([-width / 2, 0, -1.2], [width / 2, R, 0]);
  map.objects.push({ name: 'Quarter pipe', mesh: qp.mesh(1), transform: at(0, 0, 24), render: true, collision: { mode: 'mesh', surface: 'wood' } });

  // Flat bar.
  const bar = new Builder();
  bar.box([-0.03, 0, -4], [0.03, 0.35, 4]);
  bar.box([-0.04, 0.35, -4], [0.04, 0.4, 4]);
  map.objects.push({ name: 'Flat bar', mesh: bar.mesh(2), transform: at(-14, 0, 8), render: true, collision: { mode: 'mesh', surface: 'metal' } });
  map.rails.push({ name: 'Flat bar', points: [[-14, 0.4, 4], [-14, 0.4, 12]], closed: false });

  // Handrail down the stairs.
  map.rails.push({ name: 'Handrail', points: [[13.2, 1.19 + 0.9, -12 + 7 * 0.32], [13.2, 0.9, -12 - 0.3]], closed: false });
  const rail = new Builder();
  rail.box([-0.025, 0, -0.025], [0.025, 0.9, 0.025]);
  map.objects.push({ name: 'Handrail post', mesh: rail.mesh(2), transform: at(13.2, 0, -12.3), render: true, collision: { mode: 'none' } });

  map.spawns.push({ name: 'spawn', position: [0, 0, 0], yaw: 180 });
  return map;
}
