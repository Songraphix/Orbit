import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dialog, nativeImage } from 'electron';
import type { BaseWindow } from 'electron';
import type { WallpaperChoice, WallpaperState } from '@shared/types/newtab';
import type { SettingsRepository } from '../persistence/repositories/settings';
import { BUILTIN_WALLPAPERS } from '@shared/types/newtab';
import { backgroundKey, rotate } from '@shared/backgrounds';
import type { BackgroundLook, Rotation } from '@shared/backgrounds';
import { dateKey } from '@shared/work';
import type { UnsplashService } from './unsplash';

/** Images are downscaled to this width (4K) and re-encoded as JPEG to keep new tabs fast. */
const MAX_WIDTH = 3840;
const JPEG_QUALITY = 85;
/** Refuse absurd source files outright. */
const MAX_SOURCE_BYTES = 50 * 1024 * 1024;

export class WallpaperError extends Error {
  override name = 'WallpaperError';
}

/**
 * The new tab page's wallpaper (F-new-tab). The choice lives in settings; a custom image is
 * copied into `<userData>/wallpapers/custom.jpg`, so the original file can move or be deleted.
 */
export class WallpaperService {
  private readonly dir: string;
  private readonly customPath: string;
  private customDataUrl: string | null | undefined; // undefined = not loaded yet
  /** What each open new tab page shows under a rotation (picked when the page loads). */
  private readonly shownByPage = new Map<number, WallpaperChoice>();
  private lastRotation: number | null = null;

  constructor(
    userDataDir: string,
    private readonly settings: SettingsRepository,
    private readonly unsplash?: UnsplashService,
  ) {
    this.dir = join(userDataDir, 'wallpapers');
    this.customPath = join(this.dir, 'custom.jpg');
  }

  /** The background state for one new tab page (`page`: its webContents id). */
  state(page?: number): WallpaperState {
    const customImage = this.loadCustom();
    let wallpaper = this.settings.get('newtab.wallpaper');
    // A custom choice whose file has gone missing falls back to the default.
    if (wallpaper.kind === 'custom' && !customImage) wallpaper = { kind: 'builtin', id: 'aurora' };
    const favorites = this.settings
      .get('newtab.favorites')
      .filter((f) => f.kind !== 'custom' || customImage);
    const rotation = this.settings.get('newtab.rotation');
    return {
      wallpaper,
      shown: (page !== undefined && this.shownByPage.get(page)) || wallpaper,
      customImage,
      look: this.settings.get('newtab.look'),
      favorites,
      rotation,
      unsplash: this.unsplash?.available ?? false,
    };
  }

  /**
   * A new tab page opened: under a rotation it gets today's background (daily) or a fresh one
   * (every tab) — from your favourites, or the built-ins when you have none.
   */
  opened(page: number, now = Date.now()): void {
    const rotation = this.settings.get('newtab.rotation');
    const state = this.state();
    const pool: WallpaperChoice[] = state.favorites.length
      ? state.favorites
      : BUILTIN_WALLPAPERS.map((w) => ({ kind: 'builtin' as const, id: w.id }));
    const picked = rotate(pool, rotation, dateKey(new Date(now)), this.lastRotation);
    if (!picked) {
      this.shownByPage.delete(page);
      return;
    }
    this.lastRotation = picked.index;
    this.shownByPage.set(page, picked.pick);
    if (this.shownByPage.size > 50) this.shownByPage.delete(this.shownByPage.keys().next().value!);
  }

  set(choice: WallpaperChoice): WallpaperState {
    if (choice.kind === 'custom' && !this.loadCustom()) {
      throw new WallpaperError('No custom image has been chosen yet');
    }
    this.settings.set('newtab.wallpaper', choice);
    // Choosing one by hand shows it now on every open page (rotation resumes on new ones).
    this.shownByPage.clear();
    if (choice.kind === 'unsplash') void this.unsplash?.used(choice.photo);
    return this.state();
  }

  setLook(look: BackgroundLook): void {
    this.settings.set('newtab.look', look);
  }

  setRotation(rotation: Rotation): void {
    this.settings.set('newtab.rotation', rotation);
  }

  /** Adds or removes a favourite (rotation picks from favourites). */
  favorite(choice: WallpaperChoice, on: boolean): void {
    const key = backgroundKey(choice);
    const rest = this.settings.get('newtab.favorites').filter((f) => backgroundKey(f) !== key);
    this.settings.set('newtab.favorites', on ? [...rest, choice].slice(-30) : rest);
  }

  /** Shows a file picker; returns the new state, or null if the user cancelled. */
  async choose(parent: BaseWindow | null): Promise<WallpaperState | null> {
    const options: Electron.OpenDialogOptions = {
      title: 'Choose a wallpaper',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'heic', 'webp', 'gif'] }],
    };
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    const file = result.filePaths[0];
    if (result.canceled || !file) return null;
    this.importImage(file);
    return this.set({ kind: 'custom' });
  }

  /** Validates, downscales and stores an image as the custom wallpaper. */
  importImage(sourcePath: string): void {
    if (statSync(sourcePath).size > MAX_SOURCE_BYTES) {
      throw new WallpaperError('That image is too large (over 50 MB)');
    }
    let image = nativeImage.createFromPath(sourcePath);
    if (image.isEmpty()) throw new WallpaperError('That file is not an image Orbit can read');
    const { width } = image.getSize();
    if (width > MAX_WIDTH) image = image.resize({ width: MAX_WIDTH, quality: 'best' });

    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.customPath, image.toJPEG(JPEG_QUALITY));
    this.customDataUrl = undefined; // reload on next read
  }

  /** Removes the custom image (e.g. when resetting). */
  clearCustom(): void {
    rmSync(this.customPath, { force: true });
    this.customDataUrl = null;
    if (this.settings.get('newtab.wallpaper').kind === 'custom') {
      this.settings.set('newtab.wallpaper', { kind: 'builtin', id: 'aurora' });
    }
  }

  private loadCustom(): string | null {
    if (this.customDataUrl !== undefined) return this.customDataUrl;
    try {
      this.customDataUrl = `data:image/jpeg;base64,${readFileSync(this.customPath).toString('base64')}`;
    } catch {
      this.customDataUrl = null;
    }
    return this.customDataUrl;
  }
}
