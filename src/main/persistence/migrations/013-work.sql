-- 013: projects and tasks (owner request: project management in the productivity panel).
-- A task's project_id is NULL when it belongs to no project. Dates are local "YYYY-MM-DD".
-- Progress is never stored: it's counted from the tasks.
CREATE TABLE projects (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'active',
  color       TEXT NOT NULL DEFAULT 'purple',
  start_date  TEXT,
  due_date    TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE tasks (
  id           TEXT PRIMARY KEY,
  profile_id   TEXT NOT NULL,
  project_id   TEXT REFERENCES projects (id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  priority     TEXT NOT NULL DEFAULT 'medium',
  status       TEXT NOT NULL DEFAULT 'todo',
  due_date     TEXT,
  completed_at INTEGER,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_tasks_project ON tasks (project_id);

-- Set once the sample projects have been offered, so they never come back.
CREATE TABLE work_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
