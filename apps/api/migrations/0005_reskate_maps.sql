-- ReSkate (skate.) maps listed on Thunderstore, mirrored hourly by the cron
-- (src/reskate.ts) so the game can search and page through them without
-- downloading Thunderstore's whole 5 MB package list.
CREATE TABLE reskate_maps (
  full_name TEXT PRIMARY KEY,            -- owner-name, Thunderstore's id
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL,
  icon TEXT,
  bytes INTEGER NOT NULL DEFAULT 0,
  downloads INTEGER NOT NULL DEFAULT 0,
  rating INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,           -- ms
  package_url TEXT NOT NULL,
  download_url TEXT NOT NULL,
  recomp_map_id TEXT,                    -- a skatemods map converted from it, if any
  seen_at INTEGER NOT NULL               -- ms, last mirror run that listed it
);
CREATE INDEX reskate_maps_updated ON reskate_maps (updated_at DESC);

-- Small settings and bookkeeping values (e.g. when the mirror last ran).
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
