// skate3-census <mods dir | mod.zip | mod folder>... [-o base_refs.json]
// Lists every base-game (skate.) asset the map mods use, ranked by how many mods use it. Reads only the mods.
import { readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { openInput } from './node_source.ts';
import { censusMod, type ModCensus } from '../src/formats/convert/census.ts';

const args = process.argv.slice(2);
let out = 'base_refs.json'; const inputs: string[] = [];
for (let i = 0; i < args.length; i++) { if (args[i] === '-o') out = args[++i]; else inputs.push(args[i]); }
if (!inputs.length) { console.error('usage: skate3-census <mods dir | mod.zip | mod folder>... [-o base_refs.json]'); process.exit(2); }

const isMod = (p: string) => (statSync(p).isDirectory() ? existsSync(join(p, 'reskate-levels.json')) : /\.zip$/i.test(p));
const mods: string[] = [];
for (const a of inputs) {
  if (isMod(a)) mods.push(a);
  else if (statSync(a).isDirectory()) for (const e of readdirSync(a).sort()) { const p = join(a, e); if (isMod(p)) mods.push(p); }
}
const SKIP = /Characters|Clothing|Skate_Shop|Barber|Tattoo|Accessories/;
const per: Record<string, ModCensus | { error: string }> = {};
for (const m of mods) {
  const name = basename(m).replace(/\.zip$/i, '');
  if (SKIP.test(name)) continue;
  const t0 = performance.now();
  let dispose = () => {};
  try {
    const o = await openInput(m); dispose = o.dispose;
    const c = await censusMod(o.src);
    per[name] = c;
    console.log(`${name.padEnd(36)} ${Object.keys(c.placements).length} base assets placed, ${Object.keys(c.textures).length} base textures, ${c.materials.withBase}/${c.materials.total} materials (${((performance.now() - t0) / 1000).toFixed(0)}s)`);
  } catch (e) { per[name] = { error: e instanceof Error ? e.message : String(e) }; console.log(`${name.padEnd(36)} ERROR ${(per[name] as { error: string }).error}`); }
  finally { dispose(); }
}

// rank: number of mods using an asset, then total uses
const assets = new Map<string, { kind: string; mods: string[]; uses: number }>();
for (const [mod, c] of Object.entries(per)) {
  if ('error' in c) continue;
  for (const [g, p] of Object.entries(c.placements)) { const a = assets.get(g) ?? { kind: p.kind, mods: [], uses: 0 }; a.mods.push(mod); a.uses += p.count; assets.set(g, a); }
  for (const [g, n] of Object.entries(c.textures)) { const a = assets.get(g) ?? { kind: 'texture', mods: [], uses: 0 }; if (!a.mods.includes(mod)) a.mods.push(mod); a.uses += n; assets.set(g, a); }
}
const ranked = [...assets].sort((a, b) => b[1].mods.length - a[1].mods.length || b[1].uses - a[1].uses).map(([partition, a]) => ({ partition, ...a }));
writeFileSync(out, JSON.stringify({ made: new Date().toISOString(), mods: per, ranked }, null, 1));
const kinds = ranked.reduce<Record<string, number>>((s, a) => { s[a.kind] = (s[a.kind] ?? 0) + 1; return s; }, {});
console.log(`${Object.keys(per).length} mods, ${ranked.length} distinct base assets ${JSON.stringify(kinds)} -> ${out}`);
