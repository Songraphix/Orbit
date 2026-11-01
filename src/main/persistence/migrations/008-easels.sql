-- 008: Easels (PLAN.md section 5.2, F-19). scene_json is the Excalidraw scene (elements, app
-- state and pasted/captured images); preview is a small JPEG data: URL for Library → Easels.
CREATE TABLE easels (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL,
  space_id    TEXT,
  title       TEXT NOT NULL,
  scene_json  TEXT NOT NULL DEFAULT '',
  preview     TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_easels_recent ON easels (updated_at DESC);
