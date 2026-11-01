import type { BuiltinWallpaperId } from '@shared/types/newtab';

/** Soft "mesh" wallpapers: a few blurred colour blobs over a deep base colour. */
function mesh(base: string, blobs: [x: number, y: number, color: string, size: number][]): string {
  return [
    ...blobs.map(
      ([x, y, color, size]) =>
        `radial-gradient(at ${x}% ${y}%, ${color} 0px, transparent ${size}%)`,
    ),
    base,
  ].join(', ');
}

export const WALLPAPER_CSS: Record<BuiltinWallpaperId, string> = {
  aurora: mesh('#0b1026', [
    [18, 18, '#38e8b6', 48],
    [82, 8, '#7b5cff', 46],
    [62, 88, '#1fa2ff', 52],
    [8, 92, '#3a2a8f', 40],
  ]),
  dusk: mesh('#2b1640', [
    [15, 85, '#ff7e5f', 50],
    [70, 75, '#feb47b', 42],
    [85, 10, '#6a3093', 55],
    [30, 20, '#b0466d', 45],
  ]),
  lagoon: mesh('#023047', [
    [20, 25, '#00c9a7', 50],
    [80, 30, '#00a3ff', 48],
    [55, 95, '#8ff0dc', 40],
  ]),
  ember: mesh('#1a0a0a', [
    [20, 80, '#ff512f', 50],
    [75, 70, '#f09819', 42],
    [70, 10, '#dd2476', 48],
  ]),
  orchid: mesh('#1b0b2e', [
    [25, 20, '#da22ff', 46],
    [80, 60, '#9733ee', 50],
    [35, 95, '#ff9a9e', 40],
  ]),
  forest: mesh('#0a1f14', [
    [20, 30, '#134e5e', 55],
    [75, 70, '#71b280', 45],
    [85, 15, '#a8e063', 32],
  ]),
  midnight: mesh('#05060f', [
    [25, 25, '#3a1c71', 50],
    [75, 35, '#283c86', 50],
    [50, 100, '#1b4d5c', 45],
  ]),
  dune: mesh('#3b2a20', [
    [20, 20, '#e6b980', 50],
    [80, 30, '#eacda3', 42],
    [55, 95, '#c06c84', 48],
  ]),
};

/** Film-grain overlay (SVG noise) that keeps gradients from looking flat or banding. */
export const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")";
