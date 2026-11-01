-- 012: the new tab page's shortcuts and Today list (owner request), per profile.
CREATE TABLE home_shortcuts (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL,
  title       TEXT NOT NULL,
  url         TEXT NOT NULL,
  icon        TEXT,
  sort        INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_home_shortcuts ON home_shortcuts (profile_id, sort);

CREATE TABLE home_todos (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL,
  text        TEXT NOT NULL,
  done_at     INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_home_todos ON home_todos (profile_id, created_at);

-- Profiles whose shortcuts were already filled in from history (so removing them all sticks).
CREATE TABLE home_seeded (profile_id TEXT PRIMARY KEY);
