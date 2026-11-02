import type { Migration } from '../migrate';
import m001 from './001-settings.sql?raw';
import m002 from './002-tabs.sql?raw';
import m003 from './003-history.sql?raw';
import m004 from './004-spaces.sql?raw';
import m005 from './005-archive.sql?raw';
import m006 from './006-downloads.sql?raw';
import m007 from './007-boosts.sql?raw';
import m008 from './008-easels.sql?raw';
import m009 from './009-item-data.sql?raw';
import m010 from './010-notes.sql?raw';
import m011 from './011-profile-look.sql?raw';
import m012 from './012-home.sql?raw';
import m013 from './013-work.sql?raw';
import m014 from './014-links.sql?raw';
import m015 from './015-captures.sql?raw';
import m016 from './016-templates.sql?raw';
import m017 from './017-ai-activity.sql?raw';
import m018 from './018-phase4.sql?raw';

/** Ordered list of schema migrations. Append only — never edit or reorder a shipped entry. */
export const migrations: readonly Migration[] = [
  { version: 1, name: 'settings', sql: m001 },
  { version: 2, name: 'tabs', sql: m002 },
  { version: 3, name: 'history', sql: m003 },
  { version: 4, name: 'spaces', sql: m004 },
  { version: 5, name: 'archive', sql: m005 },
  { version: 6, name: 'downloads', sql: m006 },
  { version: 7, name: 'boosts', sql: m007 },
  { version: 8, name: 'easels', sql: m008 },
  { version: 9, name: 'item-data', sql: m009 },
  { version: 10, name: 'notes', sql: m010 },
  { version: 11, name: 'profile-look', sql: m011 },
  { version: 12, name: 'home', sql: m012 },
  { version: 13, name: 'work', sql: m013 },
  { version: 14, name: 'links', sql: m014 },
  { version: 15, name: 'captures', sql: m015 },
  { version: 16, name: 'templates', sql: m016 },
  { version: 17, name: 'ai-activity', sql: m017 },
  { version: 18, name: 'phase4', sql: m018 },
];
