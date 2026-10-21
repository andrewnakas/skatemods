// SPDX-License-Identifier: GPL-3.0-or-later
// Kraken (Oodle LZ, decoder type 6) decompressor.
//
// Provenance: written for skatemods from the format as implemented by the open-source GPL-3 "ooz"
// decoder (powzix), whose structure the author knew; verified byte-exact against blocks decoded by the
// game's own DLL, used only as a local test oracle (never shipped, never disassembled). This module is
// GPL-3.0-or-later. It contains no Oodle/RAD code.
//
// Layout of one compressed stream (the CAS block payload in skate.):
//   per 256 KiB of output: 2-byte block header, then per block a quantum header + quantum;
//   a quantum is decoded in 128 KiB chunks; each chunk is either one entropy-coded byte array or an
//   LZ table (literal/command/offset/length streams) replayed by the LZ run processor.

export class KrakenError extends Error {}

/** Path counters (cheap); tests use them to check which coding paths a corpus exercised. */
export const stats: Record<string, number> = {};
function hit(k: string) { stats[k] = (stats[k] ?? 0) + 1; }

function fail(msg: string): never {
  throw new KrakenError(msg);
}

// ---------------------------------------------------------------------------------------------
// Bit readers. Two bit orders occur: MSB-first (code-length tables, offsets/lengths, intervals) and
// LSB-first (Huffman and tANS symbol streams). Each can run forward from a start or backward from an
// end (bytes taken in decreasing address order). Reads past the readable range see zero bytes.

class MsbReader {
  d: Uint8Array; lo: number; hi: number; back: boolean; pos: number;   // pos = bits consumed
  constructor(d: Uint8Array, lo: number, hi: number, back = false) {
    this.d = d; this.lo = lo; this.hi = hi; this.back = back; this.pos = 0;
  }
  byteAt(i: number): number {          // i-th byte of the stream
    if (this.back) { const a = this.hi - 1 - i; return a >= this.lo ? this.d[a] : 0; }
    const a = this.lo + i; return a < this.hi ? this.d[a] : 0;
  }
  bit(): number {
    const b = (this.byteAt(this.pos >> 3) >> (7 - (this.pos & 7))) & 1;
    this.pos++;
    return b;
  }
  bits(n: number): number {            // n <= 32
    let v = 0;
    while (n > 0) {
      const off = this.pos & 7, take = Math.min(8 - off, n);
      const byte = this.byteAt(this.pos >> 3);
      v = v * (1 << take) + ((byte >> (8 - off - take)) & ((1 << take) - 1));
      this.pos += take; n -= take;
    }
    return v;
  }
  peek32(): number {
    const p = this.pos; const v = this.bits(32); this.pos = p; return v >>> 0;
  }
  /** Leading zero bits in the next 32 bits (32 if none set). */
  lz(): number {
    const v = this.peek32();
    return v === 0 ? 32 : Math.clz32(v);
  }
  /** Byte position after this reader, a partly used byte counting as used. */
  bytePos(): number {
    const n = (this.pos + 7) >> 3;
    return this.back ? this.hi - n : this.lo + n;
  }
  overran(): boolean { return this.lo + ((this.pos + 7) >> 3) > this.hi; }
}

class LsbReader {
  d: Uint8Array; lo: number; hi: number; back: boolean; pos: number;
  constructor(d: Uint8Array, lo: number, hi: number, back = false) {
    this.d = d; this.lo = lo; this.hi = hi; this.back = back; this.pos = 0;
  }
  byteAt(i: number): number {
    if (this.back) { const a = this.hi - 1 - i; return a >= this.lo ? this.d[a] : 0; }
    const a = this.lo + i; return a < this.hi ? this.d[a] : 0;
  }
  peek(n: number): number {            // n <= 24
    const i = this.pos >> 3, s = this.pos & 7;
    const w = this.byteAt(i) | (this.byteAt(i + 1) << 8) | (this.byteAt(i + 2) << 16) | (this.byteAt(i + 3) << 24);
    return (w >>> s) & ((1 << n) - 1);
  }
  bits(n: number): number { const v = this.peek(n); this.pos += n; return v; }
  bytes(): number { return (this.pos + 7) >> 3; }
}

// ---------------------------------------------------------------------------------------------
// Huffman (canonical, max code length 11). Symbols are listed grouped by code length; within a
// length in the order they were read. Streams are read LSB-first, so the LUT is bit-reversed.

const CODE_PREFIX_ORG = [0x0, 0x0, 0x2, 0x6, 0xE, 0x1E, 0x3E, 0x7E, 0xFE, 0x1FE, 0x2FE, 0x3FE];

interface HuffLut { len: Uint8Array; sym: Uint8Array }

function zigzag(v: number): number { return (v & 1) ? -((v >> 1) + 1) : (v >> 1); }   // -(v&1) ^ (v>>1)

function readFluff(br: MsbReader, numSymbols: number): number {
  if (numSymbols === 256) return 0;
  let x = 257 - numSymbols;
  if (x > numSymbols) x = numSymbols;
  x *= 2;
  const y = 32 - Math.clz32(x - 1);              // BSR(x-1) + 1
  const v = br.peek32() >>> (32 - y);
  const z = (1 << y) - x;
  if ((v >> 1) >= z) { br.pos += y; return v - z; }
  br.pos += y - 1;
  return v >> 1;
}

/** Unary values: count of 0 bits before each 1 bit, MSB-first; must stay inside the source. */
function golombRiceLengths(br: MsbReader, n: number): Uint8Array {
  const out = new Uint8Array(n + 16);
  for (let i = 0; i < n; i++) {
    let z = 0;
    for (;;) {
      if (br.lo + (br.pos >> 3) >= br.hi) fail('rice lengths overrun');
      if (br.bit()) break;
      z++;
      if (z > 255) fail('rice value too large');
    }
    out[i] = z;
  }
  return out;
}

function golombRiceBits(br: MsbReader, vals: Uint8Array, n: number, k: number): void {
  if (k === 0) return;
  if (br.lo + ((br.pos + k * n + 7) >> 3) > br.hi) fail('rice bits overrun');
  for (let i = 0; i < n; i++) vals[i] = ((vals[i] << k) | br.bits(k)) & 0xFF;
}

interface Range { symbol: number; num: number }

function convertToRanges(numSymbols: number, P: number, symlen: Uint8Array, sl: number, br: MsbReader): Range[] {
  const numRanges = P >> 1;
  let symIdx = 0;
  if (P & 1) {
    const v = symlen[sl++];
    if (v >= 8) fail('range start');
    symIdx = br.bits(v + 1) + (1 << (v + 1)) - 1;
  }
  let used = 0;
  const ranges: Range[] = [];
  for (let i = 0; i < numRanges; i++) {
    let v = symlen[sl];
    if (v >= 9) fail('range num');
    const num = br.bits(v) + (1 << v);
    v = symlen[sl + 1];
    if (v >= 8) fail('range space');
    const space = br.bits(v + 1) + (1 << (v + 1)) - 1;
    ranges.push({ symbol: symIdx, num });
    used += num;
    symIdx += num + space;
    sl += 2;
  }
  if (symIdx >= 256 || used >= numSymbols || symIdx + numSymbols - used > 256) fail('ranges');
  ranges.push({ symbol: symIdx, num: numSymbols - used });
  return ranges;
}

/** Returns number of symbols; fills syms (grouped by length via prefix). */
function readCodeLengthsOld(br: MsbReader, syms: Uint8Array, prefix: number[]): number {
  if (br.bit()) {
    let sym = 0, numSymbols = 0, avgX4 = 32;
    const forced = br.bits(2);
    const maxLz = 20 >> forced;
    let skipZeros = br.bit() === 1;
    for (;;) {
      if (!skipZeros) {
        const lz = br.lz();
        if (lz >= 8) fail('huff old: zero run');
        sym += br.bits(2 * (lz + 1)) - 1;
        if (sym >= 256) break;
      }
      skipZeros = false;
      const lz = br.lz();
      if (lz >= 8) fail('huff old: run');
      let n = br.bits(2 * (lz + 1)) - 1;
      if (sym + n > 256) fail('huff old: too many');
      numSymbols += n;
      do {
        const l = br.lz();
        if (l > maxLz) fail('huff old: gamma');
        const v = br.bits(l + forced + 1) + ((l - 1) << forced);
        const codelen = zigzag(v) + ((avgX4 + 2) >> 2);
        if (codelen < 1 || codelen > 11) fail('huff old: codelen');
        avgX4 = codelen + ((3 * avgX4 + 2) >> 2);
        syms[prefix[codelen]++] = sym++;
      } while (--n);
    }
    if (sym !== 256 || numSymbols < 2) fail('huff old: count');
    return numSymbols;
  }
  const numSymbols = br.bits(8);
  if (numSymbols === 0) fail('huff sparse: none');
  if (numSymbols === 1) {
    syms[0] = br.bits(8);
  } else {
    const clBits = br.bits(3);
    if (clBits > 4) fail('huff sparse: clbits');
    for (let i = 0; i < numSymbols; i++) {
      const sym = br.bits(8);
      const codelen = br.bits(clBits) + 1;
      if (codelen > 11) fail('huff sparse: codelen');
      syms[prefix[codelen]++] = sym;
    }
  }
  return numSymbols;
}

function readCodeLengthsNew(br: MsbReader, syms: Uint8Array, prefix: number[]): number {
  const forced = br.bits(2);
  const numSymbols = br.bits(8) + 1;
  const fluff = readFluff(br, numSymbols);
  const codeLen = golombRiceLengths(br, numSymbols + fluff);
  golombRiceBits(br, codeLen, numSymbols, forced);
  let running = 0x1e;
  for (let i = 0; i < numSymbols; i++) {
    const v = zigzag(codeLen[i]);
    const cl = v + (running >> 2) + 1;
    if (cl < 1 || cl > 11) fail('huff new: codelen');
    codeLen[i] = cl;
    running += v;
  }
  const ranges = convertToRanges(numSymbols, fluff, codeLen, numSymbols, br);
  let cp = 0;
  for (const r of ranges) {
    let sym = r.symbol;
    for (let n = r.num; n > 0; n--) syms[prefix[codeLen[cp++]]++] = sym++;
  }
  return numSymbols;
}

function makeLut(prefix: number[], syms: Uint8Array): HuffLut {
  const len = new Uint8Array(2048), sym = new Uint8Array(2048);
  let slot = 0;
  for (let i = 1; i <= 11; i++) {
    const start = CODE_PREFIX_ORG[i], count = prefix[i] - start;
    const step = 1 << (11 - i);
    if (slot + count * step > 2048) fail('huff lut overflow');
    for (let j = 0; j < count; j++) {
      len.fill(i, slot, slot + step);
      sym.fill(syms[start + j], slot, slot + step);
      slot += step;
    }
  }
  if (slot !== 2048) fail('huff lut incomplete');
  // reverse: index by the 11 code bits as they arrive LSB-first
  const rl = new Uint8Array(2048), rs = new Uint8Array(2048);
  for (let i = 0; i < 2048; i++) {
    let r = 0;
    for (let b = 0; b < 11; b++) r |= ((i >> b) & 1) << (10 - b);
    rl[r] = len[i]; rs[r] = sym[i];
  }
  return { len: rl, sym: rs };
}

/** Three interleaved streams: forward from lo, backward from hi, forward from mid. */
function huffCore(src: Uint8Array, lo: number, mid: number, hi: number, out: Uint8Array, o0: number, o1: number, lut: HuffLut) {
  if (lo > mid || mid > hi) fail('huff split');
  const f = new LsbReader(src, lo, mid), b = new LsbReader(src, mid, hi, true), m = new LsbReader(src, mid, hi);
  const L = lut.len, S = lut.sym;
  let o = o0, k: number;
  while (o < o1) {
    k = f.peek(11); out[o++] = S[k]; f.pos += L[k];
    if (o >= o1) break;
    k = b.peek(11); out[o++] = S[k]; b.pos += L[k];
    if (o >= o1) break;
    k = m.peek(11); out[o++] = S[k]; m.pos += L[k];
  }
  if (lo + f.bytes() !== mid) fail('huff fwd end');
  if (mid + m.bytes() !== hi - b.bytes()) fail('huff mid/back meet');
}

function decodeHuff(src: Uint8Array, s0: number, s1: number, out: Uint8Array, o0: number, outSize: number, type: number): void {
  const br = new MsbReader(src, s0, s1);
  const syms = new Uint8Array(1280);
  const prefix = CODE_PREFIX_ORG.slice();
  let num: number;
  if (!br.bit()) { num = readCodeLengthsOld(br, syms, prefix); hit('huff_old'); }
  else if (!br.bit()) { num = readCodeLengthsNew(br, syms, prefix); hit('huff_new'); }
  else fail('huff: bad table type');
  let p = br.bytePos();
  if (num === 1) { out.fill(syms[0], o0, o0 + outSize); return; }
  const lut = makeLut(prefix, syms);
  if (type === 1) {
    if (p + 3 > s1) fail('huff3 short');
    const split = src[p] | (src[p + 1] << 8);
    p += 2;
    huffCore(src, p, p + split, s1, out, o0, o0 + outSize, lut);
  } else {
    const half = (outSize + 1) >> 1;
    const split = src[p] | (src[p + 1] << 8) | (src[p + 2] << 16);
    p += 3;
    if (split > s1 - p) fail('huff6 split');
    const smid = p + split;
    const splitLeft = src[p] | (src[p + 1] << 8);
    p += 2;
    if (smid - p < splitLeft + 2 || s1 - smid < 3) fail('huff6 left');
    const splitRight = src[smid] | (src[smid + 1] << 8);
    if (s1 - (smid + 2) < splitRight) fail('huff6 right');
    huffCore(src, p, p + splitLeft, smid, out, o0, o0 + half, lut);
    huffCore(src, smid + 2, smid + 2 + splitRight, s1, out, o0 + half, o0 + outSize, lut);
  }
}

// ---------------------------------------------------------------------------------------------
// tANS

interface TansData { A: number[]; B: number[] }

function tansDecodeTable(br: MsbReader, Lbits: number): TansData {
  const L = 1 << Lbits;
  const A: number[] = [], B: number[] = [];
  if (br.bit()) {
    hit('tans_rice');
    const Q = br.bits(3);
    const numSymbols = br.bits(8) + 1;
    if (numSymbols < 2) fail('tans syms');
    let fluff = readFluff(br, numSymbols);
    const total = fluff + numSymbols;
    const rice = golombRiceLengths(br, total);
    const ranges = convertToRanges(numSymbols, fluff, rice, numSymbols, br);
    let ri = 0, average = 6, sum = 0;
    for (const r of ranges) {
      let symbol = r.symbol;
      for (let n = r.num; n > 0; n--) {
        const nextra = Q + rice[ri++];
        if (nextra > 15) fail('tans nextra');
        let v = br.bits(nextra) + (1 << nextra) - (1 << Q);
        const avg4 = average >> 2;
        let limit = 2 * avg4;
        if (v <= limit) v = avg4 + zigzag(v);
        if (limit > v) limit = v;
        v += 1;
        average += limit - avg4;
        if (v === 1) A.push(symbol); else B.push((symbol << 16) + v);
        sum += v;
        symbol += 1;
      }
    }
    if (sum !== L) fail('tans weights');
    return { A, B };
  }
  hit('tans_sparse');
  const seen = new Uint8Array(256);
  let count = br.bits(3) + 1;
  const bitsPerSym = 32 - Math.clz32(Lbits);       // BSR(Lbits)+1
  const maxDelta = br.bits(bitsPerSym);
  if (maxDelta === 0 || maxDelta > Lbits) fail('tans delta');
  let weight = 0, total = 0;
  do {
    const sym = br.bits(8);
    if (seen[sym]) fail('tans dup');
    const delta = br.bits(maxDelta);
    weight += delta;
    if (weight === 0) fail('tans zero weight');
    seen[sym] = 1;
    if (weight === 1) A.push(sym); else B.push((sym << 16) + weight);
    total += weight;
  } while (--count);
  const sym = br.bits(8);
  if (seen[sym]) fail('tans dup last');
  if (L - total < weight || L - total <= 1) fail('tans last weight');
  B.push((sym << 16) + (L - total));
  A.sort((a, b) => a - b);
  B.sort((a, b) => a - b);
  return { A, B };
}

interface TansLut { sym: Uint8Array; bits: Uint8Array; w: Uint32Array }

function bsr(x: number): number { return 31 - Math.clz32(x); }

function tansInitLut(t: TansData, Lbits: number): TansLut {
  const L = 1 << Lbits;
  const sym = new Uint8Array(L), bits = new Uint8Array(L), w = new Uint32Array(L);
  const aUsed = t.A.length;
  const left = L - aUsed;
  const sa = left >> 2;
  const ptr = [0, 0, 0, 0];
  let sb = sa + ((left & 3) > 0 ? 1 : 0);
  ptr[1] = sb;
  sb += sa + ((left & 3) > 1 ? 1 : 0);
  ptr[2] = sb;
  sb += sa + ((left & 3) > 2 ? 1 : 0);
  ptr[3] = sb;
  for (let i = 0; i < aUsed; i++) {
    const e = left + i;
    sym[e] = t.A[i]; bits[e] = Lbits; w[e] = 0;
  }
  let weightsSum = 0;
  for (const be of t.B) {
    const weight = be & 0xffff, symbol = be >>> 16;
    if (weight > 4) {
      const symBits = bsr(weight);
      let Z = Lbits - symBits;
      let leBits = Z, leW = (L - 1) & (weight << Z);
      let add = 1 << Z;
      let X = (1 << (symBits + 1)) - weight;
      for (let j = 0; j < 4; j++) {
        let d = ptr[j];
        const Y = (weight + ((weightsSum - j - 1) & 3)) >> 2;
        if (X >= Y) {
          for (let n = Y; n; n--) { sym[d] = symbol; bits[d] = leBits; w[d] = leW; d++; leW += add; }
          X -= Y;
        } else {
          for (let n = X; n; n--) { sym[d] = symbol; bits[d] = leBits; w[d] = leW; d++; leW += add; }
          Z--;
          add >>= 1;
          leBits = Z;
          leW = 0;
          for (let n = Y - X; n; n--) { sym[d] = symbol; bits[d] = leBits; w[d] = leW; d++; leW += add; }
          X = weight;
        }
        ptr[j] = d;
      }
    } else {
      let bm = ((1 << weight) - 1) << (weightsSum & 3);
      bm |= bm >> 4;
      let ww = weight;
      for (let n = weight; n; n--) {
        const idx = 31 - Math.clz32(bm & -bm);
        bm &= bm - 1;
        const d = ptr[idx]++;
        const wb = bsr(ww);
        sym[d] = symbol; bits[d] = Lbits - wb; w[d] = (L - 1) & (ww << (Lbits - wb));
        ww++;
      }
    }
    weightsSum += weight;
  }
  return { sym, bits, w };
}

function decodeTans(src: Uint8Array, s0: number, s1: number, out: Uint8Array, o0: number, outSize: number): void {
  if (s1 - s0 < 8 || outSize < 5) fail('tans small');
  const br = new MsbReader(src, s0, s1);
  if (br.bit()) fail('tans reserved');
  const Lbits = br.bits(2) + 8;
  const table = tansDecodeTable(br, Lbits);
  const p = br.bytePos();
  if (p >= s1) fail('tans no data');
  const lut = tansInitLut(table, Lbits);
  const f = new LsbReader(src, p, s1), b = new LsbReader(src, p, s1, true);
  const st = [f.bits(Lbits), b.bits(Lbits), f.bits(Lbits), b.bits(Lbits), f.bits(Lbits)];
  const end = o0 + outSize - 5;
  let o = o0;
  const S = lut.sym, Bt = lut.bits, W = lut.w;
  outer: while (o < end) {
    for (let i = 0; i < 5; i++) {
      const e = st[i];
      out[o++] = S[e];
      st[i] = f.bits(Bt[e]) + W[e];
      if (o >= end) break outer;
    }
    for (let i = 0; i < 5; i++) {
      const e = st[i];
      out[o++] = S[e];
      st[i] = b.bits(Bt[e]) + W[e];
      if (o >= end) break outer;
    }
  }
  if (p + f.bytes() !== s1 - b.bytes()) fail('tans streams do not meet');
  for (let i = 0; i < 5; i++) {
    if (st[i] & ~0xFF) fail('tans final state');
    out[end + i] = st[i];
  }
}

// ---------------------------------------------------------------------------------------------
// RLE, recursive, multi-array

function decodeRle(src: Uint8Array, s0: number, s1: number, out: Uint8Array, o0: number, outSize: number): void {
  const size = s1 - s0;
  if (size <= 1) {
    if (size !== 1) fail('rle empty');
    out.fill(src[s0], o0, o0 + outSize);
    return;
  }
  let cmd = src, cp = s0 + 1, ce = s1;
  if (src[s0]) {
    const dec = decodeBytes(src, s0, s1, outSize * 2 + 0x10000);
    const rest = src.subarray(s0 + dec.used, s1);
    const c = new Uint8Array(dec.data.length + rest.length);
    c.set(dec.data, 0); c.set(rest, dec.data.length);
    cmd = c; cp = 0; ce = c.length;
  }
  let d = o0;
  const dEnd = o0 + outSize;
  let rle = 0;
  while (cp < ce) {
    const c = cmd[ce - 1];
    if (((c - 1) >>> 0) >= 0x2f) {
      ce--;
      const copy = (-1 - c) & 0xF, run = c >> 4;
      if (dEnd - d < copy + run || ce - cp < copy) fail('rle a');
      out.set(cmd.subarray(cp, cp + copy), d); cp += copy; d += copy;
      out.fill(rle, d, d + run); d += run;
    } else if (c >= 0x10) {
      const data = (cmd[ce - 2] | (cmd[ce - 1] << 8)) - 4096;
      ce -= 2;
      const copy = data & 0x3F, run = data >> 6;
      if (dEnd - d < copy + run || ce - cp < copy) fail('rle b');
      out.set(cmd.subarray(cp, cp + copy), d); cp += copy; d += copy;
      out.fill(rle, d, d + run); d += run;
    } else if (c === 1) {
      rle = cmd[cp++];
      ce--;
    } else if (c >= 9) {
      const run = ((cmd[ce - 2] | (cmd[ce - 1] << 8)) - 0x8ff) * 128;
      ce -= 2;
      if (dEnd - d < run) fail('rle c');
      out.fill(rle, d, d + run); d += run;
    } else {
      const copy = ((cmd[ce - 2] | (cmd[ce - 1] << 8)) - 511) * 64;
      ce -= 2;
      if (ce - cp < copy || dEnd - d < copy) fail('rle d');
      out.set(cmd.subarray(cp, cp + copy), d); cp += copy; d += copy;
    }
  }
  if (ce !== cp || d !== dEnd) fail('rle end');
}

function decodeRecursive(src: Uint8Array, s0: number, s1: number, out: Uint8Array, o0: number, outSize: number): void {
  if (s1 - s0 < 6) fail('recursive small');
  let n = src[s0] & 0x7f;
  if (n < 2) fail('recursive n');
  if (!(src[s0] & 0x80)) {
    let p = s0 + 1, o = o0;
    const oEnd = o0 + outSize;
    do {
      const r = decodeBytes(src, p, s1, oEnd - o);
      out.set(r.data, o);
      o += r.data.length;
      p += r.used;
    } while (--n);
    if (o !== oEnd) fail('recursive size');
    if (p !== s1) fail('recursive used');
    return;
  }
  hit('multiarray');
  const r = decodeMultiArray(src, s0, s1, 1, outSize);
  if (r.arrays[0].length !== outSize) fail('multiarray size');
  out.set(r.arrays[0], o0);
  if (r.used !== s1 - s0) fail('multiarray used');
}

/** Peek the decoded size of a byte-array header without decoding it. */
function blockSize(src: Uint8Array, p: number, s1: number, cap: number): number {
  if (s1 - p < 2) fail('blocksize');
  const type = (src[p] >> 4) & 7;
  if (type === 0) {
    let n: number;
    if (src[p] >= 0x80) n = ((src[p] << 8) | src[p + 1]) & 0xFFF;
    else { n = (src[p] << 16) | (src[p + 1] << 8) | src[p + 2]; if (n & ~0x3ffff) fail('blocksize stored'); }
    if (n > cap) fail('blocksize cap');
    return n;
  }
  if (type >= 6) fail('blocksize type');
  let dst: number;
  if (src[p] >= 0x80) {
    const bits = (src[p] << 16) | (src[p + 1] << 8) | src[p + 2];
    dst = (bits & 0x3ff) + ((bits >> 10) & 0x3ff) + 1;
  } else {
    const bits = ((src[p + 1] << 24) | (src[p + 2] << 16) | (src[p + 3] << 8) | src[p + 4]) >>> 0;
    dst = (((bits >>> 18) | (src[p] << 14)) & 0x3FFFF) + 1;
  }
  if (dst > cap) fail('blocksize cap');
  return dst;
}

function decodeMultiArray(src: Uint8Array, s0: number, s1: number, arrayCount: number, cap: number): { arrays: Uint8Array[]; used: number } {
  let p = s0;
  if (s1 - p < 4) fail('multi small');
  let numInFile = src[p++];
  if (!(numInFile & 0x80)) fail('multi flag');
  numInFile &= 0x3f;
  if (numInFile === 0) {
    const arrays: Uint8Array[] = [];
    for (let i = 0; i < arrayCount; i++) {
      const r = decodeBytes(src, p, s1, cap);
      arrays.push(r.data); p += r.used;
    }
    return { arrays, used: p - s0 };
  }
  const ent: Uint8Array[] = [];
  const entPos: number[] = [];
  let total = 0;
  for (let i = 0; i < numInFile; i++) {
    const r = decodeBytes(src, p, s1, 0x7fffffff);
    ent.push(r.data); entPos.push(0); total += r.data.length; p += r.used;
  }
  if (s1 - p < 3) fail('multi q');
  const Q = src[p] | (src[p + 1] << 8);
  p += 2;
  const numIndexes = blockSize(src, p, s1, total);
  let numLens = numIndexes - arrayCount;
  if (numLens < 1) fail('multi lens');
  let lenlog2: Uint8Array, indexes: Uint8Array;
  if (Q & 0x8000) {
    const r = decodeBytes(src, p, s1, numIndexes);
    if (r.data.length !== numIndexes) fail('multi idx');
    p += r.used;
    indexes = new Uint8Array(numIndexes); lenlog2 = new Uint8Array(numIndexes);
    for (let i = 0; i < numIndexes; i++) { lenlog2[i] = r.data[i] >> 4; indexes[i] = r.data[i] & 0xF; }
    numLens = numIndexes;
  } else {
    const chunk = numIndexes - arrayCount;
    let r = decodeBytes(src, p, s1, numIndexes);
    if (r.data.length !== numIndexes) fail('multi idx');
    p += r.used;
    indexes = r.data;
    r = decodeBytes(src, p, s1, chunk);
    if (r.data.length !== chunk) fail('multi lenlog2');
    p += r.used;
    lenlog2 = r.data;
    for (let i = 0; i < chunk; i++) if (lenlog2[i] > 16) fail('multi lenlog2 range');
  }
  const varLen = Q & 0x3FFF;
  if (s1 - p < varLen) fail('multi var');
  const vEnd = p + varLen;
  const f = new MsbReader(src, p, vEnd), b = new MsbReader(src, p, vEnd, true);
  const intervals = new Int32Array(numLens);
  // each length is n bits under an implicit leading 1: (1 << n) | bits
  for (let i = 0; i < numLens; i++) intervals[i] = (1 << lenlog2[i]) | ((i & 1) ? b.bits(lenlog2[i]) : f.bits(lenlog2[i]));
  if (indexes[numIndexes - 1]) fail('multi last index');
  let indi = 0, leni = 0;
  const inc = (Q & 0x8000) ? 1 : 0;
  const arrays: Uint8Array[] = [];
  for (let a = 0; a < arrayCount; a++) {
    const parts: Uint8Array[] = [];
    let size = 0, source: number;
    if (indi >= numIndexes) fail('multi indi');
    while ((source = indexes[indi++]) !== 0) {
      if (source > numInFile) fail('multi source');
      if (leni >= numLens) fail('multi leni');
      const n = intervals[leni++];
      const e = ent[source - 1], ep = entPos[source - 1];
      if (n > e.length - ep) fail('multi take');
      parts.push(e.subarray(ep, ep + n));
      entPos[source - 1] = ep + n;
      size += n;
    }
    leni += inc;
    const arr = new Uint8Array(size);
    let q = 0;
    for (const x of parts) { arr.set(x, q); q += x.length; }
    if (size > cap) fail('multi cap');
    arrays.push(arr);
  }
  if (indi !== numIndexes || leni !== numLens) fail('multi end');
  for (let i = 0; i < numInFile; i++) if (entPos[i] !== ent[i].length) fail('multi leftover');
  return { arrays, used: vEnd - s0 };
}

// ---------------------------------------------------------------------------------------------
// Entropy-coded byte array

export interface Decoded { data: Uint8Array; used: number }

export function decodeBytes(src: Uint8Array, p0: number, s1: number, cap: number): Decoded {
  let p = p0;
  if (s1 - p < 2) fail('bytes: short');
  const type = (src[p] >> 4) & 7;
  if (type === 0) {
    let n: number;
    if (src[p] >= 0x80) { n = ((src[p] << 8) | src[p + 1]) & 0xFFF; p += 2; }
    else { n = (src[p] << 16) | (src[p + 1] << 8) | src[p + 2]; if (n & ~0x3ffff) fail('stored size'); p += 3; }
    if (n > cap || s1 - p < n) fail('stored overrun');
    hit('stored');
    return { data: src.slice(p, p + n), used: p + n - p0 };
  }
  let srcSize: number, dstSize: number;
  if (src[p] >= 0x80) {
    const bits = (src[p] << 16) | (src[p + 1] << 8) | src[p + 2];
    srcSize = bits & 0x3ff;
    dstSize = srcSize + ((bits >> 10) & 0x3ff) + 1;
    p += 3;
  } else {
    const bits = ((src[p + 1] << 24) | (src[p + 2] << 16) | (src[p + 3] << 8) | src[p + 4]) >>> 0;
    srcSize = bits & 0x3ffff;
    dstSize = (((bits >>> 18) | (src[p] << 14)) & 0x3FFFF) + 1;
    p += 5;
  }
  if (srcSize >= dstSize) fail('bytes: no gain');
  if (s1 - p < srcSize) fail('bytes: overrun');
  if (dstSize > cap) fail('bytes: cap');
  const out = new Uint8Array(dstSize);
  const e = p + srcSize;
  switch (type) {
    case 2: case 4: hit(`huff${type === 2 ? 3 : 6}`); decodeHuff(src, p, e, out, 0, dstSize, type >> 1); break;
    case 1: hit('tans'); decodeTans(src, p, e, out, 0, dstSize); break;
    case 3: hit('rle'); decodeRle(src, p, e, out, 0, dstSize); break;
    case 5: hit('recursive'); decodeRecursive(src, p, e, out, 0, dstSize); break;
    default: fail(`bytes: type ${type}`);
  }
  return { data: out, used: e - p0 };
}

// ---------------------------------------------------------------------------------------------
// LZ

function readDistance(br: MsbReader, v: number): number {
  if (v < 0xF0) {
    const n = (v >> 4) + 4;
    return ((((1 << n) | br.bits(n)) << 4) + (v & 0xF) - 248);
  }
  const n = v - 0xF0 + 4;
  const hi = (1 << n) + br.bits(n);
  return 0x2000 + hi * 4096 + br.bits(12);
}

function readLength(br: MsbReader): number {
  const lz = br.lz();
  if (lz > 12) fail('length lz');
  br.pos += lz;
  return br.bits(lz + 7) - 64;
}

interface LzTable { lit: Uint8Array; cmd: Uint8Array; offs: Int32Array; lens: Int32Array }

function readLzTable(mode: number, src: Uint8Array, s0: number, s1: number, out: Uint8Array, dst: number, dstSize: number, offset: number): LzTable {
  if (mode > 1) fail('lz mode');
  if (s1 - s0 < 13) fail('lz small');
  let p = s0;
  if (offset === 0) {
    out.set(src.subarray(p, p + 8), dst);
    p += 8;
  }
  if (src[p] & 0x80) fail('lz excess-bytes flag');
  let r = decodeBytes(src, p, s1, dstSize);
  const lit = r.data; p += r.used;
  r = decodeBytes(src, p, s1, dstSize);
  const cmd = r.data; p += r.used;
  if (s1 - p < 3) fail('lz offs');
  let scale = 0;
  let packedOffs: Uint8Array, extra: Uint8Array | null = null;
  if (src[p] & 0x80) {
    scale = src[p] - 127;
    p++;
    r = decodeBytes(src, p, s1, cmd.length); packedOffs = r.data; p += r.used;
    if (scale !== 1) {
      r = decodeBytes(src, p, s1, packedOffs.length); extra = r.data; p += r.used;
      if (extra.length !== packedOffs.length) fail('lz extra');
    }
  } else {
    r = decodeBytes(src, p, s1, cmd.length); packedOffs = r.data; p += r.used;
  }
  r = decodeBytes(src, p, s1, dstSize >> 2);
  const packedLen = r.data; p += r.used;
  const offs = new Int32Array(packedOffs.length), lens = new Int32Array(packedLen.length);
  unpackOffsets(src, p, s1, packedOffs, extra, scale, packedLen, offs, lens);
  return { lit, cmd, offs, lens };
}

function unpackOffsets(src: Uint8Array, s0: number, s1: number, packedOffs: Uint8Array, extra: Uint8Array | null,
  scale: number, packedLen: Uint8Array, offs: Int32Array, lens: Int32Array): void {
  const a = new MsbReader(src, s0, s1), b = new MsbReader(src, s0, s1, true);
  // u32 length count, gamma coded at the back
  const lz0 = b.lz();
  if (lz0 > 18) fail('lz u32 count');
  b.pos += lz0;
  const u32Count = b.bits(lz0 + 1) - 1;
  const n = packedOffs.length;
  hit(`offs_scale${Math.min(scale, 2)}`);
  if (scale === 0) {
    for (let i = 0; i < n; i++) offs[i] = -readDistance((i & 1) ? b : a, packedOffs[i]);
  } else {
    for (let i = 0; i < n; i++) {
      const c = packedOffs[i];
      if ((c >> 3) > 26) fail('lz offs cmd');
      const e = c >> 3;
      const v = (8 + (c & 7)) * 2 ** e + ((i & 1) ? b : a).bits(e);
      offs[i] = 8 - v;
    }
    if (scale !== 1) for (let i = 0; i < n; i++) offs[i] = scale * offs[i] - extra![i];
  }
  if (u32Count > 512) fail('lz u32 count');
  const u32 = new Int32Array(u32Count);
  for (let i = 0; i < u32Count; i++) u32[i] = readLength((i & 1) ? b : a);
  const ea = a.bytePos(), eb = b.bytePos();
  if (ea !== eb) fail(`lz bit streams do not meet (${ea} vs ${eb})`);
  let ui = 0;
  for (let i = 0; i < packedLen.length; i++) {
    let v = packedLen[i];
    if (v === 255) { if (ui >= u32Count) fail('lz u32 under'); v = u32[ui++] + 255; }
    lens[i] = v + 3;
  }
  if (ui !== u32Count) fail('lz u32 left');
}

function processLzRuns(mode: number, out: Uint8Array, start: number, dEnd: number, t: LzTable): void {
  let d = start;
  let ci = 0, li = 0, oi = 0, lp = 0;
  const recent = [0, 0, 0, -8, -8, -8, 0];
  let last = -8;
  const cmd = t.cmd, lit = t.lit, offs = t.offs, lens = t.lens;
  while (ci < cmd.length) {
    const f = cmd[ci++];
    let litlen = f & 3;
    const oidx = f >> 6;
    let matchlen = (f >> 2) & 0xF;
    if (litlen === 3) { if (li >= lens.length) fail('lz len under'); litlen = lens[li++]; }
    recent[6] = oi < offs.length ? offs[oi] : 0;
    if (d + litlen > dEnd || lp + litlen > lit.length) fail('lz lit overrun');
    if (mode === 0) for (let i = 0; i < litlen; i++) out[d + i] = (lit[lp + i] + out[d + i + last]) & 0xFF;
    else out.set(lit.subarray(lp, lp + litlen), d);
    d += litlen; lp += litlen;
    const off = recent[oidx + 3];
    recent[oidx + 3] = recent[oidx + 2];
    recent[oidx + 2] = recent[oidx + 1];
    recent[oidx + 1] = recent[oidx];
    recent[3] = off;
    last = off;
    if (oidx === 3) oi++;
    if (d + off < 0 || off >= 0) fail('lz offset out of range');
    if (matchlen !== 15) matchlen += 2;
    else {
      if (li >= lens.length) fail('lz len under');
      matchlen = 14 + lens[li++];
      if (matchlen < 16) fail('lz long match');
    }
    if (matchlen > dEnd - d) fail('lz match overrun');
    for (let i = 0; i < matchlen; i++) out[d + i] = out[d + off + i];
    d += matchlen;
  }
  if (oi !== offs.length || li !== lens.length) fail('lz streams left');
  const fin = dEnd - d;
  if (fin !== lit.length - lp) fail('lz final literals');
  if (mode === 0) for (let i = 0; i < fin; i++) out[d + i] = (lit[lp + i] + out[d + i + last]) & 0xFF;
  else out.set(lit.subarray(lp, lp + fin), d);
}

// ---------------------------------------------------------------------------------------------
// Quantum / stream

function decodeQuantum(src: Uint8Array, s0: number, s1: number, out: Uint8Array, d0: number, d1: number): void {
  let p = s0, d = d0;
  while (d < d1) {
    const count = Math.min(d1 - d, 0x20000);
    if (s1 - p < 4) fail('chunk header');
    const hdr = (src[p] << 16) | (src[p + 1] << 8) | src[p + 2];
    if (!(hdr & 0x800000)) {
      hit('chunk_entropy');
      const r = decodeBytes(src, p, s1, count);
      if (r.data.length !== count) fail('chunk entropy size');
      out.set(r.data, d);
      p += r.used;
    } else {
      p += 3;
      const used = hdr & 0x7FFFF, mode = (hdr >> 19) & 0xF;
      if (s1 - p < used) fail('chunk overrun');
      if (used < count) {
        hit(`lz_mode${mode}`);
        const t = readLzTable(mode, src, p, p + used, out, d, count, d);
        processLzRuns(mode, out, d + (d === 0 ? 8 : 0), d + count, t);
      } else if (used > count || mode !== 0) fail('chunk stored');
      else out.set(src.subarray(p, p + count), d);
      p += used;
    }
    d += count;
  }
  if (p !== s1) fail(`quantum: ${s1 - p} bytes left`);
}

/** Decompress one Kraken stream to exactly rawSize bytes. */
export function krakenDecompress(src: Uint8Array, rawSize: number): Uint8Array {
  const out = new Uint8Array(rawSize);
  let p = 0, d = 0;
  let useChecksums = false;
  while (d < rawSize) {
    if ((d & 0x3FFFF) === 0) {
      if (src.length - p < 2) fail('block header');
      const b0 = src[p], b1 = src[p + 1];
      if ((b0 & 0xF) !== 0xC || ((b0 >> 4) & 3) !== 0) fail(`block magic ${b0.toString(16)}`);
      const uncompressed = (b0 >> 6) & 1;
      const decoder = b1 & 0x7F;
      useChecksums = (b1 >> 7) === 1;
      if (decoder !== 6) fail(`decoder type ${decoder} (only Kraken)`);
      p += 2;
      if (uncompressed) {
        const n = Math.min(rawSize - d, 0x40000);
        if (src.length - p < n) fail('raw block overrun');
        hit('block_raw');
        out.set(src.subarray(p, p + n), d);
        p += n; d += n;
        continue;
      }
    }
    const n = Math.min(rawSize - d, 0x40000 - (d & 0x3FFFF));
    if (src.length - p < 3) fail('quantum header');
    const v = (src[p] << 16) | (src[p + 1] << 8) | src[p + 2];
    const size = v & 0x3FFFF;
    if (size !== 0x3ffff) {
      const csize = size + 1;
      p += useChecksums ? 6 : 3;
      if (src.length - p < csize) fail('quantum overrun');
      if (csize > n) fail('quantum larger than output');
      if (csize === n) hit('quantum_raw');
      if (csize === n) out.set(src.subarray(p, p + n), d);
      else decodeQuantum(src, p, p + csize, out, d, d + n);
      p += csize;
    } else if ((v >> 18) === 1) {
      hit('quantum_memset');
      out.fill(src[p + 3], d, d + n);
      p += 4;
    } else fail('quantum header kind');
    d += n;
  }
  return out;
}
