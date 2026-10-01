/** Endpoints for the convert workflow, authenticated by GitHub OIDC. */
import { Hono } from 'hono';
import type { AppEnv } from './env';
import { requireRunner, type RunnerClaims } from './oidc';
import { audit } from './maps';
import { beginFile, completeFile, putPart, putSmallFile, type FileRow } from './storage';
import { fail, now, safeName } from './util';

type RunnerEnv = AppEnv & { Variables: { runner: RunnerClaims } };
export const runner = new Hono<RunnerEnv>();

runner.use('*', requireRunner);

const STALE_SECONDS = 3 * 3600;
const MAX_ATTEMPTS = 3;

// Cheap check so scheduled runs can exit before installing any tools.
runner.get('/pending', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT count(*) AS n FROM jobs j JOIN maps m ON m.id = j.map_id
     WHERE (j.status = 'queued' OR (j.status = 'running' AND j.claimed_at < ?))
       AND m.status IN ('pending_review', 'approved')`,
  ).bind(now() - STALE_SECONDS).first<{ n: number }>();
  return c.json({ pending: row?.n ?? 0 });
});

runner.post('/claim', async (c) => {
  const t = now();
  // Jobs whose runner died: retry a few times, then give up.
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE jobs SET status = 'failed', finished_at = ?, log_tail = 'runner timed out'
                      WHERE status = 'running' AND claimed_at < ? AND attempts >= ?`).bind(t, t - STALE_SECONDS, MAX_ATTEMPTS),
    c.env.DB.prepare(`UPDATE jobs SET status = 'queued' WHERE status = 'running' AND claimed_at < ?`).bind(t - STALE_SECONDS),
  ]);
  const runUrl = `https://github.com/${c.env.GITHUB_REPO}/actions/runs/${c.get('runner').run_id}`;
  const job = await c.env.DB.prepare(
    `UPDATE jobs SET status = 'running', claimed_at = ?, attempts = attempts + 1, run_url = ?
     WHERE id = (SELECT j.id FROM jobs j JOIN maps m ON m.id = j.map_id
                 WHERE j.status = 'queued' AND m.status IN ('pending_review', 'approved')
                 ORDER BY j.created_at LIMIT 1)
       AND status = 'queued'
     RETURNING id, map_id`,
  ).bind(t, runUrl).first<{ id: string; map_id: string }>();
  if (!job) return c.body(null, 204);

  // A re-run replaces the previous outputs.
  const old = (await c.env.DB.prepare(`SELECT r2_key FROM files WHERE map_id = ? AND kind != 'original'`)
    .bind(job.map_id).all<{ r2_key: string }>()).results.map((f) => f.r2_key);
  if (old.length) await c.env.MAPS.delete(old);
  await c.env.DB.prepare(`DELETE FROM files WHERE map_id = ? AND kind != 'original'`).bind(job.map_id).run();

  const input = await c.env.DB.prepare(`SELECT id, name, bytes FROM files WHERE map_id = ? AND kind = 'original' AND complete = 1`)
    .bind(job.map_id).first();
  const map = await c.env.DB.prepare('SELECT id, title, source_platform FROM maps WHERE id = ?').bind(job.map_id).first();
  return c.json({ job: job.id, map, input });
});

async function runningJob(c: any) {
  const job = await c.env.DB.prepare(`SELECT * FROM jobs WHERE id = ? AND status = 'running'`)
    .bind(c.req.param('jobId')).first();
  if (!job) fail(404, 'No such running job');
  return job as { id: string; map_id: string };
}

runner.get('/jobs/:jobId/input', async (c) => {
  const job = await runningJob(c);
  const file = await c.env.DB.prepare(`SELECT r2_key FROM files WHERE map_id = ? AND kind = 'original' AND complete = 1`)
    .bind(job.map_id).first<{ r2_key: string }>();
  const object = file && await c.env.MAPS.get(file.r2_key);
  if (!object) fail(404, 'Input missing');
  return new Response(object.body, { headers: { 'Content-Length': String(object.size) } });
});

runner.post('/jobs/:jobId/files', async (c) => {
  const job = await runningJob(c);
  const { kind, name, bytes } = await c.req.json<{ kind: string; name: string; bytes: number }>();
  if (kind !== 'recomp' && kind !== 'skate') fail(400, 'kind must be recomp or skate');
  return c.json(await beginFile(c.env, job.map_id, kind, safeName(name), Number(bytes)), 201);
});

async function jobFile(c: any) {
  const job = await runningJob(c);
  const file = await c.env.DB.prepare(`SELECT * FROM files WHERE id = ? AND map_id = ? AND kind IN ('recomp', 'skate')`)
    .bind(c.req.param('fileId'), job.map_id).first() as FileRow | null;
  if (!file) fail(404, 'File not found');
  return file;
}

runner.put('/jobs/:jobId/files/:fileId/parts/:part', async (c) => {
  const file = await jobFile(c);
  return c.json(await putPart(c.env, file, Number(c.req.param('part')), c.req.raw.body, Number(c.req.header('Content-Length'))));
});

runner.post('/jobs/:jobId/files/:fileId/complete', async (c) => {
  await completeFile(c.env, await jobFile(c));
  return c.json({ ok: true });
});

interface Completion {
  ok: boolean;
  results: { map: string; source: string; target: string; ok: boolean; bytes?: number; seconds?: number }[];
  log: string;
  policy: { verdict: 'ok' | 'flag' | 'reject'; reasons: string[]; worlds?: unknown[] };
}

runner.post('/jobs/:jobId/complete', async (c) => {
  const job = await runningJob(c);
  const body = await c.req.json<Completion>();
  const t = now();
  const log = String(body.log ?? '').slice(-200_000);
  if (log) await putSmallFile(c.env, job.map_id, 'log', 'conversion.log', log);
  const verdict = body.policy?.verdict ?? 'flag';
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE jobs SET status = ?, finished_at = ?, result_json = ?, log_tail = ? WHERE id = ?`)
      .bind(body.ok ? 'done' : 'failed', t, JSON.stringify(body.results ?? []), log.slice(-4000), job.id),
    c.env.DB.prepare('UPDATE maps SET policy_json = ?, updated_at = ? WHERE id = ?')
      .bind(JSON.stringify(body.policy ?? { verdict: 'flag', reasons: ['runner sent no policy result'] }), t, job.map_id),
    // A hard policy failure takes the map down at once, whatever its state.
    ...(verdict === 'reject' ? [c.env.DB.prepare(
      `UPDATE maps SET status = 'rejected', review_note = ? WHERE id = ? AND status != 'removed'`,
    ).bind(`Automatic check: ${(body.policy.reasons ?? []).join('; ')}`.slice(0, 2000), job.map_id)] : []),
  ]);
  await audit(c.env, null, `convert.${body.ok ? 'done' : 'failed'}`, job.map_id, `policy ${verdict}`);
  return c.json({ ok: true });
});
