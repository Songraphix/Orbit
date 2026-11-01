import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { SidebarRow } from '@shared/types/space';
import { TabIcon } from './Rows';

const invoke = window.orbit.invoke;

type Rgb = [number, number, number];
const colors = new Map<string, Rgb | null>();

/** A favicon's main colour (its saturated pixels, averaged), for tinting its active tile. */
function faviconColor(src: string): Promise<Rgb | null> {
  if (colors.has(src)) return Promise.resolve(colors.get(src) ?? null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 16;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      let result: Rgb | null = null;
      if (ctx) {
        ctx.drawImage(img, 0, 0, 16, 16);
        const data = ctx.getImageData(0, 0, 16, 16).data;
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
          const [pr, pg, pb, pa] = [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
          const max = Math.max(pr, pg, pb);
          const min = Math.min(pr, pg, pb);
          // Skip transparent, grey, white and black pixels: they aren't the brand colour.
          if (pa < 128 || max - min < 40 || max < 50) continue;
          r += pr;
          g += pg;
          b += pb;
          n++;
        }
        if (n > 4) result = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
      }
      colors.set(src, result);
      resolve(result);
    };
    img.onerror = () => {
      colors.set(src, null);
      resolve(null);
    };
    img.src = src;
  });
}

function useFaviconColor(src: string | null): Rgb | null {
  const [state, setState] = useState<{ src: string | null; rgb: Rgb | null }>({
    src: null,
    rgb: null,
  });
  useEffect(() => {
    if (!src) return;
    let live = true;
    void faviconColor(src).then((rgb) => live && setState({ src, rgb }));
    return () => {
      live = false;
    };
  }, [src]);
  return src && state.src === src ? state.rgb : null;
}

/** "Inbox (12) – Gmail", "(3) WhatsApp": the page is telling us something is waiting. */
const hasCount = (title: string) => /\((\d[\d,.]*\+?)\)/.test(title);

/**
 * Favorites (F-02, Img 5, like Arc): rounded tiles, two across in a narrow sidebar up to four in
 * a wide one. The open favorite is tinted with its site's colour; a page with a count in its
 * title ("Inbox (12)") shows a dot.
 */
export function FavoritesGrid({
  rows,
  activeId,
  width,
}: {
  rows: SidebarRow[];
  activeId: string | null;
  width: number;
}) {
  if (rows.length === 0) return null;
  const columns = Math.min(4, Math.max(2, Math.floor((width - 16) / 68)));
  // px-2.5 padding (20) and gap-2 (8) between columns. Narrow sidebars get square tiles, like
  // Arc's; wider ones settle at a calm 52–64 px height.
  const tile = (width - 20 - 8 * (columns - 1)) / columns;
  const height = Math.round(Math.max(52, Math.min(tile, 64)));
  return (
    <ul
      className="grid gap-2 px-2.5 pb-3"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      data-testid="favorites"
    >
      {rows.map((row) => (
        <FavoriteTile key={row.id} row={row} active={row.id === activeId} height={height} />
      ))}
    </ul>
  );
}

function FavoriteTile({
  row,
  active,
  height,
}: {
  row: SidebarRow;
  active: boolean;
  height: number;
}) {
  const rgb = useFaviconColor(active ? row.favicon : null);
  const tint: CSSProperties =
    active && rgb
      ? {
          background: `rgb(${rgb.join(' ')} / 0.3)`,
          boxShadow: `inset 0 0 0 1.5px rgb(${rgb.join(' ')} / 0.85), var(--row-shadow)`,
        }
      : {};
  return (
    <li>
      <button
        type="button"
        title={row.title}
        aria-label={row.title}
        aria-current={active ? 'page' : undefined}
        className={`press relative grid w-full place-items-center rounded-[16px] ${
          active
            ? 'bg-[var(--row-active)] shadow-[var(--row-shadow)]'
            : 'bg-[var(--tile-bg)] hover:bg-[var(--row-active)]'
        }`}
        style={{ ...tint, height }}
        onClick={() => void invoke('tabs:activate', { tabId: row.id })}
        onContextMenu={(e) => {
          e.preventDefault();
          void invoke('sidebar:itemMenu', { itemId: row.id });
        }}
        data-testid="favorite-tile"
      >
        <span className="grid size-[18px] place-items-center [&>*]:size-[18px]">
          <TabIcon row={row} />
        </span>
        {hasCount(row.title) && (
          <span
            className="absolute right-2.5 bottom-2 size-[7px] rounded-full bg-[#ff453a] shadow-[0_0_0_1.5px_var(--tile-bg)]"
            aria-label="Something new"
            data-testid="favorite-dot"
          />
        )}
      </button>
    </li>
  );
}
