-- 018: roadmap Phase 4. Project templates of your own (the built-in ones live in code), and a
-- project's GitHub repository ("owner/repo") for the GitHub integration. Nullable: nothing
-- existing changes.
CREATE TABLE project_templates (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  color       TEXT NOT NULL,
  tasks_json  TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
ALTER TABLE projects ADD COLUMN github_repo TEXT;
