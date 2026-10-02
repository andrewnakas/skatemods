// Checks every external link in the written content (FAQ, communities, guides, games, timeline).
// Usage: node scripts/check-links.mjs [dir-or-file ...]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['src/content', 'src/data/skate3-timeline.ts'];
const files = targets.flatMap(function walk(p) {
  return statSync(p).isDirectory() ? readdirSync(p).flatMap((f) => walk(join(p, f))) : [p];
});
const urls = new Map();
for (const f of files) {
  // Allow balanced parens and apostrophes inside URLs (Wikipedia, PCGamingWiki), then trim trailing punctuation.
  for (const [u] of readFileSync(f, 'utf8').matchAll(/https?:\/\/(?:[^\s()'"<>\]]|\([^\s()]*\)|'(?=\w))+/g)) {
    const url = u.replace(/[.,;:]+$/, '');
    if (!urls.has(url)) urls.set(url, f);
  }
}

// Sites that refuse bots but are fine in a browser; reported, not failed.
const botWalls = /(^|\.)(reddit\.com|discord\.(gg|com)|twitter\.com|x\.com|psx-place\.com|fandom\.com|moddb\.com|ea\.com|rpcs3\.net|pcgamingwiki\.com|nexusmods\.com|ko-fi\.com|se7ensins\.com)$/;

async function check(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(15000) });
      if (res.status === 405 || res.status === 403) res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
      return res.status;
    } catch (e) {
      if (attempt === 2) return `error: ${e.cause?.code ?? e.message}`;
    }
  }
}

let failed = 0;
const list = [...urls];
for (let i = 0; i < list.length; i += 8) {
  await Promise.all(list.slice(i, i + 8).map(async ([url, file]) => {
    const status = await check(url);
    if (status === 200) return;
    const walled = botWalls.test(new URL(url).hostname);
    if (!walled) failed++;
    console.log(`${walled ? 'WARN' : 'FAIL'} ${status} ${url}  (${file})`);
  }));
}
console.log(`${urls.size} links checked, ${failed} failed`);
process.exit(failed ? 1 : 0);
