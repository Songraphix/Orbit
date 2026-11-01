-- 004: profiles, spaces and the sidebar tree (PLAN.md section 5.2). Phase 1's `tabs` rows are
-- moved into the default space's Today section by SidebarRepository on first open.
CREATE TABLE profiles (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  partition  TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE spaces (
  id                  TEXT PRIMARY KEY,
  profile_id          TEXT NOT NULL REFERENCES profiles (id),
  name                TEXT NOT NULL,
  icon                TEXT NOT NULL,
  theme_json          TEXT NOT NULL,
  sort_key            TEXT NOT NULL,
  last_active_item_id TEXT,
  created_at          INTEGER NOT NULL
);

CREATE TABLE sidebar_items (
  id             TEXT PRIMARY KEY,
  profile_id     TEXT NOT NULL REFERENCES profiles (id),
  space_id       TEXT REFERENCES spaces (id) ON DELETE CASCADE,
  parent_id      TEXT REFERENCES sidebar_items (id) ON DELETE CASCADE,
  section        TEXT NOT NULL CHECK (section IN ('favorite', 'pinned', 'today')),
  kind           TEXT NOT NULL CHECK (kind IN ('tab', 'folder')),
  sort_key       TEXT NOT NULL,
  title          TEXT NOT NULL DEFAULT '',
  title_override TEXT,
  url            TEXT,
  home_url       TEXT,
  favicon        TEXT,
  collapsed      INTEGER NOT NULL DEFAULT 0,
  last_active_at INTEGER,
  created_at     INTEGER NOT NULL
);
CREATE INDEX idx_items_space ON sidebar_items (space_id, section, parent_id, sort_key);
CREATE INDEX idx_items_profile ON sidebar_items (profile_id, section);
