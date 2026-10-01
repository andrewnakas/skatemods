import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from './env';
import { auth, loadUser, sameOrigin } from './auth';
import { maps, me } from './maps';
import { admin } from './admin';
import { runner } from './runner';
import { LICENSES } from './policy';
import { PART_SIZE } from './storage';

const app = new Hono<AppEnv>().basePath('/api');

app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'private, no-store');
});
app.use('*', sameOrigin);
app.use('*', loadUser);

app.get('/health', (c) => c.json({ ok: true }));
app.get('/config', (c) => c.json({
  licenses: LICENSES,
  partSize: PART_SIZE,
  maxUploadBytes: Number(c.env.MAX_UPLOAD_BYTES),
  signIn: !!c.env.GITHUB_CLIENT_ID || c.env.DEV_LOGIN === '1',
  devLogin: c.env.DEV_LOGIN === '1',
}));

app.route('/auth', auth);
app.route('/me', me);
app.route('/maps', maps);
app.route('/admin', admin);
app.route('/runner', runner);

app.notFound((c) => c.json({ error: 'Not found' }, 404));
app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: 'Something went wrong' }, 500);
});

export default app;
