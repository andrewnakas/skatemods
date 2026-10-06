import { Hono } from 'hono';
import type { AppEnv, Env } from './env';
import { fail, now, sha256Hex } from './util';

/**
 * Face scan pairing for the ReSkate face scan mod.
 *
 * The game makes a code (10 characters of newId's alphabet, about 50 bits) and shows it as a
 * QR code for skatemods.com/face/?c=CODE. The phone page posts what it derived on the device:
 * colours, a hairstyle and a face texture (PNG). The game polls GET /api/face/CODE and then
 * downloads the texture once; that download deletes it. Anything not picked up is purged by
 * the hourly cron after 24 hours.
 *
 * The game only ever GETs, so it needs no origin exemption; the POST comes from our own page.
 */
export const face = new Hono<AppEnv>();

export const FACE_TTL = 24 * 3600;
const CODE = /^[a-km-z2-9]{10}$/;
const HEX = /^#[0-9a-f]{6}$/;
const STYLE = /^[A-Za-z0-9_.-]{1,96}$/;
const MAX_TEXTURE = 4 * 1024 * 1024;
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export interface FaceMeta {
  v: 1;
  /** Skin tone, sRGB. */
  skin: string;
  /** Hair colour, sRGB. */
  hair: string;
  /** A stock hair asset the page matched or the player picked, or null to keep theirs. */
  hairStyle: string | null;
  facialHair: string | null;
  texture: { width: number; height: number; bytes: number; sha256: string } | null;
}

function code(c: any): string {
  const value = String(c.req.param('code') ?? '').toLowerCase();
  if (!CODE.test(value)) fail(400, 'That code is not one the game makes');
  return value;
}

function parseMeta(text: unknown): Omit<FaceMeta, 'texture'> {
  let raw: any;
  try { raw = JSON.parse(String(text)); } catch { fail(400, 'meta must be JSON'); }
  const hex = (v: unknown, what: string) => {
    const s = String(v ?? '').toLowerCase();
    if (!HEX.test(s)) fail(400, `${what} must be a #rrggbb colour`);
    return s;
  };
  const style = (v: unknown, what: string) => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v !== 'string' || !STYLE.test(v)) fail(400, `${what} is not a valid asset name`);
    return v;
  };
  return { v: 1, skin: hex(raw?.skin, 'skin'), hair: hex(raw?.hair, 'hair'),
    hairStyle: style(raw?.hairStyle, 'hairStyle'), facialHair: style(raw?.facialHair, 'facialHair') };
}

function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24 || PNG.some((b, i) => bytes[i] !== b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

async function clientKey(c: any) {
  return sha256Hex(`face|${c.req.header('CF-Connecting-IP') ?? 'local'}|${c.env.SITE}`);
}

/** A live scan: not expired, not picked up. */
async function live(env: Env, value: string) {
  const row = await env.DB.prepare('SELECT * FROM face_scans WHERE code = ?').bind(value).first<any>();
  if (!row || row.picked_at || row.expires_at < now()) return null;
  return row;
}

face.post('/:code', async (c) => {
  const value = code(c);
  const form = await c.req.formData().catch(() => fail(400, 'Send multipart form data'));
  const meta = parseMeta(form.get('meta'));
  const file = form.get('texture');
  let texture: FaceMeta['texture'] = null;
  let bytes: Uint8Array | null = null;
  if (file && typeof file !== 'string') {
    if (file.size > MAX_TEXTURE) fail(413, 'The face texture is too large');
    bytes = new Uint8Array(await file.arrayBuffer());
    const size = pngSize(bytes);
    if (!size || size.width > 2048 || size.height > 2048 || size.width < 64 || size.height < 64)
      fail(400, 'The face texture must be a PNG between 64 and 2048 pixels a side');
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    texture = { ...size, bytes: bytes.length,
      sha256: Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('') };
  }

  const ip = await clientKey(c);
  const t = now();
  const max = Number(c.env.FACE_SCANS_PER_HOUR ?? 10);
  const recent = await c.env.DB.prepare('SELECT count(*) AS n FROM face_scans WHERE ip_hash = ? AND created_at > ?')
    .bind(ip, t - 3600).first<{ n: number }>();
  if ((recent?.n ?? 0) >= max) fail(429, 'Too many scans from here. Try again in an hour.');

  const key = texture ? `face/${value}/face.png` : null;
  const full: FaceMeta = { ...meta, texture };
  const inserted = await c.env.DB.prepare(
    'INSERT INTO face_scans (code, created_at, expires_at, ip_hash, meta, texture_key) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(code) DO NOTHING',
  ).bind(value, t, t + FACE_TTL, ip, JSON.stringify(full), key).run();
  if (!inserted.meta.changes) fail(409, 'That code was already used. Start a new scan in the game.');
  if (key && bytes) await c.env.MAPS.put(key, bytes, { httpMetadata: { contentType: 'image/png' } });
  return c.json({ ok: true, expiresAt: t + FACE_TTL }, 201);
});

face.get('/:code', async (c) => {
  const row = await live(c.env, code(c));
  if (!row) return c.json({ error: 'Not scanned yet' }, 404);
  return c.json(JSON.parse(row.meta) as FaceMeta);
});

/** The game's pickup: returns the texture and deletes everything kept for the code. */
face.get('/:code/texture', async (c) => {
  const value = code(c);
  const row = await live(c.env, value);
  if (!row || !row.texture_key) return c.json({ error: 'Not scanned yet' }, 404);
  const object = await c.env.MAPS.get(row.texture_key);
  const body = object ? await object.arrayBuffer() : null;
  await pickUp(c.env, value, row.texture_key);
  if (!body) return c.json({ error: 'Not scanned yet' }, 404);
  return new Response(body, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' } });
});

/** A scan without a texture is picked up by reading its colours, then saying so. */
face.get('/:code/done', async (c) => {
  const value = code(c);
  const row = await live(c.env, value);
  if (row) await pickUp(c.env, value, row.texture_key);
  return c.json({ ok: true });
});

async function pickUp(env: Env, value: string, key: string | null) {
  await env.DB.prepare('UPDATE face_scans SET picked_at = ?, meta = NULL, texture_key = NULL WHERE code = ?')
    .bind(now(), value).run();
  if (key) await env.MAPS.delete(key);
}

/** Hourly: delete what was never picked up after 24 hours, and forget old codes. */
export async function purgeFaceScans(env: Env) {
  const t = now();
  const { results } = await env.DB.prepare('SELECT code, texture_key FROM face_scans WHERE expires_at < ?')
    .bind(t).all<{ code: string; texture_key: string | null }>();
  const keys = results.map((r) => r.texture_key).filter((k): k is string => !!k);
  if (keys.length) await env.MAPS.delete(keys);
  await env.DB.prepare('DELETE FROM face_scans WHERE expires_at < ?').bind(t).run();
  return results.length;
}
