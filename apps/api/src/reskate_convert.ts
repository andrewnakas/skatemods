/**
 * ReSkate maps -> Skate 3 recomp packs, built on demand by convert.yml and cached.
 *
 * The game (and the site) POST .../convert for a Thunderstore package. A pack already built for that
 * package version and converter comes back at once; otherwise a build is queued and the workflow
 * dispatched, and the caller polls GET .../convert until it is done or failed. Packs contain no
 * game data: the converter reads only the mod and the CC0 base pack.
 */
import { Hono } from 'hono';
import type { AppEnv, Env } from './env';
import { requireRunner, type RunnerClaims } from './oidc';
import { dispatchConversion } from './maps';
import { PART_SIZE } from './storage';
import { fail, newId, now, safeName, sha256Hex } from './util';

/** Bump when converter output changes in a way old packs should be rebuilt for. */
export const CONVERTER_VERSION = '2026-10-22.2';
const STALE_SECONDS = 2 * 3600;
const MAX_ATTEMPTS = 3;
/** A failed build may be asked for again after this long (a converter fix may have landed). */
const RETRY_FAILED_AFTER = 6 * 3600;
const NEW_BUILDS_PER_HOUR = 10;

export interface ConversionRow {
  id: string; full_name: string; version: string; converter: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  attempts: number; error: string | null; folder: string | null; finished_at: number | null;
  created_at: number; updated_at: number;
}

/** What the game and site see. */
export async function describe(env: Env, conv: ConversionRow | null, site: string) {
  if (!conv) return { status: 'none' as const };
  const out: Record<string, unknown> = { id: conv.id, status: conv.status, version: conv.version };
  if (conv.status === 'failed') out.error = conv.error ?? 'The conversion failed';
  if (conv.status === 'done') {
    const { results } = await env.DB.prepare(
      `SELECT which, name, bytes FROM reskate_conversion_files WHERE conv_id = ? AND complete = 1 ORDER BY which`,
    ).bind(conv.id).all<{ which: string; name: string; bytes: number }>();
    out.folder = conv.folder;
    out.files = results.map((f) => ({ which: f.which, name: f.name, bytes: f.bytes, url: `${site}/api/reskate/conversions/${conv.id}/${f.which}` }));
  }
  return out;
}

async function latest(env: Env, fullName: string) {
  return env.DB.prepare('SELECT full_name, version, download_url FROM reskate_maps WHERE full_name = ?')
    .bind(fullName).first<{ full_name: string; version: string; download_url: string }>();
}

async function conversionFor(env: Env, fullName: string, version: string) {
  return env.DB.prepare('SELECT * FROM reskate_conversions WHERE full_name = ? AND version = ? AND converter = ?')
    .bind(fullName, version, CONVERTER_VERSION).first<ConversionRow>();
}

async function throttled(c: any): Promise<boolean> {
  const key = await sha256Hex(`${c.req.header('CF-Connecting-IP') ?? 'local'}|${c.env.SITE}|reskate`);
  const t = now();
  const row = await c.env.DB.prepare('SELECT count(*) AS n FROM reskate_convert_requests WHERE ip_hash = ? AND at > ?')
    .bind(key, t - 3600).first();
  if ((row?.n ?? 0) >= NEW_BUILDS_PER_HOUR) return true;
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO reskate_convert_requests (ip_hash, at) VALUES (?, ?)').bind(key, t),
    c.env.DB.prepare('DELETE FROM reskate_convert_requests WHERE at < ?').bind(t - 86400),
  ]);
  return false;
}

// ---- public: /api/reskate/... (mounted on the reskate router's app path) ---------------------
export const reskateConvert = new Hono<AppEnv>();

reskateConvert.use('*', async (c, next) => {
  await next();
  c.header('Access-Control-Allow-Origin', '*');
});

// GET /api/reskate/maps/:fullName/convert - status of the current version's build
reskateConvert.get('/maps/:fullName/convert', async (c) => {
  const map = await latest(c.env, c.req.param('fullName'));
  if (!map) fail(404, 'No such ReSkate map');
  c.header('Cache-Control', 'no-store');
  return c.json(await describe(c.env, await conversionFor(c.env, map.full_name, map.version), c.env.SITE));
});

// POST /api/reskate/maps/:fullName/convert - get the pack, building it first if nobody has
reskateConvert.post('/maps/:fullName/convert', async (c) => {
  const map = await latest(c.env, c.req.param('fullName'));
  if (!map) fail(404, 'No such ReSkate map');
  c.header('Cache-Control', 'no-store');
  const t = now();
  let conv = await conversionFor(c.env, map.full_name, map.version);
  if (conv && conv.status !== 'failed') {
    await c.env.DB.prepare('UPDATE reskate_conversions SET requests = requests + 1 WHERE id = ?').bind(conv.id).run();
    return c.json(await describe(c.env, conv, c.env.SITE));
  }
  if (conv && conv.status === 'failed' && t - (conv.finished_at ?? 0) < RETRY_FAILED_AFTER) {
    return c.json(await describe(c.env, conv, c.env.SITE));
  }
  if (await throttled(c)) fail(429, 'Too many new conversions from your network. Try again in an hour.');
  if (conv) {
    await c.env.DB.prepare(`UPDATE reskate_conversions SET status = 'queued', attempts = 0, error = NULL, requests = requests + 1,
                            updated_at = ? WHERE id = ?`).bind(t, conv.id).run();
  } else {
    await c.env.DB.prepare(`INSERT INTO reskate_conversions (id, full_name, version, converter, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (full_name, version, converter) DO NOTHING`)
      .bind(newId(), map.full_name, map.version, CONVERTER_VERSION, t, t).run();
  }
  conv = await conversionFor(c.env, map.full_name, map.version);
  await dispatchConversion(c.env);
  return c.json(await describe(c.env, conv, c.env.SITE), 202);
});

// GET /api/reskate/conversions/:id/:which - the pack's .big or .header
reskateConvert.get('/conversions/:id/:which', async (c) => {
  const which = c.req.param('which');
  if (which !== 'big' && which !== 'header') fail(404, 'Not found');
  const f = await c.env.DB.prepare(
    `SELECT f.name, f.r2_key, f.bytes FROM reskate_conversion_files f JOIN reskate_conversions v ON v.id = f.conv_id
     WHERE f.conv_id = ? AND f.which = ? AND f.complete = 1 AND v.status = 'done'`,
  ).bind(c.req.param('id'), which).first<{ name: string; r2_key: string; bytes: number }>();
  const object = f && await c.env.MAPS.get(f.r2_key);
  if (!f || !object) fail(404, 'Not found');
  if (which === 'big') {
    await c.env.DB.prepare('UPDATE reskate_conversions SET downloads = downloads + 1 WHERE id = ?').bind(c.req.param('id')).run();
  }
  return new Response(object.body, {
    headers: {
      'Content-Length': String(object.size), 'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${f.name}"`, 'Cache-Control': 'public, max-age=86400, immutable',
      'Access-Control-Allow-Origin': '*',
    },
  });
});

// ---- runner: /api/runner/reskate/... (GitHub OIDC) ----------------------------------------------
type RunnerEnv = AppEnv & { Variables: { runner: RunnerClaims } };
export const reskateRunner = new Hono<RunnerEnv>();
reskateRunner.use('*', requireRunner);

reskateRunner.get('/pending', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT count(*) AS n FROM reskate_conversions WHERE status = 'queued' OR (status = 'running' AND claimed_at < ?)`,
  ).bind(now() - STALE_SECONDS).first<{ n: number }>();
  return c.json({ pending: row?.n ?? 0 });
});

reskateRunner.post('/claim', async (c) => {
  const t = now();
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE reskate_conversions SET status = 'failed', finished_at = ?, error = 'The converter timed out'
                      WHERE status = 'running' AND claimed_at < ? AND attempts >= ?`).bind(t, t - STALE_SECONDS, MAX_ATTEMPTS),
    c.env.DB.prepare(`UPDATE reskate_conversions SET status = 'queued' WHERE status = 'running' AND claimed_at < ?`).bind(t - STALE_SECONDS),
  ]);
  const runUrl = `https://github.com/${c.env.GITHUB_REPO}/actions/runs/${c.get('runner').run_id}`;
  const conv = await c.env.DB.prepare(
    `UPDATE reskate_conversions SET status = 'running', claimed_at = ?, attempts = attempts + 1, run_url = ?, updated_at = ?
     WHERE id = (SELECT id FROM reskate_conversions WHERE status = 'queued' ORDER BY created_at LIMIT 1) AND status = 'queued'
     RETURNING id, full_name, version`,
  ).bind(t, runUrl, t).first<{ id: string; full_name: string; version: string }>();
  if (!conv) return c.body(null, 204);
  const map = await latest(c.env, conv.full_name);
  // Thunderstore's own URL for exactly the version that was asked for.
  const [owner, ...rest] = conv.full_name.split('-');
  const download = map?.version === conv.version ? map.download_url
    : `https://thunderstore.io/package/download/${owner}/${rest.join('-')}/${conv.version}/`;
  // A rebuild replaces any earlier upload.
  const old = (await c.env.DB.prepare('SELECT r2_key FROM reskate_conversion_files WHERE conv_id = ?').bind(conv.id)
    .all<{ r2_key: string }>()).results.map((f) => f.r2_key);
  if (old.length) await c.env.MAPS.delete(old);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM reskate_conversion_files WHERE conv_id = ?').bind(conv.id),
    c.env.DB.prepare('DELETE FROM reskate_conversion_parts WHERE conv_id = ?').bind(conv.id),
  ]);
  return c.json({ id: conv.id, fullName: conv.full_name, version: conv.version, download, converter: CONVERTER_VERSION });
});

async function running(c: any) {
  const conv = await c.env.DB.prepare(`SELECT * FROM reskate_conversions WHERE id = ? AND status = 'running'`)
    .bind(c.req.param('id')).first() as ConversionRow | null;
  if (!conv) fail(404, 'No such running conversion');
  return conv;
}

function whichOf(c: any): 'big' | 'header' {
  const w = c.req.param('which');
  if (w !== 'big' && w !== 'header') fail(400, 'which must be big or header');
  return w;
}

reskateRunner.post('/:id/files/:which', async (c) => {
  const conv = await running(c);
  const which = whichOf(c);
  const { name, bytes } = await c.req.json<{ name: string; bytes: number }>();
  if (!Number.isInteger(bytes) || bytes <= 0 || bytes > 4 * 1024 ** 3) fail(400, 'bad size');
  const key = `reskate/${conv.id}/${which}/${safeName(name)}`;
  const upload = await c.env.MAPS.createMultipartUpload(key, { httpMetadata: { contentDisposition: `attachment; filename="${safeName(name)}"` } });
  await c.env.DB.prepare(
    `INSERT INTO reskate_conversion_files (conv_id, which, name, r2_key, bytes, upload_id) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (conv_id, which) DO UPDATE SET name = excluded.name, r2_key = excluded.r2_key, bytes = excluded.bytes,
       upload_id = excluded.upload_id, complete = 0`,
  ).bind(conv.id, which, safeName(name), key, bytes, upload.uploadId).run();
  return c.json({ partSize: PART_SIZE, parts: Math.max(1, Math.ceil(bytes / PART_SIZE)) }, 201);
});

async function fileOf(c: any) {
  const conv = await running(c);
  const which = whichOf(c);
  const f = await c.env.DB.prepare('SELECT * FROM reskate_conversion_files WHERE conv_id = ? AND which = ?').bind(conv.id, which)
    .first() as { conv_id: string; which: string; r2_key: string; bytes: number; upload_id: string | null; complete: number } | null;
  if (!f || !f.upload_id || f.complete) fail(409, 'No upload in progress');
  return f;
}

reskateRunner.put('/:id/files/:which/parts/:part', async (c) => {
  const f = await fileOf(c);
  const part = Number(c.req.param('part')), length = Number(c.req.header('Content-Length'));
  const parts = Math.max(1, Math.ceil(f.bytes / PART_SIZE));
  if (!Number.isInteger(part) || part < 1 || part > parts) fail(400, `part must be 1..${parts}`);
  const expected = part < parts ? PART_SIZE : f.bytes - PART_SIZE * (parts - 1);
  if (length !== expected || !c.req.raw.body) fail(400, `part ${part} must be exactly ${expected} bytes`);
  const fixed = new FixedLengthStream(length);
  c.req.raw.body.pipeTo(fixed.writable).catch(() => {});
  const up = await c.env.MAPS.resumeMultipartUpload(f.r2_key, f.upload_id!).uploadPart(part, fixed.readable);
  await c.env.DB.prepare(
    `INSERT INTO reskate_conversion_parts (conv_id, which, part, etag, bytes) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (conv_id, which, part) DO UPDATE SET etag = excluded.etag, bytes = excluded.bytes`,
  ).bind(f.conv_id, f.which, part, up.etag, length).run();
  return c.json({ part, etag: up.etag });
});

reskateRunner.post('/:id/files/:which/complete', async (c) => {
  const f = await fileOf(c);
  const { results } = await c.env.DB.prepare('SELECT part, etag, bytes FROM reskate_conversion_parts WHERE conv_id = ? AND which = ? ORDER BY part')
    .bind(f.conv_id, f.which).all<{ part: number; etag: string; bytes: number }>();
  const total = results.reduce((n, p) => n + p.bytes, 0);
  if (results.length !== Math.max(1, Math.ceil(f.bytes / PART_SIZE)) || total !== f.bytes) fail(409, 'Upload incomplete');
  await c.env.MAPS.resumeMultipartUpload(f.r2_key, f.upload_id!).complete(results.map((p) => ({ partNumber: p.part, etag: p.etag })));
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE reskate_conversion_files SET complete = 1, upload_id = NULL WHERE conv_id = ? AND which = ?').bind(f.conv_id, f.which),
    c.env.DB.prepare('DELETE FROM reskate_conversion_parts WHERE conv_id = ? AND which = ?').bind(f.conv_id, f.which),
  ]);
  return c.json({ ok: true });
});

reskateRunner.post('/:id/complete', async (c) => {
  const conv = await running(c);
  const body = await c.req.json<{ ok: boolean; folder?: string; error?: string; log?: string; report?: unknown }>();
  const t = now();
  let ok = !!body.ok;
  let error = body.error ? String(body.error).slice(0, 500) : null;
  if (ok) {
    const done = await c.env.DB.prepare(`SELECT count(*) AS n FROM reskate_conversion_files WHERE conv_id = ? AND complete = 1`)
      .bind(conv.id).first<{ n: number }>();
    if ((done?.n ?? 0) !== 2 || !/^[A-Z0-9_]{1,40}$/.test(body.folder ?? '')) { ok = false; error = 'The runner reported success without a complete pack'; }
  }
  await c.env.DB.prepare(
    `UPDATE reskate_conversions SET status = ?, finished_at = ?, updated_at = ?, folder = ?, error = ?, log_tail = ?, report_json = ? WHERE id = ?`,
  ).bind(ok ? 'done' : 'failed', t, t, ok ? body.folder : null, ok ? null : (error ?? 'The conversion failed'),
    String(body.log ?? '').slice(-4000), body.report ? JSON.stringify(body.report).slice(0, 20000) : null, conv.id).run();
  return c.json({ ok: true });
});
