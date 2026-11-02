import { join } from 'node:path';
import { openDatabase } from './db';
import type { Database } from './db';
import { migrate } from './migrate';
import { migrations } from './migrations';
import { ArchiveRepository } from './repositories/archive';
import { BoostRepository } from './repositories/boosts';
import { EaselRepository } from './repositories/easels';
import { NotesRepository } from './repositories/notes';
import { HomeRepository } from './repositories/home';
import { WorkRepository } from './repositories/work';
import { CaptureRepository } from './repositories/captures';
import { TemplateRepository } from './repositories/templates';
import { AiActivityRepository } from './repositories/ai-activity';
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
  easels: EaselRepository;
  notes: NotesRepository;
  home: HomeRepository;
  work: WorkRepository;
  captures: CaptureRepository;
  templates: TemplateRepository;
  aiActivity: AiActivityRepository;
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
    easels: new EaselRepository(db),
    notes: new NotesRepository(db),
    home: new HomeRepository(db),
    work: new WorkRepository(db),
    captures: new CaptureRepository(db),
    templates: new TemplateRepository(db),
    aiActivity: new AiActivityRepository(db),
    close: () => {
      if (db.isOpen) db.close();
    },
  };
}
