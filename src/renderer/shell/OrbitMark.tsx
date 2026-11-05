import { useId } from 'react';

/** Orbit's mark: a soft ring with a small moon on it, lit by the canvas accent. */
export function OrbitMark({ size = 20 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={id} x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="var(--canvas-accent, #b8a6ff)" />
          <stop offset="1" stopColor="var(--canvas-accent-2, #7cc4b5)" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="8" fill="none" stroke={`url(#${id})`} strokeWidth="2.6" />
      <circle cx="18.2" cy="6.6" r="2.4" fill="#ffffff" />
    </svg>
  );
}
