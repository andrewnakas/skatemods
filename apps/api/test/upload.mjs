// Upload a real map file to a local API as a dev user: node test/upload.mjs <file> [user]
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
const [file, as = 'alice'] = process.argv.slice(2);
const BASE = process.env.API ?? 'http://localhost:8787';
let cookie = '';
const req = async (method, path, opts = {}) => {
  const headers = { Origin: BASE, Cookie: cookie, ...(opts.headers ?? {}) };
  const res = await fetch(BASE + path, { method, headers, body: opts.body, redirect: 'manual' });
  const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
  return res;
};
await req('GET', `/api/auth/dev-login?as=${as}`);
const data = readFileSync(file);
const start = await (await req('POST', '/api/maps', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
  title: basename(file), authorCredit: 'local test', rights: 'author', license: 'cc-by-4.0', sourcePlatform: 'unknown',
  fileName: basename(file), fileBytes: data.length, attest: { rights: true, noRetail: true, terms: true } }) })).json();
for (let p = 1; p <= start.parts; p++) {
  const chunk = data.subarray((p - 1) * start.partSize, p * start.partSize);
  const r = await req('PUT', `/api/maps/${start.mapId}/files/${start.fileId}/parts/${p}`, { body: chunk, headers: { 'Content-Length': String(chunk.length) } });
  if (!r.ok) throw new Error(await r.text());
}
console.log(await (await req('POST', `/api/maps/${start.mapId}/files/${start.fileId}/complete`)).text());
