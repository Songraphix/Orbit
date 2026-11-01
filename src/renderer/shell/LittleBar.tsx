import { ArrowUpRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatAddress } from '@shared/format-address';

/**
 * The bar of a Little Orbit window (F-24): which page this is, and "Open in Orbit" to move it
 * into the main window. The rest of the strip drags the window.
 */
export function LittleBar() {
  const [page, setPage] = useState({ url: '', title: '' });

  useEffect(() => {
    const off = window.orbit.on('little:state', setPage);
    void window.orbit.invoke('little:get', {}).then(setPage);
    return off;
  }, []);

  const address = formatAddress(page.url, page.title);

  return (
    <div
      className="drag-region flex h-[38px] items-center gap-2 pr-2 pl-[76px] text-[12px]"
      style={{ background: 'var(--sidebar-bg)', color: 'var(--sidebar-fg)' }}
      data-testid="little-bar"
    >
      <span className="min-w-0 flex-1 truncate" title={page.url} data-testid="little-address">
        <span className="font-semibold">{address.domain}</span>
        {address.title && <span className="opacity-60"> / {address.title}</span>}
      </span>
      <button
        type="button"
        className="no-drag flex shrink-0 items-center gap-1 rounded-md bg-[var(--row-active)] px-2 py-1 font-medium hover:brightness-110"
        onClick={() => void window.orbit.invoke('little:promote', {})}
        data-testid="little-promote"
      >
        Open in Orbit <ArrowUpRight size={13} />
      </button>
    </div>
  );
}
