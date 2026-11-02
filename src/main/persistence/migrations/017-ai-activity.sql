-- 017: the AI activity log (roadmap P3.7): one row per request Orbit sent to Claude — when, for
-- what, which model, tokens and estimated cost, and a description of what was sent. Never the
-- page text, the selection or your question themselves.
CREATE TABLE ai_activity (
  id             TEXT PRIMARY KEY,
  at             INTEGER NOT NULL,
  feature        TEXT NOT NULL,
  model          TEXT NOT NULL,
  input_tokens   INTEGER NOT NULL,
  output_tokens  INTEGER NOT NULL,
  cost           REAL NOT NULL,
  sent           TEXT NOT NULL
);
CREATE INDEX ai_activity_at ON ai_activity (at);
