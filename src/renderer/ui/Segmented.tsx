import type { ReactNode } from 'react';

/**
 * A segmented control (macOS style): one of a few choices, as a row of buttons in a track.
 * Accessible as a radio group; each option carries data-value for tests and styling.
 */
export function Segmented<T extends string>(props: {
  value: T;
  options: readonly { value: T; label: ReactNode; title?: string }[];
  onChange: (value: T) => void;
  label: string;
  testId?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={props.label}
      className="flex rounded-[var(--radius-control)] bg-neutral-100 p-0.5"
      data-testid={props.testId}
    >
      {props.options.map((o) => {
        const on = o.value === props.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.title}
            onClick={() => props.onChange(o.value)}
            className={`flex h-7 items-center justify-center gap-1.5 rounded-[6px] px-3 text-[12.5px] transition-colors ${
              on
                ? 'bg-white font-medium text-neutral-900 shadow-[0_1px_2px_rgb(0_0_0/0.12)]'
                : 'text-neutral-500 hover:text-neutral-800'
            }`}
            data-value={o.value}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
