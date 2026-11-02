import { ArrowLeft, ArrowRight, Columns2, Maximize2, RotateCw, X } from 'lucide-react';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { formatAddress } from '@shared/format-address';
import type { PeekView } from '@shared/types/command-bar';
import { Tip } from '../tooltip/Tip';

/**
 * Peek (F-23), Arc-style: a link that wanted a new tab pops out as a card over the page. Main
 * places the page itself just under the card's slim bar (back, forward, reload, the address);
 * beside the card sit round buttons — Close, Open as Tab and Open in Split View. Esc or a click
 * on the dimmed page closes it. Only the page area dims: the sidebar stays usable, and leaving
 * the tab keeps its Peek waiting there.
 */
export function PeekFrame({
  peek,
  origin,
  interactive,
}: {
  peek: PeekView;
  /** Where the overlay sits in the window: alone with the Peek, it covers only the page area. */
  origin: { x: number; y: number };
  interactive: boolean;
}) {
  const { headerHeight, radius } = peek;
  // The dimmed area sits in the overlay; the card and its buttons sit in the dimmed area.
  const cover = { ...peek.cover, x: peek.cover.x - origin.x, y: peek.cover.y - origin.y };
  const frame = { ...peek.frame, x: peek.frame.x - peek.cover.x, y: peek.frame.y - peek.cover.y };
  const address = formatAddress(peek.url, peek.title);
  const close = () => void window.orbit.invoke('peek:close', {});
  const navigate = (action: 'back' | 'forward' | 'reload') =>
    void window.orbit.invoke('peek:navigate', { action });

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
      className="fixed bg-black/35 animate-[orbit-fade-in_var(--dur)_var(--ease-out)]"
      style={{ left: cover.x, top: cover.y, width: cover.width, height: cover.height }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      data-testid="peek-backdrop"
    >
      <div
        className="ui-light absolute origin-center bg-white shadow-[0_0_0_0.5px_rgb(0_0_0/0.25),0_2px_8px_rgb(0_0_0/0.14),0_40px_100px_-12px_rgb(0_0_0/0.6)] animate-[orbit-peek-in_200ms_var(--ease-out)_both]"
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
          className="relative flex items-center gap-0.5 px-2 text-[13px] text-neutral-600"
          style={{ height: headerHeight }}
        >
          <BarButton
            label="Back"
            onClick={() => navigate('back')}
            disabled={!peek.canGoBack}
            testId="peek-back"
          >
            <ArrowLeft size={14} />
          </BarButton>
          <BarButton
            label="Forward"
            onClick={() => navigate('forward')}
            disabled={!peek.canGoForward}
            testId="peek-forward"
          >
            <ArrowRight size={14} />
          </BarButton>
          <BarButton label="Reload" onClick={() => navigate('reload')} testId="peek-reload">
            <RotateCw size={13} />
          </BarButton>
          <span
            className="pointer-events-none absolute inset-x-28 flex min-w-0 items-center justify-center gap-1.5"
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
          {peek.isLoading && (
            <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden">
              <div className="h-full w-1/3 animate-[orbit-loading_1.1s_ease-in-out_infinite] rounded-full bg-[var(--accent-fill)]" />
            </div>
          )}
        </div>
      </div>

      {/* Beside the card, like Arc: close, expand to a tab, split view. */}
      <div
        className="absolute flex flex-col gap-2 animate-[orbit-peek-in_200ms_var(--ease-out)_both]"
        style={{ left: frame.x + frame.width + 12, top: frame.y }}
        data-testid="peek-actions"
      >
        <SideButton label="Close" keys="Esc" onClick={close} testId="peek-close">
          <X size={16} />
        </SideButton>
        <SideButton
          label="Open as Tab"
          onClick={() => void window.orbit.invoke('peek:promote', {})}
          testId="peek-promote"
        >
          <Maximize2 size={14} />
        </SideButton>
        <SideButton
          label="Open in Split View"
          onClick={() => void window.orbit.invoke('peek:split', {})}
          testId="peek-split"
        >
          <Columns2 size={15} />
        </SideButton>
      </div>
    </div>
  );
}

function BarButton(props: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  testId: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      disabled={props.disabled}
      className="press grid size-7 place-items-center rounded-[7px] hover:bg-black/[0.06] disabled:opacity-30"
      data-testid={props.testId}
    >
      {props.children}
    </button>
  );
}

/** A round button beside the card (dark glass, white icon), with an Arc-style tooltip. */
function SideButton(props: {
  label: string;
  keys?: string;
  onClick: () => void;
  children: ReactNode;
  testId: string;
}) {
  return (
    <Tip label={props.label} keys={props.keys} side="right">
      <button
        type="button"
        aria-label={props.label}
        onClick={props.onClick}
        className="press grid size-[34px] place-items-center rounded-full bg-[rgb(28_27_34/0.82)] text-on-accent shadow-[0_0_0_0.5px_rgb(255_255_255/0.18),0_6px_18px_-4px_rgb(0_0_0/0.5)] backdrop-blur-xl hover:bg-[rgb(48_46_58/0.92)]"
        data-testid={props.testId}
      >
        {props.children}
      </button>
    </Tip>
  );
}
