-- Face scans for the ReSkate face scan mod: the game shows a QR code with a code it made,
-- the phone page posts what it derived from the camera (colours, a hairstyle, a face texture
-- in R2 under face/<code>/), and the game picks it up once. A row outlives its pickup (meta
-- cleared, files deleted) until expires_at, so a code can't be reused and the hourly cron
-- has something to purge. Raw camera frames never reach us.
CREATE TABLE face_scans (
  code        TEXT PRIMARY KEY,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  picked_at   INTEGER,
  ip_hash     TEXT NOT NULL,
  meta        TEXT,
  texture_key TEXT
);
CREATE INDEX face_scans_ip ON face_scans(ip_hash, created_at);
CREATE INDEX face_scans_expiry ON face_scans(expires_at);
