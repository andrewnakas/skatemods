// Checks every built page's <title> and meta description: titles Google shows in full (~65 chars),
// descriptions that aren't empty or bloated (Google cuts at ~160 but reads more),
// and no two indexable pages sharing either. Run after `npm run build`. Exits 1 with --strict.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const strict = process.argv.includes('--strict');

async function* pages(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* pages(p);
    else if (e.name === 'index.html') yield p;
  }
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const titles = new Map();
const descs = new Map();
const problems = [];
let count = 0;
for await (const file of pages(DIST)) {
  const html = await readFile(file, 'utf8');
  if (/<meta name="robots" content="noindex"/.test(html)) continue;
  const url = '/' + file.slice(DIST.length).replace(/index\.html$/, '');
  // Mod pages are generated from Thunderstore text; only flag their duplicates, not lengths.
  const mod = /^\/reskate\/[^/]+\/[^/]+\/$/.test(url) && !url.startsWith('/reskate/best');
  const title = decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '');
  const desc = decode(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '');
  count++;
  if (!mod && title.length > 65) problems.push(`${url}  title ${title.length} chars: ${title}`);
  if (!mod && (desc.length < 50 || desc.length > 320)) problems.push(`${url}  description ${desc.length} chars`);
  (titles.get(title) ?? titles.set(title, []).get(title)).push(url);
  // Authors reuse descriptions across their own mods; only our pages must be unique.
  if (!mod) (descs.get(desc) ?? descs.set(desc, []).get(desc)).push(url);
}
for (const [t, urls] of titles) if (urls.length > 1) problems.push(`duplicate title "${t}": ${urls.join(' ')}`);
for (const [d, urls] of descs) if (urls.length > 1) problems.push(`duplicate description (${urls.length} pages): ${urls.slice(0, 4).join(' ')}${urls.length > 4 ? ' …' : ''}`);
console.log(`${count} indexable pages, ${problems.length} problems`);
for (const p of problems) console.log('  ' + p);
if (strict && problems.length) process.exit(1);
