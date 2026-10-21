-- Throttle the Thunderstore pass-through (src/thunderstore.ts): one row per conversion start.
CREATE TABLE thunderstore_fetches (
  ip_hash  TEXT NOT NULL,
  at       INTEGER NOT NULL
);
CREATE INDEX thunderstore_fetches_recent ON thunderstore_fetches(ip_hash, at);
