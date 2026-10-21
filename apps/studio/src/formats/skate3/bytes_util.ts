// SPDX-License-Identifier: GPL-3.0-or-later
// Byte helpers shared by the Skate 3 writers (ports of sk3/*.py): a growable big-endian byte
// builder, struct-style readers, and string codecs matching Python's latin1/ascii/utf-8 encodes.

export const M64 = (1n << 64n) - 1n;

export function concat(parts: readonly Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function zeros(n: number): Uint8Array {
  return new Uint8Array(n);
}

/** Python `s.encode('latin1')` (throws past U+00FF). */
export function latin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c > 0xFF) throw new Error(`latin1: cannot encode U+${c.toString(16)}`);
    out[i] = c;
  }
  return out;
}

/** Python `s.encode('ascii')` (throws past U+007F). */
export function ascii(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c > 0x7F) throw new Error(`ascii: cannot encode U+${c.toString(16)}`);
    out[i] = c;
  }
  return out;
}

export function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function decodeLatin1(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

export function decodeUtf8(b: Uint8Array): string {
  return new TextDecoder('utf-8').decode(b);
}

export function fromHex(h: string): Uint8Array {
  const s = h.replace(/\s+/g, '');
  if (s.length % 2) throw new Error('odd hex length');
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) {
    const v = parseInt(s.substr(2 * i, 2), 16);
    if (Number.isNaN(v)) throw new Error(`bad hex at ${2 * i}`);
    out[i] = v;
  }
  return out;
}

export function toHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}

/** Index of byte `v` in `b` from `from`, or throw (Python bytes.index). */
export function indexOfByte(b: Uint8Array, v: number, from = 0): number {
  const i = b.indexOf(v, from);
  if (i < 0) throw new Error('substring not found');
  return i;
}

/** NUL-terminated string at `o` (latin1). */
export function cstr(b: Uint8Array, o: number): string {
  return decodeLatin1(b.subarray(o, indexOfByte(b, 0, o)));
}

export function dv(b: Uint8Array): DataView {
  return new DataView(b.buffer, b.byteOffset, b.byteLength);
}

export function u32be(b: Uint8Array, o: number): number {
  return dv(b).getUint32(o, false);
}

export function u16be(b: Uint8Array, o: number): number {
  return dv(b).getUint16(o, false);
}

export function u64be(b: Uint8Array, o: number): bigint {
  return dv(b).getBigUint64(o, false);
}

export function f32be(b: Uint8Array, o: number): number {
  return dv(b).getFloat32(o, false);
}

export function putU32be(b: Uint8Array, o: number, v: number): void {
  dv(b).setUint32(o, v >>> 0, false);
}

export function putU64be(b: Uint8Array, o: number, v: bigint): void {
  dv(b).setBigUint64(o, BigInt.asUintN(64, v), false);
}

/** Growable byte buffer with struct.pack-style appenders (big-endian unless noted). */
export class ByteWriter {
  buf: Uint8Array;
  length = 0;

  constructor(capacity = 256) {
    this.buf = new Uint8Array(Math.max(16, capacity));
  }

  private grow(extra: number): void {
    const need = this.length + extra;
    if (need <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < need) cap *= 2;
    const nb = new Uint8Array(cap);
    nb.set(this.buf.subarray(0, this.length));
    this.buf = nb;
  }

  private view(): DataView {
    return new DataView(this.buf.buffer, this.buf.byteOffset, this.buf.byteLength);
  }

  u8(v: number): this {
    this.grow(1);
    this.buf[this.length++] = v & 0xFF;
    return this;
  }

  u16(v: number): this {
    this.grow(2);
    this.view().setUint16(this.length, v & 0xFFFF, false);
    this.length += 2;
    return this;
  }

  u32(...vs: number[]): this {
    this.grow(4 * vs.length);
    const d = this.view();
    for (const v of vs) {
      if (!Number.isInteger(v) || v < 0 || v > 0xFFFFFFFF) throw new Error(`u32 out of range: ${v}`);
      d.setUint32(this.length, v, false);
      this.length += 4;
    }
    return this;
  }

  u32le(...vs: number[]): this {
    this.grow(4 * vs.length);
    const d = this.view();
    for (const v of vs) {
      if (!Number.isInteger(v) || v < 0 || v > 0xFFFFFFFF) throw new Error(`u32 out of range: ${v}`);
      d.setUint32(this.length, v, true);
      this.length += 4;
    }
    return this;
  }

  u64(...vs: bigint[]): this {
    this.grow(8 * vs.length);
    const d = this.view();
    for (const v of vs) {
      if (v < 0n || v > M64) throw new Error(`u64 out of range: ${v}`);
      d.setBigUint64(this.length, v, false);
      this.length += 8;
    }
    return this;
  }

  f32(...vs: number[]): this {
    this.grow(4 * vs.length);
    const d = this.view();
    for (const v of vs) {
      d.setFloat32(this.length, v, false);
      this.length += 4;
    }
    return this;
  }

  bytes(b: Uint8Array): this {
    this.grow(b.length);
    this.buf.set(b, this.length);
    this.length += b.length;
    return this;
  }

  zeros(n: number): this {
    if (n < 0) throw new Error('negative pad');
    this.grow(n);
    this.buf.fill(0, this.length, this.length + n);
    this.length += n;
    return this;
  }

  /** Zero-pad to a multiple of `a`. */
  align(a: number): this {
    return this.zeros((a - (this.length % a)) % a);
  }

  finish(): Uint8Array {
    return this.buf.slice(0, this.length);
  }
}

/** Python `(x + a - 1) // a * a` for non-negative x. */
export function alignUp(x: number, a: number): number {
  return Math.ceil(x / a) * a;
}

/** Python `-x % m` (the pad that brings x to a multiple of m). */
export function padTo(x: number, m: number): number {
  return ((-x % m) + m) % m;
}

/** Python code-point string comparison (UTF-16 order equals it for BMP text). */
export function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Python `'%.6f' % v`: exact decimal value rounded half-to-even, '-' kept on negative zero. */
export function fmt6(v: number): string {
  if (!Number.isFinite(v)) return Number.isNaN(v) ? 'nan' : v > 0 ? 'inf' : '-inf';
  const neg = v < 0 || Object.is(v, -0);
  const x = Math.abs(v);
  let body: string;
  const x128 = x * 128;      // exact (power-of-two scale); ties at 6 decimals need x * 128 integral
  if (Number.isInteger(x128) && x < 1e15) {
    const q = BigInt(x128) * 1000000n;
    let n = q / 128n;
    const r = q % 128n;
    if (r > 64n || (r === 64n && (n & 1n) === 1n)) n += 1n;
    const s = n.toString().padStart(7, '0');
    body = `${s.slice(0, -6)}.${s.slice(-6)}`;
  } else {
    body = x.toFixed(6);
  }
  return (neg ? '-' : '') + body;
}
