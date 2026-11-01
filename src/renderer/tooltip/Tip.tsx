import { cloneElement, useCallback, useEffect, useState } from 'react';
import type { PointerEvent, ReactElement } from 'react';
import { splitKeys } from '@shared/keys';

type Side = 'top' | 'bottom' | 'right';
type Target = {
  onPointerEnter?: (e: PointerEvent<HTMLElement>) => void;
  onPointerLeave?: (e: PointerEvent<HTMLElement>) => void;
  onPointerDown?: (e: PointerEvent<HTMLElement>) => void;
};

/** Hover this long before the first tooltip; once one shows, the next ones come at once. */
const DELAY_MS = 500;
const WARM_MS = 600;

/** One tooltip at a time, shared by every <Tip> on the page. */
const shared: {
  timer: ReturnType<typeof setTimeout> | undefined;
  owner: object | null;
  hiddenAt: number;
} = { timer: undefined, owner: null, hiddenAt: 0 };

function hide(): void {
  clearTimeout(shared.timer);
  if (!shared.owner) return;
  shared.owner = null;
  shared.hiddenAt = Date.now();
  void window.orbit.invoke('tooltip:hide', {});
}

if (typeof window !== 'undefined') window.addEventListener('blur', hide);

/**
 * An Arc-style tooltip for a control: `label` and its shortcut as key caps, drawn by the
 * overlay (so it shows over the page too). Wraps one element and keeps its own handlers.
 */
export function Tip({
  label,
  keys,
  side = 'bottom',
  children,
}: {
  label: string;
  /** "⇧⌘C", "⌃3"… */
  keys?: string | undefined;
  side?: Side;
  children: ReactElement<Target>;
}) {
  // This Tip's identity (which control the showing tooltip belongs to).
  const [me] = useState<object>(() => ({}));
  // A control that goes away (the sidebar hiding…) takes its tooltip with it.
  useEffect(
    () => () => {
      if (shared.owner === me) hide();
    },
    [me],
  );
  const own = children.props;

  const enter = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      own.onPointerEnter?.(e);
      clearTimeout(shared.timer);
      const el = e.currentTarget;
      const warm = shared.owner !== null || Date.now() - shared.hiddenAt < WARM_MS;
      shared.timer = setTimeout(
        () => {
          if (!el.isConnected) return;
          const r = el.getBoundingClientRect();
          shared.owner = me;
          void window.orbit.invoke('tooltip:show', {
            label,
            keys: keys ? splitKeys(keys) : [],
            anchor: { x: r.x, y: r.y, width: r.width, height: r.height },
            side,
          });
        },
        warm ? 0 : DELAY_MS,
      );
    },
    [own, label, keys, side, me],
  );
  const leave = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      own.onPointerLeave?.(e);
      hide();
    },
    [own],
  );
  const down = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      own.onPointerDown?.(e);
      hide();
    },
    [own],
  );
  return cloneElement(children, {
    onPointerEnter: enter,
    onPointerLeave: leave,
    onPointerDown: down,
  });
}
