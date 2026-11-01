import { generateKeyBetween } from 'fractional-indexing';
import {
  DEFAULT_PROFILE_ID,
  DEFAULT_SPACE_ID,
  DEFAULT_THEME,
  spaceThemeSchema,
} from '@shared/types/space';
import type { SpaceTheme } from '@shared/types/space';
import type { SidebarItem } from '../../sidebar/model';
import { transaction } from '../db';
import type { Database } from '../db';

export type Profile = { id: string; name: string; partition: string; createdAt: number };
export type Space = {
  id: string;
  profileId: string;
  name: string;
  icon: string;
  theme: SpaceTheme;
  sortKey: string;
  lastActiveItemId: string | null;
  createdAt: number;
};

type ItemRow = {
  id: string;
  profile_id: string;
  space_id: string | null;
  parent_id: string | null;
  section: SidebarItem['section'];
  kind: SidebarItem['kind'];
  sort_key: string;
  title: string;
  title_override: string | null;
  url: string | null;
  home_url: string | null;
  favicon: string | null;
  collapsed: number;
  last_active_at: number | null;
  created_at: number;
};

const toItem = (r: ItemRow): SidebarItem => ({
  id: r.id,
  profileId: r.profile_id,
  spaceId: r.space_id,
  parentId: r.parent_id,
  section: r.section,
  kind: r.kind,
  sortKey: r.sort_key,
  title: r.title,
  titleOverride: r.title_override,
  url: r.url,
  homeUrl: r.home_url,
  favicon: r.favicon,
  collapsed: r.collapsed === 1,
  lastActiveAt: r.last_active_at,
  createdAt: r.created_at,
});

function parseTheme(json: string): SpaceTheme {
  try {
    const parsed = spaceThemeSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Favicons are small data: URLs; anything bigger isn't worth keeping. */
const MAX_FAVICON_CHARS = 64 * 1024;

/** Profiles, spaces and sidebar items (PLAN.md section 5.2). */
export class SidebarRepository {
  constructor(private readonly db: Database) {}

  /** Makes sure a default profile and space exist, and moves Phase 1's saved tabs into it. */
  ensureDefaults(now = Date.now()): void {
    transaction(this.db, () => {
      const hasProfile = this.db.prepare('SELECT 1 FROM profiles LIMIT 1').get();
      if (!hasProfile) {
        this.db
          .prepare('INSERT INTO profiles (id, name, partition, created_at) VALUES (?, ?, ?, ?)')
          .run(DEFAULT_PROFILE_ID, 'Personal', 'persist:profile-default', now);
      }
      const hasSpace = this.db.prepare('SELECT 1 FROM spaces LIMIT 1').get();
      if (!hasSpace) {
        this.db
          .prepare(
            `INSERT INTO spaces (id, profile_id, name, icon, theme_json, sort_key, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            DEFAULT_SPACE_ID,
            DEFAULT_PROFILE_ID,
            'Personal',
            'planet',
            JSON.stringify(DEFAULT_THEME),
            'a0',
            now,
          );
      }
      // Phase 1 kept open tabs in `tabs`; they become the default space's Today items.
      const legacy = this.db
        .prepare('SELECT id, url, title, favicon, is_active FROM tabs ORDER BY position')
        .all() as {
        id: string;
        url: string;
        title: string;
        favicon: string | null;
        is_active: number;
      }[];
      if (legacy.length > 0) {
        let key: string | null = null;
        const insert = this.db.prepare(
          `INSERT OR IGNORE INTO sidebar_items
             (id, profile_id, space_id, parent_id, section, kind, sort_key, title, url, favicon, created_at)
           VALUES (?, ?, ?, NULL, 'today', 'tab', ?, ?, ?, ?, ?)`,
        );
        for (const t of legacy) {
          key = generateKeyBetween(key, null);
          insert.run(
            t.id,
            DEFAULT_PROFILE_ID,
            DEFAULT_SPACE_ID,
            key,
            t.title,
            t.url,
            t.favicon,
            now,
          );
          if (t.is_active) {
            this.db
              .prepare('UPDATE spaces SET last_active_item_id = ? WHERE id = ?')
              .run(t.id, DEFAULT_SPACE_ID);
          }
        }
        this.db.exec('DELETE FROM tabs');
      }
    });
  }

  loadProfiles(): Profile[] {
    return (
      this.db
        .prepare('SELECT id, name, partition, created_at FROM profiles ORDER BY created_at')
        .all() as {
        id: string;
        name: string;
        partition: string;
        created_at: number;
      }[]
    ).map((r) => ({ id: r.id, name: r.name, partition: r.partition, createdAt: r.created_at }));
  }

  loadSpaces(): Space[] {
    const rows = this.db
      .prepare(
        'SELECT id, profile_id, name, icon, theme_json, sort_key, last_active_item_id, created_at FROM spaces ORDER BY sort_key',
      )
      .all() as {
      id: string;
      profile_id: string;
      name: string;
      icon: string;
      theme_json: string;
      sort_key: string;
      last_active_item_id: string | null;
      created_at: number;
    }[];
    return rows.map((r) => ({
      id: r.id,
      profileId: r.profile_id,
      name: r.name,
      icon: r.icon,
      theme: parseTheme(r.theme_json),
      sortKey: r.sort_key,
      lastActiveItemId: r.last_active_item_id,
      createdAt: r.created_at,
    }));
  }

  loadItems(): SidebarItem[] {
    return (this.db.prepare('SELECT * FROM sidebar_items').all() as ItemRow[]).map(toItem);
  }

  saveProfile(p: Profile): void {
    this.db
      .prepare(
        `INSERT INTO profiles (id, name, partition, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET name = excluded.name`,
      )
      .run(p.id, p.name, p.partition, p.createdAt);
  }

  saveSpace(s: Space): void {
    this.db
      .prepare(
        `INSERT INTO spaces (id, profile_id, name, icon, theme_json, sort_key, last_active_item_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET profile_id = excluded.profile_id, name = excluded.name,
           icon = excluded.icon, theme_json = excluded.theme_json, sort_key = excluded.sort_key,
           last_active_item_id = excluded.last_active_item_id`,
      )
      .run(
        s.id,
        s.profileId,
        s.name,
        s.icon,
        JSON.stringify(s.theme),
        s.sortKey,
        s.lastActiveItemId,
        s.createdAt,
      );
  }

  deleteSpace(id: string): void {
    this.db.prepare('DELETE FROM spaces WHERE id = ?').run(id);
  }

  /** Writes changed items and deletes removed ones in one transaction. */
  applyItemChanges(changed: readonly SidebarItem[], removedIds: readonly string[]): void {
    if (changed.length === 0 && removedIds.length === 0) return;
    transaction(this.db, () => {
      const upsert = this.db.prepare(
        `INSERT INTO sidebar_items (id, profile_id, space_id, parent_id, section, kind, sort_key, title,
           title_override, url, home_url, favicon, collapsed, last_active_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET profile_id = excluded.profile_id, space_id = excluded.space_id,
           parent_id = excluded.parent_id, section = excluded.section, sort_key = excluded.sort_key,
           title = excluded.title, title_override = excluded.title_override, url = excluded.url,
           home_url = excluded.home_url, favicon = excluded.favicon, collapsed = excluded.collapsed,
           last_active_at = excluded.last_active_at`,
      );
      // Parents first, so foreign keys hold when a folder and its children arrive together.
      const ordered = [...changed].sort(
        (a, b) => (a.parentId === null ? -1 : 0) - (b.parentId === null ? -1 : 0),
      );
      for (const i of ordered) {
        const favicon = i.favicon && i.favicon.length <= MAX_FAVICON_CHARS ? i.favicon : null;
        upsert.run(
          i.id,
          i.profileId,
          i.spaceId,
          i.parentId,
          i.section,
          i.kind,
          i.sortKey,
          i.title,
          i.titleOverride,
          i.url,
          i.homeUrl,
          favicon,
          i.collapsed ? 1 : 0,
          i.lastActiveAt,
          i.createdAt,
        );
      }
      const del = this.db.prepare('DELETE FROM sidebar_items WHERE id = ?');
      for (const id of removedIds) del.run(id);
    });
  }
}
