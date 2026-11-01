/**
 * Decides whether an IPC message comes from one of Orbit's own surfaces (PLAN.md section 4.8).
 * Pure: no Electron imports, so it can be unit tested.
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
  private readonly trusted = new Set<number>();

  /** @param allowedUrlPrefixes e.g. the dev-server origin or the packaged renderer directory. */
  constructor(private readonly allowedUrlPrefixes: readonly string[]) {}

  add(webContentsId: number): void {
    this.trusted.add(webContentsId);
  }

  remove(webContentsId: number): void {
    this.trusted.delete(webContentsId);
  }

  isTrusted(sender: SenderInfo): boolean {
    if (!this.trusted.has(sender.webContentsId)) return false;
    if (!sender.isMainFrame || sender.frameUrl === null) return false;
    return this.allowedUrlPrefixes.some((prefix) => sender.frameUrl!.startsWith(prefix));
  }
}
