import { join } from 'node:path';
import { openDatabase } from './db';
import type { Database } from './db';
import { migrate } from './migrate';
import { migrations } from './migrations';
import { HistoryRepository } from './repositories/history';
import { SettingsRepository } from './repositories/settings';
import { TabsRepository } from './repositories/tabs';

export const DATABASE_FILE = 'orbit.db';

export type Persistence = {
  db: Database;
  settings: SettingsRepository;
  tabs: TabsRepository;
  history: HistoryRepository;
  close(): void;
};

/** Opens `<userData>/orbit.db`, applies pending migrations and builds the repositories. */
export function openPersistence(userDataDir: string): Persistence {
  const db = openDatabase(join(userDataDir, DATABASE_FILE));
  migrate(db, migrations);
  return {
    db,
    settings: new SettingsRepository(db),
    tabs: new TabsRepository(db),
    history: new HistoryRepository(db),
    close: () => {
      if (db.isOpen) db.close();
    },
  };
}
