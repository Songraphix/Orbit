import { CLOSED_FIND } from '@shared/types/find';
import type { FindState } from '@shared/types/find';

/** The parts of WebContents find-in-page uses. */
export type Findable = {
  findInPage(text: string, options: { forward?: boolean; findNext?: boolean }): number;
  stopFindInPage(action: 'clearSelection' | 'keepSelection' | 'activateSelection'): void;
  isDestroyed(): boolean;
};

/**
 * Find in page for one window (F-31): ⌘F opens the bar in the toolbar, typing searches the
 * active tab, ⌘G / ⇧⌘G step through matches, Esc closes. Results arrive asynchronously via
 * Chromium's `found-in-page` event (`onResult`).
 */
export class FindController {
  private state: FindState = CLOSED_FIND;
  private requestId = 0;

  constructor(
    private readonly target: () => Findable | null,
    private readonly onChange: (state: FindState) => void,
  ) {}

  get current(): FindState {
    return this.state;
  }

  open(): void {
    this.set({ ...this.state, open: true, focusToken: this.state.focusToken + 1 });
  }

  /** Searches (or steps, when the query is unchanged and a direction is given). */
  search(query: string, direction?: 'next' | 'previous'): void {
    const page = this.target();
    if (!page || page.isDestroyed()) return;
    if (!query) {
      page.stopFindInPage('clearSelection');
      this.set({ ...this.state, open: true, query: '', activeMatch: 0, matches: 0 });
      return;
    }
    const stepping = direction !== undefined && query === this.state.query;
    this.requestId = page.findInPage(query, {
      forward: direction !== 'previous',
      findNext: !stepping, // a new search, rather than moving within the current one
    });
    this.set({ ...this.state, open: true, query });
  }

  /** ⌘G / ⇧⌘G from the menu. Opens the bar if it was closed. */
  step(direction: 'next' | 'previous'): void {
    if (!this.state.query) {
      this.open();
      return;
    }
    this.search(this.state.query, direction);
  }

  onResult(result: { requestId: number; activeMatchOrdinal: number; matches: number }): void {
    if (!this.state.open || result.requestId !== this.requestId) return;
    this.set({ ...this.state, activeMatch: result.activeMatchOrdinal, matches: result.matches });
  }

  close(): void {
    if (!this.state.open) return;
    const page = this.target();
    if (page && !page.isDestroyed()) page.stopFindInPage('keepSelection');
    this.set({ ...CLOSED_FIND, focusToken: this.state.focusToken });
  }

  private set(next: FindState): void {
    this.state = next;
    this.onChange(next);
  }
}
