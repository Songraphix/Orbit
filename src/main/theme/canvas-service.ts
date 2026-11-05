import { backgroundKey } from '@shared/backgrounds';
import type { BackgroundLook } from '@shared/backgrounds';
import {
  canvasTheme,
  lookPalette,
  paletteFromColors,
  paletteFromCss,
  paletteFromPixels,
} from '@shared/canvas-theme';
import type { Palette } from '@shared/canvas-theme';
import type { CanvasState } from '@shared/types/canvas';
import { builtinPhoto } from '@shared/types/newtab';
import type { WallpaperChoice } from '@shared/types/newtab';
import type { UiPrefs } from '@shared/ui-prefs';
import { isPhotoChoice, PHOTO_AVERAGE, WALLPAPER_CSS } from '@shared/wallpapers';

/** A small picture's pixels (main reads it with nativeImage: BGRA on the Mac). */
export type Pixels = { data: Uint8Array; width: number; height: number; order: 'rgba' | 'bgra' };

export type CanvasDeps = {
  /** What the canvas shows, your own image (data: URL) and its file, and the look. */
  choice: () => WallpaperChoice;
  customImage: () => string | null;
  customFile: () => { path: string; stamp: number } | null;
  look: () => BackgroundLook;
  ui: () => UiPrefs;
  /** Orbit's appearance is dark (Light / Dark / System): the glass's tone when the palette
   *  doesn't follow the wallpaper. */
  dark?: () => boolean;
  /** The palette cache (setting `canvas.palettes`). */
  cache: {
    get: () => { key: string; palette: Palette }[];
    set: (entries: { key: string; palette: Palette }[]) => void;
  };
  /** Reads a small thumbnail of a file on this Mac or a photo's thumbnail address. */
  readPixels: (source: { file: string } | { url: string }) => Promise<Pixels | null>;
  /** Where a built-in photograph's file is. */
  photoFile: (name: string) => string;
  /** The new state, for every shell, overlay and Orbit page. */
  publish: (state: CanvasState) => void;
};

const CACHE_SIZE = 16;

/**
 * The window's canvas (UI spec §4): which wallpaper it shows and the theme taken from it.
 * Palettes are read on this Mac (built-ins and colours from their CSS at once; photos from a tiny
 * thumbnail, in the background) and cached by background, so a change of wallpaper is
 * recalculated once. Nothing is uploaded anywhere.
 */
export class CanvasService {
  private current: CanvasState;
  /** The background whose palette is being read now (later answers for others are dropped). */
  private reading: string | null = null;

  constructor(private readonly deps: CanvasDeps) {
    this.current = this.build();
  }

  get state(): CanvasState {
    return this.current;
  }

  /** The background, its look or the preferences changed: recompute and tell everyone. */
  refresh(): void {
    this.current = this.build();
    this.deps.publish(this.current);
  }

  private keyOf(choice: WallpaperChoice): string {
    const file = choice.kind === 'custom' ? this.deps.customFile() : null;
    return file ? `custom:${file.stamp}` : backgroundKey(choice);
  }

  private build(): CanvasState {
    const choice = this.deps.choice();
    const look = this.deps.look();
    const ui = this.deps.ui();
    const palette = this.paletteFor(choice);
    const theme = canvasTheme(lookPalette(palette, look, isPhotoChoice(choice)), {
      glass: ui.glass,
      accent: ui.accent,
      neutral: ui.palette === 'off',
      // Off: the glass follows Light / Dark instead of the wallpaper.
      ...(ui.palette === 'off' && this.deps.dark
        ? { tone: this.deps.dark() ? ('dark' as const) : ('light' as const) }
        : {}),
    });
    return {
      wallpaper: choice,
      customImage: choice.kind === 'custom' ? this.deps.customImage() : null,
      look,
      tone: theme.tone,
      accent: theme.accent,
      accent2: theme.accent2,
      average: theme.average,
      auto: ui.palette === 'auto',
      vars: theme.vars,
    };
  }

  /** The cached palette, one read at once (CSS), or a stand-in while a photo is read. */
  private paletteFor(choice: WallpaperChoice): Palette {
    const key = this.keyOf(choice);
    const cached = this.deps.cache.get().find((e) => e.key === key);
    if (cached) return cached.palette;
    const immediate = immediatePalette(choice);
    if (immediate) {
      this.remember(key, immediate);
      return immediate;
    }
    void this.read(choice, key);
    return standIn(choice);
  }

  private async read(choice: WallpaperChoice, key: string): Promise<void> {
    if (this.reading === key) return;
    this.reading = key;
    const source =
      choice.kind === 'custom'
        ? { file: this.deps.customFile()?.path ?? '' }
        : choice.kind === 'unsplash'
          ? { url: choice.photo.thumb }
          : choice.kind === 'builtin' && builtinPhoto(choice.id)
            ? { file: this.deps.photoFile(builtinPhoto(choice.id)!) }
            : null;
    const pixels = source ? await this.deps.readPixels(source).catch(() => null) : null;
    if (this.reading !== key) return; // the wallpaper changed meanwhile
    this.reading = null;
    // Unreadable: keep the stand-in (remembered, so it isn't retried on every change).
    const palette = pixels
      ? paletteFromPixels(pixels.data, pixels.width, pixels.height, pixels.order)
      : standIn(choice);
    this.remember(key, palette);
    if (this.keyOf(this.deps.choice()) === key) this.refresh();
  }

  private remember(key: string, palette: Palette): void {
    const rest = this.deps.cache.get().filter((e) => e.key !== key);
    this.deps.cache.set([...rest, { key, palette }].slice(-CACHE_SIZE));
  }
}

/** Palettes that need no picture read: CSS built-ins, colours, gradients. */
function immediatePalette(choice: WallpaperChoice): Palette | null {
  switch (choice.kind) {
    case 'builtin':
      return builtinPhoto(choice.id) ? null : paletteFromCss(WALLPAPER_CSS[choice.id]);
    case 'color':
      return paletteFromColors([choice.color]);
    case 'gradient':
      return paletteFromColors([choice.from, choice.to]);
    default:
      return null;
  }
}

/** Until a photo's palette is read: its known average colour (or a neutral deep blue). */
function standIn(choice: WallpaperChoice): Palette {
  const color =
    choice.kind === 'unsplash'
      ? choice.photo.color
      : choice.kind === 'builtin'
        ? PHOTO_AVERAGE[choice.id]
        : null;
  return paletteFromColors([color ?? '#2a2f45']);
}
