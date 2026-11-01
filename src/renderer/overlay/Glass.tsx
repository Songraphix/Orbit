import { useContext, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { BackdropContext } from './backdrop';

/** Where an element sits in the overlay, ignoring transforms (entrance animations scale it). */
function layoutOrigin(el: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) {
    x += node.offsetLeft;
    y += node.offsetTop;
  }
  return { x, y };
}

/**
 * A glass surface (Arc-like): a blurred, saturated copy of the page behind it under a dark tint,
 * a lit hairline rim and layered shadows. Native web pages can't be blurred by CSS, so the copy
 * is a snapshot main takes when the surface opens; until it arrives the tint is a little denser.
 */
export function Glass(props: {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  role?: string;
  'aria-label'?: string;
  'data-testid'?: string;
  'data-kind'?: string;
}) {
  const backdrop = useContext(BackdropContext);
  const ref = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const next = layoutOrigin(el);
      setOrigin((o) => (o && o.x === next.x && o.y === next.y ? o : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const { className = '', children, ...rest } = props;
  // The page copy and tint are positioned inside, so the surface must be positioned itself.
  const position = /(^|\s)(absolute|fixed)(\s|$)/.test(className) ? '' : 'relative';
  return (
    <div
      ref={ref}
      {...rest}
      className={`glass overflow-hidden ${position} ${backdrop ? '' : 'glass-solid'} ${className}`}
    >
      {backdrop && origin && (
        <img
          src={backdrop.image}
          alt=""
          aria-hidden
          className="pointer-events-none absolute -z-10 max-w-none select-none"
          style={{
            left: backdrop.rect.x - origin.x,
            top: backdrop.rect.y - origin.y,
            width: backdrop.rect.width,
            height: backdrop.rect.height,
            filter: 'blur(30px) saturate(1.8) brightness(0.8)',
          }}
          data-testid="glass-backdrop"
        />
      )}
      {/* The tint goes over the page copy, so text stays readable on white pages too. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[rgb(26_25_32/0.72)]"
      />
      {children}
    </div>
  );
}
