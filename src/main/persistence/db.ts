import { DatabaseSync } from 'node:sqlite';

export type Database = DatabaseSync;

/** Opens (or creates) Orbit's database with the pragmas from PLAN.md section 5.2. */
export function openDatabase(path: string): Database {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA synchronous = NORMAL;'); // safe with WAL; much faster than FULL
  db.exec('PRAGMA busy_timeout = 5000;');
  return db;
}

/** Runs `fn` inside a transaction; rolls back if it throws. Not re-entrant. */
export function transaction<T>(db: Database, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = fn();
    db.exec('COMMIT;');
    return result;
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}
