import type { CSSProperties } from 'react';

/** The tooltip itself: a label and its shortcut's key caps (Arc's look). */
export function TooltipPill({
  label,
  keys,
  side,
}: {
  label: string;
  keys: readonly string[];
  side: 'top' | 'bottom' | 'right';
}) {
  // It slides in from its control's side.
  const from = side === 'bottom' ? '-3px' : side === 'top' ? '3px' : '0px';
  return (
    <span
      className="orbit-tip"
      role="tooltip"
      data-keys={keys.length > 0}
      style={{ '--tip-from': from } as CSSProperties}
      data-testid="tooltip"
    >
      {label}
      {keys.length > 0 && (
        <span className="flex gap-[3px]" aria-hidden>
          {keys.map((k, i) => (
            <kbd key={i}>{k}</kbd>
          ))}
        </span>
      )}
    </span>
  );
}
