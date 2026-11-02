import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { buttonClass } from './controls';
import type { Variant } from './controls';

/**
 * Orbit's button (design system, M1): one height, radius and set of states everywhere.
 * `primary` for the one main action, `secondary` for the rest, `ghost` in toolbars and rows,
 * `danger` for deleting. Works inside `.ui-light` surfaces in both light and dark.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  className = '',
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: 'sm' | 'md';
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <button type={type} className={`${buttonClass(variant, size)} ${className}`} {...rest}>
      {icon}
      {children}
    </button>
  );
}
