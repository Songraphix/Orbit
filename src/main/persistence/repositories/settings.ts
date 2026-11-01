import { settingsDefaults, settingsSchema } from '@shared/settings';
import type { SettingKey, Settings } from '@shared/settings';
import type { Database } from '../db';

/** Typed access to the `settings` table. Values are validated on read and write. */
export class SettingsRepository {
  constructor(private readonly db: Database) {}

  get<K extends SettingKey>(key: K): Settings[K] {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      { value: string } | undefined;
    if (!row) return settingsDefaults[key];
    try {
      const parsed = settingsSchema[key].safeParse(JSON.parse(row.value));
      if (parsed.success) return parsed.data as Settings[K];
    } catch {
      // Corrupt JSON: fall through to the default.
    }
    return settingsDefaults[key];
  }

  set<K extends SettingKey>(key: K, value: Settings[K]): void {
    const valid = settingsSchema[key].parse(value);
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(key, JSON.stringify(valid));
  }
}
