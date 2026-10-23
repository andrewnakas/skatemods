import { Hono } from 'hono';
import type { AppEnv, Env } from './env';

// ReSkate maps from Thunderstore's "reskate" community, mirrored into D1.
// Thunderstore's package list is ~5 MB of JSON for every mod; the game only
// wants the maps, searched and paged.

const LIST_URL = 'https://thunderstore.io/c/reskate/api/v1/package/';
const MIRROR_EVERY_MS = 60 * 60 * 1000;

interface TsVersion {
  version_number: string; description?: string; icon?: string; download_url: string;
  file_size?: number; downloads?: number; date_created?: string;
}
interface TsPackage {
  full_name: string; name: string; owner: string; package_url: string; date_updated?: string;
  rating_score?: number; is_deprecated?: boolean; categories?: string[]; versions?: TsVersion[];
}

export function mapRows(list: TsPackage[], seenAt: number) {
  const rows = [];
  for (const p of list) {
    if (!p || p.is_deprecated || !(p.categories ?? []).includes('Maps')) continue;
    const v = p.versions?.[0];
    if (!v?.download_url) continue;
    rows.push({
      full_name: p.full_name,
      title: p.name.replace(/_/g, ' '),
      author: p.owner,
      description: (v.description ?? '').slice(0, 300),
      version: v.version_number,
      icon: v.icon ?? null,
      bytes: v.file_size ?? 0,
      downloads: (p.versions ?? []).reduce((n, x) => n + (x.downloads ?? 0), 0),
      rating: p.rating_score ?? 0,
      updated_at: Date.parse(p.date_updated ?? v.date_created ?? '') || seenAt,
      package_url: p.package_url,
      download_url: v.download_url,
      seen_at: seenAt,
    });
  }
  return rows;
}

/** Fetches Thunderstore's list and upserts the maps. Returns how many it saw. */
export async function mirrorReskate(env: Env, fetcher: typeof fetch = fetch): Promise<number> {
  const res = await fetcher(env.RESKATE_LIST_URL || LIST_URL, { headers: { 'User-Agent': 'skatemods.com' } });
  if (!res.ok) throw new Error(`Thunderstore answered ${res.status}`);
  const seenAt = Date.now();
  const rows = mapRows(await res.json() as TsPackage[], seenAt);
  const upsert = env.DB.prepare(
    `INSERT INTO reskate_maps (full_name, title, author, description, version, icon, bytes, downloads, rating,
       updated_at, package_url, download_url, seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (full_name) DO UPDATE SET title = excluded.title, author = excluded.author,
       description = excluded.description, version = excluded.version, icon = excluded.icon,
       bytes = excluded.bytes, downloads = excluded.downloads, rating = excluded.rating,
       updated_at = excluded.updated_at, package_url = excluded.package_url,
       download_url = excluded.download_url, seen_at = excluded.seen_at`);
  const stmts = rows.map(r => upsert.bind(r.full_name, r.title, r.author, r.description, r.version, r.icon,
    r.bytes, r.downloads, r.rating, r.updated_at, r.package_url, r.download_url, r.seen_at));
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  // Gone from Thunderstore (deleted or deprecated): drop it.
  if (rows.length) await env.DB.prepare('DELETE FROM reskate_maps WHERE seen_at < ?').bind(seenAt).run();
  await env.DB.prepare(
    `INSERT INTO kv (k, v) VALUES ('reskate_mirrored_at', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v`,
  ).bind(String(seenAt)).run();
  return rows.length;
}

export async function mirrorIfStale(env: Env) {
  const row = await env.DB.prepare(`SELECT v FROM kv WHERE k = 'reskate_mirrored_at'`).first<{ v: string }>();
  if (!row || Date.now() - Number(row.v) > MIRROR_EVERY_MS) await mirrorReskate(env);
}

export const reskate = new Hono<AppEnv>();

reskate.use('*', async (c, next) => {
  await next();
  c.header('Access-Control-Allow-Origin', '*');
});

// GET /api/reskate/maps?q=&page=&per=&sort=updated|downloads|title
reskate.get('/maps', async (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 80);
  const per = Math.min(Math.max(Number(c.req.query('per')) || 20, 1), 50);
  const page = Math.max(Number(c.req.query('page')) || 0, 0);
  const sort = ({ downloads: 'downloads DESC', title: 'title COLLATE NOCASE' } as Record<string, string>)[
    c.req.query('sort') ?? ''] ?? 'updated_at DESC';
  // The very first request after a deploy fills the table rather than
  // answering "no maps" until the cron runs.
  const any = await c.env.DB.prepare('SELECT 1 FROM reskate_maps LIMIT 1').first();
  if (!any) {
    try { await mirrorReskate(c.env); } catch (e) { console.error('reskate mirror', e); }
  }
  const where = q ? 'WHERE title LIKE ? OR author LIKE ? OR description LIKE ?' : '';
  const binds = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];
  const total = (await c.env.DB.prepare(`SELECT count(*) AS n FROM reskate_maps ${where}`)
    .bind(...binds).first<{ n: number }>())?.n ?? 0;
  const { results } = await c.env.DB.prepare(
    `SELECT full_name, title, author, description, version, icon, bytes, downloads, updated_at, package_url,
       download_url, recomp_map_id FROM reskate_maps ${where} ORDER BY ${sort} LIMIT ? OFFSET ?`,
  ).bind(...binds, per, page * per).all();
  c.header('Cache-Control', 'public, max-age=300');
  return c.json({
    page, per, total, more: (page + 1) * per < total,
    maps: results.map((r: any) => ({
      id: r.full_name, title: r.title, author: r.author, description: r.description, version: r.version,
      icon: r.icon, bytes: r.bytes, downloads: r.downloads, updated: r.updated_at,
      thunderstoreUrl: r.package_url, downloadUrl: r.download_url,
      // A skatemods map id when someone converted it for the recomp, else null.
      recomp: r.recomp_map_id ?? null,
    })),
  });
});
