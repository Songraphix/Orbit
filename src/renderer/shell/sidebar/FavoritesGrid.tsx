import type { SidebarRow } from '@shared/types/space';
import { TabIcon } from './Rows';

const invoke = window.orbit.invoke;

/**
 * Favorites (F-02, Img 5): a grid of rounded tiles, three across at the default width and more
 * as the sidebar widens. Shared by every space using the same profile.
 */
export function FavoritesGrid({ rows, activeId }: { rows: SidebarRow[]; activeId: string | null }) {
  if (rows.length === 0) return null;
  return (
    <ul
      className="grid gap-2 px-3 pb-3"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))' }}
      data-testid="favorites"
    >
      {rows.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            title={row.title}
            aria-label={row.title}
            aria-current={row.id === activeId ? 'page' : undefined}
            className={`press grid h-12 w-full place-items-center rounded-xl ${
              row.id === activeId
                ? 'bg-[var(--row-active)] shadow-[var(--row-shadow)]'
                : 'bg-[var(--tile-bg)] hover:bg-[var(--row-active)]'
            }`}
            onClick={() => void invoke('tabs:activate', { tabId: row.id })}
            onContextMenu={(e) => {
              e.preventDefault();
              void invoke('sidebar:itemMenu', { itemId: row.id });
            }}
            data-testid="favorite-tile"
          >
            <span className="grid size-5 place-items-center [&>*]:size-5">
              <TabIcon row={row} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
