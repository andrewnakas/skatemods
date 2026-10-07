// Mesh datablock -> polygon soup, for every layout Blender has written since 2.8:
//   legacy (2.8 - 3.x):   CD_MVERT / CD_MPOLY / CD_MLOOP / CD_MLOOPUV CustomData layers
//   generic (3.4 - 4.x):  "position" float3, ".corner_vert" int, poly_offset_indices,
//                         "material_index", "sharp_face", float2 corner UV maps
//   AttributeStorage (5.x): the same attributes in Mesh.attribute_storage.dna_attributes

import type { BlendFile, StructView } from './file';
import type { PolyMeshInput } from './geometry';

type Kind = 'float' | 'float2' | 'float3' | 'int32' | 'int8' | 'bool' | 'other';
type Domain = 'point' | 'edge' | 'face' | 'corner';

interface Attr {
  name: string;
  domain: Domain;
  kind: Kind;
  ptr: number;
  /** AttributeStorage single-value storage: `ptr` holds one element to broadcast. */
  single: boolean;
  /** Raw CustomData type (legacy struct layers), -1 for AttributeStorage. */
  cdType: number;
  activeRnd: number;
  scope: number;
}

// eCustomDataType values used here.
const CD_MVERT = 0, CD_PROP_FLOAT = 10, CD_PROP_INT32 = 11, CD_MLOOPUV = 16, CD_MPOLY = 25, CD_MLOOP = 26,
  CD_PROP_INT8 = 45, CD_PROP_FLOAT3 = 48, CD_PROP_FLOAT2 = 49, CD_PROP_BOOL = 50;

function cdKind(t: number): Kind {
  switch (t) {
    case CD_PROP_FLOAT: return 'float';
    case CD_PROP_INT32: return 'int32';
    case CD_PROP_INT8: return 'int8';
    case CD_PROP_FLOAT3: return 'float3';
    case CD_PROP_FLOAT2: return 'float2';
    case CD_PROP_BOOL: return 'bool';
    default: return 'other';
  }
}

// bke::AttrType values (AttributeStorage).
function attrKind(t: number): Kind {
  switch (t) {
    case 0: return 'bool';
    case 1: return 'int8';
    case 3: return 'int32';
    case 5: return 'float';
    case 6: return 'float2';
    case 7: return 'float3';
    default: return 'other';
  }
}
const ATTR_DOMAINS: Array<Domain | undefined> = ['point', 'edge', 'face', 'corner'];

function customDataLayers(mesh: StructView, names: string[], domain: Domain): Attr[] {
  const cd = mesh.sub(names);
  if (!cd) return [];
  const F = mesh.file;
  const total = cd.num('totlayer');
  const r = F.resolve(cd.ptr('layers'), mesh.scope);
  const def = F.struct('CustomDataLayer');
  if (!r || !def || total <= 0) return [];
  const out: Attr[] = [];
  for (let i = 0; i < total; i++) {
    const off = r.offset + i * def.size;
    if (off + def.size > r.block.offset + r.block.len) break;
    const l = F.viewBlock(r.block, 'CustomDataLayer', off)!;
    const type = l.num('type');
    out.push({
      name: l.str('name'), domain, kind: cdKind(type), ptr: l.ptr('data'), single: false,
      cdType: type, activeRnd: l.num('active_rnd'), scope: mesh.scope,
    });
  }
  return out;
}

function attributeStorage(mesh: StructView): Attr[] {
  const st = mesh.sub('attribute_storage');
  if (!st) return [];
  const F = mesh.file;
  const n = st.num('dna_attributes_num');
  const r = F.resolve(st.ptr('dna_attributes'), mesh.scope);
  const def = F.struct('Attribute');
  if (!r || !def || n <= 0) return [];
  const out: Attr[] = [];
  for (let i = 0; i < n; i++) {
    const off = r.offset + i * def.size;
    if (off + def.size > r.block.offset + r.block.len) break;
    const a = F.viewBlock(r.block, 'Attribute', off)!;
    const domain = ATTR_DOMAINS[a.num('domain')];
    if (!domain) continue;
    const storage = a.num('storage_type');
    const holder = F.view(a.ptr('data'), mesh.scope, storage === 1 ? 'AttributeSingle' : 'AttributeArray');
    if (!holder) continue;
    // `is_single` arrays (5.1+ written for 5.0 compatibility) are still full arrays.
    out.push({
      name: a.derefString('name'), domain, kind: attrKind(a.num('data_type')), ptr: holder.ptr('data'),
      single: storage === 1, cdType: -1, activeRnd: 0, scope: mesh.scope,
    });
  }
  return out;
}

const COMPS: Record<Kind, number> = { float: 1, float2: 2, float3: 3, int32: 1, int8: 1, bool: 1, other: 0 };
const ELEM: Record<Kind, number> = { float: 4, float2: 8, float3: 12, int32: 4, int8: 1, bool: 1, other: 0 };

function readAttr(F: BlendFile, a: Attr, count: number): Float32Array | Int32Array | Uint8Array | null {
  const r = F.resolve(a.ptr, a.scope);
  if (!r) return null;
  const comps = COMPS[a.kind], esz = ELEM[a.kind];
  const avail = r.block.offset + r.block.len - r.offset;
  const n = count * comps;
  if (a.kind === 'bool' || a.kind === 'int8') {
    const out = new Uint8Array(n);
    for (let i = 0; i < count; i++) {
      const src = a.single ? 0 : i;
      if (src * esz >= avail) break;
      out[i] = a.kind === 'int8' ? F.i8(r.offset + src) : F.u8(r.offset + src);
    }
    return out;
  }
  const isFloat = a.kind.startsWith('float');
  if (F.le && !a.single && count * esz <= avail) {
    // Fast path: copy into an aligned buffer and view it directly.
    const buf = F.bytes.slice(r.offset, r.offset + count * esz).buffer;
    return isFloat ? new Float32Array(buf) : new Int32Array(buf);
  }
  const out = isFloat ? new Float32Array(n) : new Int32Array(n);
  for (let i = 0; i < count; i++) {
    const src = a.single ? 0 : i;
    if ((src + 1) * esz > avail) break;
    for (let c = 0; c < comps; c++) {
      const o = r.offset + src * esz + c * 4;
      out[i * comps + c] = isFloat ? F.f32(o) : F.i32(o);
    }
  }
  return out;
}

/** Reads `field` (comps floats or ints) from an array of DNA structs. */
function readStructArray(F: BlendFile, ptr: number, scope: number, type: string, count: number, field: string, comps: number, float: boolean): Float32Array | Int32Array | null {
  const r = F.resolve(ptr, scope);
  const st = F.struct(type);
  if (!r || !st) return null;
  const f = st.byName.get(field);
  if (!f) return null;
  const out = float ? new Float32Array(count * comps) : new Int32Array(count * comps);
  const end = r.block.offset + r.block.len;
  for (let i = 0; i < count; i++) {
    const base = r.offset + i * st.size + f.offset;
    if (base + f.size > end) break;
    const v = F.viewBlock(r.block, type, r.offset + i * st.size)!;
    for (let c = 0; c < comps; c++) out[i * comps + c] = v.num(field, 0, c);
  }
  return out;
}

export interface MeshData extends PolyMeshInput {
  vertexCount: number;
  faceCount: number;
  uvName?: string;
}

/** Extracts a polygon mesh from a Mesh datablock view. Returns null when it has no readable geometry. */
export function readMesh(mesh: StructView, warn: (s: string) => void, label: string): MeshData | null {
  const F = mesh.file;
  const nV = mesh.num(['totvert', 'verts_num']);
  const nF = mesh.num(['totpoly', 'faces_num']);
  const nC = mesh.num(['totloop', 'corners_num']);
  if (nV <= 0) return null;

  const attrs: Attr[] = [
    ...attributeStorage(mesh),
    ...customDataLayers(mesh, ['vdata', 'vert_data'], 'point'),
    ...customDataLayers(mesh, ['pdata', 'face_data'], 'face'),
    ...customDataLayers(mesh, ['ldata', 'corner_data'], 'corner'),
  ];
  const find = (domain: Domain, name: string, kind?: Kind) =>
    attrs.find((a) => a.domain === domain && a.name === name && (!kind || a.kind === kind) && a.ptr);
  const findCd = (domain: Domain, cdType: number) => attrs.find((a) => a.domain === domain && a.cdType === cdType && a.ptr);

  // Positions.
  let positions: Float32Array | null = null;
  const pos = find('point', 'position', 'float3');
  if (pos) positions = readAttr(F, pos, nV) as Float32Array;
  else {
    const mv = findCd('point', CD_MVERT);
    const ptr = mv?.ptr || mesh.ptr('mvert');
    if (ptr) positions = readStructArray(F, ptr, mesh.scope, 'MVert', nV, 'co', 3, true) as Float32Array;
  }
  if (!positions) { warn(`${label}: mesh has no readable vertex positions`); return null; }

  // Faces and corners.
  let faceOffsets: Int32Array | null = null;
  let cornerVerts: Int32Array | null = null;
  let materialIndex: Int32Array | Uint8Array | null = null;
  let sharpFace: Uint8Array | null = null;

  const offPtr = mesh.ptr(['poly_offset_indices', 'face_offset_indices']);
  if (offPtr && nF > 0) {
    faceOffsets = readAttr(F, { name: '', domain: 'face', kind: 'int32', ptr: offPtr, single: false, cdType: -1, activeRnd: 0, scope: mesh.scope }, nF + 1) as Int32Array;
  }
  const mpolyLayer = findCd('face', CD_MPOLY);
  const mpolyPtr = mpolyLayer?.ptr || mesh.ptr('mpoly');
  if (!faceOffsets && mpolyPtr && nF > 0) {
    const starts = readStructArray(F, mpolyPtr, mesh.scope, 'MPoly', nF, 'loopstart', 1, false);
    const sizes = readStructArray(F, mpolyPtr, mesh.scope, 'MPoly', nF, 'totloop', 1, false);
    if (starts && sizes) {
      // MPoly may (in theory) be unordered: rebuild corner order face by face.
      faceOffsets = new Int32Array(nF + 1);
      for (let f = 0; f < nF; f++) faceOffsets[f + 1] = faceOffsets[f] + sizes[f];
      const ordered = starts.every((s, f) => s === faceOffsets![f]);
      if (!ordered) (faceOffsets as Int32Array & { starts?: Int32Array }).starts = starts as Int32Array;
    }
  }
  if (mpolyPtr && nF > 0) {
    const st = F.struct('MPoly');
    if (st?.byName.has('mat_nr')) materialIndex = readStructArray(F, mpolyPtr, mesh.scope, 'MPoly', nF, 'mat_nr', 1, false) as Int32Array;
    if (st?.byName.has('flag')) {
      const flags = readStructArray(F, mpolyPtr, mesh.scope, 'MPoly', nF, 'flag', 1, false);
      if (flags) { sharpFace = new Uint8Array(nF); for (let f = 0; f < nF; f++) sharpFace[f] = flags[f] & 1 ? 0 : 1; }
    }
  }

  const cv = find('corner', '.corner_vert', 'int32');
  if (cv) cornerVerts = readAttr(F, cv, nC) as Int32Array;
  else {
    const ml = findCd('corner', CD_MLOOP);
    const ptr = ml?.ptr || mesh.ptr('mloop');
    if (ptr) cornerVerts = readStructArray(F, ptr, mesh.scope, 'MLoop', nC, 'v', 1, false) as Int32Array;
  }

  const mi = find('face', 'material_index');
  if (mi && (mi.kind === 'int32' || mi.kind === 'int8')) materialIndex = readAttr(F, mi, nF) as Int32Array;
  const sf = find('face', 'sharp_face', 'bool');
  if (sf) sharpFace = readAttr(F, sf, nF) as Uint8Array;

  if (!faceOffsets || !cornerVerts || nF <= 0) {
    if (nF > 0) warn(`${label}: mesh face data could not be read`);
    return null;
  }

  // Reorder corners when legacy MPoly loopstarts are not sequential.
  const starts = (faceOffsets as Int32Array & { starts?: Int32Array }).starts;
  const reorder = (arr: ArrayLike<number>, comps: number): Float32Array | Int32Array => {
    const out = arr instanceof Float32Array ? new Float32Array(faceOffsets!.at(-1)! * comps) : new Int32Array(faceOffsets!.at(-1)! * comps);
    for (let f = 0; f < nF; f++) {
      for (let k = 0; k < faceOffsets![f + 1] - faceOffsets![f]; k++) {
        for (let c = 0; c < comps; c++) out[(faceOffsets![f] + k) * comps + c] = arr[(starts![f] + k) * comps + c];
      }
    }
    return out;
  };

  // UV maps: modern float2 corner attributes, else legacy MLoopUV layers.
  let uvs: Array<{ name: string; data: Float32Array }> = [];
  const f2 = attrs.filter((a) => a.domain === 'corner' && a.kind === 'float2' && a.ptr);
  const legacyUv = attrs.filter((a) => a.domain === 'corner' && a.cdType === CD_MLOOPUV && a.ptr);
  const preferred = mesh.derefString(['default_uv_map_attribute']) || mesh.derefString(['active_uv_map_attribute']);
  const pick = (list: Attr[]): Attr[] => {
    if (!list.length) return [];
    let first = (preferred && list.find((a) => a.name === preferred)) || list[list[0].activeRnd] || list[0];
    if (first.name.startsWith('.')) first = list.find((a) => !a.name.startsWith('.')) ?? first;
    return [first, ...list.filter((a) => a !== first && !a.name.startsWith('.'))];
  };
  for (const a of pick(f2)) uvs.push({ name: a.name, data: readAttr(F, a, nC) as Float32Array });
  if (!uvs.length) {
    for (const a of pick(legacyUv)) {
      const d = readStructArray(F, a.ptr, mesh.scope, 'MLoopUV', nC, 'uv', 2, true) as Float32Array | null;
      if (d) uvs.push({ name: a.name, data: d });
    }
  }
  uvs = uvs.slice(0, 2);

  // Sanity: corner indices in range.
  for (let i = 0; i < cornerVerts.length; i++) {
    if (cornerVerts[i] < 0 || cornerVerts[i] >= nV) { warn(`${label}: corner index out of range`); return null; }
  }

  const out: MeshData = {
    positions,
    faceOffsets,
    cornerVerts: starts ? reorder(cornerVerts, 1) : cornerVerts,
    vertexCount: nV,
    faceCount: nF,
  };
  if (materialIndex) out.materialIndex = materialIndex;
  if (sharpFace) out.sharpFace = sharpFace;
  if (uvs[0]) { out.uv = starts ? reorder(uvs[0].data, 2) : uvs[0].data; out.uvName = uvs[0].name; }
  if (uvs[1]) out.uv2 = starts ? reorder(uvs[1].data, 2) : uvs[1].data;
  return out;
}
