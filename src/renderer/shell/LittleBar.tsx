import { ArrowUpRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatAddress } from '@shared/format-address';

/**
 * The bar of a Little Orbit window (F-24): which page this is, and "Open in Orbit" to move it
 * into the main window. Clicking the address (or an empty ⌥⌘N window) lets you type an address
 * or search. The rest of the strip drags the window.
 */
export function LittleBar() {
  const [page, setPage] = useState({ url: '', title: '' });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const off = window.orbit.on('little:state', (next) => {
      setPage(next);
      setEditing(false);
    });
    void window.orbit.invoke('little:get', {}).then(setPage);
    return off;
  }, []);

  const empty = page.url === '' || page.url === 'about:blank';
  const showInput = editing || empty;
  const address = formatAddress(page.url, page.title);

  return (
    <div
      className="drag-region flex h-[38px] items-center gap-2 pr-2 pl-[76px] text-[12px]"
      style={{ background: 'var(--sidebar-bg)', color: 'var(--sidebar-fg)' }}
      data-testid="little-bar"
    >
      {showInput ? (
        <form
          className="no-drag min-w-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            const input = draft.trim();
            if (input) void window.orbit.invoke('little:navigate', { input });
          }}
        >
          <input
            // Focused as soon as it appears: an empty window is waiting for an address.
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !empty) setEditing(false);
            }}
            onBlur={() => !empty && setEditing(false)}
            placeholder="Search or enter address"
            spellCheck={false}
            className="w-full rounded-md bg-[var(--row-active)] px-2 py-1 outline-none placeholder:opacity-60"
            data-testid="little-input"
          />
        </form>
      ) : (
        <button
          type="button"
          className="no-drag min-w-0 flex-1 truncate rounded-md px-1 py-0.5 text-left hover:bg-[var(--row-active)]"
          title={page.url}
          onClick={() => {
            setDraft(page.url);
            setEditing(true);
          }}
          data-testid="little-address"
        >
          <span className="font-semibold">{address.domain}</span>
          {address.title && <span className="opacity-60"> / {address.title}</span>}
        </button>
      )}
      <button
        type="button"
        disabled={empty}
        className="no-drag flex shrink-0 items-center gap-1 rounded-md bg-[var(--row-active)] px-2 py-1 font-medium hover:brightness-110 disabled:opacity-40"
        onClick={() => void window.orbit.invoke('little:promote', {})}
        data-testid="little-promote"
      >
        Open in Orbit <ArrowUpRight size={13} />
      </button>
    </div>
  );
}
