-- 014: connecting work (roadmap P1.1, P1.2). A project can own a Space (its workspace) and
-- remembers when it was last opened; a note can belong to a project. All nullable: nothing
-- existing changes.
ALTER TABLE projects ADD COLUMN space_id TEXT;
ALTER TABLE projects ADD COLUMN last_opened_at INTEGER;
ALTER TABLE notes ADD COLUMN project_id TEXT;
