// Which base-game (skate.) assets a map mod uses: placed base meshes/blueprints and base textures in its
// materials, keyed by EBX partition guid. Drives the order the CC0 clean-room library is built in.
import type { ModSource } from '../reskate-mod/frostbite.ts';
import { bindMaterials, indexMod, levelOf, placeGeometry, readDepots, readLevel } from '../reskate-mod/mod.ts';

export interface ModCensus {
  level: string;
  placements: Record<string, { kind: string; count: number }>;   // partition guid -> placed copies
  textures: Record<string, number>;                              // partition guid -> materials using it
  materials: { total: number; withBase: number };
  ownPlacements: number;
}

export async function censusMod(src: ModSource, log: (s: string) => void = () => {}): Promise<ModCensus> {
  const ix = await indexMod(src, log);
  const level = await levelOf(src);
  const lvl = await readLevel(src, ix, level, log);
  const geo = await placeGeometry(src, ix, lvl, log);
  const depots = await readDepots(src, ix);
  const bindings = bindMaterials(ix, lvl, depots, geo.meshKeys);
  const placements: ModCensus['placements'] = {};
  for (const r of lvl.baseRefs) { const p = (placements[r.partition] ??= { kind: r.kind, count: 0 }); p.count++; }
  const textures: Record<string, number> = {};
  let withBase = 0;
  for (const b of bindings.values()) {
    if (b.baseTextures.length) withBase++;
    for (const t of b.baseTextures) textures[t] = (textures[t] ?? 0) + 1;
  }
  return { level, placements, textures, materials: { total: bindings.size, withBase }, ownPlacements: lvl.placements.length };
}
