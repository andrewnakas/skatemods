// Cloudflare Pages Function: /ts-dl/<owner>/<name>[/<version>] streams a ReSkate package zip from Thunderstore to
// the in-browser map converter. Thunderstore's API and zip CDN send no CORS headers, so the browser cannot read
// them directly. Nothing is stored or cached here. Only packages listed in the ReSkate community resolve, and
// only to thunderstore.io hosts, so this is not an open proxy. Range requests pass through.
const PART = /^[A-Za-z0-9_]{1,128}$/;
const VERSION = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/;
const HOST = /(^|\.)thunderstore\.io$/;
const COMMUNITY = 'reskate';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, X-Package, X-Version',
};

const fail = (status, message) =>
  new Response(JSON.stringify({ error: message }), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function meta(owner, name) {
  const r = await fetch(`https://thunderstore.io/api/experimental/package/${owner}/${name}/`, {
    headers: { 'User-Agent': 'skatemods.com map converter', Accept: 'application/json' },
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Thunderstore API ${r.status}`);
  return r.json();
}

export async function onRequest({ request, params }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS' } });
  if (request.method !== 'GET' && request.method !== 'HEAD') return fail(405, 'GET only');
  const [owner, name, version, ...rest] = params.path ?? [];
  if (!owner || !name || rest.length || !PART.test(owner) || !PART.test(name) || (version && !VERSION.test(version))) {
    return fail(400, 'expected /ts-dl/<owner>/<name>[/<version>]');
  }
  let pkg;
  try { pkg = await meta(owner, name); } catch (e) { return fail(502, String(e.message ?? e)); }
  if (!pkg) return fail(404, 'no such package');
  if (!(pkg.community_listings ?? []).some((l) => l.community === COMMUNITY)) return fail(403, 'not a ReSkate package');
  const ver = version ?? pkg.latest?.version_number;
  if (!ver) return fail(404, 'no versions');
  // HEAD answers from the metadata alone (the converter page uses it to see that this route exists)
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers: { ...CORS, 'X-Package': `${owner}-${name}`, 'X-Version': ver } });

  const headers = { 'User-Agent': 'skatemods.com map converter' };
  const range = request.headers.get('Range');
  if (range) headers.Range = range;
  let url = `https://thunderstore.io/package/download/${owner}/${name}/${ver}/`;
  for (let hop = 0; hop < 5; hop++) {
    const r = await fetch(url, { headers, redirect: 'manual' });
    if (r.status >= 300 && r.status < 400 && r.headers.get('Location')) {
      const next = new URL(r.headers.get('Location'), url);
      if (next.protocol !== 'https:' || !HOST.test(next.hostname)) return fail(502, 'download left thunderstore.io');
      url = next.toString();
      continue;
    }
    if (!r.ok && r.status !== 206) return fail(r.status === 404 ? 404 : 502, `download ${r.status}`);
    const out = new Headers(CORS);
    for (const h of ['Content-Length', 'Content-Range', 'Accept-Ranges', 'Last-Modified', 'ETag']) {
      const v = r.headers.get(h); if (v) out.set(h, v);
    }
    out.set('Content-Type', 'application/zip');
    out.set('Content-Disposition', `attachment; filename="${owner}-${name}-${ver}.zip"`);
    out.set('X-Package', `${owner}-${name}`); out.set('X-Version', ver);
    out.set('Cache-Control', 'no-store');
    return new Response(r.body, { status: r.status, headers: out });
  }
  return fail(502, 'too many redirects');
}
