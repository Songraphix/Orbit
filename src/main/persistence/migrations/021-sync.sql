-- Cloud sync (docs/FIREBASE.md). Local-first: every change to a synced table is queued here
-- by a trigger, in the same transaction as the change itself, so nothing is lost if Orbit
-- quits before it's sent. One row per record (the latest change); the engine sends it, and
-- notes what the cloud has (sync_records) so unchanged data is never sent twice.

CREATE TABLE sync_outbox (
  kind       TEXT NOT NULL,
  record_id  TEXT NOT NULL,
  changed_at INTEGER NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  next_at    INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  PRIMARY KEY (kind, record_id)
);

-- What the cloud holds for each record this Mac has synced: its update time (the precondition
-- for the next write), the hash of what was sent, and the agreed version for merging.
CREATE TABLE sync_records (
  kind        TEXT NOT NULL,
  record_id   TEXT NOT NULL,
  update_time TEXT NOT NULL,
  hash        TEXT NOT NULL,
  base        TEXT,
  parts       INTEGER NOT NULL DEFAULT 0,
  deleted     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, record_id)
);

-- The engine's own state: account, device id, pull cursor.
CREATE TABLE sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- While the engine applies cloud changes, a row here keeps the triggers from queueing them.
CREATE TABLE sync_guard (active INTEGER NOT NULL);

-- profiles
CREATE TRIGGER sync_profile_insert AFTER INSERT ON profiles WHEN NOT EXISTS (SELECT 1 FROM sync_guard) BEGIN
  INSERT INTO sync_outbox (kind, record_id, changed_at) VALUES ('profile', NEW.id, CAST(unixepoch('subsec') * 1000 AS INTEGER))
  ON CONFLICT (kind, record_id) DO UPDATE SET changed_at = excluded.changed_at, attempts = 0, next_at = 0, last_error = NULL;
END;
CREATE TRIGGER sync_profile_update AFTER UPDATE OF name, partition, display_name, avatar, color ON profiles WHEN NOT EXISTS (SELECT 1 FROM sync_guard) BEGIN
  INSERT INTO sync_outbox (kind, record_id, changed_at) VALUES ('profile', NEW.id, CAST(unixepoch('subsec') * 1000 AS INTEGER))
  ON CONFLICT (kind, record_id) DO UPDATE SET changed_at = excluded.changed_at, attempts = 0, next_at = 0, last_error = NULL;
END;
CREATE TRIGGER sync_profile_delete AFTER DELETE ON profiles WHEN NOT EXISTS (SELECT 1 FROM sync_guard) BEGIN
  INSERT INTO sync_outbox (kind, record_id, changed_at) VALUES ('profile', OLD.id, CAST(unixepoch('subsec') * 1000 AS INTEGER))
  ON CONFLICT (kind, record_id) DO UPDATE SET changed_at = excluded.changed_at, attempts = 0, next_at = 0, last_error = NULL;
END;

-- spaces
CREATE TRIGGER sync_space_insert AFTER INSERT ON spaces WHEN NOT EXISTS (SELECT 1 FROM sync_guard) BEGIN
  INSERT INTO sync_outbox (kind, record_id, changed_at) VALUES ('space', NEW.id, CAST(unixepoch('subsec') * 1000 AS INTEGER))
  ON CONFLICT (kind, record_id) DO UPDATE SET changed_at = excluded.changed_at, attempts = 0, next_at = 0, last_error = NULL;
END;
CREATE TRIGGER sync_space_update AFTER UPDATE OF profile_id, name, icon, theme_json, sort_key ON spaces WHEN NOT EXISTS (SELECT 1 FROM sync_guard) BEGIN
  INSERT INTO sync_outbox (kind, record_id, changed_at) VALUES ('space', NEW.id, CAST(unixepoch('subsec') * 1000 AS INTEGER))
  ON CONFLICT (kind, record_id) DO UPDATE SET changed_at = excluded.changed_at, attempts = 0, next_at = 0, last_error = NULL;
END;
CREATE TRIGGER sync_space_delete AFTER DELETE ON spaces WHEN NOT EXISTS (SELECT 1 FROM sync_guard) BEGIN
  INSERT INTO sync_outbox (kind, record_id, changed_at) VALUES ('space', OLD.id, CAST(unixepoch('subsec') * 1000 AS INTEGER))
  ON CONFLICT (kind, record_id) DO UPDATE SET changed_at = excluded.changed_at, attempts = 0, next_at = 0, last_error = NULL;
END;

-- sidebar_items
CREATE TRIGGER sync_item_insert AFTER INSERT ON sidebar_items WHEN NOT EXISTS (SELECT 1 FROM sync_guard) AND NEW.section != 'today' BEGIN
  INSERT INTO sync_outbox (kind, record_id, changed_at) VALUES ('item', NEW.id, CAST(unixepoch('subsec') * 1000 AS INTEGER))
  ON CONFLICT (kind, record_id) DO UPDATE SET changed_at = excluded.changed_at, attempts = 0, next_at = 0, last_error = NULL;
END;
CREATE TRIGGER sync_item_update AFTER UPDATE OF profile_id, space_id, parent_id, section, kind, sort_key, title_override, url, home_url, collapsed, data_json ON sidebar_items WHEN NOT EXISTS (SELECT 1 FROM sync_guard) AND (NEW.section != 'today' OR OLD.section != 'today') BEGIN
  INSERT INTO sync_outbox (kind, record_id, changed_at) VALUES ('item', NEW.id, CAST(unixepoch('subsec') * 1000 AS INTEGER))
  ON CONFLICT (kind, record_id) DO UPDATE SET changed_at = excluded.changed_at, attempts = 0, next_at = 0, last_error = NULL;
END;
CREATE TRIGGER sync_item_delete AFTER DELETE ON sidebar_items WHEN NOT EXISTS (SELECT 1 FROM sync_guard) AND OLD.section != 'today' BEGIN
  INSERT INTO sync_outbox (kind, record_id, changed_at) VALUES ('item', OLD.id, CAST(unixepoch('subsec') * 1000 AS INTEGER))
  ON CONFLICT (kind, record_id) DO UPDATE SET changed_at = excluded.changed_at, attempts = 0, next_at = 0, last_error = NULL;
END;

-- projects
CREATE TRIGGER sync_project_insert AFTER INSERT ON projects WHEN NOT EXISTS (SELECT 1 FROM sync_guard) BEGIN
  INSERT INTO sync_outbox (kind, record_id, changed_at) VALUES ('project', NEW.id, CAST(unixepoch('subsec') * 1000 AS INTEGER))
  ON CONFLICT (kind, record_id) DO UPDATE SET changed_at = excluded.changed_at, attempts = 0, next_at = 0, last_error = NULL;
END;
CREATE TRIGGER sync_project_update AFTER UPDATE OF name, description, status, color, start_date, due_date, space_id, github_repo, updated_at ON projects WHEN NOT EXISTS (SELECT 1 FROM sync_guard) BEGIN
  INSERT INTO sync_outbox (kind, record_id, changed_at) VALUES ('project', NEW.id, CAST(unixepoch('subsec') * 1000 AS INTEGER))
  ON CONFLICT (kind, record_id) DO UPDATE SET changed_at = excluded.changed_at, attempts = 0, next_at = 0, last_error = NULL;
END;
CREATE TRIGGER sync_project_delete AFTER DELETE ON projects WHEN NOT EXISTS (SELECT 1 FROM sync_guard) BEGIN
  INSERT INTO sync_outbox (kind, record_id, changed_at) VALUES ('project', OLD.id, CAST(unixepoch('subsec') * 1000 AS INTEGER))
  ON CONFLICT (kind, record_id) DO UPDATE SET changed_at = excluded.changed_at, attempts = 0, next_at = 0, last_error = NULL;
END;

-- tasks
CREATE TRIGGER sync_task_insert AFTER INSERT ON tasks WHEN NOT EXISTS (SELECT 1 FROM sync_guard) BEGIN
  INSERT INTO sync_outbox (kind, record_id, changed_at) VALUES ('task', NEW.id, CAST(unixepoch('subsec') * 1000 AS INTEGER))
  ON CONFLICT (kind, record_id) DO UPDATE SET changed_at = excluded.changed_at, attempts = 0, next_at = 0, last_error = NULL;
END;
CREATE TRIGGER sync_task_update AFTER UPDATE OF project_id, title, description, priority, status, due_date, completed_at, updated_at ON tasks WHEN NOT EXISTS (SELECT 1 FROM sync_guard) BEGIN
  INSERT INTO sync_outbox (kind, record_id, changed_at) VALUES ('task', NEW.id, CAST(unixepoch('subsec') * 1000 AS INTEGER))
  ON CONFLICT (kind, record_id) DO UPDATE SET changed_at = excluded.changed_at, attempts = 0, next_at = 0, last_error = NULL;
END;
CREATE TRIGGER sync_task_delete AFTER DELETE ON tasks WHEN NOT EXISTS (SELECT 1 FROM sync_guard) BEGIN
  INSERT INTO sync_outbox (kind, record_id, changed_at) VALUES ('task', OLD.id, CAST(unixepoch('subsec') * 1000 AS INTEGER))
  ON CONFLICT (kind, record_id) DO UPDATE SET changed_at = excluded.changed_at, attempts = 0, next_at = 0, last_error = NULL;
END;

-- notes
CREATE TRIGGER sync_note_insert AFTER INSERT ON notes WHEN NOT EXISTS (SELECT 1 FROM sync_guard) BEGIN
  INSERT INTO sync_outbox (kind, record_id, changed_at) VALUES ('note', NEW.id, CAST(unixepoch('subsec') * 1000 AS INTEGER))
  ON CONFLICT (kind, record_id) DO UPDATE SET changed_at = excluded.changed_at, attempts = 0, next_at = 0, last_error = NULL;
END;
CREATE TRIGGER sync_note_update AFTER UPDATE OF doc_json, text, updated_at, project_id ON notes WHEN NOT EXISTS (SELECT 1 FROM sync_guard) BEGIN
  INSERT INTO sync_outbox (kind, record_id, changed_at) VALUES ('note', NEW.id, CAST(unixepoch('subsec') * 1000 AS INTEGER))
  ON CONFLICT (kind, record_id) DO UPDATE SET changed_at = excluded.changed_at, attempts = 0, next_at = 0, last_error = NULL;
END;
CREATE TRIGGER sync_note_delete AFTER DELETE ON notes WHEN NOT EXISTS (SELECT 1 FROM sync_guard) BEGIN
  INSERT INTO sync_outbox (kind, record_id, changed_at) VALUES ('note', OLD.id, CAST(unixepoch('subsec') * 1000 AS INTEGER))
  ON CONFLICT (kind, record_id) DO UPDATE SET changed_at = excluded.changed_at, attempts = 0, next_at = 0, last_error = NULL;
END;

-- easels
CREATE TRIGGER sync_easel_insert AFTER INSERT ON easels WHEN NOT EXISTS (SELECT 1 FROM sync_guard) BEGIN
  INSERT INTO sync_outbox (kind, record_id, changed_at) VALUES ('easel', NEW.id, CAST(unixepoch('subsec') * 1000 AS INTEGER))
  ON CONFLICT (kind, record_id) DO UPDATE SET changed_at = excluded.changed_at, attempts = 0, next_at = 0, last_error = NULL;
END;
CREATE TRIGGER sync_easel_update AFTER UPDATE OF title, scene_json, background, space_id, updated_at ON easels WHEN NOT EXISTS (SELECT 1 FROM sync_guard) BEGIN
  INSERT INTO sync_outbox (kind, record_id, changed_at) VALUES ('easel', NEW.id, CAST(unixepoch('subsec') * 1000 AS INTEGER))
  ON CONFLICT (kind, record_id) DO UPDATE SET changed_at = excluded.changed_at, attempts = 0, next_at = 0, last_error = NULL;
END;
CREATE TRIGGER sync_easel_delete AFTER DELETE ON easels WHEN NOT EXISTS (SELECT 1 FROM sync_guard) BEGIN
  INSERT INTO sync_outbox (kind, record_id, changed_at) VALUES ('easel', OLD.id, CAST(unixepoch('subsec') * 1000 AS INTEGER))
  ON CONFLICT (kind, record_id) DO UPDATE SET changed_at = excluded.changed_at, attempts = 0, next_at = 0, last_error = NULL;
END;
