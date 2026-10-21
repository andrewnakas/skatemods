// SPDX-License-Identifier: GPL-3.0-or-later
// node test/sk3/writers.golden.ts : byte-equality of the TS Skate 3 writers against the Python
// oracle (skate4to3 tests/make_ts_golden.py -> test/golden/sk3).
import assert from 'node:assert/strict';
import { assertBytes, check, loadBundle, loadJson, summary } from './golden.ts';
import { attribKey, hashBytes } from '../../src/formats/skate3/attrib_hash.ts';
import * as refpack from '../../src/formats/skate3/refpack.ts';
import * as big from '../../src/formats/skate3/big.ts';
import * as sfil from '../../src/formats/skate3/sfil.ts';
import { parseRw4 } from '../../src/formats/skate3/rw4.ts';
import { buildRw4, specFromArena } from '../../src/formats/skate3/rw4_write.ts';
import * as mf from '../../src/formats/skate3/manifests.ts';
import * as V from '../../src/formats/skate3/vault.ts';
import * as dlc from '../../src/formats/skate3/dlc.ts';
import { concat, fmt6, fromHex, latin1 } from '../../src/formats/skate3/bytes_util.ts';

const hx = (v: bigint | number) => v.toString(16);

// ---- hashes -----------------------------------------------------------------------------------
await check('attrib_hash / djb2 / fnv1_64 / string_id / group_hash / locator ids', () => {
  const H = loadJson('hashes.json');
  for (const [n, h] of H.attrib_key) assert.equal(hx(attribKey(n)), h, `attrib_key(${JSON.stringify(n)})`);
  assert.equal(hashBytes(latin1('challenge_local_data')), 0x46A56ADDF284C381n);
  for (const [p, h] of H.djb2) assert.equal(big.djb2(p), h, p);
  for (const [p, h] of H.fnv1_64) assert.equal(hx(mf.fnv1_64(p)), h, p);
  for (const [p, h] of H.string_id) assert.equal(dlc.stringId(p), h, p);
  for (const [d, k, h] of H.group_hash) assert.equal(mf.groupHash(d, k), h, `${d} ${k}`);
  for (const [n, a, x] of H.locator_own_ids) { const [ga, gx] = dlc.locatorOwnIds(n); assert.equal(hx(ga), a); assert.equal(hx(gx), x); }
  for (const [d, n, s] of H.locator_file_stem) assert.equal(dlc.locatorFileStem(d, n), s);
  return `${H.attrib_key.length} names`;
});

// ---- refpack ----------------------------------------------------------------------------------
await check('refpack compress == Python, decompress round trip', () => {
  const b = loadBundle('refpack.bundle');
  let n = 0;
  for (const [k, out] of b) {
    const m = /^(.*)\.d(\d+)\.out$/.exec(k);
    if (!m) continue;
    const src = b.get(`${m[1]}.in`)!;
    assertBytes(refpack.compress(src, Number(m[2])), out, k);
    assertBytes(refpack.decompress(out), src, `${k} decompress`);
    n++;
  }
  return `${n} streams`;
});

// ---- rw4 + sfil -------------------------------------------------------------------------------
await check('rw4 parse -> specFromArena -> build round trip', () => {
  const b = loadBundle('rw4_sfil.bundle');
  for (const k of ['arena_small', 'arena_big', 'arena_main_only_big', 'loc_arena']) {
    assertBytes(buildRw4(specFromArena(parseRw4(b.get(k)!))), b.get(k), k);
  }
});

await check('sfil raw/EA streams == Python', () => {
  const b = loadBundle('rw4_sfil.bundle');
  const assets: sfil.Asset[] = [
    { id: 0x1111222233334444n, arena: b.get('arena_small')! }, { id: 0xFEDCBA9876543210n, arena: b.get('arena_big')! },
    { id: 7n, arena: b.get('arena_main_only_big')! }, { id: 8n, arena: b.get('loc_arena')! }];
  assertBytes(sfil.rawStream(0xDEADBEEF, assets, 4 << 24), b.get('raw_stream'), 'raw_stream');
  assertBytes(sfil.eaStream(0x01020304, assets, 0x99), b.get('ea_stream'), 'ea_stream');
  assertBytes(sfil.eaStream(0x01020304, assets, 0, false), b.get('ea_stream_nocomp'), 'ea_stream_nocomp');
  assertBytes(sfil.writeSfil({ group: 5, align: 0x80, platform: 2, tail: 0, padOver: true }, assets.slice(0, 2), 'xbox2', true, 4),
    b.get('write_padover_xbox'), 'write_padover_xbox');
  const [hdr, back] = sfil.readSfil(b.get('ea_stream')!);
  assertBytes(sfil.writeSfil(hdr, back), b.get('ea_stream'), 'ea_stream re-read/re-write');
  back.forEach((a, i) => assertBytes(a.arena, assets[i].arena, `ea_stream asset ${i} arena`));
  // Python's read only detects pad_over when a payload size is a multiple of the alignment
  const [h2, raw] = sfil.readSfil(b.get('raw_stream')!);
  assert.equal(h2.padOver, false);
  assertBytes(sfil.writeSfil({ ...h2, padOver: true }, raw), b.get('raw_stream'), 'raw_stream re-read/re-write');
});

// ---- big ----------------------------------------------------------------------------------------
await check('big directory + DLC/world/shift-6 archives == Python', () => {
  const b = loadBundle('big.bundle');
  const J = loadJson('big.json');
  const srcs = J.paths.map((p: string) => big.sourceOf(p, fromHex(J.data[p])));
  const nodes = big.planDirectory(J.paths);
  assert.deepEqual(nodes, J.nodes);
  assertBytes(big.buildDirectory(nodes), b.get('directory'), 'directory');
  assertBytes(big.buildDirectory(nodes, 3), b.get('directory_flavour3'), 'directory flavour 3');
  assert.deepEqual(big.readDirectory(b.get('directory')!), [1, nodes]);
  assertBytes(big.writeBig(srcs, { flags: big.FLAGS_DLC }), b.get('dlc'), 'dlc archive');
  assertBytes(big.writeBig(srcs, { flags: big.FLAGS_WORLD, dataOrder: J.world_order, directory: new Uint8Array(0) }), b.get('world'), 'world archive');
  assertBytes(big.writeBig(srcs, { flags: 0x00100600, directory: new Uint8Array(0), entryTable: Uint8Array.from({ length: 32 }, (_, i) => i) }),
    b.get('shift6'), 'shift-6 archive');
  // reader: same entries (paths, offsets, sizes) and stride as Python's big.read
  const srcs2 = J.paths2.map((p: string) => big.sourceOf(p, fromHex(J.data[p] ?? J.data['data/Z.xml'])));
  assertBytes(big.writeBig(srcs2), b.get('dlc2'), 'dlc2 archive');
  for (const k of ['dlc', 'dlc2', 'world']) {
    const a = big.readBig(b.get(k)!);
    assert.deepEqual([a.entries.map((e) => [big.entryPath(e), e.offset, e.size]), a.stride], J[`read_${k}`], `read ${k}`);
    if (k === 'dlc2') assertBytes(big.rebuild(a), b.get(k), `${k} rebuild`);   // the others have unnamed entries
  }
  const a2 = big.readBig(b.get('dlc2')!);
  for (const e of a2.entries) {
    const p = big.entryPath(e);
    assert.equal(Buffer.from(big.readEntry(a2, e)).toString('hex'), J.data[p === 'data/x/Z.xml' ? 'data/Z.xml' : p]);
  }
});

// ---- manifests ----------------------------------------------------------------------------------
await check('manifests generate / loc / spawn_transform == Python', () => {
  const b = loadBundle('manifests.bundle');
  const r = loadBundle('rw4_sfil.bundle');
  const small = r.get('arena_small')!, bigA = r.get('arena_big')!, mob = r.get('arena_main_only_big')!, loc = r.get('loc_arena')!;
  const tiles: mf.Tile[] = [
    { name: 'cSim_150_-50_high', arenas: [[0xA1n, small], [0xA2n, bigA]], streamSize: 12345, content: [100.0, -3.5, -100.0, 200.0, 40.25, 0.0] },
    { name: 'cSim_-50_50_high', arenas: [[0xA1n, small]], streamSize: 4096 },
    { name: 'cSim_Global', arenas: [[0xB0n, mob]], streamSize: 777 },
    { name: 'cSim_50_50_x', arenas: [[0xA3n, loc]], streamSize: 2048, content: null, yrange: [-12.0, 99.5] }];
  const cmp = (pre: string, g: Record<string, Uint8Array>) => { for (const [k, v] of Object.entries(g)) assertBytes(v, b.get(pre + k), pre + k); };
  cmp('gen_default', mf.generate('DIST_MyMap', 'Sim', tiles));
  cmp('gen_ea', mf.generate('DIST_MyMap', 'Pres', tiles.filter((t) => !t.name.endsWith('_Global')),
    { cell: 64.0, platform: 2, alignment: 0x80, sizeIncludesHeader: false, group: 0x1234ABCD }));
  cmp('gen_legacy', mf.generate('DIST_MyMap', 'Tex', tiles.slice(0, 2), { legacyMissingGlobalGroup: true }));
  cmp('gen_unique', mf.generate('DIST_MyMap', 'Sim', tiles, { uniqueTileIds: true }));
  // readers round trip
  for (const k of ['gen_default', 'gen_ea']) {
    assertBytes(mf.writeCmap(mf.readCmap(b.get(k + '.xsm')!)), b.get(k + '.xsm'), k + ' cmap rw');
    assertBytes(mf.writeCspa(mf.readCspa(b.get(k + '.xss')!)), b.get(k + '.xss'), k + ' cspa rw');
    assertBytes(mf.writeAtoc(mf.readAtoc(b.get(k + '.xst')!)), b.get(k + '.xst'), k + ' atoc rw');
    assert.equal(mf.readMmap(b.get(k + '.xmm')!), mf.readCmap(b.get(k + '.xsm')!).group);
  }
  const tricky = (loadJson('manifests.json').tricky as string[]).map(Number);
  const got = mf.writeLoc([{ name: 'a', transform: tricky.slice(0, 16) }, { name: 'b', transform: tricky.slice(2, 18), category: 'cat', emptyTag: false },
    { name: 'c', transform: mf.spawnTransform(1.5, -2.25, 1e3, 37.5), category: '', emptyTag: false }]);
  // Python repr(-0.0) is '-0.0' -> Number gives -0: keep the sign
  assertBytes(got, b.get('loc'), 'loc');
  assertBytes(mf.writeLoc(mf.readLoc(b.get('loc')!)), b.get('loc'), 'loc re-read');
  const st = [[0, 0, 0, 0], [1, 2, 3, 90], [-5.5, 0.25, 7, 37.5], [100, 0, -100, -123.4], [0, 0, 0, 359.99]];
  const w = new Uint8Array(st.length * 128);
  const dvw = new DataView(w.buffer);
  st.forEach(([x, y, z, yaw], i) => mf.spawnTransform(x, y, z, yaw).forEach((v, k) => dvw.setFloat64(128 * i + 8 * k, v)));
  assertBytes(w, b.get('spawn_transforms'), 'spawn_transform (float64, cos/sin)');
  assert.equal(fmt6(-0), '-0.000000');
  assert.equal(fmt6(0.0078125), '0.007812');
  assert.equal(fmt6(0.0234375), '0.023438');
});

// ---- vault --------------------------------------------------------------------------------------
await check('vault dlcVaults == Python (5 packs, every db file)', () => {
  let n = 0;
  for (const c of loadJson('vault.json')) {
    const want = loadBundle(`vault_${c.name}.bundle`);
    const got = V.dlcVaults(c.slug, c.keys, c.dist, BigInt('0x' + c.version), c.milestone);
    assert.deepEqual([...got.keys()], [...want.keys()], `${c.name} file list`);
    for (const [p, d] of got) { assertBytes(d, want.get(p), `${c.name}/${p}`); n++; }
    // codec round trip on our own output
    for (const [p, d] of got) {
      if (p.endsWith('.vlt')) assertBytes(V.writeVlt(V.readVlt(d)), d, `${c.name}/${p} vlt rw`);
      if (p.endsWith('.bin')) assertBytes(V.writeBin(V.readBin(d)), d, `${c.name}/${p} bin rw`);
    }
  }
  return `${n} files`;
});

// ---- dlc ----------------------------------------------------------------------------------------
function inputsTiles(): Partial<Record<mf.Kind, dlc.TileArenas>> {
  const inp = loadBundle('dlc_inputs.bundle');
  const tiles: Record<string, dlc.TileArenas> = {};
  for (const [k, ar] of inp) {
    const [kind, name, f] = k.split('/');
    const l = (tiles[kind] ??= []);
    let t = l.find((x) => x[0] === name);
    if (!t) l.push((t = [name, []]));
    t[1].push([BigInt('0x' + f.split('_')[1]), ar]);
  }
  return tiles;
}

const spotsOf = (J: any): dlc.Spot[] => J.spots.map((s: any) => ({ title: s.title, pos: s.pos, yaw: s.yaw, matrix: s.matrix, key: s.key }));

await check('dlc buildFiles + writePack == Python (synthetic map, raw + EA streams + template)', () => {
  const J = loadJson('dlc.json');
  const out = loadBundle('dlc_outputs.bundle');
  const tiles = inputsTiles();
  const spots = spotsOf(J);
  const names = dlc.namesFor(J.display, spots);
  assert.deepEqual(names, J.names);
  let n = 0;
  for (const c of J.cases) {
    if (c.name === 'template') continue;
    const kw = c.kw ?? {};
    const files = dlc.buildFiles(J.display, tiles, spots, names, {
      cell: kw.cell, centerRule: kw.center_rule, streamForm: kw.stream_form, dlcTables: kw.dlc_tables,
      group: kw.group, tail: kw.tail, content: c.content,
    });
    assert.deepEqual([...files.keys()], c.order, `${c.name} file order`);
    for (const [p, d] of files) { assertBytes(d, out.get(`${c.name}/${p}`), `${c.name}/${p}`); n++; }
    const pk = dlc.writePack(files, names.slug, J.display);
    assertBytes(concat(pk.bigParts), out.get(`${c.name}/@big`), `${c.name} .big`);
    assertBytes(pk.header, out.get(`${c.name}/@header`), `${c.name} .header`);
    assert.equal(pk.contentId, new TextDecoder().decode(out.get(`${c.name}/@cid`)));
    if (c.name === 'default') {
      const tpl = dlc.readTemplate(concat(pk.bigParts));
      const tc = J.cases.find((x: any) => x.name === 'template');
      const tf = dlc.buildFiles('Other Name', tiles, spots.slice(0, 2), tpl);
      assert.deepEqual([...tf.keys()], tc.order, 'template file order');
      for (const [p, d] of tf) { assertBytes(d, out.get(`template/${p}`), `template/${p}`); n++; }
    }
  }
  for (const [d, s, di, cid] of J.slug_for) {
    assert.equal(dlc.slugFor(d), s); assert.equal(dlc.distFor(d), di); assert.equal(dlc.contentIdFor(d), cid);
  }
  return `${n} files + 2 archives`;
});

await check('dlc helpers (boundary, preload, language, header, locators) == Python', () => {
  const h = loadBundle('dlc_helpers.bundle');
  assertBytes(dlc.writeBoundary(dlc.boundaryRect([[50, -50], [-150, 50], [50, 150]], 100)), h.get('boundary'), 'boundary');
  const grid = (x0: number, x1: number, z0: number, z1: number) => {
    const o: [number, number][] = [];
    for (let x = x0; x <= x1; x += 100) for (let z = z0; z <= z1; z += 100) o.push([x, z]);
    return o;
  };
  assertBytes(dlc.writeStreamTiles(dlc.preloadList([50, 50], grid(-450, 450, -350, 350), 63)), h.get('preload'), 'preload');
  assertBytes(dlc.writeStreamTiles(dlc.preloadList([-50, 50], grid(-250, 250, -250, 250), 10)), h.get('preload_small'), 'preload small');
  const lang = dlc.locationStrings('mymap', 'My Map', [['mymap', 'Main'], ['spot1', 'Main'], ['spot2', 'B']]);
  assertBytes(dlc.writeLanguage(lang), h.get('lang'), 'language');
  assertBytes(dlc.writeLanguage(dlc.readLanguage(h.get('lang')!)), h.get('lang'), 'language re-read');
  assertBytes(dlc.writeHistogram(), h.get('hist'), 'histogram');
  assertBytes(dlc.writeHeader('Ünïcødé name ' + 'x'.repeat(200), 'MYCONTENTID'), h.get('header'), 'header');
  const m = mf.spawnTransform(1.0, 2.0, 3.0, 33.0);
  const L: dlc.Locator = { name: 'freeskate_a_b_locator', matrix: m, locatorId: attribKey('freeskate_a_b_locator'), spawns: [] };
  L.spawns = dlc.spawnRing(L.name, 'freeskate_a_b', m);
  assertBytes(dlc.writeLocatorObject(L), h.get('locator_object'), 'locator object');
  assertBytes(dlc.writeLocatorObject(dlc.parseLocatorObject(h.get('locator_object')!)), h.get('locator_object'), 'locator object re-read');
  assertBytes(dlc.buildLocatorArena(L), h.get('locator_arena'), 'locator arena');
  assertBytes(dlc.buildLocatorArena(L, 0x12345678, 0x1122334455667788n), h.get('locator_arena_ids'), 'locator arena with ids');
  assertBytes(dlc.locatorArena(h.get('locator_arena_ids')!, { name: 'Z_q_Start', matrix: m, locatorId: 99n, spawns: [] }),
    h.get('locator_from_template'), 'locator arena from template');
  assertBytes(dlc.locatorTable(5n, 6n), h.get('locator_table'), 'locator table');
});

summary('sk3 writers');
