import { AppWindow, Check, PanelRight, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { OverlayState } from '@shared/types/command-bar';
import { Glass } from './Glass';

type Library = NonNullable<OverlayState['appLibrary']>;

const close = (settings = false) => void window.orbit.invoke('applib:close', { settings });

/** A calm, stable colour for an app without an icon (sea glass, sky, sand, mist…). */
const TINTS = ['#4f8f86', '#5a87a6', '#9c8a6b', '#6d7f8c', '#7a6f99', '#5f8a6a'];
const tintFor = (name: string) =>
  TINTS[[...name].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) % TINTS.length]!;

const WHERE: Record<'tab' | 'panel' | 'window', string> = {
  tab: 'Opens in a tab',
  panel: 'Opens beside the page',
  window: 'Opens in a window',
};

/**
 * The App Library (redesign brief §7): one floating panel to find your apps and add more. Search
 * filters as you type (↓ goes to the tiles, arrows move between them, ⏎ opens or adds, Esc
 * closes). Your apps say where they open and whether they're open now; catalogue apps say
 * whether you have them. Settings → Apps keeps the details (Spaces, where each opens).
 */
export function AppLibrary({ library }: { library: Library }) {
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => search.current?.focus(), []);

  const q = query.trim().toLowerCase();
  const matches = (...texts: string[]) => !q || texts.some((t) => t.toLowerCase().includes(q));
  const apps = library.apps.filter((a) => matches(a.title, a.host));
  const catalog = useMemo(
    () =>
      library.catalog
        .map((g) => ({ ...g, apps: g.apps.filter((a) => matches(a.name, a.host, g.group)) }))
        .filter((g) => g.apps.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [library.catalog, q],
  );
  // Typed an address that isn't in the catalogue: offer to add it as is.
  const typedSite = /^[^\s/]+\.[a-z]{2,}(\/\S*)?$/i.test(query.trim()) ? query.trim() : null;

  /** Arrow keys move between tiles, row by row as they're laid out. */
  const onGridKey = (e: KeyboardEvent) => {
    const tiles = [...(grid.current?.querySelectorAll<HTMLElement>('[data-tile]') ?? [])];
    const at = tiles.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    let next: number;
    if (e.key === 'ArrowRight') next = at + 1;
    else if (e.key === 'ArrowLeft') next = at - 1;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const here = tiles[at]!.getBoundingClientRect();
      const down = e.key === 'ArrowDown';
      const row = tiles
        .map((t, i) => ({ i, r: t.getBoundingClientRect() }))
        .filter(({ r }) => (down ? r.top > here.top + 4 : r.top < here.top - 4));
      const target = down ? row.find(({ r }) => r.top === row[0]?.r.top) : row.at(-1);
      const sameRow = row.filter(({ r }) => r.top === target?.r.top);
      const nearest = sameRow.sort(
        (a, b) => Math.abs(a.r.left - here.left) - Math.abs(b.r.left - here.left),
      )[0];
      if (!nearest) {
        if (!down) search.current?.focus();
        e.preventDefault();
        return;
      }
      next = nearest.i;
    } else return;
    e.preventDefault();
    tiles[Math.max(0, Math.min(tiles.length - 1, next))]?.focus();
  };

  let order = 0;
  /** A short stagger on first opening only (Reduce Motion stills it). */
  const reveal = () => ({ animationDelay: `calc(var(--stagger) * ${Math.min(order++, 16)})` });

  return (
    <div
      className="fixed inset-0 flex justify-center bg-black/[0.16] pt-[9vh] animate-[orbit-fade-in_var(--dur-modal)_var(--ease-out)]"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
      onKeyDown={(e) => e.key === 'Escape' && close()}
      data-testid="app-library-backdrop"
    >
      <Glass
        className="animate-pop flex h-fit max-h-[78vh] w-[min(780px,92vw)] flex-col rounded-[26px]"
        role="dialog"
        aria-label="App Library"
        data-testid="app-library"
      >
        <header className="flex items-center gap-3 px-5 pt-4 pb-3">
          <h2 className="shrink-0 text-[16px] font-semibold">Apps</h2>
          <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full bg-white/[0.08] px-3.5 ring-1 ring-white/10 focus-within:ring-white/30">
            <Search size={15} className="shrink-0 opacity-60" />
            <input
              ref={search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  grid.current?.querySelector<HTMLElement>('[data-tile]')?.focus();
                }
              }}
              placeholder="Find an app, or type a site to add…"
              aria-label="Find an app"
              className="h-full min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-white/45"
              spellCheck={false}
              autoComplete="off"
              data-testid="app-library-search"
            />
          </label>
          <button
            type="button"
            aria-label="Close"
            onClick={() => close()}
            className="lift grid size-8 shrink-0 place-items-center rounded-full text-white/65 hover:bg-white/[0.1] hover:text-white"
            data-testid="app-library-close"
          >
            <X size={16} />
          </button>
        </header>

        <div
          ref={grid}
          className="min-h-0 flex-1 overflow-y-auto border-t border-white/[0.08] px-5 pt-3 pb-4"
          onKeyDown={onGridKey}
        >
          {apps.length > 0 && (
            <section aria-label="Your apps" data-testid="app-library-yours">
              <h3 className="mb-2 text-[11.5px] font-semibold tracking-wide text-white/55 uppercase">
                Your apps
              </h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1.5">
                {apps.map((app) => (
                  <button
                    key={app.id}
                    type="button"
                    data-tile
                    onClick={() => void window.orbit.invoke('applib:launch', { itemId: app.id })}
                    className="lift animate-rise flex items-center gap-3 rounded-[14px] px-2.5 py-2 text-left hover:bg-white/[0.08] focus-visible:bg-white/[0.1]"
                    style={reveal()}
                    title={`Open ${app.title} — ${WHERE[app.openIn].toLowerCase()}`}
                    data-testid="app-library-app"
                    data-open={app.open}
                  >
                    <AppTile name={app.title} favicon={app.favicon} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{app.title}</span>
                      <span className="flex items-center gap-1 truncate text-[11.5px] text-white/50">
                        {app.openIn === 'panel' ? (
                          <PanelRight size={10} />
                        ) : app.openIn === 'window' ? (
                          <AppWindow size={10} />
                        ) : null}
                        {app.open ? 'Open now' : WHERE[app.openIn]}
                      </span>
                    </span>
                    {app.open && (
                      <span
                        className="size-1.5 shrink-0 rounded-full bg-[var(--orbit-sea-glass)]"
                        aria-label="Open now"
                      />
                    )}
                  </button>
                ))}
              </div>
            </section>
          )}

          {typedSite && !library.apps.some((a) => a.host === typedSite.replace(/^www\./, '')) && (
            <button
              type="button"
              data-tile
              onClick={() => void window.orbit.invoke('applib:add', { url: typedSite })}
              className="lift mt-3 flex w-full items-center gap-3 rounded-[14px] px-2.5 py-2 text-left hover:bg-white/[0.08] focus-visible:bg-white/[0.1]"
              data-testid="app-library-add-typed"
            >
              <span className="grid size-9 place-items-center rounded-[11px] bg-white/[0.1]">
                <Plus size={16} />
              </span>
              <span className="text-[13.5px]">
                Add <span className="font-semibold">{typedSite}</span> as an app
              </span>
            </button>
          )}

          {catalog.map((group) => (
            <section key={group.group} className="mt-4" aria-label={group.group}>
              <h3 className="mb-2 text-[11.5px] font-semibold tracking-wide text-white/55 uppercase">
                {group.group}
              </h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1.5">
                {group.apps.map((app) => (
                  <button
                    key={app.url}
                    type="button"
                    data-tile
                    disabled={app.added}
                    onClick={() =>
                      void window.orbit.invoke('applib:add', { url: app.url, title: app.name })
                    }
                    className="lift animate-rise flex items-center gap-3 rounded-[14px] px-2.5 py-2 text-left enabled:hover:bg-white/[0.08] focus-visible:bg-white/[0.1] disabled:cursor-default"
                    style={reveal()}
                    title={app.added ? `${app.name} is one of your apps` : `Add ${app.name}`}
                    data-testid="app-library-catalog"
                    data-added={app.added}
                  >
                    <AppTile name={app.name} favicon={null} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{app.name}</span>
                      <span className="block truncate text-[11.5px] text-white/50">{app.host}</span>
                    </span>
                    <span
                      className={`grid size-6 shrink-0 place-items-center rounded-full ${
                        app.added
                          ? 'text-[var(--orbit-sea-glass)]'
                          : 'bg-white/[0.08] text-white/80'
                      }`}
                      aria-label={app.added ? 'Added' : 'Add'}
                    >
                      {app.added ? <Check size={13} strokeWidth={2.6} /> : <Plus size={13} />}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}

          {apps.length === 0 && catalog.length === 0 && !typedSite && (
            <p
              className="py-8 text-center text-[13px] text-white/55"
              data-testid="app-library-empty"
            >
              No apps match “{query.trim()}”. Type a site’s address to add it.
            </p>
          )}
        </div>

        <footer className="flex items-center border-t border-white/[0.08] px-5 py-2.5 text-[12px] text-white/55">
          <span className="flex-1">
            Your apps are your Favorites — drag them in the sidebar to reorder.
          </span>
          <button
            type="button"
            onClick={() => close(true)}
            className="rounded-md px-1.5 py-0.5 text-white/70 underline-offset-2 hover:text-white hover:underline"
            data-testid="app-library-settings"
          >
            Manage in Settings
          </button>
        </footer>
      </Glass>
    </div>
  );
}

/** An app's icon: its own on white, or its initial on a calm tint. */
function AppTile({ name, favicon }: { name: string; favicon: string | null }) {
  return favicon ? (
    <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)]">
      <img src={favicon} alt="" className="size-5" />
    </span>
  ) : (
    <span
      className="grid size-9 shrink-0 place-items-center rounded-[11px] text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.2)]"
      style={{ background: tintFor(name) }}
      aria-hidden
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
