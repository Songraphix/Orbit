import { join } from 'node:path';
import { openDatabase } from './db';
import type { Database } from './db';
import { migrate } from './migrate';
import { migrations } from './migrations';
import { ArchiveRepository } from './repositories/archive';
import { BoostRepository } from './repositories/boosts';
import { HistoryRepository } from './repositories/history';
import { SettingsRepository } from './repositories/settings';
import { SiteSettingsRepository } from './repositories/site-settings';
import { SidebarRepository } from './repositories/sidebar';

export const DATABASE_FILE = 'orbit.db';

export type Persistence = {
  db: Database;
  settings: SettingsRepository;
  sidebar: SidebarRepository;
  history: HistoryRepository;
  siteSettings: SiteSettingsRepository;
  archive: ArchiveRepository;
  boosts: BoostRepository;
  close(): void;
};

/** Opens `<userData>/orbit.db`, applies pending migrations and builds the repositories. */
export function openPersistence(userDataDir: string): Persistence {
  const db = openDatabase(join(userDataDir, DATABASE_FILE));
  migrate(db, migrations);
  return {
    db,
    settings: new SettingsRepository(db),
    sidebar: new SidebarRepository(db),
    history: new HistoryRepository(db),
    siteSettings: new SiteSettingsRepository(db),
    archive: new ArchiveRepository(db),
    boosts: new BoostRepository(db),
    close: () => {
      if (db.isOpen) db.close();
    },
  };
}
