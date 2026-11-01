import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dialog, nativeImage } from 'electron';
import type { BaseWindow } from 'electron';
import type { WallpaperChoice, WallpaperState } from '@shared/types/newtab';
import type { SettingsRepository } from '../persistence/repositories/settings';

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

  constructor(
    userDataDir: string,
    private readonly settings: SettingsRepository,
  ) {
    this.dir = join(userDataDir, 'wallpapers');
    this.customPath = join(this.dir, 'custom.jpg');
  }

  state(): WallpaperState {
    const customImage = this.loadCustom();
    let wallpaper = this.settings.get('newtab.wallpaper');
    // A custom choice whose file has gone missing falls back to the default.
    if (wallpaper.kind === 'custom' && !customImage) wallpaper = { kind: 'builtin', id: 'aurora' };
    return { wallpaper, customImage };
  }

  set(choice: WallpaperChoice): WallpaperState {
    if (choice.kind === 'custom' && !this.loadCustom()) {
      throw new WallpaperError('No custom image has been chosen yet');
    }
    this.settings.set('newtab.wallpaper', choice);
    return this.state();
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
