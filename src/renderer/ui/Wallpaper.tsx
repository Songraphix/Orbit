import { useState } from 'react';
import type { CSSProperties } from 'react';
import { backgroundKey, lookFilter } from '@shared/backgrounds';
import type { BackgroundLook } from '@shared/backgrounds';
import type { WallpaperChoice } from '@shared/types/newtab';
import {
  ATMOSPHERE_FIELDS,
  backgroundCss,
  GRAIN,
  isPhotoChoice,
  PHOTO_AVERAGE,
} from '@shared/wallpapers';

/** --dur-ambient in tokens.css (seconds): drift is timed from the clock so every page that draws
 *  the wallpaper drifts in step (the shell's canvas and the Homepage line up exactly). */
const AMBIENT_S = 48;

/**
 * The wallpaper (UI spec §4): the image or colours, your adjustments (brightness, saturation,
 * contrast, blur), a veil over photos so text stays readable, grain and a soft vignette. A photo
 * shows its average colour while it loads.
 *
 * The shell draws it behind the whole window (the canvas every island floats on); the Homepage
 * draws the same one, aligned to the window through `frame` (where its own view sits), so the
 * two meet without a seam and the Homepage's widgets can blur what's behind them.
 */
export function Wallpaper(props: {
  choice: WallpaperChoice | null;
  customImage: string | null;
  look: BackgroundLook;
  /** A pale veil (light wallpapers under dark text) instead of the dark vignette. */
  light: boolean;
  /** This page's place in the window: the wallpaper is drawn window-sized, offset to match. */
  frame?: { x: number; y: number; windowWidth: number; windowHeight: number } | null;
  /** Where the shell is drawing it (tests tell the canvas from the Homepage's copy). */
  testId?: string;
}) {
  const { choice, look, frame } = props;
  const image = choice !== null && isPhotoChoice(choice);
  const atmosphere = choice?.kind === 'builtin' && Boolean(ATMOSPHERE_FIELDS[choice.id]);
  // Drift starts where the clock says, so separate pages stay in step.
  const [offset] = useState(() => (Date.now() / 1000) % 1e6);
  const box: CSSProperties = frame
    ? { left: -frame.x, top: -frame.y, width: frame.windowWidth, height: frame.windowHeight }
    : { inset: 0 };
  const loading =
    choice?.kind === 'unsplash'
      ? (choice.photo.color ?? '#1a1d2e')
      : choice?.kind === 'builtin'
        ? (PHOTO_AVERAGE[choice.id] ?? '#0b1026')
        : '#0b1026';
  return (
    <div
      className="pointer-events-none fixed overflow-hidden"
      style={{ ...box, background: loading }}
      data-testid={props.testId ?? 'wallpaper'}
      data-wallpaper={choice ? (choice.kind === 'builtin' ? choice.id : choice.kind) : 'loading'}
      data-key={choice ? backgroundKey(choice) : ''}
    >
      {choice && (
        <div
          className="absolute -inset-6 transition-[background,filter] duration-500"
          style={{
            background: backgroundCss(choice, props.customImage),
            backgroundSize: image ? look.fit : undefined,
            backgroundPosition: image ? look.position : undefined,
            backgroundRepeat: 'no-repeat',
            filter: lookFilter(look),
          }}
          data-testid={props.testId ? undefined : 'wallpaper-image'}
        />
      )}
      {choice?.kind === 'builtin' && ATMOSPHERE_FIELDS[choice.id] && look.ambient && (
        // The atmosphere's light fields, each on its own layer, drifting very slowly (transform
        // only; stilled by Reduce Motion, Orbit's Motion setting or Customize → Background).
        <div
          className="pointer-events-none absolute -inset-[12%]"
          aria-hidden
          data-testid={props.testId ? undefined : 'atmosphere'}
        >
          {ATMOSPHERE_FIELDS[choice.id]!.fields.map(([x, y, color, size], i) => {
            const period = AMBIENT_S + i * 9;
            return (
              <div
                key={i}
                className="ambient absolute inset-0"
                style={{
                  background: `radial-gradient(at ${x}% ${y}%, ${color} 0px, transparent ${size}%)`,
                  animation: `orbit-drift-${i % 3} ${period}s var(--ease-in-out) ${-((offset % (period * 2)) + i * 7)}s infinite alternate`,
                  filter: lookFilter(look),
                }}
              />
            );
          })}
        </div>
      )}
      {image && look.overlay > 0 && (
        <div
          className="absolute inset-0"
          style={{ background: `rgb(0 0 0 / ${look.overlay / 100})` }}
          data-testid={props.testId ? undefined : 'wallpaper-overlay'}
        />
      )}
      {/* Grain keeps gradients from banding; photos stay crisp (no grain over them). */}
      {!image && (
        <div
          className={`absolute inset-0 mix-blend-overlay ${atmosphere ? 'opacity-[0.06]' : 'opacity-[0.12]'}`}
          style={{ background: GRAIN }}
        />
      )}
      <div
        className={`absolute inset-0 transition-colors duration-500 ${
          props.light
            ? 'bg-white/10'
            : image
              ? 'bg-[radial-gradient(ellipse_at_center,transparent_55%,rgb(0_0_0/0.18)_100%)]'
              : 'bg-[radial-gradient(ellipse_at_center,transparent_45%,rgb(0_0_0/0.22)_100%)]'
        }`}
      />
    </div>
  );
}
