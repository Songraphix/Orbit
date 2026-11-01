import type { EaselCapture } from '@shared/types/easels';

/**
 * An Easel asking for a capture (F-19): the window's area-capture overlay hands its result here
 * instead of to the clipboard. One request per window at a time; a new one cancels the old.
 */
export class CaptureRequests {
  private readonly pending = new Map<object, (result: EaselCapture | null) => void>();

  wait(window: object): Promise<EaselCapture | null> {
    this.settle(window, null);
    return new Promise((resolve) => this.pending.set(window, resolve));
  }

  /** Delivers a capture (or a cancel). False if nobody was waiting in this window. */
  settle(window: object, result: EaselCapture | null): boolean {
    const resolve = this.pending.get(window);
    if (!resolve) return false;
    this.pending.delete(window);
    resolve(result);
    return true;
  }
}
