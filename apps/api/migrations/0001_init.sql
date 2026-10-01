-- skatemods: accounts, maps, conversions, moderation.

CREATE TABLE users (
  id          INTEGER PRIMARY KEY,
  github_id   INTEGER NOT NULL UNIQUE,
  login       TEXT NOT NULL,
  name        TEXT,
  avatar_url  TEXT,
  role        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'banned')),
  created_at  INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

-- A map is private (uploading / pending_review / rejected / removed) until a
-- moderator approves it. Rights fields are the uploader's own declaration.
CREATE TABLE maps (
  id               TEXT PRIMARY KEY,
  owner_id         INTEGER NOT NULL REFERENCES users(id),
  title            TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  author_credit    TEXT NOT NULL,
  rights           TEXT NOT NULL CHECK (rights IN ('author', 'permission')),
  permission_note  TEXT NOT NULL DEFAULT '',
  license          TEXT NOT NULL,
  source_platform  TEXT NOT NULL CHECK (source_platform IN ('ps3', 'x360', 'skate', 'unknown')),
  status           TEXT NOT NULL DEFAULT 'uploading'
                   CHECK (status IN ('uploading', 'pending_review', 'approved', 'rejected', 'removed')),
  review_note      TEXT NOT NULL DEFAULT '',
  policy_json      TEXT,          -- automated checks from the runner
  attested_at      INTEGER NOT NULL,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  approved_at      INTEGER
);
CREATE INDEX maps_status ON maps(status, approved_at);
CREATE INDEX maps_owner ON maps(owner_id);

-- Every stored object: the original upload and each conversion output.
CREATE TABLE files (
  id          TEXT PRIMARY KEY,
  map_id      TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('original', 'recomp', 'skate', 'log')),
  name        TEXT NOT NULL,
  r2_key      TEXT NOT NULL UNIQUE,
  bytes       INTEGER NOT NULL DEFAULT 0,
  -- multipart state while uploading; NULL once complete
  upload_id   TEXT,
  complete    INTEGER NOT NULL DEFAULT 0,
  downloads   INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX files_map ON files(map_id);

CREATE TABLE file_parts (
  file_id  TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  part     INTEGER NOT NULL,
  etag     TEXT NOT NULL,
  bytes    INTEGER NOT NULL,
  PRIMARY KEY (file_id, part)
);

CREATE TABLE jobs (
  id           TEXT PRIMARY KEY,
  map_id       TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  attempts     INTEGER NOT NULL DEFAULT 0,
  run_url      TEXT,
  claimed_at   INTEGER,
  finished_at  INTEGER,
  result_json  TEXT,
  log_tail     TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX jobs_status ON jobs(status, created_at);

CREATE TABLE reports (
  id          INTEGER PRIMARY KEY,
  map_id      TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  reporter_id INTEGER REFERENCES users(id),
  reason      TEXT NOT NULL CHECK (reason IN ('copyright', 'stolen', 'retail_assets', 'malware', 'broken', 'other')),
  details     TEXT NOT NULL DEFAULT '',
  contact     TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  resolved_at INTEGER,
  resolution  TEXT
);
CREATE INDEX reports_open ON reports(resolved_at, created_at);

CREATE TABLE audit (
  id         INTEGER PRIMARY KEY,
  actor_id   INTEGER REFERENCES users(id),
  action     TEXT NOT NULL,
  map_id     TEXT,
  note       TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
