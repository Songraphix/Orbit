import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_PROFILE_ID, DEFAULT_THEME } from '@shared/types/space';
import type { SpaceTheme } from '@shared/types/space';
import type { HistoryRepository } from '../../persistence/repositories/history';
import type { Section } from '../../sidebar/model';
import type { SidebarStore } from '../../sidebar/store';
import { readChromiumHistory } from './history';
import { countArc, parseArcSidebar } from './sidebar';
import type { ArcNode, ArcSidebar, ArcTheme } from './sidebar';

export type ArcPreview = {
  source: string;
  spaces: number;
  favorites: number;
  pinned: number;
  today: number;
  history: number;
  spaceNames: string[];
};

export type ImportResult = {
  spacesAdded: number;
  spacesSkipped: number;
  favoritesAdded: number;
  tabsAdded: number;
  historyImported: number;
};

const SIDEBAR_FILE = 'StorableSidebar.json';
const HISTORY_FILE = join('User Data', 'Default', 'History');

/**
 * Where Arc data lives, best first: the newest dated backup in ~/ArcBackup (PLAN.md "Do this
 * first"), then Arc's own folder. Only folders that actually contain the sidebar file count.
 */
export function findArcSources(home = homedir()): string[] {
  const candidates: string[] = [];
  const backups = join(home, 'ArcBackup');
  if (existsSync(backups)) {
    const dated = readdirSync(backups)
      .map((name) => join(backups, name))
      .filter((p) => statSync(p).isDirectory())
      .sort()
      .reverse();
    candidates.push(...dated);
  }
  candidates.push(join(home, 'Library', 'Application Support', 'Arc'));
  return candidates.filter((dir) => existsSync(join(dir, SIDEBAR_FILE)));
}

export function toSpaceTheme(theme: ArcTheme | null): SpaceTheme {
  if (!theme) return DEFAULT_THEME;
  return {
    mode: theme.mode,
    colors: theme.colors.slice(0, 3),
    intensity: Math.min(1, Math.max(0, theme.intensity)),
    noise: Math.min(1, Math.max(0, theme.noise)),
  };
}

/**
 * The Arc importer (F-27): recreates spaces (names, icons, colours), favorites, pinned tabs,
 * folders and Today tabs, and imports history. Re-running it doesn't duplicate anything:
 * spaces are keyed by Arc's id, favorites by URL, and history merges.
 */
export class ArcImporter {
  constructor(
    private readonly store: SidebarStore,
    private readonly history: HistoryRepository,
  ) {}

  private read(dir: string): ArcSidebar {
    return parseArcSidebar(JSON.parse(readFileSync(join(dir, SIDEBAR_FILE), 'utf8')));
  }

  preview(dir: string): ArcPreview {
    const sidebar = this.read(dir);
    const counts = countArc(sidebar);
    const historyFile = join(dir, HISTORY_FILE);
    const history = countHistory(historyFile);
    return { source: dir, ...counts, history, spaceNames: sidebar.spaces.map((s) => s.title) };
  }

  import(dir: string): ImportResult {
    const sidebar = this.read(dir);
    const result: ImportResult = {
      spacesAdded: 0,
      spacesSkipped: 0,
      favoritesAdded: 0,
      tabsAdded: 0,
      historyImported: 0,
    };

    const profileFor = (arcProfile: string): string => {
      if (arcProfile === 'default') return DEFAULT_PROFILE_ID;
      const existing = this.store.profiles.find((p) => p.name === arcProfile);
      return (existing ?? this.store.createProfile(arcProfile)).id;
    };

    for (const space of sidebar.spaces) {
      const id = `arc-${space.arcId}`;
      if (this.store.space(id)) {
        result.spacesSkipped++;
        continue;
      }
      const profileId = profileFor(space.profile);
      this.store.createSpace({
        id,
        name: space.title,
        icon: space.icon ?? 'planet',
        profileId,
        theme: toSpaceTheme(space.theme),
      });
      result.tabsAdded += this.addNodes(space.pinned, 'pinned', profileId, id, null);
      result.tabsAdded += this.addNodes(space.today, 'today', profileId, id, null);
      result.spacesAdded++;
    }

    for (const [arcProfile, nodes] of Object.entries(sidebar.favorites)) {
      const profileId = profileFor(arcProfile);
      const existing = new Set(
        this.store
          .all()
          .filter((i) => i.section === 'favorite' && i.profileId === profileId)
          .map((i) => i.url),
      );
      for (const node of flattenTabs(nodes)) {
        if (existing.has(node.url)) continue;
        existing.add(node.url);
        this.store.insert(
          { kind: 'tab', title: node.title, url: node.url },
          { section: 'favorite', profileId, spaceId: null, parentId: null, beforeId: null },
        );
        result.favoritesAdded++;
      }
    }

    const historyFile = join(dir, HISTORY_FILE);
    if (existsSync(historyFile)) {
      try {
        result.historyImported = this.history.importVisits(readChromiumHistory(historyFile));
      } catch {
        // History is a bonus; a locked or odd file shouldn't fail the sidebar import.
      }
    }
    this.store.flushLive();
    return result;
  }

  private addNodes(
    nodes: ArcNode[],
    section: Exclude<Section, 'favorite'>,
    profileId: string,
    spaceId: string,
    parentId: string | null,
  ): number {
    let tabs = 0;
    for (const node of nodes) {
      if (node.kind === 'tab') {
        this.store.insert(
          { kind: 'tab', title: node.title, url: node.url },
          { section, profileId, spaceId, parentId, beforeId: null },
        );
        tabs++;
      } else {
        const folder = this.store.insert(
          { kind: 'folder', title: node.title },
          { section, profileId, spaceId, parentId, beforeId: null },
        );
        tabs += this.addNodes(node.children, section, profileId, spaceId, folder.id);
      }
    }
    return tabs;
  }
}

/** Unreadable or missing history doesn't block the rest of the import. */
function countHistory(file: string): number {
  try {
    return existsSync(file) ? readChromiumHistory(file).length : 0;
  } catch {
    return 0;
  }
}

function flattenTabs(nodes: ArcNode[]): { title: string; url: string }[] {
  return nodes.flatMap((n) => (n.kind === 'tab' ? [n] : flattenTabs(n.children)));
}
