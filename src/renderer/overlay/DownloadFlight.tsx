import { ArrowDown } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { OverlayState } from '@shared/types/command-bar';

type Flight = NonNullable<OverlayState['flight']>;
const SIZE = 34;

/**
 * Arc's download flourish: a blue badge pops up out of the page, arcs over and drops into the
 * downloads shelf at the bottom of the sidebar, shrinking as it docks. One curved motion path
 * (CSS offset-path) driven by the Web Animations API; skipped under "Reduce motion".
 */
export function DownloadFlight({ flight }: { flight: Flight }) {
  const badge = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = badge.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const { from, to } = flight;
    // Up first (a jump out of the page), then a long arc down and left to the shelf.
    const cx = from.x - (from.x - to.x) * 0.35;
    const cy = Math.min(from.y, to.y) - 240;
    el.style.offsetPath = `path("M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}")`;
    el.style.offsetRotate = '0deg';
    const animation = el.animate(
      [
        { offsetDistance: '0%', transform: 'scale(0.4)', opacity: 0 },
        { offsetDistance: '6%', transform: 'scale(1.18)', opacity: 1, offset: 0.16 },
        { offsetDistance: '30%', transform: 'scale(1)', opacity: 1, offset: 0.4 },
        { offsetDistance: '100%', transform: 'scale(0.62)', opacity: 1, offset: 0.92 },
        { offsetDistance: '100%', transform: 'scale(0.4)', opacity: 0 },
      ],
      { duration: 1050, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'forwards' },
    );
    return () => animation.cancel();
  }, [flight]);

  return (
    <div className="pointer-events-none fixed inset-0" data-testid="download-flight">
      <div
        ref={badge}
        className="absolute top-0 left-0 grid place-items-center rounded-full bg-[#0a84ff] text-white opacity-0 shadow-[0_0_0_3px_rgb(255_255_255/0.9),0_10px_26px_-4px_rgb(10_132_255/0.6)]"
        style={{ width: SIZE, height: SIZE, marginLeft: -SIZE / 2, marginTop: -SIZE / 2 }}
      >
        <ArrowDown size={18} strokeWidth={2.6} />
      </div>
    </div>
  );
}
