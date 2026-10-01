import { Hono } from 'hono';
import type { AppEnv } from './env';
import { requireAdmin } from './auth';
import { audit, getMap, present, queueJob, removeStorage } from './maps';
import { releasesEnabled, setReleaseDraft } from './releases';
import { fail, now } from './util';

export const admin = new Hono<AppEnv>();

admin.use('*', async (c, next) => { requireAdmin(c); await next(); });

admin.get('/queue', async (c) => {
  const user = c.get('user');
  const pending = (await c.env.DB.prepare(
    `SELECT id FROM maps WHERE status IN ('pending_review', 'uploading') ORDER BY created_at`,
  ).all<{ id: string }>()).results;
  const maps = [];
  for (const { id } of pending) {
    const map = await getMap(c.env, id);
    if (map) maps.push(await present(c.env, map, user));
  }
  const reports = (await c.env.DB.prepare(
    `SELECT r.*, m.title, m.status AS map_status, u.login AS reporter
     FROM reports r JOIN maps m ON m.id = r.map_id LEFT JOIN users u ON u.id = r.reporter_id
     WHERE r.resolved_at IS NULL ORDER BY r.created_at`,
  ).all()).results;
  return c.json({ maps, reports });
});

admin.post('/maps/:id', async (c) => {
  const user = requireAdmin(c);
  const map = await getMap(c.env, c.req.param('id'));
  if (!map) fail(404, 'Map not found');
  const { action, note = '' } = await c.req.json<{ action: string; note?: string }>();
  const t = now();
  switch (action) {
    case 'approve': {
      const policy = map.policy_json ? JSON.parse(map.policy_json) : null;
      if (policy?.verdict === 'reject') fail(409, 'Automated checks rejected this map. Reconvert after fixing the policy, or reject it.');
      await c.env.DB.prepare(`UPDATE maps SET status = 'approved', review_note = ?, approved_at = ?, updated_at = ? WHERE id = ?`)
        .bind(note, t, t, map.id).run();
      if (map.release_id) {
        if (releasesEnabled(c.env)) await setReleaseDraft(c.env, map.release_id, false);
      } else {
        // Move the files from R2 to a public GitHub release.
        await queueJob(c.env, map.id, 'publish');
      }
      break;
    }
    case 'reject':
      if (!note.trim()) fail(400, 'Tell the uploader why');
      await c.env.DB.prepare(`UPDATE maps SET status = 'rejected', review_note = ?, updated_at = ? WHERE id = ?`)
        .bind(note, t, map.id).run();
      break;
    case 'unpublish':
      if (map.release_id) {
        if (!releasesEnabled(c.env)) fail(503, 'Cannot hide the published release: GITHUB_TOKEN is not configured');
        await setReleaseDraft(c.env, map.release_id, true);
      }
      await c.env.DB.prepare(`UPDATE maps SET status = 'pending_review', review_note = ?, updated_at = ? WHERE id = ?`)
        .bind(note, t, map.id).run();
      break;
    case 'remove':
      await removeStorage(c.env, map);
      await c.env.DB.batch([
        c.env.DB.prepare(`UPDATE maps SET status = 'removed', review_note = ?, updated_at = ? WHERE id = ?`).bind(note, t, map.id),
        c.env.DB.prepare('DELETE FROM files WHERE map_id = ?').bind(map.id),
      ]);
      break;
    case 'reconvert':
      if (map.release_id) fail(409, 'Published maps are reconverted by deleting and re-uploading');
      await queueJob(c.env, map.id);
      break;
    default:
      fail(400, 'Unknown action');
  }
  await audit(c.env, user.id, `review.${action}`, map.id, note);
  return c.json({ ok: true });
});

admin.post('/reports/:id', async (c) => {
  const user = requireAdmin(c);
  const { resolution } = await c.req.json<{ resolution: string }>();
  if (!resolution?.trim()) fail(400, 'Say how it was resolved');
  const r = await c.env.DB.prepare('UPDATE reports SET resolved_at = ?, resolution = ? WHERE id = ? AND resolved_at IS NULL RETURNING map_id')
    .bind(now(), resolution.slice(0, 1000), Number(c.req.param('id'))).first<{ map_id: string }>();
  if (!r) fail(404, 'Report not found');
  await audit(c.env, user.id, 'report.resolve', r.map_id, resolution);
  return c.json({ ok: true });
});

admin.post('/users/:login/ban', async (c) => {
  const user = requireAdmin(c);
  const target = await c.env.DB.prepare(`UPDATE users SET role = 'banned' WHERE login = ? AND role != 'admin' RETURNING id`)
    .bind(c.req.param('login')).first<{ id: number }>();
  if (!target) fail(404, 'User not found');
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id).run();
  await audit(c.env, user.id, 'user.ban', null, c.req.param('login'));
  return c.json({ ok: true });
});
