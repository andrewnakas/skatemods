export interface Env {
  DB: D1Database;
  MAPS: R2Bucket;
  SITE: string;
  GITHUB_REPO: string;
  OIDC_AUDIENCE: string;
  ADMINS: string;
  MAX_UPLOAD_BYTES: string;
  MAX_PENDING_PER_USER: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  /** Fine-grained PAT: Actions RW on GITHUB_REPO (dispatch), Contents RW on MAPS_REPO (releases). */
  GITHUB_TOKEN?: string;
  MAPS_REPO: string;
  /** New site accounts allowed per client per hour (default 3). */
  SIGNUPS_PER_HOUR?: string;
  /** Face scans allowed per client per hour (default 10). */
  FACE_SCANS_PER_HOUR?: string;
  /** Local development only: enables /api/auth/dev-login. Never set in production. */
  DEV_LOGIN?: string;
}

export interface User {
  id: number;
  github_id: number | null;
  login: string;
  name: string | null;
  avatar_url: string | null;
  role: 'user' | 'admin' | 'banned';
}

export type AppEnv = { Bindings: Env; Variables: { user: User | null } };
