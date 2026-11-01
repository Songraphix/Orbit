import type { ReactNode, SVGProps } from 'react';
import type { LibrarySection } from '@shared/types/library';

/**
 * The Library's section icons (owner: "even their icons have animation and colour"): quiet line
 * drawings that fill with colour and move once when their section opens — the photos fan out,
 * the download arrow drops in and bounces, the brush stroke draws itself, the cards spread, the
 * sparkles twinkle, the lid lifts. Motion lives in tokens.css (`.lib-icon`).
 */
export function LibraryIcon({ section, active }: { section: LibrarySection; active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="lib-icon"
      data-active={active}
      data-section={section}
      aria-hidden
    >
      {ICONS[section](active)}
    </svg>
  );
}

const on = (active: boolean, color: string) => (active ? color : 'currentColor');
const fill = (active: boolean, color: string): SVGProps<SVGElement>['fill'] =>
  active ? color : 'none';

const ICONS: Record<LibrarySection, (active: boolean) => ReactNode> = {
  media: (a) => (
    <>
      <defs>
        <linearGradient id="li-media" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff5f9e" />
          <stop offset="1" stopColor="#ffb24a" />
        </linearGradient>
      </defs>
      {/* The photo behind: just its top-left corner shows. */}
      <path
        className="li-back"
        d="M3.5 14V8.2a2.5 2.5 0 0 1 2.5-2.5h8.2"
        stroke={on(a, '#ff9ec0')}
        opacity={a ? 1 : 0.6}
      />
      <g className="li-front">
        <rect
          x="7"
          y="8"
          width="13.5"
          height="11"
          rx="2.6"
          fill={fill(a, 'url(#li-media)')}
          stroke={a ? 'none' : 'currentColor'}
        />
        <path d="M8.4 17.4l3.3-3.5 2.4 2.3 1.9-2 3.2 3.2" stroke={on(a, '#fff')} />
        <circle
          className="li-sun"
          cx="16.7"
          cy="11.4"
          r="1.25"
          fill={a ? '#fff' : 'currentColor'}
          stroke="none"
        />
      </g>
    </>
  ),
  downloads: (a) => (
    <>
      <circle cx="12" cy="12" r="9" fill={fill(a, '#2f7bf6')} stroke={on(a, '#2f7bf6')} />
      <g className="li-arrow" stroke={on(a, '#fff')} strokeWidth={a ? 2.2 : 1.8}>
        <path d="M12 7.6v8.1" />
        <path d="M8.6 12.4 12 15.8l3.4-3.4" />
      </g>
    </>
  ),
  easels: (a) => (
    <>
      <rect
        x="3.5"
        y="3.5"
        width="17"
        height="12.5"
        rx="2.5"
        fill={fill(a, '#f5a524')}
        stroke={on(a, '#f5a524')}
      />
      <path
        className="li-stroke"
        pathLength={1}
        d="M7 12c1.4-3.3 2.8-3.3 3.8-.2s2.6 3 4.1-.9 2.1-2.4 2.4-1.2"
        stroke={on(a, '#fff')}
      />
      <path d="M8.6 20.5 12 16l3.4 4.5" stroke={on(a, '#f5a524')} />
    </>
  ),
  spaces: (a) =>
    a ? (
      <>
        <rect
          className="li-card-back"
          x="8"
          y="3"
          width="11"
          height="14"
          rx="2.3"
          fill="#c4b5fd"
          stroke="none"
        />
        <rect
          className="li-card-mid"
          x="6.4"
          y="4.9"
          width="11"
          height="14"
          rx="2.3"
          fill="#a78bfa"
          stroke="none"
        />
        <rect
          className="li-card-front"
          x="4.8"
          y="6.8"
          width="11"
          height="14"
          rx="2.3"
          fill="#7c3aed"
          stroke="none"
        />
        <path d="M7.6 10.5h5.4M7.6 13.4h3.6" stroke="#fff" strokeWidth={1.6} />
      </>
    ) : (
      <>
        {/* Cards behind: only their top-right edges show. */}
        <path d="M10.3 3h6.4a2.3 2.3 0 0 1 2.3 2.3v9.4" opacity={0.5} />
        <path d="M8.7 4.9h6.4A2.3 2.3 0 0 1 17.4 7.2v9.4" opacity={0.75} />
        <rect x="4.8" y="6.8" width="11" height="14" rx="2.3" />
      </>
    ),
  boosts: (a) => (
    <>
      <path
        className="li-wand"
        d="M4.8 19.4 14.4 9.8"
        stroke={on(a, '#ec4899')}
        strokeWidth={a ? 2.6 : 2}
      />
      <path d="M15.8 8.4l1.3-1.3" stroke={on(a, '#f9a8d4')} strokeWidth={a ? 2.6 : 2} />
      <path
        className="li-spark li-spark-1"
        d="M17.4 2.6v3.6M15.6 4.4h3.6"
        stroke={on(a, '#fbbf24')}
      />
      <path
        className="li-spark li-spark-2"
        d="M20.6 9.6v2.2M19.5 10.7h2.2"
        stroke={on(a, '#fb7185')}
      />
      <path
        className="li-spark li-spark-3"
        d="M9.8 3.2v2.2M8.7 4.3h2.2"
        stroke={on(a, '#f472b6')}
      />
    </>
  ),
  archive: (a) => (
    <>
      <path
        d="M4.8 8.6V18a2 2 0 0 0 2 2h10.4a2 2 0 0 0 2-2V8.6"
        fill={fill(a, '#14b8a6')}
        stroke={on(a, '#14b8a6')}
      />
      <path d="M10 12.8h4" stroke={on(a, '#fff')} />
      <rect
        className="li-lid"
        x="3"
        y="4"
        width="18"
        height="4.6"
        rx="1.5"
        fill={fill(a, '#2dd4bf')}
        stroke={on(a, '#2dd4bf')}
      />
    </>
  ),
};

/** Orbit's own mark at the top of the Library: a planet, its ring, and a moon going round. */
export function OrbitMark() {
  return (
    <svg viewBox="0 0 32 32" width={30} height={30} className="orbit-mark" aria-hidden>
      <defs>
        <linearGradient id="orbit-mark-planet" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a99bff" />
          <stop offset="1" stopColor="#5b5bd6" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="7" fill="url(#orbit-mark-planet)" />
      <ellipse
        cx="16"
        cy="16"
        rx="13"
        ry="5"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1.4"
        transform="rotate(-20 16 16)"
      />
      <g className="orbit-mark-moon">
        <circle cx="28.2" cy="11.6" r="1.9" fill="#fff" />
      </g>
    </svg>
  );
}
