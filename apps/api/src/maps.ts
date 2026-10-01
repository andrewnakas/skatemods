import { Hono } from 'hono';
import type { AppEnv, Env, User } from './env';
import { requireUser } from './auth';
import { LICENSES, PLATFORMS, REPORT_REASONS, parseNewMap, type License } from './policy';
import { beginFile, completeFile, deleteMapObjects, putPart, type FileRow } from './storage';
import { fail, newId, now, safeName } from './util';

export interface MapRow {
  id: string;
  owner_id: number;
  title: string;
  description: string;
  author_credit: string;
  rights: 'author' | 'permission';
  permission_note: string;
  license: License;
  source_platform: string;
  status: string;
  review_note: string;
  policy_json: string | null;
  created_at: number;
  updated_at: number;
  approved_at: number | null;
  owner_login?: string;
  owner_avatar?: string | null;
}

const canSee = (map: MapRow, user: User | null) =>
  map.status === 'approved' || (!!user && (user.id === map.owner_id || user.role === 'admin'));

const isPrivileged = (map: MapRow, user: User | null) =>
  !!user && (user.id === map.owner_id || user.role === 'admin');

export async function getMap(env: Env, id: string) {
  return env.DB.prepare(
    `SELECT m.*, u.login AS owner_login, u.avatar_url AS owner_avatar
     FROM maps m JOIN users u ON u.id = m.owner_id WHERE m.id = ?`,
  ).bind(id).first<MapRow>();
}

export async function present(env: Env, map: MapRow, user: User | null) {
  const files = (await env.DB.prepare(
    `SELECT id, kind, name, bytes, downloads FROM files WHERE map_id = ? AND complete = 1 ORDER BY created_at`,
  ).bind(map.id).all()).results;
  const job = await env.DB.prepare(
    `SELECT status, attempts, finished_at, result_json, log_tail, run_url FROM jobs WHERE map_id = ? ORDER BY created_at DESC LIMIT 1`,
  ).bind(map.id).first<any>();
  const privileged = isPrivileged(map, user);
  return {
    id: map.id,
    title: map.title,
    description: map.description,
    authorCredit: map.author_credit,
    rights: map.rights,
    license: map.license,
    licenseLabel: LICENSES[map.license] ?? map.license,
    sourcePlatform: map.source_platform,
    status: map.status,
    createdAt: map.created_at,
    approvedAt: map.approved_at,
    uploader: { login: map.owner_login, avatar: map.owner_avatar },
    files: files.filter((f: any) => privileged || f.kind !== 'log'),
    conversion: job ? {
      status: job.status,
      finishedAt: job.finished_at,
      results: job.result_json ? JSON.parse(job.result_json) : [],
      ...(privileged ? { log: job.log_tail, runUrl: job.run_url, attempts: job.attempts } : {}),
    } : null,
    ...(privileged ? {
      permissionNote: map.permission_note,
      reviewNote: map.review_note,
      policy: map.policy_json ? JSON.parse(map.policy_json) : null,
      canEdit: true,
    } : {}),
  };
}

/** Ask GitHub to start convert.yml now. Without a token the workflow's schedule picks the job up. */
export async function dispatchConversion(env: Env) {
  if (!env.GITHUB_DISPATCH_TOKEN) return false;
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/convert.yml/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'skatemods',
    },
    body: JSON.stringify({ ref: 'main' }),
  });
  return res.ok;
}

export async function queueJob(env: Env, mapId: string) {
  await env.DB.prepare(`INSERT INTO jobs (id, map_id, status, created_at) VALUES (?, ?, 'queued', ?)`)
    .bind(newId(), mapId, now()).run();
  return dispatchConversion(env);
}

export async function audit(env: Env, actor: number | null, action: string, mapId: string | null, note = '') {
  await env.DB.prepare('INSERT INTO audit (actor_id, action, map_id, note, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(actor, action, mapId, note.slice(0, 2000), now()).run();
}

export const maps = new Hono<AppEnv>();

// Public list of approved maps.
maps.get('/', async (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 80);
  const platform = c.req.query('platform');
  const where = [`m.status = 'approved'`];
  const binds: unknown[] = [];
  if (q) { where.push('(m.title LIKE ? OR m.author_credit LIKE ?)'); binds.push(`%${q}%`, `%${q}%`); }
  if (platform && (PLATFORMS as readonly string[]).includes(platform)) { where.push('m.source_platform = ?'); binds.push(platform); }
  const { results } = await c.env.DB.prepare(
    `SELECT m.id, m.title, m.author_credit, m.license, m.source_platform, m.approved_at, u.login AS uploader,
       (SELECT group_concat(kind) FROM files f WHERE f.map_id = m.id AND f.complete = 1 AND f.kind != 'log') AS kinds,
       (SELECT coalesce(sum(downloads), 0) FROM files f WHERE f.map_id = m.id) AS downloads
     FROM maps m JOIN users u ON u.id = m.owner_id
     WHERE ${where.join(' AND ')} ORDER BY m.approved_at DESC LIMIT 200`,
  ).bind(...binds).all();
  c.header('Cache-Control', 'public, max-age=60');
  return c.json({
    maps: results.map((r: any) => ({ ...r, kinds: r.kinds ? [...new Set(String(r.kinds).split(','))] : [] })),
  });
});

maps.get('/:id', async (c) => {
  const map = await getMap(c.env, c.req.param('id'));
  if (!map || !canSee(map, c.get('user'))) fail(404, 'Map not found');
  return c.json(await present(c.env, map, c.get('user')));
});

// Download one file. Private maps: owner and moderators only.
maps.get('/:id/files/:fileId', async (c) => {
  const map = await getMap(c.env, c.req.param('id'));
  if (!map || !canSee(map, c.get('user'))) fail(404, 'Map not found');
  const file = await c.env.DB.prepare('SELECT * FROM files WHERE id = ? AND map_id = ? AND complete = 1')
    .bind(c.req.param('fileId'), map.id).first() as FileRow | null;
  if (!file || (file.kind === 'log' && !isPrivileged(map, c.get('user')))) fail(404, 'File not found');
  const object = await c.env.MAPS.get(file.r2_key);
  if (!object) fail(404, 'File missing from storage');
  if (map.status === 'approved') {
    c.executionCtx.waitUntil(c.env.DB.prepare('UPDATE files SET downloads = downloads + 1 WHERE id = ?').bind(file.id).run());
  }
  return new Response(object.body, {
    headers: {
      'Content-Type': file.kind === 'log' ? 'text/plain; charset=utf-8' : 'application/octet-stream',
      'Content-Length': String(object.size),
      'Content-Disposition': `${file.kind === 'log' ? 'inline' : 'attachment'}; filename="${file.name}"`,
      'Cache-Control': map.status === 'approved' ? 'public, max-age=3600' : 'private, no-store',
    },
  });
});

// Start an upload: rights declaration + metadata, then the client sends parts.
maps.post('/', async (c) => {
  const user = requireUser(c);
  const input = parseNewMap(await c.req.json().catch(() => null), Number(c.env.MAX_UPLOAD_BYTES));
  const pending = await c.env.DB.prepare(
    `SELECT count(*) AS n FROM maps WHERE owner_id = ? AND status IN ('uploading', 'pending_review')`,
  ).bind(user.id).first<{ n: number }>();
  if ((pending?.n ?? 0) >= Number(c.env.MAX_PENDING_PER_USER)) {
    fail(429, 'You have too many maps waiting for review. Wait for those to be reviewed first.');
  }
  const id = newId();
  const t = now();
  await c.env.DB.prepare(
    `INSERT INTO maps (id, owner_id, title, description, author_credit, rights, permission_note, license,
       source_platform, status, attested_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploading', ?, ?, ?)`,
  ).bind(id, user.id, input.title, input.description, input.authorCredit, input.rights, input.permissionNote,
    input.license, input.sourcePlatform, t, t, t).run();
  const file = await beginFile(c.env, id, 'original', safeName(input.fileName), input.fileBytes);
  await audit(c.env, user.id, 'upload.start', id, `${input.rights}; ${input.license}; ${input.fileBytes} bytes`);
  return c.json({ mapId: id, ...file }, 201);
});

async function ownFile(c: any) {
  const user = requireUser(c);
  const map = await getMap(c.env, c.req.param('id'));
  if (!map || map.owner_id !== user.id) fail(404, 'Map not found');
  if (map.status !== 'uploading') fail(409, 'This upload is already finished');
  const file = await c.env.DB.prepare(`SELECT * FROM files WHERE id = ? AND map_id = ? AND kind = 'original'`)
    .bind(c.req.param('fileId'), map.id).first() as FileRow | null;
  if (!file) fail(404, 'Upload not found');
  return { user, map, file };
}

maps.put('/:id/files/:fileId/parts/:part', async (c) => {
  const { file } = await ownFile(c);
  const length = Number(c.req.header('Content-Length'));
  return c.json(await putPart(c.env, file, Number(c.req.param('part')), c.req.raw.body, length));
});

maps.post('/:id/files/:fileId/complete', async (c) => {
  const { user, map, file } = await ownFile(c);
  await completeFile(c.env, file);
  await c.env.DB.prepare(`UPDATE maps SET status = 'pending_review', updated_at = ? WHERE id = ?`).bind(now(), map.id).run();
  const dispatched = await queueJob(c.env, map.id);
  await audit(c.env, user.id, 'upload.complete', map.id);
  return c.json({ ok: true, mapId: map.id, conversion: dispatched ? 'started' : 'queued' });
});

// The uploader can take their own map down at any time.
maps.delete('/:id', async (c) => {
  const user = requireUser(c);
  const map = await getMap(c.env, c.req.param('id'));
  if (!map || (map.owner_id !== user.id && user.role !== 'admin')) fail(404, 'Map not found');
  await deleteMapObjects(c.env, map.id);
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE maps SET status = 'removed', updated_at = ? WHERE id = ?`).bind(now(), map.id),
    c.env.DB.prepare('DELETE FROM files WHERE map_id = ?').bind(map.id),
  ]);
  await audit(c.env, user.id, 'map.remove', map.id, user.id === map.owner_id ? 'by uploader' : 'by moderator');
  return c.json({ ok: true });
});

// Anyone can report a public map; rights holders don't need an account.
maps.post('/:id/report', async (c) => {
  const map = await getMap(c.env, c.req.param('id'));
  if (!map || !canSee(map, c.get('user'))) fail(404, 'Map not found');
  const body = await c.req.json().catch(() => ({})) as any;
  if (!REPORT_REASONS.includes(body.reason)) fail(400, 'Pick a reason');
  const details = String(body.details ?? '').trim().slice(0, 4000);
  const contact = String(body.contact ?? '').trim().slice(0, 200);
  const user = c.get('user');
  if (!user && !contact) fail(400, 'Leave a way to contact you, or sign in');
  if (['copyright', 'stolen'].includes(body.reason) && details.length < 20) {
    fail(400, 'Describe what you own and where the original is (at least 20 characters)');
  }
  await c.env.DB.prepare(
    `INSERT INTO reports (map_id, reporter_id, reason, details, contact, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(map.id, user?.id ?? null, body.reason, details, contact, now()).run();
  await audit(c.env, user?.id ?? null, 'report', map.id, body.reason);
  return c.json({ ok: true }, 201);
});

export const me = new Hono<AppEnv>();

me.get('/', (c) => {
  const user = c.get('user');
  return c.json({ user: user && { login: user.login, name: user.name, avatar: user.avatar_url, role: user.role } });
});

me.get('/maps', async (c) => {
  const user = requireUser(c);
  const { results } = await c.env.DB.prepare(
    `SELECT m.id, m.title, m.status, m.review_note, m.created_at, m.updated_at,
       (SELECT status FROM jobs j WHERE j.map_id = m.id ORDER BY created_at DESC LIMIT 1) AS conversion
     FROM maps m WHERE m.owner_id = ? AND m.status != 'removed' ORDER BY m.created_at DESC`,
  ).bind(user.id).all();
  return c.json({ maps: results });
});
