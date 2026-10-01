// End-to-end against `wrangler dev` with DEV_LOGIN=1 (see README).
// Run: npm run dev  (in another shell), then: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';

const BASE = process.env.API ?? 'http://localhost:8787';
const ORIGIN = BASE;

class Client {
  cookie = '';
  async req(method, path, { json, body, headers = {}, auth } = {}) {
    const h = { Origin: ORIGIN, ...headers };
    if (this.cookie) h.Cookie = this.cookie;
    if (auth) h.Authorization = auth;
    if (json !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    const res = await fetch(BASE + path, { method, headers: h, body, redirect: 'manual' });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    return res;
  }
  async login(as) { await this.req('GET', `/api/auth/dev-login?as=${as}&next=/`); return this; }
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const runner = new Client();
const RUN = 'Bearer dev-runner';

const goodMap = (bytes, extra = {}) => ({
  title: 'Test Park', description: 'A park for tests', authorCredit: 'Tester', rights: 'author',
  license: 'cc-by-4.0', sourcePlatform: 'ps3', fileName: 'testpark.7z', fileBytes: bytes,
  attest: { rights: true, noRetail: true, terms: true }, ...extra,
});

async function upload(client, data, extra) {
  const start = await client.req('POST', '/api/maps', { json: goodMap(data.length, extra) });
  assert.equal(start.status, 201, await start.clone().text());
  const { mapId, fileId, partSize, parts } = await start.json();
  for (let p = 1; p <= parts; p++) {
    const chunk = data.subarray((p - 1) * partSize, p * partSize);
    const r = await client.req('PUT', `/api/maps/${mapId}/files/${fileId}/parts/${p}`, { body: chunk, headers: { 'Content-Length': String(chunk.length) } });
    assert.equal(r.status, 200, await r.clone().text());
  }
  const done = await client.req('POST', `/api/maps/${mapId}/files/${fileId}/complete`);
  assert.equal(done.status, 200, await done.clone().text());
  return mapId;
}

async function runJob(policy = { verdict: 'ok', reasons: [] }) {
  const claim = await runner.req('POST', '/api/runner/claim', { auth: RUN });
  assert.equal(claim.status, 200);
  const { job, input } = await claim.json();
  const inBuf = Buffer.from(await (await runner.req('GET', `/api/runner/jobs/${job}/input`, { auth: RUN })).arrayBuffer());
  assert.equal(inBuf.length, input.bytes);
  const out = Buffer.from(`converted:${sha(inBuf)}`);
  const begin = await runner.req('POST', `/api/runner/jobs/${job}/files`, { auth: RUN, json: { kind: 'recomp', name: 'testpark_00000000.big', bytes: out.length } });
  const { fileId } = await begin.json();
  await runner.req('PUT', `/api/runner/jobs/${job}/files/${fileId}/parts/1`, { auth: RUN, body: out, headers: { 'Content-Length': String(out.length) } });
  assert.equal((await runner.req('POST', `/api/runner/jobs/${job}/files/${fileId}/complete`, { auth: RUN })).status, 200);
  const fin = await runner.req('POST', `/api/runner/jobs/${job}/complete`, { auth: RUN, json: {
    ok: true, results: [{ map: 'TestPark', source: 'ps3', target: 'recomp', ok: true, bytes: out.length }], log: 'all good\n', policy,
  } });
  assert.equal(fin.status, 200);
  return { inBuf, out };
}

test('full lifecycle', async () => {
  const anon = new Client();
  const alice = await new Client().login('alice');
  const admin = await new Client().login('andrewnakas');
  const mallory = await new Client().login('mallory');

  // Signed-out and cross-origin requests are refused.
  assert.equal((await anon.req('POST', '/api/maps', { json: goodMap(10) })).status, 401);
  const xo = await fetch(BASE + '/api/maps', { method: 'POST', headers: { Origin: 'https://evil.example', Cookie: alice.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(goodMap(10)) });
  assert.equal(xo.status, 403);

  // Rights and policy checks on the declaration.
  const bad = async (extra, re) => {
    const r = await alice.req('POST', '/api/maps', { json: goodMap(10, extra) });
    assert.equal(r.status, 400); assert.match((await r.json()).error, re);
  };
  await bad({ attest: { rights: false, noRetail: true, terms: true } }, /permission/);
  await bad({ attest: { rights: true, noRetail: false, terms: true } }, /retail/);
  await bad({ rights: 'permission', permissionNote: 'ok' }, /Permission details/);
  await bad({ license: 'whatever' }, /license/);
  await bad({ fileName: 'virus.exe' }, /Upload a/);
  await bad({ authorCredit: '' }, /Original author/);

  // Two-part upload (50 MiB + remainder); a wrong-sized part is refused.
  const data = randomBytes(50 * 1024 * 1024 + 12345);
  const mapId = await upload(alice, data);
  const me = await (await alice.req('GET', '/api/me/maps')).json();
  assert.equal(me.maps.find((m) => m.id === mapId).status, 'pending_review');

  // Private until approved: strangers can't see it, even signed in.
  assert.equal((await anon.req('GET', `/api/maps/${mapId}`)).status, 404);
  assert.equal((await mallory.req('GET', `/api/maps/${mapId}`)).status, 404);
  assert.equal((await alice.req('GET', `/api/maps/${mapId}`)).status, 200);
  assert.equal((await mallory.req('GET', '/api/admin/queue')).status, 403);
  assert.ok(!(await (await anon.req('GET', '/api/maps')).json()).maps.some((m) => m.id === mapId));

  // Runner auth: a forged token is refused.
  assert.equal((await runner.req('POST', '/api/runner/claim', { auth: 'Bearer eyJhbGciOiJSUzI1NiJ9.e30.AAAA' })).status, 401);
  const { inBuf, out } = await runJob();
  assert.equal(sha(inBuf), sha(data), 'runner received the exact upload');
  assert.equal((await runner.req('POST', '/api/runner/claim', { auth: RUN })).status, 204, 'queue is empty');

  // Moderator approves; now public, downloadable, and logs stay private.
  const queue = await (await admin.req('GET', '/api/admin/queue')).json();
  assert.ok(queue.maps.some((m) => m.id === mapId && m.policy.verdict === 'ok'));
  assert.equal((await admin.req('POST', `/api/admin/maps/${mapId}`, { json: { action: 'approve' } })).status, 200);
  const pub = await (await anon.req('GET', `/api/maps/${mapId}`)).json();
  assert.equal(pub.status, 'approved');
  assert.equal(pub.permissionNote, undefined, 'rights notes are private');
  assert.ok(!pub.files.some((f) => f.kind === 'log'));
  const recomp = pub.files.find((f) => f.kind === 'recomp');
  const dl = Buffer.from(await (await anon.req('GET', `/api/maps/${mapId}/files/${recomp.id}`)).arrayBuffer());
  assert.deepEqual(dl, out);
  assert.ok((await (await anon.req('GET', '/api/maps')).json()).maps.some((m) => m.id === mapId && m.kinds.includes('recomp')));

  // Reports: anonymous needs contact; copyright claims need detail.
  assert.equal((await anon.req('POST', `/api/maps/${mapId}/report`, { json: { reason: 'broken' } })).status, 400);
  assert.equal((await anon.req('POST', `/api/maps/${mapId}/report`, { json: { reason: 'copyright', contact: 'me@example.com', details: 'short' } })).status, 400);
  assert.equal((await anon.req('POST', `/api/maps/${mapId}/report`, { json: { reason: 'copyright', contact: 'me@example.com', details: 'I made this map in 2019, original thread: https://example.com/x' } })).status, 201);
  const q2 = await (await admin.req('GET', '/api/admin/queue')).json();
  const report = q2.reports.find((r) => r.map_id === mapId);
  assert.ok(report);
  assert.equal((await admin.req('POST', `/api/admin/reports/${report.id}`, { json: { resolution: 'verified, removing' } })).status, 200);

  // Takedown deletes the files.
  assert.equal((await admin.req('POST', `/api/admin/maps/${mapId}`, { json: { action: 'remove', note: 'DMCA' } })).status, 200);
  assert.equal((await anon.req('GET', `/api/maps/${mapId}`)).status, 404);
  assert.equal((await anon.req('GET', `/api/maps/${mapId}/files/${recomp.id}`)).status, 404);
});

test('automatic policy rejection blocks approval', async () => {
  const bob = await new Client().login('bob');
  const admin = await new Client().login('andrewnakas');
  const mapId = await upload(bob, randomBytes(1000), { title: 'Stock District Rip' });
  await runJob({ verdict: 'reject', reasons: ['DIST_University is a retail district'] });
  const mine = await (await bob.req('GET', `/api/maps/${mapId}`)).json();
  assert.equal(mine.status, 'rejected');
  assert.match(mine.reviewNote, /retail district/);
  assert.equal((await admin.req('POST', `/api/admin/maps/${mapId}`, { json: { action: 'approve' } })).status, 409);
  // The uploader can delete their own map.
  assert.equal((await bob.req('DELETE', `/api/maps/${mapId}`)).status, 200);
});

test('site accounts: sign up, sign in, upload, no moderator powers', async () => {
  const name = `skater_${Date.now().toString(36)}`;
  const a = new Client();
  const bad = async (body, status, re) => {
    const r = await a.req('POST', '/api/auth/signup', { json: { agree: true, ...body } });
    assert.equal(r.status, status); assert.match((await r.json()).error, re);
  };
  await bad({ username: 'ab', password: 'long enough pass' }, 400, /3 to 24/);
  await bad({ username: name, password: 'short' }, 400, /10 characters/);
  await bad({ username: name, password: `${name}123456` }, 400, /guessable/);
  await bad({ username: 'admin', password: 'correct horse battery' }, 400, /reserved/);
  // Names that exist on GitHub belong to their owners.
  await bad({ username: 'torvalds', password: 'correct horse battery' }, 409, /GitHub account/);
  await bad({ username: name, password: 'correct horse battery', agree: false }, 400, /policy/);

  assert.equal((await a.req('POST', '/api/auth/signup', { json: { username: name, password: 'correct horse battery', agree: true } })).status, 201);
  const me = (await (await a.req('GET', '/api/me')).json()).user;
  assert.equal(me.login, name); assert.equal(me.account, 'site'); assert.equal(me.role, 'user');
  assert.equal((await a.req('POST', '/api/auth/signup', { json: { username: name.toUpperCase(), password: 'correct horse battery', agree: true } })).status, 409, 'case-insensitive');

  // Sign out and back in.
  await a.req('POST', '/api/auth/logout');
  assert.equal((await (await a.req('GET', '/api/me')).json()).user, null);
  const b = new Client();
  assert.equal((await b.req('POST', '/api/auth/password', { json: { username: name, password: 'wrong password!!' } })).status, 401);
  assert.equal((await b.req('POST', '/api/auth/password', { json: { username: 'nobody_here_x', password: 'whatever pass' } })).status, 401);
  assert.equal((await b.req('POST', '/api/auth/password', { json: { username: name, password: 'correct horse battery' } })).status, 200);

  // Can upload; cannot moderate.
  const mapId = await upload(b, randomBytes(2000), { title: 'Site account map' });
  assert.equal((await b.req('GET', `/api/maps/${mapId}`)).status, 200);
  assert.equal((await b.req('GET', '/api/admin/queue')).status, 403);
  await runJob();
  assert.equal((await b.req('DELETE', `/api/maps/${mapId}`)).status, 200);
});
