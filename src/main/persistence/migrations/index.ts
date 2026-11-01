import type { Migration } from '../migrate';
import m001 from './001-settings.sql?raw';

/** Ordered list of schema migrations. Append only — never edit or reorder a shipped entry. */
export const migrations: readonly Migration[] = [{ version: 1, name: 'settings', sql: m001 }];
