import { Hono } from 'hono';
import type { AppEnv } from './env';
import { fail, now, sha256Hex } from './util';

/**
 * Pass-through for ReSkate mod zips from Thunderstore, for the in-browser converter.
 *
 * Thunderstore's API sends CORS headers but its zip CDN does not, so the converter page asks for
 * the bytes through us. Nothing is stored or cached here: the zip streams from Thunderstore's CDN
 * to the requesting browser, which converts it locally. Only packages listed in the ReSkate
 * community resolve, and only to thunderstore.io hosts. Range requests pass through so a client
 * can stream or resume. A client may start a limited number of downloads per hour.
 */
export const thunderstore = new Hono<AppEnv>();

const PART = /^[A-Za-z0-9_]{1,128}$/;
const VERSION = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/;
const HOST = /(^|\.)thunderstore\.io$/;
const COMMUNITY = 'reskate';

async function throttled(c: any, max: number, windowSeconds: number): Promise<boolean> {
  const key = await sha256Hex(`${c.req.header('CF-Connecting-IP') ?? 'local'}|${c.env.SITE}`);
  const t = now();
  const row = await c.env.DB.prepare('SELECT count(*) AS n FROM thunderstore_fetches WHERE ip_hash = ? AND at > ?')
    .bind(key, t - windowSeconds).first();
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO thunderstore_fetches (ip_hash, at) VALUES (?, ?)').bind(key, t),
    c.env.DB.prepare('DELETE FROM thunderstore_fetches WHERE at < ?').bind(t - 86400),
  ]);
  return (row?.n ?? 0) >= max;
}

/** The package version must exist and the package be listed in the ReSkate community. */
async function listed(owner: string, name: string, version: string): Promise<boolean> {
  const get = (path: string) => fetch(`https://thunderstore.io/api/experimental/package/${path}`, {
    headers: { 'User-Agent': 'skatemods', Accept: 'application/json' },
    cf: { cacheTtl: 3600, cacheEverything: true },
  } as RequestInit);
  const [ver, pkg] = await Promise.all([get(`${owner}/${name}/${version}/`), get(`${owner}/${name}/`)]);
  if (ver.status === 404 || pkg.status === 404) return false;
  if (!ver.ok || !pkg.ok) fail(503, 'Thunderstore did not answer, try again in a minute');
  const p = await pkg.json() as { community_listings?: { community: string }[] };
  return (p.community_listings ?? []).some((l) => l.community === COMMUNITY);
}

thunderstore.get('/:owner/:name/:version', async (c) => {
  const { owner, name, version } = c.req.param();
  if (!PART.test(owner) || !PART.test(name) || !VERSION.test(version)) fail(400, 'Not a Thunderstore package id');
  const range = c.req.header('Range');
  // A conversion starts with a whole-file or a first-byte request; later ranges continue it.
  const starting = !range || /^bytes=0-/.test(range);
  if (starting && await throttled(c, 20, 3600)) fail(429, 'Too many downloads from your network. Try again in an hour.');
  if (!await listed(owner, name, version)) fail(404, 'That package is not in the ReSkate community on Thunderstore');

  let url = `https://thunderstore.io/package/download/${owner}/${name}/${version}/`;
  let res: Response | null = null;
  for (let hop = 0; hop < 4; hop++) {
    if (!HOST.test(new URL(url).hostname)) fail(503, 'Thunderstore sent the download somewhere unexpected');
    res = await fetch(url, {
      headers: { 'User-Agent': 'skatemods', ...(range ? { Range: range } : {}) },
      redirect: 'manual',
    });
    const next = res.headers.get('Location');
    if (res.status >= 300 && res.status < 400 && next) { url = new URL(next, url).toString(); continue; }
    break;
  }
  if (!res || !(res.status === 200 || res.status === 206) || !res.body) fail(503, 'Thunderstore could not send that file');
  const headers = new Headers({
    'Content-Type': 'application/zip',
    'Cache-Control': 'private, no-store',
    'Accept-Ranges': 'bytes',
  });
  for (const h of ['Content-Length', 'Content-Range', 'ETag', 'Last-Modified']) {
    const v = res.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(res.body, { status: res.status, headers });
});
