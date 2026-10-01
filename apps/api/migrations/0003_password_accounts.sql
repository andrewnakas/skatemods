-- Site accounts (username + password) alongside GitHub sign-in.
-- github_id stays NOT NULL to avoid rebuilding a table other tables reference:
-- site accounts get a synthetic negative id. Real GitHub ids are positive.

ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN email TEXT;

-- One account per name, whatever the case.
CREATE UNIQUE INDEX users_login_nocase ON users(login COLLATE NOCASE);

-- Throttle sign-ups and password guesses per client.
CREATE TABLE auth_attempts (
  ip_hash  TEXT NOT NULL,
  kind     TEXT NOT NULL CHECK (kind IN ('signup', 'login')),
  at       INTEGER NOT NULL
);
CREATE INDEX auth_attempts_recent ON auth_attempts(ip_hash, kind, at);
