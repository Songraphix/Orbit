import { generateKeyBetween } from 'fractional-indexing';

/**
 * The sidebar tree (PLAN.md sections 5.1 and F-02…F-05) as pure functions over a flat list.
 * Favorites belong to a profile (shared by its spaces); pinned and Today items belong to a space.
 * Ordering uses fractional keys so a move never renumbers siblings.
 */
export type Section = 'favorite' | 'pinned' | 'today';
export type ItemKind = 'tab' | 'folder';

export type SidebarItem = {
  id: string;
  profileId: string;
  /** null for favorites (they're per profile). */
  spaceId: string | null;
  parentId: string | null;
  section: Section;
  kind: ItemKind;
  sortKey: string;
  /** Live page title (tabs) or folder name. */
  title: string;
  /** A name the user gave it, shown instead of the page title. */
  titleOverride: string | null;
  /** Current URL (tabs). */
  url: string | null;
  /** Where a pinned tab or favorite returns to ("back to pinned URL"). */
  homeUrl: string | null;
  favicon: string | null;
  collapsed: boolean;
  lastActiveAt: number | null;
  createdAt: number;
};

/** Where an item goes: a section of a space (or the favorites of a profile), inside an optional
 *  folder, before an optional sibling (null = at the end). */
export type Position = {
  section: Section;
  profileId: string;
  spaceId: string | null;
  parentId: string | null;
  beforeId: string | null;
};

export class SidebarError extends Error {
  override name = 'SidebarError';
}

const sameList = (
  a: SidebarItem,
  p: Pick<Position, 'section' | 'profileId' | 'spaceId' | 'parentId'>,
) =>
  a.section === p.section &&
  a.parentId === p.parentId &&
  (p.section === 'favorite' ? a.profileId === p.profileId : a.spaceId === p.spaceId);

/** The ordered children at one position. */
export function childrenAt(
  items: readonly SidebarItem[],
  at: Pick<Position, 'section' | 'profileId' | 'spaceId' | 'parentId'>,
): SidebarItem[] {
  return items
    .filter((i) => sameList(i, at))
    .sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
}

/** All descendants of an item (folders nest). */
export function descendantsOf(items: readonly SidebarItem[], id: string): SidebarItem[] {
  const out: SidebarItem[] = [];
  const stack = [id];
  while (stack.length > 0) {
    const parent = stack.pop()!;
    for (const child of items) {
      if (child.parentId === parent) {
        out.push(child);
        stack.push(child.id);
      }
    }
  }
  return out;
}

/** A sort key placing an item before `beforeId` (or last) among `siblings` (sorted). */
export function keyFor(
  siblings: readonly SidebarItem[],
  beforeId: string | null,
  skipId?: string,
): string {
  const list = siblings.filter((s) => s.id !== skipId);
  const index = beforeId === null ? list.length : list.findIndex((s) => s.id === beforeId);
  if (index === -1) throw new SidebarError(`Sibling ${beforeId} not found`);
  const prev = list[index - 1]?.sortKey ?? null;
  const next = list[index]?.sortKey ?? null;
  return generateKeyBetween(prev, next);
}

function validateTarget(items: readonly SidebarItem[], at: Position, moving?: SidebarItem): void {
  if (at.section === 'favorite' && at.spaceId !== null) {
    throw new SidebarError('Favorites belong to a profile, not a space');
  }
  if (at.section !== 'favorite' && at.spaceId === null) {
    throw new SidebarError('Pinned and Today items need a space');
  }
  if (at.parentId !== null) {
    const parent = items.find((i) => i.id === at.parentId);
    if (!parent || parent.kind !== 'folder') throw new SidebarError('Parent must be a folder');
    if (parent.section !== at.section)
      throw new SidebarError('Parent folder is in another section');
    if (at.section === 'favorite') throw new SidebarError('Favorites have no folders');
  }
  if (moving?.kind === 'folder') {
    if (at.section === 'favorite') throw new SidebarError('Folders cannot become favorites');
    if (
      at.parentId === moving.id ||
      descendantsOf(items, moving.id).some((d) => d.id === at.parentId)
    ) {
      throw new SidebarError('A folder cannot go inside itself');
    }
  }
}

/** Adds an item at a position. */
export function insertItem(
  items: readonly SidebarItem[],
  item: Omit<SidebarItem, 'sortKey' | 'section' | 'spaceId' | 'parentId' | 'profileId'>,
  at: Position,
): SidebarItem[] {
  validateTarget(items, at);
  const sortKey = keyFor(childrenAt(items, at), at.beforeId);
  const added: SidebarItem = {
    ...item,
    section: at.section,
    profileId: at.profileId,
    spaceId: at.spaceId,
    parentId: at.parentId,
    sortKey,
    homeUrl: at.section === 'today' ? null : (item.homeUrl ?? item.url),
  };
  return [...items, added];
}

/**
 * Moves an item (and, for folders, everything inside it). Pinning rules: a tab entering the
 * pinned or favorite section remembers its current URL as home; one going to Today forgets it.
 */
export function moveItem(items: readonly SidebarItem[], id: string, at: Position): SidebarItem[] {
  const item = items.find((i) => i.id === id);
  if (!item) throw new SidebarError(`Item ${id} not found`);
  if (at.beforeId === id) return [...items]; // dropped onto itself
  validateTarget(items, at, item);

  const sortKey = keyFor(childrenAt(items, at), at.beforeId, id);
  const movedIds = new Set([id, ...descendantsOf(items, id).map((d) => d.id)]);
  const rehome = (i: SidebarItem): SidebarItem => {
    if (i.kind !== 'tab') return i;
    if (at.section === 'today') return { ...i, homeUrl: null };
    return { ...i, homeUrl: i.homeUrl ?? i.url };
  };

  return items.map((i) => {
    if (i.id === id) {
      return rehome({
        ...i,
        section: at.section,
        profileId: at.profileId,
        spaceId: at.spaceId,
        parentId: at.parentId,
        sortKey,
      });
    }
    if (movedIds.has(i.id)) {
      // Descendants keep their parent, but follow the folder's section and space.
      return rehome({ ...i, section: at.section, profileId: at.profileId, spaceId: at.spaceId });
    }
    return i;
  });
}

/** Removes an item and its descendants; returns the remaining items and what was removed. */
export function removeItem(
  items: readonly SidebarItem[],
  id: string,
): { items: SidebarItem[]; removed: SidebarItem[] } {
  const ids = new Set([id, ...descendantsOf(items, id).map((d) => d.id)]);
  return {
    items: items.filter((i) => !ids.has(i.id)),
    removed: items.filter((i) => ids.has(i.id)),
  };
}

/** Updates fields of one item. */
export function updateItem(
  items: readonly SidebarItem[],
  id: string,
  patch: Partial<
    Pick<
      SidebarItem,
      'title' | 'titleOverride' | 'url' | 'favicon' | 'collapsed' | 'lastActiveAt' | 'homeUrl'
    >
  >,
): SidebarItem[] {
  return items.map((i) => (i.id === id ? { ...i, ...patch } : i));
}

/** Flattens a space's section into display order (folders before their children). */
export function flatten(
  items: readonly SidebarItem[],
  at: Pick<Position, 'section' | 'profileId' | 'spaceId'>,
  parentId: string | null = null,
  depth = 0,
): { item: SidebarItem; depth: number }[] {
  const out: { item: SidebarItem; depth: number }[] = [];
  for (const child of childrenAt(items, { ...at, parentId })) {
    out.push({ item: child, depth });
    if (child.kind === 'folder') out.push(...flatten(items, at, child.id, depth + 1));
  }
  return out;
}
