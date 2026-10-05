// Tell IndexNow (Bing, Yandex, Seznam, Naver; Bing feeds ChatGPT search and Copilot) about every
// URL in the built sitemap. Run after a deploy:  node scripts/indexnow.mjs
import { readFileSync } from 'node:fs';

const KEY = '45825ff283d5c912fa3307b0613197a3'; // also served at /45825ff283d5c912fa3307b0613197a3.txt
const xml = readFileSync(new URL('../dist/sitemap.xml', import.meta.url), 'utf8');
const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: 'skatemods.com', key: KEY, keyLocation: `https://skatemods.com/${KEY}.txt`, urlList }),
});
console.log(`IndexNow: ${urlList.length} URLs → HTTP ${res.status}`);
if (res.status >= 400) { console.error(await res.text()); process.exitCode = 1; }
