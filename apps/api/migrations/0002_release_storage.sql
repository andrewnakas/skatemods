-- Published maps live in GitHub Releases on the maps repo (free storage and
-- bandwidth); R2 holds only uploads that are still private or under review.

ALTER TABLE jobs ADD COLUMN kind TEXT NOT NULL DEFAULT 'convert' CHECK (kind IN ('convert', 'publish'));

ALTER TABLE files ADD COLUMN storage TEXT NOT NULL DEFAULT 'r2' CHECK (storage IN ('r2', 'github'));
ALTER TABLE files ADD COLUMN external_url TEXT;
ALTER TABLE files ADD COLUMN gh_asset_id INTEGER;

ALTER TABLE maps ADD COLUMN release_id INTEGER;
ALTER TABLE maps ADD COLUMN release_tag TEXT;
