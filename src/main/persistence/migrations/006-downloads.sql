-- 006: downloads (PLAN.md section 5.2, F-10). `dismissed` hides an item from the sidebar shelf;
-- it stays listed for Library → Downloads (Phase 9).
CREATE TABLE downloads (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL,
  url         TEXT NOT NULL,
  path        TEXT,
  filename    TEXT NOT NULL,
  mime        TEXT,
  total_bytes INTEGER,
  state       TEXT NOT NULL,
  started_at  INTEGER NOT NULL,
  finished_at INTEGER,
  dismissed   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_downloads_recent ON downloads (started_at DESC);
