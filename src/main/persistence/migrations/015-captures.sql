-- 015: Orbit Capture (roadmap P2.1): findings saved from the web — a link, a quote, a code
-- snippet or a screenshot — as a project's research. project_id NULL = Unsorted. image is a
-- JPEG data: URL (downscaled), thumb a small one for lists.
CREATE TABLE captures (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL,
  project_id  TEXT,
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  url         TEXT NOT NULL DEFAULT '',
  text        TEXT NOT NULL DEFAULT '',
  language    TEXT NOT NULL DEFAULT '',
  image       TEXT,
  thumb       TEXT,
  comment     TEXT NOT NULL DEFAULT '',
  task_id     TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_captures_project ON captures (project_id, created_at DESC);
