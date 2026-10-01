import { Hono, type MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { AppEnv, Env, User } from './env';
import { fail, now, randomToken, sha256Hex } from './util';
import { hashPassword, passwordProblem, verifyPassword } from './passwords';

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

/** A login not already used by another account; GitHub names win new conflicts with "-gh". */
async function freeLogin(env: Env, wanted: string, exceptId: number | null): Promise<string> {
  for (let n = 0; n < 50; n++) {
    const candidate = n === 0 ? wanted : `${wanted}-gh${n > 1 ? n : ''}`;
    const taken = await env.DB.prepare('SELECT id FROM users WHERE login = ? COLLATE NOCASE').bind(candidate).first<{ id: number }>();
    if (!taken || taken.id === exceptId) return candidate;
  }
  fail(409, 'Could not pick a username');
}

async function upsertUser(env: Env, gh: { id: number; login: string; name: string | null; avatar_url: string | null }) {
  // Moderators come from GitHub identities only, never from site usernames.
  const admins = env.ADMINS.split(',').map((s) => s.trim().toLowerCase());
  const role = admins.includes(gh.login.toLowerCase()) ? 'admin' : 'user';
  const existing = await env.DB.prepare('SELECT * FROM users WHERE github_id = ?').bind(gh.id).first<User>();
  const login = await freeLogin(env, gh.login, existing?.id ?? null);
  if (existing) {
    // Never lift a ban on sign-in; promote listed admins.
    return env.DB.prepare(
      `UPDATE users SET login = ?, name = ?, avatar_url = ?,
         role = CASE WHEN role = 'banned' THEN 'banned' WHEN ? = 'admin' THEN 'admin' ELSE role END
       WHERE id = ? RETURNING *`,
    ).bind(login, gh.name, gh.avatar_url, role, existing.id).first<User>();
  }
  return env.DB.prepare(
    `INSERT INTO users (github_id, login, name, avatar_url, role, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
  ).bind(gh.id, login, gh.name, gh.avatar_url, role, now()).first<User>();
}

const USERNAME = /^[a-z0-9][a-z0-9_-]{2,23}$/i;
const RESERVED = new Set(['admin', 'administrator', 'moderator', 'mod', 'skatemods', 'support', 'root', 'system', 'ea', 'official', 'staff']);

async function clientKey(c: any) {
  return sha256Hex(`${c.req.header('CF-Connecting-IP') ?? 'local'}|${c.env.SITE}`);
}

/** Too many attempts of this kind from this client recently? Records this one either way. */
async function throttled(c: any, kind: 'signup' | 'login', max: number, windowSeconds: number) {
  const key = await clientKey(c);
  const t = now();
  const row = await c.env.DB.prepare('SELECT count(*) AS n FROM auth_attempts WHERE ip_hash = ? AND kind = ? AND at > ?')
    .bind(key, kind, t - windowSeconds).first();
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO auth_attempts (ip_hash, kind, at) VALUES (?, ?, ?)').bind(key, kind, t),
    c.env.DB.prepare('DELETE FROM auth_attempts WHERE at < ?').bind(t - 86400),
  ]);
  return (row?.n ?? 0) >= max;
}

/** Usernames that exist on GitHub are kept for their owners (they sign in with GitHub). */
async function isGithubLogin(env: Env, login: string): Promise<boolean> {
  const res = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, {
    headers: {
      'User-Agent': 'skatemods', Accept: 'application/vnd.github+json',
      ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}),
    },
  });
  if (res.status === 404) return false;
  if (res.ok) return true;
  fail(503, 'Could not check that username right now, try again in a minute');
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

auth.post('/signup', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { username?: string; password?: string; email?: string; agree?: boolean };
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');
  const email = String(body.email ?? '').trim().slice(0, 200);
  if (!USERNAME.test(username)) fail(400, 'Usernames are 3 to 24 letters, numbers, - or _, starting with a letter or number');
  if (RESERVED.has(username.toLowerCase())) fail(400, 'That username is reserved');
  const problem = passwordProblem(password, username);
  if (problem) fail(400, problem);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'That email address does not look right');
  if (body.agree !== true) fail(400, 'Accept the upload policy to create an account');
  if (await throttled(c, 'signup', Number(c.env.SIGNUPS_PER_HOUR ?? 3), 3600)) fail(429, 'Too many new accounts from your network. Try again in an hour.');
  if (await c.env.DB.prepare('SELECT 1 FROM users WHERE login = ? COLLATE NOCASE').bind(username).first()) fail(409, 'That username is taken');
  if (await isGithubLogin(c.env, username)) {
    fail(409, 'That name belongs to a GitHub account. If it is yours, use "Continue with GitHub" instead.');
  }
  const user = await c.env.DB.prepare(
    // Site accounts carry a negative github_id (see migration 0003).
    `INSERT INTO users (github_id, login, name, password_hash, email, role, created_at)
     VALUES (-1 - abs(random() % 9007199254740000), ?, ?, ?, ?, 'user', ?) RETURNING id`,
  ).bind(username, username, await hashPassword(password), email || null, now()).first<{ id: number }>();
  await startSession(c, user!.id);
  return c.json({ ok: true }, 201);
});

auth.post('/password', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { username?: string; password?: string };
  if (await throttled(c, 'login', 10, 900)) fail(429, 'Too many sign-in attempts. Wait 15 minutes.');
  const user = await c.env.DB.prepare('SELECT id, role, password_hash FROM users WHERE login = ? COLLATE NOCASE')
    .bind(String(body.username ?? '').trim()).first<{ id: number; role: string; password_hash: string | null }>();
  const ok = await verifyPassword(String(body.password ?? ''), user?.password_hash ?? null);
  if (!user || !ok) fail(401, 'Wrong username or password');
  if (user.role === 'banned') fail(403, 'This account cannot sign in');
  await startSession(c, user.id);
  return c.json({ ok: true });
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
