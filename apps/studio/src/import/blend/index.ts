// .blend -> MapIR. Pure TS, safe for a Web Worker.
//
//   const { map, missingImages, version } = readBlend(bytes, { name: 'park' });
//   // ask the user for missingImages, then for each file:
//   attachImage(map, file.name, new Uint8Array(await file.arrayBuffer()));
//
// Reads objects (mesh, legacy curve, empty, light), their world transforms, materials
// (Principled BSDF + Image Texture), packed images, ReSkate Studio `sk8_object` /
// `sk8_material` properties and spawn empties. Modifiers are not evaluated.

import { emptyMap, type CollisionMode, type Light, type MapIR, type MapObject, type Rail, type Vec3 } from '../../ir';
import { BlendFile, type BHead } from './file';
import { readCurve } from './curve';
import { buildMesh, conv, localMatrix, mul, toGameMatrix } from './geometry';
import { idName, idProperties, type IDValue } from './idprop';
import { MaterialReader } from './material';
import { readMesh } from './mesh';

export { attachImage, sniffImage } from './material';
export { BlendError, BlendFile, StructView } from './file';

export interface ReadBlendOptions {
  name?: string;
  /** Testing aid: ignore world matrices stored in the file (pre-4.2) and rebuild them from loc/rot/scale. */
  recomputeMatrices?: boolean;
}

export interface ReadBlendResult {
  map: MapIR;
  /** File paths of images that are referenced but not packed; supply them with attachImage(). */
  missingImages: string[];
  /** Blender version that saved the file, e.g. "4.5". */
  version: string;
}

// Object types (DNA_object_types.h).
const OB_EMPTY = 0, OB_MESH = 1, OB_CURVES_LEGACY = 2, OB_LAMP = 10;
// Object.restrictflag / visibility_flag.
const OB_HIDE_VIEWPORT = 1, OB_HIDE_RENDER = 4;
// Parent types.
const PAROBJECT = 0;

/** ReSkate Studio COLLISION_MODES, in EnumProperty item order (the stored integer). */
const SK8_COLLISION_MODES = ['triangle_mesh', 'convex_parts', 'hull', 'none', 'water'] as const;
const COLLISION_MAP: Record<string, CollisionMode> = {
  triangle_mesh: 'mesh', convex_parts: 'convex', hull: 'hull', none: 'none', water: 'water',
};

const LEGACY_SPAWN_MESHES = new Set(['sk8_playerspawn', 'sk8_player_spawn']);

function isGroup(v: IDValue | undefined): v is { [k: string]: IDValue } {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function collisionFrom(props: { [k: string]: IDValue }): CollisionMode | undefined {
  const g = props.sk8_object;
  let raw: IDValue | undefined = isGroup(g) ? g.collision_mode : undefined;
  if (raw === undefined) raw = props.sk8_collision_mode;
  if (typeof raw === 'number') raw = SK8_COLLISION_MODES[raw];
  if (typeof raw === 'string' && COLLISION_MAP[raw]) return COLLISION_MAP[raw];
  if (isGroup(g)) return 'mesh'; // group present, enum at its default
  return undefined;
}

export function readBlend(bytes: Uint8Array, opts: ReadBlendOptions = {}): ReadBlendResult {
  const F = new BlendFile(bytes);
  const version = F.versionString;
  const map = emptyMap(opts.name ?? 'blend', `blend ${version}`);
  const warnings = new Set<string>();
  const warn = (s: string) => { if (!warnings.has(s)) { warnings.add(s); map.warnings.push(s); } };
  const mats = new MaterialReader(F, map, warn);

  // Linked (library) data shows up as ID placeholder blocks.
  const idNameOf = (b: BHead) => {
    const f = F.struct('ID')?.byName.get('name');
    return f ? F.cstr(b.offset + f.offset, f.size) : '';
  };
  const linked = F.blocks.filter((b) => b.code === 'ID').map(idNameOf);
  const linkedObjects = linked.filter((n) => n.startsWith('OB')).map((n) => n.slice(2));
  if (linkedObjects.length) warn(`${linkedObjects.length} object(s) are linked from other .blend files and were skipped: ${linkedObjects.slice(0, 5).join(', ')}${linkedObjects.length > 5 ? ', ...' : ''}`);
  else if (linked.length) warn(`${linked.length} datablock(s) are linked from other .blend files and could not be read`);

  // Collection membership.
  const collectionsOf = new Map<number, string[]>();
  for (const gb of F.idBlocks('GR')) {
    const gr = F.viewBlock(gb);
    if (!gr) continue;
    const gname = idName(gr);
    for (const co of gr.list('gobject', 'CollectionObject')) {
      const ob = F.block(co.ptr('ob'));
      if (!ob) continue;
      const list = collectionsOf.get(ob.index) ?? [];
      list.push(gname);
      collectionsOf.set(ob.index, list);
    }
  }

  // World matrices (Blender space), memoised per Object block.
  const worldCache = new Map<number, number[]>();
  const worldOf = (b: BHead, depth = 0): number[] => {
    const cached = worldCache.get(b.index);
    if (cached) return cached;
    const ob = F.viewBlock(b)!;
    let m: number[] | null = null;
    if (!opts.recomputeMatrices) {
      const stored = ob.field(['obmat', 'object_to_world']);
      if (stored && !stored.isPtr && stored.count === 16) m = ob.nums(stored.name);
    }
    if (!m) {
      const local = localMatrix({
        loc: ob.nums('loc'), dloc: ob.nums('dloc'),
        rot: ob.nums('rot'), drot: ob.nums('drot'),
        quat: ob.nums('quat'), dquat: ob.nums('dquat'),
        rotAxis: ob.nums('rotAxis'), rotAngle: ob.num('rotAngle'),
        drotAxis: ob.nums('drotAxis'), drotAngle: ob.num('drotAngle'),
        rotmode: ob.num('rotmode', 1),
        scale: ob.nums('size'), dscale: ob.has('dscale') ? ob.nums('dscale') : [1, 1, 1],
      });
      const pb = F.block(ob.ptr('parent'));
      if (pb && pb.code === 'OB' && depth < 64) {
        if ((ob.num('partype') & 15) !== PAROBJECT) warn(`${idName(ob)}: parented to a bone/vertex; treated as a plain object parent`);
        m = mul(mul(worldOf(pb, depth + 1), ob.nums('parentinv')), local);
      } else m = local;
      if (ob.listFirst('constraints')) warn(`${idName(ob)}: constraints are ignored`);
    }
    worldCache.set(b.index, m);
    return m;
  };

  const sk8Objects: Record<string, IDValue> = {};

  for (const b of F.idBlocks('OB')) {
    const ob = F.viewBlock(b);
    if (!ob) continue;
    const name = idName(ob);
    const id = ob.sub('id');
    if (id?.ptr('lib')) { warn(`${name} is linked from a library and was skipped`); continue; }
    const type = ob.num('type');
    const dataBlock = F.block(ob.ptr('data'));
    if (dataBlock && dataBlock.code === 'ID') { warn(`${name}: its data is linked from a library and was skipped`); continue; }
    const restrict = ob.num('restrictflag') | ob.num('visibility_flag');
    const hideRender = (restrict & OB_HIDE_RENDER) !== 0;
    const props = idProperties(ob);
    const collections = collectionsOf.get(b.index) ?? [];

    if (type === OB_EMPTY) {
      if (/^spawn/i.test(name)) {
        const w = worldOf(b);
        const f = conv([w[4], w[5], w[6]]);
        map.spawns.push({ name, position: conv([w[12], w[13], w[14]]), yaw: Math.atan2(f[0], f[2]) * 180 / Math.PI });
      }
      continue;
    }

    if (type === OB_MESH) {
      const w = worldOf(b);
      if (LEGACY_SPAWN_MESHES.has(name.toLowerCase())) {
        const f = conv([w[4], w[5], w[6]]);
        map.spawns.push({ name, position: conv([w[12], w[13], w[14]]), yaw: Math.atan2(f[0], f[2]) * 180 / Math.PI });
        continue;
      }
      const me = dataBlock && dataBlock.code === 'ME' ? F.viewBlock(dataBlock) : null;
      if (!me) continue;
      const nMods = ob.list('modifiers').length;
      if (nMods) warn(`${name} has ${nMods} unapplied modifier${nMods > 1 ? 's' : ''}; base mesh used`);
      if (me.has('key') && me.ptr('key')) warn(`${name}: shape keys ignored; basis used`);
      const data = readMesh(me, warn, name);
      if (!data) continue;

      // Material slots: object-level (matbits) or mesh-level.
      const obTot = ob.num('totcol'), meTot = me.num('totcol');
      const slots = Math.max(obTot, meTot);
      const obMats = F.ptrArray(ob.ptr('mat'), obTot, ob.scope);
      const meMats = F.ptrArray(me.ptr('mat'), meTot, me.scope);
      const bitsData = F.data(ob.ptr('matbits'), ob.scope);
      const slotPtr: number[] = [];
      for (let i = 0; i < slots; i++) {
        const useOb = bitsData && i < bitsData.length && bitsData[i] !== 0 && i < obMats.length;
        slotPtr.push(useOb ? obMats[i] : (meMats[i] ?? 0));
      }
      const slotCache = new Map<number, number>();
      const slotToMaterial = (slot: number) => {
        const s = slots ? Math.min(Math.max(slot, 0), slots - 1) : -1;
        let idx = slotCache.get(s);
        if (idx === undefined) {
          idx = s < 0 ? mats.defaultMaterial() : mats.material(slotPtr[s]);
          slotCache.set(s, idx);
        }
        return idx;
      };
      const mesh = buildMesh(data, slotToMaterial);
      if (!mesh.indices.length) continue;

      const obj: MapObject = {
        name,
        mesh,
        transform: toGameMatrix(w),
        render: !hideRender,
        collision: { mode: 'mesh' },
        extra: {
          blend: { collections, hideViewport: (restrict & OB_HIDE_VIEWPORT) !== 0, mesh: idName(me), uvMap: data.uvName },
        },
      };
      const mode = collisionFrom(props);
      if (mode) obj.collision.mode = mode;
      if (isGroup(props.sk8_object)) {
        obj.extra!.sk8_object = props.sk8_object;
        sk8Objects[name] = props.sk8_object;
      }
      map.objects.push(obj);
      continue;
    }

    if (type === OB_CURVES_LEGACY) {
      const cu = dataBlock && dataBlock.code === 'CU' ? F.viewBlock(dataBlock) : null;
      if (!cu) continue;
      const nMods = ob.list('modifiers').length;
      if (nMods) warn(`${name} has ${nMods} unapplied modifier${nMods > 1 ? 's' : ''}; base curve used`);
      const lines = readCurve(cu, worldOf(b), warn, name);
      lines.forEach((l, i) => {
        if (l.points.length < 2) return;
        const rail: Rail = {
          name: lines.length > 1 ? `${name}.${i}` : name,
          points: l.points,
          closed: l.closed,
          extra: { blend: { collections, spline: l.kind, hideRender } },
        };
        if (isGroup(props.sk8_grind_curve)) rail.extra!.sk8_grind_curve = props.sk8_grind_curve;
        if (isGroup(props.sk8_object)) rail.extra!.sk8_object = props.sk8_object;
        map.rails.push(rail);
      });
      continue;
    }

    if (type === OB_LAMP) {
      const la = dataBlock ? F.viewBlock(dataBlock) : null;
      if (!la) continue;
      const w = worldOf(b);
      const lt = la.num('type');
      const kind: Light['kind'] = lt === 1 ? 'sun' : lt === 2 ? 'spot' : 'point';
      const dir = conv([-w[8], -w[9], -w[10]]);
      const len = Math.hypot(...dir) || 1;
      const light: Light = {
        name, kind,
        position: conv([w[12], w[13], w[14]]),
        color: [la.num('r', 1), la.num('g', 1), la.num('b', 1)] as Vec3,
        intensity: la.num('energy', 1),
      };
      if (kind !== 'point') light.direction = dir.map((v) => v / len) as Vec3;
      map.lights.push(light);
      continue;
    }
    // Cameras, armatures, text, metaballs, new Curves, grease pencil, ...: not map content.
  }

  const blendExtra: Record<string, unknown> = { version, fileVersion: F.fileVersion };
  if (Object.keys(sk8Objects).length) blendExtra.sk8_object = sk8Objects;
  if (Object.keys(mats.sk8Materials).length) blendExtra.sk8_material = mats.sk8Materials;
  map.extra = { blend: blendExtra };

  if (!map.objects.length && !map.rails.length) warn('No mesh or curve objects found in the .blend');
  return { map, missingImages: [...mats.missing], version };
}

