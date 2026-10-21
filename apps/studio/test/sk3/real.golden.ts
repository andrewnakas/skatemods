// SPDX-License-Identifier: GPL-3.0-or-later
// node test/sk3/real.golden.ts : a pack from real tile arenas (skate4to3 work/mod_thps_berlin, the
// owner's local data, never stored here) built by the TS writers; every file's sha256 + size and the
// whole .big compared with what the Python writers produce (test/golden/sk3/real_berlin.json).
// Opt-in: set REAL_BERLIN_TILES to that pack_tiles folder; skips otherwise.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, haveGolden, loadJson, sha256, summary } from './golden.ts';
import * as big from '../../src/formats/skate3/big.ts';
import * as dlc from '../../src/formats/skate3/dlc.ts';
import { concat } from '../../src/formats/skate3/bytes_util.ts';
import type { Kind } from '../../src/formats/skate3/manifests.ts';

await check('real map (THPS Berlin subset): every file + .big sha256 == Python', () => {
  if (!haveGolden('real_berlin.json')) return 'skip';
  const R = loadJson('real_berlin.json');
  const tiles = process.env.REAL_BERLIN_TILES;
  if (!tiles || !existsSync(tiles)) return 'skip';
  const load = (sub: string): [bigint, Uint8Array][] => readdirSync(join(tiles, sub)).filter((f) => f.endsWith('.rx2')).sort()
    .map((f) => [BigInt('0x' + f.slice(0, -4).split('_').pop()!), new Uint8Array(readFileSync(join(tiles, sub, f)))]);
  const spots: dlc.Spot[] = R.spots.map((s: any) => ({ title: s.title, pos: s.pos, yaw: s.yaw }));
  const names = dlc.namesFor(R.display, spots);
  let n = 0, bytes = 0;
  for (const c of R.cases) {
    const tiles: Partial<Record<Kind, dlc.TileArenas>> = {};
    for (const [kind, subs] of Object.entries(c.kinds as Record<string, string[]>)) tiles[kind as Kind] = subs.map((s) => [s, load(s)]);
    const files = dlc.buildFiles(R.display, tiles, spots, names, { streamForm: c.kw.stream_form, centerRule: c.kw.center_rule });
    assert.deepEqual([...files.keys()], Object.keys(c.files), `${c.name} file list`);
    for (const [p, d] of files) {
      const [h, len] = c.files[p];
      assert.equal(d.length, len, `${c.name}/${p} size`);
      assert.equal(sha256(d), h, `${c.name}/${p} sha256`);
      n++;
    }
    const { parts, size } = big.writeBigParts([...files].map(([p, d]) => big.sourceOf(p, d)));
    const whole = concat(parts);
    assert.equal(size, c.big[1]);
    assert.equal(sha256(whole), c.big[0], `${c.name} .big sha256`);
    bytes += size;
  }
  return `${n} files, ${(bytes / 1e6).toFixed(1)} MB of .big`;
});

summary('sk3 real map');
