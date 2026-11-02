import type { Surface } from '@shared/ipc/contract';

/**
 * Decides whether an IPC message comes from one of Orbit's own surfaces (PLAN.md section 4.8),
 * and which kind. Pure: no Electron imports, so it can be unit tested.
 */
export type SenderInfo = {
  /** webContents id of the sender. */
  webContentsId: number;
  /** URL of the frame that sent the message, or null if the frame is gone. */
  frameUrl: string | null;
  /** True when the sending frame is the top-level frame (not an iframe). */
  isMainFrame: boolean;
};

export class SenderRegistry {
  private readonly surfaces = new Map<number, Surface>();

  /** @param allowedUrlPrefixes e.g. the dev-server origin or the packaged renderer directory. */
  constructor(private readonly allowedUrlPrefixes: readonly string[]) {}

  add(webContentsId: number, surface: Surface): void {
    this.surfaces.set(webContentsId, surface);
  }

  remove(webContentsId: number): void {
    this.surfaces.delete(webContentsId);
  }

  /** Every registered webContents of one kind (main sends Orbit's pages their updates). */
  idsOf(surface: Surface): number[] {
    return [...this.surfaces].filter(([, s]) => s === surface).map(([id]) => id);
  }

  /** True for Orbit's own pages (shell, overlay, internal), whatever URL they show. */
  has(webContentsId: number): boolean {
    return this.surfaces.has(webContentsId);
  }

  /** The surface that sent this message, or null if it isn't a trusted Orbit page. */
  surfaceOf(sender: SenderInfo): Surface | null {
    const surface = this.surfaces.get(sender.webContentsId);
    if (!surface || !sender.isMainFrame || sender.frameUrl === null) return null;
    const url = sender.frameUrl;
    return this.allowedUrlPrefixes.some((prefix) => url.startsWith(prefix)) ? surface : null;
  }

  isTrusted(sender: SenderInfo): boolean {
    return this.surfaceOf(sender) !== null;
  }
}
