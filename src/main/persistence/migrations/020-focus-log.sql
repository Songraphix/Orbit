-- Focus history (brief M7): finished focus sessions, for today's total and the week. Local only.
CREATE TABLE focus_log (
  id          TEXT PRIMARY KEY,
  task_id     TEXT,
  project_id  TEXT,
  title       TEXT NOT NULL,
  started_at  INTEGER NOT NULL,
  ended_at    INTEGER NOT NULL,
  focused_ms  INTEGER NOT NULL,
  completed   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_focus_log_ended ON focus_log (ended_at);
