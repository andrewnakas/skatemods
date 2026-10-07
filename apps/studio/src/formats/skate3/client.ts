// Skate 3 DLC (.big) through the .NET WebAssembly build of ArenaBuilder + DlcBuilder + sk3
// (apps/studio/dotnet/Sk3Wasm). Loaded only when a Skate 3 file is involved. Runs on the page:
// the .NET runtime stalls during startup inside a Web Worker.
import { strToU8, unzipSync, zipSync } from 'fflate';
import type { MapIR, Material } from '../../ir';
import { mergeMap } from '../../export';
import { writeGlb } from '../../util/glb';
import { skateSurface } from '../skate/surfaces';

interface Sk3Exports {
  Info(): string;
  LastLog(): string;
  BuildDlcFromGlb(zip: Uint8Array, options: string): Uint8Array;
  ReadBig(big: Uint8Array): Uint8Array;
}

let runtime: Promise<Sk3Exports> | null = null;

export const SKATE3_UNAVAILABLE =
  'Skate 3 export is not in this test build yet. It runs ArenaBuilder and DlcBuilder from Dumbad\'s Skate 3 Modding Tools, and we are waiting on the author\'s OK to host it.';

async function load(progress: (t: string) => void): Promise<Sk3Exports> {
  if (!runtime) runtime = (async () => {
    const url = `${import.meta.env.BASE_URL}dotnet/_framework/dotnet.js`;
    progress('Loading the Skate 3 tools (about 3 MB, first time only)');
    let dotnet;
    try { ({ dotnet } = await import(/* @vite-ignore */ url)); } catch { throw new Error(SKATE3_UNAVAILABLE); }
    const rt = await dotnet.create();
    return (await rt.getAssemblyExports('Sk3Wasm')).Sk3Wasm.Exports as Sk3Exports;
  })();
  try { return await runtime; } catch (e) { runtime = null; throw e; }
}

/**
 * Builds the ArenaBuilder input folder: one world-space GLB whose material names carry the
 * per-object settings, blenrose_materials.json (Skate 3 surface ids, collision/render
 * exclusion) and splines.json (grind rails).
 */
export function buildArenaInput(map: MapIR): { files: Record<string, Uint8Array>; warnings: string[] } {
  const warnings: string[] = [];
  const variants: Material[] = [];
  const variantIndex = new Map<string, number>();
  const db: Record<string, unknown> = {};
  const objects = map.objects.map(o => ({
    ...o,
    mesh: {
      ...o.mesh,
      groups: o.mesh.groups.map(g => {
        const base = map.materials[g.material];
        const surface = o.collision.surface ?? base?.surface ?? 'concrete';
        const collide = o.collision.mode !== 'none';
        if (o.collision.mode === 'convex' || o.collision.mode === 'hull')
          warnings.push(`${o.name}: ${o.collision.mode} collision is built from the exact triangles in Skate 3`);
        const key = `${base?.name ?? 'default'}|${surface}|${o.render ? 'r' : '-'}|${collide ? 'c' : '-'}`;
        let index = variantIndex.get(key);
        if (index === undefined) {
          const name = `m${variants.length}_${(base?.name ?? 'default').replace(/[^A-Za-z0-9_]/g, '_').slice(0, 40)}`;
          variants.push({ ...(base ?? map.materials[0]), name });
          index = variants.length - 1;
          variantIndex.set(key, index);
          const s = skateSurface(surface);
          db[name] = {
            collision: { physics_surface: String(s.physics), audio_surface: String(s.audio), surface_pattern: String(s.pattern) },
            exclude_collision: !collide,
            exclude_pres: !o.render,
          };
        }
        return { ...g, material: index };
      }),
    },
  }));
  const variantMap: MapIR = { ...map, objects, materials: variants };
  const merged = mergeMap(variantMap, 'all');
  const files: Record<string, Uint8Array> = {
    'map.glb': writeGlb(map.name, merged, variants, map.textures),
    'blenrose_materials.json': strToU8(JSON.stringify(db, null, 1)),
  };
  if (map.rails.length) files['splines.json'] = strToU8(JSON.stringify({ splines: map.rails.map(r => ({ points: r.closed ? [...r.points, r.points[0]] : r.points })) }));
  return { files, warnings };
}

export async function writeSkate3(map: MapIR, progress: (t: string) => void): Promise<{ name: string; bytes: Uint8Array; warnings: string[] }> {
  const sk3 = await load(progress);
  const { files, warnings } = buildArenaInput(map);
  const spawn = map.spawns[0];
  const options = {
    name: map.name,
    target: 'x360',
    includeDist: true,
    spawn: spawn ? { x: spawn.position[0], y: spawn.position[1], z: spawn.position[2], yaw: spawn.yaw } : undefined,
  };
  progress('Building Skate 3 arenas, collision and textures (can take a minute or two)');
  let out: Uint8Array;
  try { out = sk3.BuildDlcFromGlb(zipSync(files, { level: 0 }), JSON.stringify(options)); }
  catch (e) { throw new Error(`${e instanceof Error ? e.message : e}\n${sk3.LastLog().split('\n').slice(-8).join('\n')}`); }
  const tree = unzipSync(out);
  const bigName = Object.keys(tree).find(n => n.endsWith('.big'));
  if (!bigName) throw new Error('the Skate 3 build produced no .big');
  const log = new TextDecoder().decode(tree['build.log'] ?? new Uint8Array());
  for (const line of log.split('\n')) if (/\[WARN|Warning/i.test(line)) warnings.push(line.trim());
  return { name: bigName, bytes: tree[bigName], warnings };
}

export async function readSkate3(_bytes: Uint8Array, _name: string, _progress: (t: string) => void): Promise<MapIR> {
  throw new Error('Opening Skate 3 DLC packs is not in this build yet. If you have the pack as a .skate (the Rust engine format), open that instead.');
}
