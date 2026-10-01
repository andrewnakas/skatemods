import { HTTPException } from 'hono/http-exception';

export const now = () => Math.floor(Date.now() / 1000);

/** URL-safe random id. 12 chars ≈ 71 bits: unguessable for private maps. */
export function newId(length = 12): string {
  const alphabet = 'abcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]!);
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function fail(status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 500 | 503, message: string): never {
  throw new HTTPException(status, { message });
}

/** Keep stored file names to a safe, readable subset. */
export function safeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  const cleaned = base.replace(/[^A-Za-z0-9._ -]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120);
  return cleaned || 'file';
}
