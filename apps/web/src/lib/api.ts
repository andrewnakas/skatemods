/** Browser-side client for /api (same origin; the session cookie rides along). */

export interface Me { login: string; name: string | null; avatar: string | null; role: 'user' | 'admin'; account: 'github' | 'site' }

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...rest,
    headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return { error: text }; } })() : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `HTTP ${res.status}`);
  return data as T;
}

let mePromise: Promise<Me | null> | null = null;
export function getMe(): Promise<Me | null> {
  mePromise ??= api<{ user: Me | null }>('/me').then((r) => r.user).catch(() => null);
  return mePromise;
}

export const signInUrl = (next = location.pathname + location.search) =>
  `/signin/?next=${encodeURIComponent(next)}`;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export const formatDate = (unix: number | null) =>
  unix ? new Date(unix * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export const STATUS: Record<string, [string, string]> = {
  uploading: ['warn', 'Upload unfinished'],
  pending_review: ['warn', 'Waiting for review'],
  approved: ['ok', 'Public'],
  rejected: ['bad', 'Rejected'],
  removed: ['bad', 'Removed'],
};

export const KIND_LABEL: Record<string, string> = {
  original: 'Original upload',
  recomp: 'Recomp / Xbox 360 (.big)',
  skate: 'Rust engine (.skate)',
  log: 'Conversion log',
};
