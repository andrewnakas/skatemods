// IDProperty (custom properties / Python PropertyGroups) -> plain JS values.

import type { StructView } from './file';

export type IDValue = string | number | boolean | null | IDValue[] | { [key: string]: IDValue };

const IDP_STRING = 0, IDP_INT = 1, IDP_FLOAT = 2, IDP_ARRAY = 5, IDP_GROUP = 6, IDP_ID = 7,
  IDP_DOUBLE = 8, IDP_IDPARRAY = 9, IDP_BOOLEAN = 10;

const td = new TextDecoder();

export function readIDProperty(p: StructView, depth = 0): IDValue {
  const F = p.file;
  const type = p.num('type');
  const data = p.sub('data');
  if (!data || depth > 32) return null;
  const len = p.num('len');
  const valAt = data.at('val');
  switch (type) {
    case IDP_STRING: {
      const bytes = F.data(data.ptr('pointer'), p.scope);
      if (!bytes) return '';
      let n = Math.min(bytes.length, len > 0 ? len : bytes.length);
      while (n > 0 && bytes[n - 1] === 0) n--;
      const nul = bytes.subarray(0, n).indexOf(0);
      return td.decode(bytes.subarray(0, nul >= 0 ? nul : n));
    }
    case IDP_INT: return data.num('val');
    case IDP_BOOLEAN: return data.num('val') !== 0;
    case IDP_FLOAT: return F.f32(valAt);
    case IDP_DOUBLE: return F.f64(valAt);
    case IDP_ARRAY: {
      const sub = p.num('subtype');
      const r = F.resolve(data.ptr('pointer'), p.scope);
      if (!r) return [];
      const out: IDValue[] = [];
      const size = sub === IDP_DOUBLE ? 8 : sub === IDP_BOOLEAN ? 1 : 4;
      const end = r.block.offset + r.block.len;
      for (let i = 0; i < len && r.offset + (i + 1) * size <= end; i++) {
        const o = r.offset + i * size;
        out.push(sub === IDP_FLOAT ? F.f32(o) : sub === IDP_DOUBLE ? F.f64(o) : sub === IDP_BOOLEAN ? F.u8(o) !== 0 : F.i32(o));
      }
      return out;
    }
    case IDP_GROUP: return readIDGroupList(data.listFirst('group'), p, depth + 1);
    case IDP_ID: {
      const id = F.view(data.ptr('pointer'), p.scope);
      return id ? idName(id) : null;
    }
    case IDP_IDPARRAY: {
      const r = F.resolve(data.ptr('pointer'), p.scope);
      if (!r) return [];
      const out: IDValue[] = [];
      for (let i = 0; i < len; i++) {
        const v = F.viewBlock(r.block, 'IDProperty', r.offset + i * p.def.size);
        if (!v || v.offset + p.def.size > r.block.offset + r.block.len) break;
        out.push(readIDProperty(v, depth + 1));
      }
      return out;
    }
    default: return null;
  }
}

function readIDGroupList(first: number, parent: StructView, depth: number): { [key: string]: IDValue } {
  const out: { [key: string]: IDValue } = {};
  for (const child of parent.file.list(first, parent.scope, 'IDProperty')) {
    out[child.str('name')] = readIDProperty(child, depth);
  }
  return out;
}

/** An ID's custom + system (Python-defined, Blender >= 4.5/5.0) properties merged into one object. */
export function idProperties(idOwner: StructView): { [key: string]: IDValue } {
  const id = idOwner.sub('id') ?? idOwner;
  const out: { [key: string]: IDValue } = {};
  for (const field of ['properties', 'system_properties']) {
    const g = id.deref(field, 'IDProperty');
    if (!g) continue;
    const v = readIDProperty(g);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k, val] of Object.entries(v)) {
        // Groups with the same name in both stores are merged (system values win).
        const prev = out[k];
        if (prev && typeof prev === 'object' && !Array.isArray(prev) && val && typeof val === 'object' && !Array.isArray(val)) {
          out[k] = { ...prev, ...val };
        } else out[k] = val;
      }
    }
  }
  return out;
}

/** ID name without its two-letter type prefix ("OBCube" -> "Cube"). */
export function idName(v: StructView): string {
  const id = v.sub('id') ?? v;
  return id.str('name').slice(2);
}
