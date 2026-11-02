import type { ChangeEvent } from 'react';

/**
 * An on/off switch (macOS style). A real checkbox underneath — keyboard, screen readers and
 * forms treat it as one — with `role="switch"`; it follows the palette and the accent.
 */
export function Toggle(props: {
  checked: boolean;
  onChange: (checked: boolean, event: ChangeEvent<HTMLInputElement>) => void;
  label?: string;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <input
      type="checkbox"
      role="switch"
      className="orbit-switch"
      checked={props.checked}
      disabled={props.disabled}
      aria-label={props.label}
      onChange={(e) => props.onChange(e.target.checked, e)}
      data-testid={props.testId}
    />
  );
}
