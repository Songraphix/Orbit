import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, test } from '@playwright/test';
import { launchOrbit } from './launch-orbit';

test('creates and migrates orbit.db in the profile on launch', async () => {
  const orbit = await launchOrbit();
  try {
    const file = join(orbit.userData, 'orbit.db');
    await expect.poll(() => existsSync(file)).toBe(true);

    const db = new DatabaseSync(file, { readOnly: true });
    try {
      const version = db.prepare('PRAGMA user_version;').get() as { user_version: number };
      expect(version.user_version).toBeGreaterThanOrEqual(1);
      const table = db.prepare("SELECT name FROM sqlite_master WHERE name = 'settings'").get();
      expect(table).toEqual({ name: 'settings' });
    } finally {
      db.close();
    }
  } finally {
    await orbit.close();
  }
});
