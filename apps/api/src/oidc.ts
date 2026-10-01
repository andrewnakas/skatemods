/**
 * The convert workflow proves who it is with a GitHub Actions OIDC token, so no
 * long-lived secret is shared between GitHub and the Worker. Only this repo's
 * convert.yml on main is accepted.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from './env';
import { fail } from './util';

const ISSUER = 'https://token.actions.githubusercontent.com';
const jwks = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks`));

export interface RunnerClaims {
  repository: string;
  workflow_ref: string;
  run_id: string;
  ref: string;
}

export function checkClaims(claims: Partial<RunnerClaims>, repo: string): RunnerClaims {
  if (claims.repository !== repo) fail(403, 'Wrong repository');
  if (claims.ref !== 'refs/heads/main') fail(403, 'Only main may convert');
  if (claims.workflow_ref !== `${repo}/.github/workflows/convert.yml@refs/heads/main`) fail(403, 'Wrong workflow');
  return claims as RunnerClaims;
}

export const requireRunner: MiddlewareHandler<AppEnv & { Variables: { runner: RunnerClaims } }> = async (c, next) => {
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) fail(401, 'Missing runner token');
  if (c.env.DEV_LOGIN === '1' && token === 'dev-runner') {
    c.set('runner', { repository: c.env.GITHUB_REPO, workflow_ref: 'local', run_id: '0', ref: 'refs/heads/main' });
    return next();
  }
  let payload;
  try {
    ({ payload } = await jwtVerify(token, jwks, { issuer: ISSUER, audience: c.env.OIDC_AUDIENCE }));
  } catch {
    fail(401, 'Invalid runner token');
  }
  c.set('runner', checkClaims(payload as Partial<RunnerClaims>, c.env.GITHUB_REPO));
  await next();
};
