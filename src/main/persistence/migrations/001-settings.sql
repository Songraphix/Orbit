-- 001: key/value settings (PLAN.md section 5.2). Values are JSON, validated by src/shared/settings.ts.
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
