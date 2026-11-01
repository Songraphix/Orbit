import { DEFAULT_PROFILE_ID } from '@shared/types/space';
import type { ItemData } from '@shared/types/live-folders';
import { randomUUID } from 'node:crypto';
import { generateKeyBetween } from 'fractional-indexing';
import { DEFAULT_THEME } from '@shared/types/space';
import { cleanProfilePatch } from '@shared/profile';
import type { ProfilePatch } from '@shared/profile';
import type { SpaceTheme } from '@shared/types/space';
import type { Profile, SidebarRepository, Space } from '../persistence/repositories/sidebar';
import { childrenAt, flatten, insertItem, moveItem, removeItem, updateItem } from './model';
import type { Position, Section, SidebarItem } from './model';

/** Live-page fields (url/title/favicon) change in bursts; they're written after a pause. */
const LIVE_SAVE_DELAY_MS = 500;

export type NewItem = {
  kind: SidebarItem['kind'];
  title: string;
  url?: string | null;
  favicon?: string | null;
  id?: string;
};

/**
 * The sidebar's source of truth in main (ADR-004): profiles, spaces and the item tree. Every
 * structural change is written at once; live page details are debounced. Listeners are told
 * after each change so windows can re-send their snapshot.
 */
export class SidebarStore {
  private profilesList: Profile[];
  private spacesList: Space[];
  private items: SidebarItem[];
  private readonly listeners = new Set<() => void>();
  private pendingLive = new Set<string>();
  private liveTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(private readonly repo: SidebarRepository) {
    repo.ensureDefaults();
    this.profilesList = repo.loadProfiles();
    this.spacesList = repo.loadSpaces();
    this.items = repo.loadItems();
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ── Reading ────────────────────────────────────────────────────────────────

  get spaces(): readonly Space[] {
    return this.spacesList;
  }

  get profiles(): readonly Profile[] {
    return this.profilesList;
  }

  space(id: string): Space | undefined {
    return this.spacesList.find((s) => s.id === id);
  }

  item(id: string): SidebarItem | undefined {
    return this.items.find((i) => i.id === id);
  }

  all(): readonly SidebarItem[] {
    return this.items;
  }

  /** Display order of a section (folders before their children; collapsed ones hide them). */
  rows(section: Section, space: Space): { item: SidebarItem; depth: number }[] {
    const at = {
      section,
      profileId: space.profileId,
      spaceId: section === 'favorite' ? null : space.id,
    };
    const visible: { item: SidebarItem; depth: number }[] = [];
    const hiddenUnder = new Set<string>();
    for (const row of flatten(this.items, at)) {
      if (row.item.parentId && hiddenUnder.has(row.item.parentId)) {
        hiddenUnder.add(row.item.id);
        continue;
      }
      if (row.item.kind === 'folder' && row.item.collapsed) hiddenUnder.add(row.item.id);
      visible.push(row);
    }
    return visible;
  }

  /** Every tab a space shows, in order (for ⌃Tab and ⌘1…⌘9). */
  tabsInOrder(space: Space): SidebarItem[] {
    return (['favorite', 'pinned', 'today'] as const).flatMap((section) =>
      this.rows(section, space)
        .map((r) => r.item)
        .filter((i) => i.kind === 'tab'),
    );
  }

  // ── Items ──────────────────────────────────────────────────────────────────

  /** Inserts a new item; `at.beforeId` = 'first' puts it at the top. */
  insert(
    item: NewItem,
    at: Omit<Position, 'beforeId'> & { beforeId: string | null | 'first' },
  ): SidebarItem {
    const now = Date.now();
    const beforeId =
      at.beforeId === 'first' ? (childrenAt(this.items, at)[0]?.id ?? null) : at.beforeId;
    const id = item.id ?? randomUUID();
    this.commit(
      insertItem(
        this.items,
        {
          id,
          kind: item.kind,
          title: item.title,
          titleOverride: null,
          url: item.url ?? null,
          homeUrl: null,
          favicon: item.favicon ?? null,
          collapsed: false,
          lastActiveAt: now,
          createdAt: now,
        },
        { ...at, beforeId },
      ),
    );
    return this.item(id)!;
  }

  move(id: string, at: Position): void {
    this.commit(moveItem(this.items, id, at));
  }

  remove(id: string): SidebarItem[] {
    const { items, removed } = removeItem(this.items, id);
    this.commit(items);
    return removed;
  }

  rename(id: string, title: string | null): void {
    const item = this.item(id);
    if (!item) return;
    const patch =
      item.kind === 'folder' ? { title: title || 'Folder' } : { titleOverride: title || null };
    this.commit(updateItem(this.items, id, patch));
  }

  setCollapsed(id: string, collapsed: boolean): void {
    this.commit(updateItem(this.items, id, { collapsed }));
  }

  /** Live Folder / feed / Tidy data on an item (null clears it). */
  setData(id: string, data: ItemData | null): void {
    this.commit(updateItem(this.items, id, { data }));
  }

  setHome(id: string, homeUrl: string | null): void {
    this.commit(updateItem(this.items, id, { homeUrl }));
  }

  /** A live page's url/title/favicon changed: update now, persist shortly. */
  updateLive(
    id: string,
    patch: { url?: string; title?: string; favicon?: string | null; lastActiveAt?: number },
  ): void {
    const item = this.item(id);
    if (!item) return;
    const changed = (Object.keys(patch) as (keyof typeof patch)[]).some(
      (k) => patch[k] !== item[k],
    );
    if (!changed) return;
    this.items = updateItem(this.items, id, patch);
    this.pendingLive.add(id);
    if (!this.liveTimer) this.liveTimer = setTimeout(() => this.flushLive(), LIVE_SAVE_DELAY_MS);
    this.notify();
  }

  flushLive(): void {
    if (this.liveTimer) clearTimeout(this.liveTimer);
    this.liveTimer = null;
    if (this.closed) return;
    const ids = [...this.pendingLive];
    this.pendingLive.clear();
    const changed = ids.map((id) => this.item(id)).filter((i): i is SidebarItem => i !== undefined);
    this.repo.applyItemChanges(changed, []);
  }

  /** Final save before the database closes (app quit). Later changes are kept in memory only. */
  close(): void {
    this.flushLive();
    this.closed = true;
    this.listeners.clear();
  }

  // ── Spaces ─────────────────────────────────────────────────────────────────

  createSpace(input: {
    name: string;
    icon?: string;
    profileId?: string;
    theme?: SpaceTheme;
    id?: string;
  }): Space {
    const last = this.spacesList.at(-1)?.sortKey ?? null;
    const space: Space = {
      id: input.id ?? randomUUID(),
      profileId: input.profileId ?? this.profilesList[0]!.id,
      name: input.name,
      icon: input.icon ?? 'planet',
      theme: input.theme ?? DEFAULT_THEME,
      sortKey: generateKeyBetween(last, null),
      lastActiveItemId: null,
      createdAt: Date.now(),
    };
    if (!this.closed) this.repo.saveSpace(space);
    this.spacesList = [...this.spacesList, space];
    this.notify();
    return space;
  }

  updateSpace(
    id: string,
    patch: Partial<Pick<Space, 'name' | 'icon' | 'theme' | 'profileId' | 'lastActiveItemId'>>,
  ): void {
    const space = this.space(id);
    if (!space) return;
    const next = { ...space, ...patch };
    this.repo.saveSpace(next);
    this.spacesList = this.spacesList.map((s) => (s.id === id ? next : s));
    // Moving a space to another profile moves its items too (favorites stay with the profile).
    if (patch.profileId && patch.profileId !== space.profileId) {
      this.commit(
        this.items.map((i) => (i.spaceId === id ? { ...i, profileId: patch.profileId! } : i)),
      );
      return;
    }
    if (patch.lastActiveItemId === undefined || Object.keys(patch).length > 1) this.notify();
  }

  /** Moves a space before another (or to the end). */
  reorderSpace(id: string, beforeId: string | null): void {
    const others = this.spacesList.filter((s) => s.id !== id);
    const index = beforeId === null ? others.length : others.findIndex((s) => s.id === beforeId);
    const sortKey = generateKeyBetween(
      others[index - 1]?.sortKey ?? null,
      others[index]?.sortKey ?? null,
    );
    const space = this.space(id);
    if (!space) return;
    const next = { ...space, sortKey };
    this.repo.saveSpace(next);
    this.spacesList = [...others, next].sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1));
    this.notify();
  }

  /** Deletes a space and its items. The last space can't be deleted. Returns its removed items. */
  deleteSpace(id: string): SidebarItem[] {
    if (this.spacesList.length <= 1) return [];
    const removed = this.items.filter((i) => i.spaceId === id);
    this.repo.deleteSpace(id); // cascades to its items
    this.items = this.items.filter((i) => i.spaceId !== id);
    this.spacesList = this.spacesList.filter((s) => s.id !== id);
    this.notify();
    return removed;
  }

  createProfile(name: string): Profile {
    const id = randomUUID();
    const profile: Profile = {
      id,
      name,
      partition: `persist:profile-${id}`,
      createdAt: Date.now(),
      displayName: '',
      avatar: '',
      color: '',
    };
    this.repo.saveProfile(profile);
    this.profilesList = [...this.profilesList, profile];
    this.notify();
    return profile;
  }

  renameProfile(id: string, name: string): void {
    this.updateProfile(id, { name });
  }

  /** Changes a profile's name, your name, avatar or colour (each checked first). */
  updateProfile(id: string, patch: ProfilePatch): void {
    const profile = this.profilesList.find((p) => p.id === id);
    const clean = cleanProfilePatch(patch);
    if (!profile || Object.keys(clean).length === 0) return;
    const next = { ...profile, ...clean };
    this.repo.saveProfile(next);
    this.profilesList = this.profilesList.map((p) => (p.id === id ? next : p));
    this.notify();
  }

  /**
   * Deletes a profile nobody uses (not the default, and no space on it). Its favorites go with
   * it. Returns false when it can't be deleted.
   */
  deleteProfile(id: string): boolean {
    if (id === DEFAULT_PROFILE_ID || this.spacesList.some((s) => s.profileId === id)) return false;
    if (!this.profilesList.some((p) => p.id === id)) return false;
    this.repo.deleteProfile(id);
    this.items = this.items.filter((i) => !(i.profileId === id && i.spaceId === null));
    this.profilesList = this.profilesList.filter((p) => p.id !== id);
    this.notify();
    return true;
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /** Replaces the tree, writing exactly what changed. */
  private commit(next: SidebarItem[]): void {
    const before = new Map(this.items.map((i) => [i.id, i]));
    const after = new Set(next.map((i) => i.id));
    const changed = next.filter((i) => before.get(i.id) !== i);
    const removed = [...before.keys()].filter((id) => !after.has(id));
    this.items = next;
    for (const i of changed) this.pendingLive.delete(i.id); // written now
    if (!this.closed) this.repo.applyItemChanges(changed, removed);
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
