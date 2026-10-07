// MapIR -> ReSkate Studio "handshake" (map.json + meshes/*.glb + textures/), the normalized
// map folder `reskate_cli compile-map <game> <folder> <staging> --deploy` builds from.
// Field names and conventions follow ReSkate Studio's Blender exporter (sk8_map_export.py).
import { zipSync, strToU8 } from 'fflate';
import type { CollisionMode, MapIR, Mat4, Mesh, Vec3 } from '../../ir';
import { RESKATE_PACKED, RESKATE_RAIL_PACKED, reskateMaterialId } from '../../surfaces';
import { textureBytes, writeGlb } from '../../util/glb';
import { railMesh, RAIL_RADIUS } from '../../rails';

const MODE: Record<CollisionMode, string> = {
  mesh: 'triangle_mesh', convex: 'convex_parts', hull: 'hull', none: 'none', water: 'water',
};

/** map.json material `surface` (audio/footstep family), from Studio's SURFACES list. */
const MATERIAL_SURFACE: Record<string, string> = {
  default: 'default', concrete: 'concrete', smooth_concrete: 'concrete', asphalt: 'asphalt',
  brick: 'brick', wood: 'wood', metal: 'metal', metal_grate: 'metal', marble: 'tile',
  plastic: 'plastic', glass: 'glass', grass: 'grass', dirt: 'dirt', water: 'water',
};

export interface ReskateExportOptions {
  /** Folder name inside the zip; also the default package name. */
  folder?: string;
  /** Include the Windows build script next to the map folder. */
  includeBat?: boolean;
  railRadius?: number;
  shadowDistances?: [number, number, number];
}

export function safeName(name: string, fallback = 'object'): string {
  const s = name.replace(/[^A-Za-z0-9._-]/g, '_');
  return s || fallback;
}

/** [right, up, forward, translation] rows: the basis columns of the game-space matrix. */
export function matrixRows(m: Mat4): number[] {
  return [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10], m[12], m[13], m[14]].map(round6);
}

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;
const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

export interface ReskateHandshake {
  mapJson: Record<string, unknown>;
  files: Record<string, Uint8Array>;
  warnings: string[];
}

export function buildHandshake(map: MapIR, opts: ReskateExportOptions = {}): ReskateHandshake {
  const warnings: string[] = [];
  const files: Record<string, Uint8Array> = {};
  const materials: Record<string, Record<string, unknown>> = {};
  const savedTextures = new Map<number, string>();
  const usedNames = new Set<string>();

  const unique = (base: string) => {
    let name = base, n = 1;
    while (usedNames.has(name)) name = `${base}_${++n}`;
    usedNames.add(name);
    return name;
  };

  const saveTexture = (index: number | undefined): string | undefined => {
    if (index === undefined) return undefined;
    if (savedTextures.has(index)) return savedTextures.get(index);
    const tex = map.textures[index];
    const enc = tex && textureBytes(tex);
    if (!enc) { warnings.push(`texture ${tex?.name ?? index}: no PNG/JPEG data, skipped`); return undefined; }
    let stem = safeName(tex.name.replace(/\.[^.]+$/, ''), `texture_${index}`);
    while ([...savedTextures.values()].includes(`textures/${stem}.${enc.ext}`)) stem += '_';
    const path = `textures/${stem}.${enc.ext}`;
    files[path] = enc.bytes;
    savedTextures.set(index, path);
    return path;
  };

  const materialKey = (index: number): string => {
    const mat = map.materials[index];
    const key = mat ? mat.name : 'default';
    if (materials[key]) return key;
    const entry: Record<string, unknown> = {
      surface: MATERIAL_SURFACE[mat?.surface ?? 'default'] ?? 'default',
      srgb: true,
    };
    if (mat) {
      entry.domain = 'surface';
      entry.shader_override = 'surface';
      entry.alpha_source = mat.alphaMode === 'opaque' ? 'constant' : 'base_color_texture';
      entry.alpha_cutoff = mat.alphaCutoff;
      entry.cast_shadows = true;
      entry.double_sided = mat.doubleSided;
      entry.transparent_shadow = mat.alphaMode !== 'opaque';
      entry.alpha = mat.alphaMode;
      entry.blend_method = mat.alphaMode === 'blend' ? 'blend' : 'clip';
      entry.roughness = mat.roughness;
      entry.metallic = mat.metallic;
      const tex = saveTexture(mat.textures.albedo);
      if (tex) entry.texture = tex;
      else warnings.push(`${mat.name}: no Base Color image texture`);
      const normal = saveTexture(mat.textures.normal);
      if (normal) entry.normal_texture = normal;
    }
    materials[key] = entry;
    return key;
  };

  const objects: Record<string, unknown>[] = [];
  const surfaceProfiles: Record<string, unknown> = {};

  for (const obj of map.objects) {
    const base = unique(safeName(obj.name));
    const rel = `meshes/${base}.glb`;
    const mesh = obj.mesh;
    if (!mesh.indices.length) { warnings.push(`${obj.name}: no triangles, skipped`); continue; }
    files[rel] = writeGlb(obj.name, mesh, map.materials, map.textures);
    const mode = obj.collision.mode;
    mesh.groups.forEach((group, primitive) => {
      const mat = map.materials[group.material];
      const surface = obj.collision.surface ?? mat?.surface ?? 'concrete';
      const packed = RESKATE_PACKED[surface] ?? RESKATE_PACKED.default;
      const record: Record<string, unknown> = {
        name: mesh.groups.length === 1 ? obj.name : `${obj.name} / section ${primitive + 1}`,
        placement_mode: 'authored_mesh',
        mesh: rel,
        primitive,
        material: materialKey(group.material),
        transform: matrixRows(obj.transform),
        static: true,
        collision_mode: MODE[mode],
        collision_material: reskateMaterialId(packed),
        collision_material_packed: packed,
      };
      if (!obj.render) {
        if (mode === 'none') return;
        record.render = false;
      }
      if (mesh.groups.length > 1 && mode === 'hull') {
        if (primitive === 0) record.collision_mesh = rel;
        else record.collision_mode = 'none';
      }
      objects.push(record);
    });
  }

  // Grind rails become invisible collision prisms. Retail maps carry thousands of rails, and
  // ReSkate caps collision parts, so rails are merged into one object per 64 m map cell.
  const radius = opts.railRadius ?? RAIL_RADIUS;
  const RAIL_CELL = 64;
  const cells = new Map<string, { names: string[]; positions: number[]; indices: number[] }>();
  for (const rail of map.rails) {
    const { positions, indices } = railMesh(rail.points, rail.closed, radius);
    if (!indices.length) { warnings.push(`rail ${rail.name}: no usable points`); continue; }
    const p0 = rail.points[0];
    const key = `${Math.floor(p0[0] / RAIL_CELL)}_${Math.floor(p0[2] / RAIL_CELL)}`;
    const cell = cells.get(key) ?? cells.set(key, { names: [], positions: [], indices: [] }).get(key)!;
    const base = cell.positions.length / 3;
    for (const v of positions) cell.positions.push(v);
    for (const i of indices) cell.indices.push(base + i);
    cell.names.push(rail.name);
  }
  for (const [key, cell] of cells) {
    const label = cell.names.length === 1 ? cell.names[0] : `rails ${key} (${cell.names.length})`;
    const name = unique(`grind_${safeName(label, 'rail')}`);
    const rel = `meshes/${name}.glb`;
    const idx = new Uint32Array(cell.indices);
    const mesh: Mesh = { positions: new Float32Array(cell.positions), indices: idx, groups: [{ start: 0, count: idx.length, material: -1 }] };
    files[rel] = writeGlb(label, mesh, [], []);
    objects.push({
      name: `${label} (grind curve)`,
      placement_mode: 'authored_mesh',
      render: false,
      collision_mesh: rel,
      transform: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      static: true,
      collision_mode: 'triangle_mesh',
      collision_material: reskateMaterialId(RESKATE_RAIL_PACKED),
      collision_material_packed: RESKATE_RAIL_PACKED,
      grind_curve: true,
    });
  }

  if (!objects.length) throw new Error('map has no buildable objects');
  if (!map.spawns.length) warnings.push("map has no spawn; ReSkate will use BAM's default spawn transform");

  const [near, medium, far] = opts.shadowDistances ?? [50, 250, 500];
  const mapJson: Record<string, unknown> = {
    format: 1,
    units: 'meters',
    up: 'y',
    forward: '-z',
    generator: 'skatemods map studio',
    materials,
    surface_profiles: surfaceProfiles,
    streaming_distances: { near, medium, far },
    objects,
    lights: map.lights.map(l => lightRecord(l)),
    audio_volumes: [],
    audio_emitters: [],
    interaction_prefabs: [],
    trigger_effects: [],
    vfx_prefabs: [],
    npc_routes: [],
    warnings: [...map.warnings, ...warnings],
  };
  if (map.spawns.length) {
    const s = map.spawns[0];
    mapJson.spawn = { name: s.name, position: s.position.map(round4), yaw: Math.round(s.yaw * 1000) / 1000 };
    if (map.spawns.length > 1) {
      // Extra spawns become bare fast-travel points (no bus shelter, players land on the point).
      mapJson.travel_points = map.spawns.slice(1).map((p, i) => ({
        name: p.name, source_name: p.name, position: p.position.map(round4),
        yaw: Math.round(p.yaw * 1000) / 1000, stop_name: p.name || `Spot ${i + 1}`, shelter: false,
      }));
    }
  }
  return { mapJson, files, warnings };
}

function lightRecord(l: MapIR['lights'][number]) {
  const dir: Vec3 = l.direction ?? [0, -1, 0];
  return {
    name: l.name, source_path: `/${l.name}`,
    type: l.kind,
    position: l.position,
    direction: dir,
    color_linear: l.color,
    energy: l.intensity,
    normalize_power: true,
    cast_shadow: l.kind === 'sun',
    use_custom_distance: true,
    cutoff_distance: l.range ?? 40,
    diffuse_factor: 1, specular_factor: 1,
    time_of_day: 127,
    native_entity_authored: false,
  };
}

/** Windows script that compiles and deploys the folder with ReSkate Studio's CLI. */
export function buildBat(folder: string): string {
  return [
    '@echo off',
    'setlocal',
    'rem Made by skatemods.com Map Studio. Put this next to reskate_cli.exe from ReSkate Studio,',
    `rem with the "${folder}" folder beside it, then double-click. Skate must be closed.`,
    '',
    'set "CLI=%~dp0reskate_cli.exe"',
    'if not exist "%CLI%" set "CLI=%RESKATE_CLI%"',
    'set "GAME=C:\\Program Files (x86)\\Steam\\steamapps\\common\\Skate"',
    `set "MAP=%~dp0${folder}"`,
    `set "PACKAGE=%USERPROFILE%\\Desktop\\${folder}_package"`,
    '',
    'if not exist "%CLI%" (',
    '  echo reskate_cli.exe was not found. Copy this .bat into the ReSkate Studio folder,',
    '  echo or set RESKATE_CLI to the full path of reskate_cli.exe.',
    '  goto end',
    ')',
    'if not exist "%MAP%\\map.json" (',
    '  echo Cannot find "%MAP%\\map.json". Keep the map folder next to this .bat.',
    '  goto end',
    ')',
    '',
    ':waitgame',
    'tasklist /fi "imagename eq Skate.exe" 2>nul | find /i "Skate.exe" >nul',
    'if errorlevel 1 goto build',
    'echo Skate is running. Close it, then press any key.',
    'pause >nul',
    'goto waitgame',
    '',
    ':build',
    '"%CLI%" compile-map "%GAME%" "%MAP%" "%PACKAGE%" --deploy',
    'if errorlevel 1 (echo BUILD FAILED. See the messages above.) else (echo Built and deployed. Start Skate.)',
    '',
    ':end',
    'echo.',
    'pause',
    '',
  ].join('\r\n');
}

/** The handshake as a zip: <folder>/map.json, <folder>/meshes, <folder>/textures, plus the .bat. */
export function writeReskateZip(map: MapIR, opts: ReskateExportOptions = {}): { zip: Uint8Array; warnings: string[] } {
  const folder = safeName(opts.folder ?? map.name, 'map');
  const hs = buildHandshake(map, opts);
  const entries: Record<string, Uint8Array> = {
    [`${folder}/map.json`]: strToU8(JSON.stringify(hs.mapJson, null, 2)),
  };
  for (const [path, bytes] of Object.entries(hs.files)) entries[`${folder}/${path}`] = bytes;
  if (opts.includeBat !== false) entries[`Build ${folder}.bat`] = strToU8(buildBat(folder));
  entries['README.txt'] = strToU8(readme(folder));
  return { zip: zipSync(entries, { level: 6 }), warnings: hs.warnings };
}

function readme(folder: string): string {
  return [
    `${folder}: a ReSkate map made with the skatemods.com Map Studio.`,
    '',
    'To play it you need skate. (Steam), ReSkate, and ReSkate Studio (which provides reskate_cli.exe).',
    `1. Unzip this next to reskate_cli.exe, so "${folder}" and "Build ${folder}.bat" sit beside it.`,
    `2. Close skate., then double-click "Build ${folder}.bat".`,
    '3. The script compiles the map and deploys it as a mod. Start skate. through ReSkate.',
    '',
    `The "${folder}" folder is a ReSkate Studio map export, so you can also open or rebuild it from ReSkate Studio.`,
    '',
  ].join('\r\n');
}
