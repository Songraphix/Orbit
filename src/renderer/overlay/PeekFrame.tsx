import { ArrowUpRight, X } from 'lucide-react';
import { useEffect } from 'react';
import { formatAddress } from '@shared/format-address';
import type { PeekView } from '@shared/types/command-bar';

/**
 * The Peek preview's frame (F-23). Main places the previewed page exactly below the header, so
 * this draws the dimmed backdrop (click to close), the header and the shadow around it.
 */
export function PeekFrame({ peek, interactive }: { peek: PeekView; interactive: boolean }) {
  const { frame, headerHeight, radius } = peek;
  const address = formatAddress(peek.url, peek.title);
  const close = () => void window.orbit.invoke('peek:close', {});

  useEffect(() => {
    if (!interactive) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [interactive]);

  return (
    <div
      className="fixed inset-0 bg-black/25 animate-[orbit-fade-in_120ms_ease-out]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      data-testid="peek-backdrop"
    >
      <div
        className="absolute bg-white shadow-[0_24px_80px_rgb(0_0_0/0.35)]"
        style={{
          left: frame.x,
          top: frame.y,
          width: frame.width,
          height: frame.height,
          borderRadius: radius,
        }}
        data-testid="peek"
      >
        <div
          className="flex items-center gap-2 border-b border-black/5 px-2 text-[13px] text-neutral-600"
          style={{ height: headerHeight }}
        >
          <button
            type="button"
            aria-label="Close Preview"
            title="Close (Esc)"
            onClick={close}
            className="grid size-7 place-items-center rounded-md hover:bg-black/5"
            data-testid="peek-close"
          >
            <X size={15} />
          </button>
          <span
            className="flex min-w-0 flex-1 items-center justify-center gap-1.5"
            title={peek.url}
          >
            {peek.favicon && <img src={peek.favicon} alt="" className="size-4 shrink-0" />}
            <span className="shrink-0 font-medium text-neutral-800" data-testid="peek-address">
              {address.domain || peek.url}
            </span>
            {address.title && (
              <span className="truncate text-neutral-500">
                <span className="text-neutral-300">/ </span>
                {address.title}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => void window.orbit.invoke('peek:promote', {})}
            className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-medium text-neutral-700 hover:bg-black/5"
            data-testid="peek-promote"
          >
            Open as Tab <ArrowUpRight size={13} />
          </button>
        </div>
        {peek.isLoading && (
          <div
            className="absolute inset-x-0 h-0.5 overflow-hidden"
            style={{ top: headerHeight - 2 }}
          >
            <div className="h-full w-1/3 animate-[orbit-loading_1.1s_ease-in-out_infinite] rounded-full bg-neutral-400" />
          </div>
        )}
      </div>
    </div>
  );
}
