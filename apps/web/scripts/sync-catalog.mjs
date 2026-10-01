// Snapshot the Skate 3 Level Loader's map catalog (metadata only: names, world
// ids, load status). Pack files are never fetched. Run: npm run sync:catalog
import { writeFile } from 'node:fs/promises';

const repo = 'andrewnakas/skate3-level-loader';
const api = `https://api.github.com/repos/${repo}/contents/catalog`;
const headers = { 'User-Agent': 'skatemods-sync', Accept: 'application/vnd.github+json' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

const list = await (await fetch(api, { headers })).json();
if (!Array.isArray(list)) throw new Error(`GitHub API: ${JSON.stringify(list)}`);

const packs = [];
for (const file of list.filter((f) => f.name.endsWith('.json'))) {
  const raw = await (await fetch(file.download_url, { headers })).json();
  packs.push({
    id: raw.id,
    name: raw.name,
    package: raw.package ?? null,
    kind: raw.kind,
    maps: (raw.maps ?? []).map((m) => ({
      worldId: m.world_id,
      name: m.name,
      // '' means not yet swept; anything else is the loader's verdict.
      status: m.status || 'untested',
    })),
  });
}
packs.sort((a, b) => a.name.localeCompare(b.name));

await writeFile(
  new URL('../src/data/catalog.json', import.meta.url),
  JSON.stringify({ source: `https://github.com/${repo}/tree/main/catalog`, synced: new Date().toISOString().slice(0, 10), packs }, null, 2) + '\n',
);
console.log(`catalog: ${packs.length} packs, ${packs.reduce((n, p) => n + p.maps.length, 0)} maps`);
