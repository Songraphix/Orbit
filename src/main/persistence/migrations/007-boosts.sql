-- 007: Boosts (PLAN.md section 5.2, F-18). settings_json holds the colour, font and zapped
-- selectors; css and js are the user's own code.
CREATE TABLE boosts (
  id            TEXT PRIMARY KEY,
  profile_id    TEXT NOT NULL,
  name          TEXT NOT NULL,
  domain        TEXT NOT NULL,
  enabled       INTEGER NOT NULL DEFAULT 1,
  css           TEXT NOT NULL DEFAULT '',
  js            TEXT NOT NULL DEFAULT '',
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX idx_boosts_domain ON boosts (domain);
