import type { SoundId, SoundState } from '@shared/sounds';
import type { SettingsRepository } from '../persistence/repositories/settings';

/** The hidden page that plays sounds (an internal page in a window that's never shown). */
export type SoundHost = {
  send(state: SoundState): void;
  close(): void;
};

export type SoundDeps = {
  settings: SettingsRepository;
  /** Opens the hidden player page; `ready` is called once it can take state. */
  openHost(onReady: () => void): SoundHost;
  /** Every shell and Focus view hears about changes. */
  changed(state: SoundState): void;
};

/** How long the player keeps running after Stop, so the sound fades out instead of cutting. */
const FADE_MS = 2500;

/**
 * Focus sounds: main decides what plays and how loud; one hidden Orbit page makes the sound
 * (Web Audio), so it keeps going across tabs, windows and Spaces. The page exists only while
 * something plays — no memory or CPU spent otherwise.
 */
export class SoundService {
  private playing: SoundId | null = null;
  private host: SoundHost | null = null;
  private hostReady = false;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: SoundDeps) {}

  get state(): SoundState {
    return { playing: this.playing, volume: this.deps.settings.get('sounds.volume') };
  }

  play(id: SoundId): void {
    this.playing = id;
    this.ensureHost();
    this.sync();
  }

  stop(): void {
    if (!this.playing) return;
    this.playing = null;
    this.sync();
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      if (this.playing) return;
      this.host?.close();
      this.host = null;
      this.hostReady = false;
    }, FADE_MS);
  }

  /** Play `id`, or stop it if it's the one playing. */
  toggle(id: SoundId): void {
    if (this.playing === id) this.stop();
    else this.play(id);
  }

  setVolume(volume: number): void {
    this.deps.settings.set('sounds.volume', Math.min(1, Math.max(0, volume)));
    this.sync();
  }

  /** The player page went away on its own (crash): it comes back if something should play. */
  hostGone(): void {
    this.host = null;
    this.hostReady = false;
    if (this.playing) {
      this.ensureHost();
    }
  }

  private ensureHost(): void {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    if (this.host) return;
    this.host = this.deps.openHost(() => {
      this.hostReady = true;
      this.sync();
    });
  }

  private sync(): void {
    const state = this.state;
    if (this.host && this.hostReady) this.host.send(state);
    this.deps.changed(state);
  }
}
