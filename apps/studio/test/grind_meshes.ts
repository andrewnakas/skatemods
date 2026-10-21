// Synthetic skate shapes for the grind golden (boxes, a stair set, a kinked rail, a bench), no game or mod data.
export interface Mesh { name: string; P: number[]; T: number[] }
function box(m: Mesh, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
  const b = m.P.length / 3;
  for (const [x, y, z] of [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]) m.P.push(x, y, z);
  for (const [a, c, d] of [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]) m.T.push(b + a, b + d, b + c);   // outward winding
}
export function meshes(): Mesh[] {
  const out: Mesh[] = [];
  let m: Mesh = { name: 'ledge', P: [], T: [] }; box(m, 0, 0, 0, 6, 0.45, 0.6); out.push(m);
  m = { name: 'stairs', P: [], T: [] }; for (let i = 0; i < 6; i++) box(m, 0, 0, i * 0.35, 4, 0.2 * (6 - i), (i + 1) * 0.35); out.push(m);
  m = { name: 'kinked_rail', P: [], T: [] }; box(m, 0, 0.8, -0.03, 3, 0.86, 0.03); box(m, 3, 0.8, -0.03, 6, 0.86, 0.03); out.push(m);
  m = { name: 'bench', P: [], T: [] }; box(m, 0, 0.4, 0, 2, 0.48, 0.5); box(m, 0.1, 0, 0.1, 0.3, 0.4, 0.4); box(m, 1.7, 0, 0.1, 1.9, 0.4, 0.4); out.push(m);
  m = { name: 'manual_pad', P: [], T: [] }; box(m, -2, 0, -1, 2, 0.15, 1); out.push(m);
  m = { name: 'tilted_box', P: [], T: [] }; box(m, 0, 0, 0, 3, 0.5, 1);
  for (let i = 0; i < m.P.length; i += 3) { const x = m.P[i], z = m.P[i + 2]; m.P[i] = x * 0.8 - z * 0.6; m.P[i + 2] = x * 0.6 + z * 0.8; } out.push(m);
  return out;
}
