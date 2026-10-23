-- ReSkate maps converted to Skate 3 recomp packs on demand (src/reskate_convert.ts).
-- One row per (package, version, converter): the first player to press Convert
-- builds it, everyone after gets the same pack at once. Packs hold no game data
-- (the converter reads only the mod and the CC0 base pack).
CREATE TABLE reskate_conversions (
  id            TEXT PRIMARY KEY,
  full_name     TEXT NOT NULL,                -- Thunderstore owner-name
  version       TEXT NOT NULL,
  converter     TEXT NOT NULL,                -- CONVERTER_VERSION; a bump rebuilds every map on its next request
  status        TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  run_url       TEXT,
  claimed_at    INTEGER,
  finished_at   INTEGER,
  error         TEXT,
  log_tail      TEXT,
  report_json   TEXT,
  folder        TEXT,                         -- the pack's folder (content id), e.g. OGBERRICS
  requests      INTEGER NOT NULL DEFAULT 1,
  downloads     INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE (full_name, version, converter)
);
CREATE INDEX reskate_conversions_queue ON reskate_conversions (status, created_at);

-- The pack's two files (.big, .header), uploaded by the runner in parts.
CREATE TABLE reskate_conversion_files (
  conv_id    TEXT NOT NULL REFERENCES reskate_conversions(id) ON DELETE CASCADE,
  which      TEXT NOT NULL CHECK (which IN ('big', 'header')),
  name       TEXT NOT NULL,
  r2_key     TEXT NOT NULL UNIQUE,
  bytes      INTEGER NOT NULL,
  upload_id  TEXT,
  complete   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (conv_id, which)
);
CREATE TABLE reskate_conversion_parts (
  conv_id TEXT NOT NULL,
  which   TEXT NOT NULL,
  part    INTEGER NOT NULL,
  etag    TEXT NOT NULL,
  bytes   INTEGER NOT NULL,
  PRIMARY KEY (conv_id, which, part)
);

-- Convert requests per client, for the hourly limit on new builds.
CREATE TABLE reskate_convert_requests (ip_hash TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX reskate_convert_requests_at ON reskate_convert_requests (ip_hash, at);
