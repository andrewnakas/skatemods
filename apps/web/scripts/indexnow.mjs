// Tell IndexNow (Bing, Yandex, Seznam, Naver; Bing feeds ChatGPT search and Copilot) about the URLs that
// are new or changed since the last deploy, not the whole sitemap: re-sending ~6,000 unchanged URLs every
// 6 hours is the bulk resubmission IndexNow asks sites not to do, and Bing may throttle it.
//
//   node scripts/indexnow.mjs <previous-sitemap.xml>   after a deploy; the workflow saves the live sitemap before deploying
//   node scripts/indexnow.mjs --all                    submit every URL once (by hand only)
//   DRY_RUN=1 node scripts/indexnow.mjs …              print what would be sent
//
// A URL counts as changed when it's new, or when its <lastmod> is set and differs from the previous sitemap.
import { existsSync, readFileSync } from 'node:fs';

const KEY = '45825ff283d5c912fa3307b0613197a3'; // also served at /45825ff283d5c912fa3307b0613197a3.txt
const CAP = 1000;
const parse = (xml) => new Map([...xml.matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?<\/url>/g)].map((m) => [m[1], m[2] ?? '']));
const built = parse(readFileSync(new URL('../dist/sitemap.xml', import.meta.url), 'utf8'));

const arg = process.argv[2];
let changed;
if (arg === '--all') {
  changed = [...built.keys()];
} else if (arg && existsSync(arg) && parse(readFileSync(arg, 'utf8')).size > 0) {
  const prev = parse(readFileSync(arg, 'utf8'));
  changed = [...built].filter(([u, d]) => !prev.has(u) || (d && d !== prev.get(u))).map(([u]) => u);
} else {
  console.log('IndexNow: no previous sitemap to compare with, nothing sent. Use --all to submit everything.');
  process.exit(0);
}
if (!changed.length) {
  console.log(`IndexNow: no new or changed URLs out of ${built.size}, nothing sent.`);
  process.exit(0);
}
// Newest first, so a big batch (a new category of mods, say) sends the freshest pages.
const urlList = changed.sort((a, b) => (built.get(b) || '').localeCompare(built.get(a) || '')).slice(0, CAP);
if (changed.length > CAP) console.log(`IndexNow: ${changed.length} changed URLs, sending the newest ${CAP}.`);
if (process.env.DRY_RUN) {
  console.log(`IndexNow (dry run): would send ${urlList.length} of ${built.size} URLs:\n${urlList.join('\n')}`);
  process.exit(0);
}

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: 'skatemods.com', key: KEY, keyLocation: `https://skatemods.com/${KEY}.txt`, urlList }),
});
console.log(`IndexNow: ${urlList.length} new or changed URLs (of ${built.size}) → HTTP ${res.status}`);
if (res.status >= 400) { console.error(await res.text()); process.exitCode = 1; }
