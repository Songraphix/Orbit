-- 002: open tabs, for session restore (Phase 1). Phase 3 moves these into sidebar_items
-- (Today section) when spaces arrive.
CREATE TABLE tabs (
  id         TEXT PRIMARY KEY,
  position   INTEGER NOT NULL,
  url        TEXT NOT NULL,
  title      TEXT NOT NULL DEFAULT '',
  favicon    TEXT,
  is_active  INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
