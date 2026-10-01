/**
 * GitHub Releases as the store for published maps. The convert workflow uploads
 * the assets (it has the files); the Worker only flips visibility and deletes.
 */
import type { Env } from './env';

const GH = 'https://api.github.com';

function headers(env: Env, accept = 'application/vnd.github+json') {
  return { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: accept, 'User-Agent': 'skatemods', 'X-GitHub-Api-Version': '2022-11-28' };
}

export const releasesEnabled = (env: Env) => !!env.GITHUB_TOKEN;

/** Draft releases (and their assets) are invisible to the public. */
export async function setReleaseDraft(env: Env, releaseId: number, draft: boolean) {
  const res = await fetch(`${GH}/repos/${env.MAPS_REPO}/releases/${releaseId}`, {
    method: 'PATCH', headers: headers(env), body: JSON.stringify({ draft }),
  });
  if (!res.ok && res.status !== 404) throw new Error(`GitHub release update failed: ${res.status}`);
}

export async function deleteRelease(env: Env, releaseId: number, tag: string | null) {
  const res = await fetch(`${GH}/repos/${env.MAPS_REPO}/releases/${releaseId}`, { method: 'DELETE', headers: headers(env) });
  if (!res.ok && res.status !== 404) throw new Error(`GitHub release delete failed: ${res.status}`);
  if (tag) await fetch(`${GH}/repos/${env.MAPS_REPO}/git/refs/tags/${encodeURIComponent(tag)}`, { method: 'DELETE', headers: headers(env) });
}

/** Stream a release asset with the token (works for drafts, for owners and moderators). */
export async function fetchAsset(env: Env, assetId: number): Promise<Response> {
  return fetch(`${GH}/repos/${env.MAPS_REPO}/releases/assets/${assetId}`, {
    headers: headers(env, 'application/octet-stream'), redirect: 'follow',
  });
}
