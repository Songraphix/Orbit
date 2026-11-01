-- 003: browsing history with full-text search (PLAN.md section 5.2), favicons by host, and
-- per-site settings (zoom now; permissions etc. in Phase 3+). profile_id is 'default' until
-- profiles arrive in Phase 3.
CREATE TABLE history (
  id            INTEGER PRIMARY KEY,
  profile_id    TEXT NOT NULL,
  url           TEXT NOT NULL,
  title         TEXT NOT NULL DEFAULT '',
  visit_count   INTEGER NOT NULL DEFAULT 1,
  last_visit_at INTEGER NOT NULL,
  UNIQUE (profile_id, url)
);
CREATE INDEX idx_history_recent ON history (profile_id, last_visit_at DESC);

CREATE VIRTUAL TABLE history_fts USING fts5(
  title, url, content = 'history', content_rowid = 'id', tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TRIGGER history_ai AFTER INSERT ON history BEGIN
  INSERT INTO history_fts (rowid, title, url) VALUES (new.id, new.title, new.url);
END;
CREATE TRIGGER history_ad AFTER DELETE ON history BEGIN
  INSERT INTO history_fts (history_fts, rowid, title, url) VALUES ('delete', old.id, old.title, old.url);
END;
CREATE TRIGGER history_au AFTER UPDATE ON history BEGIN
  INSERT INTO history_fts (history_fts, rowid, title, url) VALUES ('delete', old.id, old.title, old.url);
  INSERT INTO history_fts (rowid, title, url) VALUES (new.id, new.title, new.url);
END;

CREATE TABLE favicons (
  host       TEXT PRIMARY KEY,
  data_url   TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE site_settings (
  profile_id TEXT NOT NULL,
  origin     TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  PRIMARY KEY (profile_id, origin, key)
);
