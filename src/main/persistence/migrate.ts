import { transaction } from './db';
import type { Database } from './db';

export type Migration = { version: number; name: string; sql: string };

export function getSchemaVersion(db: Database): number {
  const row = db.prepare('PRAGMA user_version;').get() as { user_version: number } | undefined;
  return row?.user_version ?? 0;
}

/**
 * Applies every migration newer than the database's `user_version`, each in its own
 * transaction (PLAN.md section 5.3). Never edit a shipped migration; add a new one.
 * Returns the versions that were applied.
 */
export function migrate(db: Database, migrations: readonly Migration[]): number[] {
  const versions = migrations.map((m) => m.version);
  versions.forEach((v, i) => {
    if (v !== i + 1) throw new Error(`Migrations must be numbered 1..n in order; got ${versions}`);
  });

  const current = getSchemaVersion(db);
  if (current > migrations.length) {
    throw new Error(
      `Database schema v${current} is newer than this build (v${migrations.length}). ` +
        'Refusing to open it to avoid data loss.',
    );
  }

  const applied: number[] = [];
  for (const migration of migrations.slice(current)) {
    transaction(db, () => {
      db.exec(migration.sql);
      // PRAGMA can't take bound parameters; version is a validated integer.
      db.exec(`PRAGMA user_version = ${migration.version};`);
    });
    applied.push(migration.version);
  }
  return applied;
}
