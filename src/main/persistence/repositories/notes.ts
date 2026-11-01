import { randomUUID } from 'node:crypto';
import type { NoteEntry } from '@shared/types/notes';
import type { Database } from '../db';
import { isBlankNote, matchesQuery, notePreview, noteTitle } from '../../notes/model';

const PROFILE = 'default';

type Row = {
  id: string;
  doc_json: string;
  text: string;
  updated_at: number;
  project_id: string | null;
};

/** Notes (F-33), stored in SQLite. */
export class NotesRepository {
  constructor(private readonly db: Database) {}

  /** Newest first; with a query, only notes containing every word of it. */
  list(query = ''): NoteEntry[] {
    const rows = this.db
      .prepare(
        `SELECT id, text, updated_at FROM notes WHERE profile_id = ?
         ORDER BY updated_at DESC, id`,
      )
      .all(PROFILE) as Omit<Row, 'doc_json'>[];
    return rows
      .filter((row) => !isBlankNote(row.text) && (!query || matchesQuery(row.text, query)))
      .map((row) => ({
        id: row.id,
        title: noteTitle(row.text),
        preview: notePreview(row.text),
        updatedAt: row.updated_at,
      }));
  }

  get(
    id: string,
  ): { id: string; doc: string; text: string; updatedAt: number; projectId: string | null } | null {
    const row = this.db
      .prepare(
        `SELECT id, doc_json, text, updated_at, project_id FROM notes
         WHERE profile_id = ? AND id = ?`,
      )
      .get(PROFILE, id) as Row | undefined;
    return row
      ? {
          id: row.id,
          doc: row.doc_json,
          text: row.text,
          updatedAt: row.updated_at,
          projectId: row.project_id,
        }
      : null;
  }

  /** Notes that belong to a project (blank ones aside), newest first. */
  linked(): { id: string; title: string; projectId: string; updatedAt: number }[] {
    const rows = this.db
      .prepare(
        `SELECT id, text, updated_at, project_id FROM notes
         WHERE profile_id = ? AND project_id IS NOT NULL ORDER BY updated_at DESC`,
      )
      .all(PROFILE) as Omit<Row, 'doc_json'>[];
    return rows
      .filter((r) => !isBlankNote(r.text))
      .map((r) => ({
        id: r.id,
        title: noteTitle(r.text),
        projectId: r.project_id!,
        updatedAt: r.updated_at,
      }));
  }

  /** Puts a note in a project (or none). */
  setProject(id: string, projectId: string | null): void {
    this.db
      .prepare('UPDATE notes SET project_id = ? WHERE profile_id = ? AND id = ?')
      .run(projectId, PROFILE, id);
  }

  /** A project was deleted: its notes stay, in no project. */
  unlinkProject(projectId: string): void {
    this.db
      .prepare('UPDATE notes SET project_id = NULL WHERE profile_id = ? AND project_id = ?')
      .run(PROFILE, projectId);
  }

  title(id: string): string | null {
    const note = this.get(id);
    return note ? noteTitle(note.text) : null;
  }

  create(now = Date.now(), projectId: string | null = null): string {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO notes (id, profile_id, created_at, updated_at, project_id)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, PROFILE, now, now, projectId);
    return id;
  }

  /** Saves the document; returns its new version (updatedAt), or null if the note is gone. */
  save(id: string, doc: string, text: string, now = Date.now()): number | null {
    const current = this.get(id);
    if (!current) return null;
    // Two saves in the same millisecond still move the version on, so other copies reload.
    const version = Math.max(now, current.updatedAt + 1);
    this.db
      .prepare(
        'UPDATE notes SET doc_json = ?, text = ?, updated_at = ? WHERE profile_id = ? AND id = ?',
      )
      .run(doc, text, version, PROFILE, id);
    return version;
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM notes WHERE profile_id = ? AND id = ?').run(PROFILE, id);
  }

  /** Deletes the note if nothing was written in it. Returns true if it was deleted. */
  deleteIfBlank(id: string): boolean {
    const note = this.get(id);
    if (!note || !isBlankNote(note.text)) return false;
    this.delete(id);
    return true;
  }

  /** At launch: notes left empty (a quick note opened and closed) go, unless something still
   *  shows them (a tab, a floating note). */
  pruneBlank(keep: ReadonlySet<string>): number {
    const blank = this.db
      .prepare(`SELECT id FROM notes WHERE profile_id = ? AND trim(text) = ''`)
      .all(PROFILE) as { id: string }[];
    let removed = 0;
    for (const { id } of blank) {
      if (keep.has(id)) continue;
      this.delete(id);
      removed++;
    }
    return removed;
  }
}
