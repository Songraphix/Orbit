-- 010: Notes (F-33). doc_json is the editor's document (Tiptap/ProseMirror JSON); text is its
-- plain text, for titles, previews and search.
CREATE TABLE notes (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL,
  doc_json    TEXT NOT NULL DEFAULT '',
  text        TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_notes_recent ON notes (updated_at DESC);
