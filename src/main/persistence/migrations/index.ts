import type { Migration } from '../migrate';
import m001 from './001-settings.sql?raw';
import m002 from './002-tabs.sql?raw';
import m003 from './003-history.sql?raw';
import m004 from './004-spaces.sql?raw';

/** Ordered list of schema migrations. Append only — never edit or reorder a shipped entry. */
export const migrations: readonly Migration[] = [
  { version: 1, name: 'settings', sql: m001 },
  { version: 2, name: 'tabs', sql: m002 },
  { version: 3, name: 'history', sql: m003 },
  { version: 4, name: 'spaces', sql: m004 },
];
