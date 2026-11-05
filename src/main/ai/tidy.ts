import type { Space } from '../persistence/repositories/sidebar';
import type { SidebarStore } from '../sidebar/store';
import type { AIService } from './service';
import { TIDY_MIN_TABS } from './tidy-model';
import { acceptedGroups, proposeGroups, SUGGEST_FROM_TABS } from '../sidebar/grouping-model';
import type { ProposedGroup } from '../sidebar/grouping-model';

/** How long "Undo" stays next to Tidy. */
const UNDO_FOR_MS = 60_000;

export type TidyState = {
  available: boolean;
  running: boolean;
  canUndo: boolean;
  assistant: boolean;
  /** Group Tabs (without AI) has folders to suggest for a crowded Today. */
  suggestGroups: boolean;
};

/** After "Not Now", the suggestion waits this long (per Space). */
const QUIET_AFTER_DISMISS_MS = 6 * 60 * 60 * 1000;

type Undo = { folderIds: string[]; order: string[]; timer: ReturnType<typeof setTimeout> };

/**
 * Tidy (F-03, F-29): the space header's button groups the space's loose Today tabs into named
 * folders (flagged as Tidy's). Undo puts every tab back where it was and removes the folders.
 */
export class TidyService {
  private readonly running = new Set<string>();
  private readonly undo = new Map<string, Undo>();
  private readonly dismissed = new Map<string, number>();

  constructor(
    private readonly deps: {
      store: SidebarStore;
      ai: AIService;
      /** Tidy's state changed (running, undo available): redraw sidebars. */
      onChange: () => void;
      /** Settings → General → Suggest grouping tabs. */
      suggestions?: () => boolean;
      now?: () => number;
    },
  ) {}

  state(spaceId: string): TidyState {
    const space = this.deps.store.spaces.find((s) => s.id === spaceId);
    return {
      available: this.deps.ai.available,
      running: this.running.has(spaceId),
      canUndo: this.undo.has(spaceId),
      assistant: this.deps.ai.prefs.enabled,
      suggestGroups: space ? this.shouldSuggest(space) : false,
    };
  }

  /** A crowded Today with something to group, not just dismissed, suggestions on. */
  private shouldSuggest(space: Space): boolean {
    if (this.deps.suggestions && !this.deps.suggestions()) return false;
    if (this.undo.has(space.id)) return false;
    const quietUntil = (this.dismissed.get(space.id) ?? 0) + QUIET_AFTER_DISMISS_MS;
    if ((this.deps.now?.() ?? Date.now()) < quietUntil) return false;
    const tabs = this.looseTabs(space);
    return tabs.length >= SUGGEST_FROM_TABS && this.proposeFor(space).length >= 2;
  }

  private proposeFor(space: Space): ProposedGroup[] {
    return proposeGroups(
      this.looseTabs(space).map((t) => ({
        id: t.id,
        title: t.titleOverride || t.title,
        url: t.url ?? '',
      })),
    );
  }

  /** Group Tabs' preview: the folders it proposes, with each tab's title and icon. */
  proposal(space: Space): {
    loose: number;
    groups: (Omit<ProposedGroup, 'tabIds'> & {
      tabs: { id: string; title: string; favicon: string | null }[];
    })[];
  } {
    const { store } = this.deps;
    return {
      loose: this.looseTabs(space).length,
      groups: this.proposeFor(space).map(({ tabIds, ...group }) => ({
        ...group,
        tabs: tabIds.map((id) => {
          const item = store.item(id)!;
          return {
            id,
            title: item.titleOverride || item.title || item.url || 'Tab',
            favicon: item.favicon,
          };
        }),
      })),
    };
  }

  /** "Not Now": the suggestion steps back for a while in this Space. */
  dismiss(space: Space): void {
    this.dismissed.set(space.id, this.deps.now?.() ?? Date.now());
    this.deps.onChange();
  }

  /** Makes the folders the user accepted (only tabs still loose in Today); Undo as Tidy. */
  group(space: Space, groups: readonly { name: string; tabIds: readonly string[] }[]): number {
    const loose = new Set(this.looseTabs(space).map((t) => t.id));
    const made = this.makeFolders(space, acceptedGroups(groups, loose));
    this.deps.onChange();
    return made;
  }

  /** Tabs Tidy would group: Today's top-level tabs. */
  private looseTabs(space: Space) {
    return this.deps.store
      .rows('today', space)
      .filter((r) => r.depth === 0 && r.item.kind === 'tab')
      .map((r) => r.item);
  }

  /** Groups the space's loose Today tabs. Resolves to the number of folders made. */
  async tidy(space: Space): Promise<number> {
    if (this.running.has(space.id)) return 0;
    const tabs = this.looseTabs(space);
    if (tabs.length < TIDY_MIN_TABS) throw new Error('Tidy needs a few more tabs in Today');
    this.running.add(space.id);
    this.deps.onChange();
    try {
      const groups = await this.deps.ai.tidy(
        tabs.map((t) => ({ id: t.id, title: t.titleOverride || t.title, url: t.url ?? '' })),
      );
      return this.makeFolders(space, groups);
    } finally {
      this.running.delete(space.id);
      this.deps.onChange();
    }
  }

  /** Folders at the top of Today, the first group first; remembers how to undo it. */
  private makeFolders(
    space: Space,
    groups: readonly { name: string; tabIds: readonly string[] }[],
  ): number {
    const { store } = this.deps;
    // Today's top-level order before any change, for Undo.
    const order = store
      .rows('today', space)
      .filter((r) => r.depth === 0)
      .map((r) => r.item.id);
    const today = { section: 'today' as const, profileId: space.profileId, spaceId: space.id };
    const folderIds: string[] = [];
    // Last group first, each to the top, so the first group ends up first.
    for (const group of [...groups].reverse()) {
      // Tabs closed or moved meanwhile stay out.
      const ids = group.tabIds.filter((id) => {
        const item = store.item(id);
        return item?.section === 'today' && item.spaceId === space.id && item.parentId === null;
      });
      if (ids.length < 2) continue;
      const folder = store.insert(
        { kind: 'folder', title: group.name },
        { ...today, parentId: null, beforeId: 'first' },
      );
      store.setData(folder.id, { tidy: true });
      for (const id of ids) store.move(id, { ...today, parentId: folder.id, beforeId: null });
      folderIds.push(folder.id);
    }
    if (folderIds.length > 0) this.rememberUndo(space.id, { folderIds, order });
    return folderIds.length;
  }

  /** Puts the tabs back in their old order and removes Tidy's folders. */
  untidy(space: Space): void {
    const undo = this.undo.get(space.id);
    if (!undo) return;
    clearTimeout(undo.timer);
    this.undo.delete(space.id);
    const { store } = this.deps;
    const top = { section: 'today' as const, profileId: space.profileId, spaceId: space.id };
    for (const id of undo.order) {
      if (store.item(id)) store.move(id, { ...top, parentId: null, beforeId: null });
    }
    for (const folderId of undo.folderIds) {
      // Anything added to the folder since comes out too, so nothing is lost.
      for (const child of store.all().filter((i) => i.parentId === folderId))
        store.move(child.id, { ...top, parentId: null, beforeId: null });
      if (store.item(folderId)) store.remove(folderId);
    }
    this.deps.onChange();
  }

  private rememberUndo(spaceId: string, undo: Omit<Undo, 'timer'>): void {
    const previous = this.undo.get(spaceId);
    if (previous) clearTimeout(previous.timer);
    const timer = setTimeout(() => {
      this.undo.delete(spaceId);
      this.deps.onChange();
    }, UNDO_FOR_MS);
    timer.unref?.();
    this.undo.set(spaceId, { ...undo, timer });
  }
}
