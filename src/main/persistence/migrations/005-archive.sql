-- 005: archived tabs (PLAN.md section 5.2, F-20): closed, cleared or auto-archived Today tabs.
CREATE TABLE archive (
  id          TEXT PRIMARY KEY,
  space_id    TEXT,
  profile_id  TEXT NOT NULL,
  url         TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  favicon     TEXT,
  reason      TEXT NOT NULL CHECK (reason IN ('auto', 'closed', 'cleared')),
  archived_at INTEGER NOT NULL
);
CREATE INDEX idx_archive_recent ON archive (archived_at DESC);

CREATE VIRTUAL TABLE archive_fts USING fts5(
  title, url, content = 'archive', content_rowid = 'rowid', tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TRIGGER archive_ai AFTER INSERT ON archive BEGIN
  INSERT INTO archive_fts (rowid, title, url) VALUES (new.rowid, new.title, new.url);
END;
CREATE TRIGGER archive_ad AFTER DELETE ON archive BEGIN
  INSERT INTO archive_fts (archive_fts, rowid, title, url) VALUES ('delete', old.rowid, old.title, old.url);
END;
