import { Hono, type MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { AppEnv, Env, User } from './env';
import { fail, now, randomToken, sha256Hex } from './util';

const SESSION_COOKIE = 'skm_session';
const STATE_COOKIE = 'skm_oauth';
const SESSION_DAYS = 30;

/** Loads the signed-in user (or null) for every request. */
export const loadUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('user', null);
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const row = await c.env.DB.prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    ).bind(await sha256Hex(token), now()).first<User>();
    if (row && row.role !== 'banned') c.set('user', row);
  }
  await next();
};

export function requireUser(c: { get(k: 'user'): User | null }): User {
  const user = c.get('user');
  if (!user) fail(401, 'Sign in with GitHub first');
  return user;
}

export function requireAdmin(c: { get(k: 'user'): User | null }): User {
  const user = requireUser(c);
  if (user.role !== 'admin') fail(403, 'Moderators only');
  return user;
}

/**
 * State-changing requests must come from our own pages. SameSite=Lax already
 * blocks cross-site POSTs carrying the cookie; this also rejects other origins.
 */
export const sameOrigin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && !c.req.path.startsWith('/api/runner/')) {
    const origin = c.req.header('Origin') ?? '';
    const allowed = new URL(c.env.SITE).origin;
    // wrangler dev rewrites Origin to the route's host over http; locally, compare hosts only.
    const devOk = c.env.DEV_LOGIN === '1' && /^http:\/\/(localhost(:\d+)?|skatemods\.com)$/.test(origin);
    if (origin !== allowed && !devOk) {
      fail(403, 'Cross-origin request refused');
    }
  }
  await next();
};

function safeNext(env: Env, next: string | undefined): string {
  // Only same-site relative paths, never "//host" or absolute URLs.
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/me/';
}

async function startSession(c: any, userId: number) {
  const token = randomToken();
  await c.env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256Hex(token), userId, now() + SESSION_DAYS * 86400).run();
  setCookie(c, SESSION_COOKIE, token, {
    path: '/', httpOnly: true, secure: c.env.DEV_LOGIN !== '1', sameSite: 'Lax', maxAge: SESSION_DAYS * 86400,
  });
}

async function upsertUser(env: Env, gh: { id: number; login: string; name: string | null; avatar_url: string | null }) {
  const admins = env.ADMINS.split(',').map((s) => s.trim().toLowerCase());
  const role = admins.includes(gh.login.toLowerCase()) ? 'admin' : 'user';
  // Never downgrade a ban on login; promote listed admins.
  return env.DB.prepare(
    `INSERT INTO users (github_id, login, name, avatar_url, role, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(github_id) DO UPDATE SET login = excluded.login, name = excluded.name, avatar_url = excluded.avatar_url,
       role = CASE WHEN users.role = 'banned' THEN 'banned' WHEN excluded.role = 'admin' THEN 'admin' ELSE users.role END
     RETURNING *`,
  ).bind(gh.id, gh.login, gh.name, gh.avatar_url, role, now()).first<User>();
}

export const auth = new Hono<AppEnv>();

auth.get('/login', (c) => {
  if (!c.env.GITHUB_CLIENT_ID) fail(503, 'Sign-in is not configured yet');
  const state = randomToken();
  const next = safeNext(c.env, c.req.query('next'));
  setCookie(c, STATE_COOKIE, `${state}|${next}`, {
    path: '/api/auth', httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 600,
  });
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', c.env.GITHUB_CLIENT_ID);
  url.searchParams.set('redirect_uri', `${c.env.SITE}/api/auth/callback`);
  url.searchParams.set('scope', 'read:user');
  url.searchParams.set('state', state);
  url.searchParams.set('allow_signup', 'true');
  return c.redirect(url.toString());
});

auth.get('/callback', async (c) => {
  const [state, next] = (getCookie(c, STATE_COOKIE) ?? '').split('|');
  deleteCookie(c, STATE_COOKIE, { path: '/api/auth' });
  if (!state || state !== c.req.query('state')) fail(400, 'Sign-in expired, try again');
  const code = c.req.query('code');
  if (!code) fail(400, 'Missing code');

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: c.env.GITHUB_CLIENT_ID, client_secret: c.env.GITHUB_CLIENT_SECRET, code }),
  });
  const { access_token } = await tokenRes.json<{ access_token?: string }>();
  if (!access_token) fail(400, 'GitHub refused the sign-in');

  const ghRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${access_token}`, 'User-Agent': 'skatemods', Accept: 'application/vnd.github+json' },
  });
  if (!ghRes.ok) fail(400, 'Could not read your GitHub profile');
  const gh = await ghRes.json<{ id: number; login: string; name: string | null; avatar_url: string | null }>();

  const user = await upsertUser(c.env, gh);
  if (!user || user.role === 'banned') fail(403, 'This account cannot sign in');
  await startSession(c, user.id);
  return c.redirect(safeNext(c.env, next));
});

auth.post('/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

/** Local development only (DEV_LOGIN=1 in .dev.vars): sign in as a fake user. */
auth.get('/dev-login', async (c) => {
  if (c.env.DEV_LOGIN !== '1') fail(404, 'Not found');
  const login = c.req.query('as') ?? 'devuser';
  const user = await upsertUser(c.env, { id: 1_000_000 + login.length * 7919 + login.charCodeAt(0), login, name: login, avatar_url: null });
  await startSession(c, user!.id);
  return c.redirect(safeNext(c.env, c.req.query('next')));
});
