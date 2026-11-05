import { cleanTranscript, IDLE_VOICE, meterLevel } from '@shared/voice';
import type { VoiceState } from '@shared/voice';

/** The hidden page that listens and turns speech into text (created when voice is used). */
export type VoiceHost = {
  send: (command: 'start' | 'stop' | 'cancel') => void;
  close: () => void;
};

/** What the voice page reports. */
export type HostEvent =
  | { kind: 'loading' }
  | { kind: 'listening' }
  | { kind: 'level'; rms: number }
  | { kind: 'transcribing' }
  | { kind: 'result'; text: string }
  | { kind: 'error'; message: string; micDenied?: boolean };

export type VoiceDeps = {
  /** Whether the model's files are on this Mac. */
  modelReady: () => boolean;
  /** Downloads the model (progress 0–1). */
  download: (onProgress: (share: number) => void, signal: AbortSignal) => Promise<void>;
  /** macOS microphone access: asks the first time. */
  micAccess: () => Promise<boolean>;
  /** Creates the hidden voice page; it reports through `onHostEvent`. */
  createHost: () => VoiceHost;
  /** Every window's shell and overlay hear about changes. */
  broadcast: (state: VoiceState) => void;
  /** Close the idle voice page (and free the model's memory) after this long. */
  idleMs?: number;
};

/**
 * Push-to-talk (roadmap R2 M2). One voice at a time for the whole app: start listens until you
 * stop speaking (or press again), then the page turns it into text on this Mac and the command
 * bar receives it. The microphone is only on while listening; nothing is recorded or kept.
 */
export class VoiceService {
  private value: VoiceState;
  private host: VoiceHost | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private downloading: AbortController | null = null;
  /** Start listening once the model has finished downloading. */
  private startAfterDownload = false;

  constructor(private readonly deps: VoiceDeps) {
    this.value = { ...IDLE_VOICE, modelReady: deps.modelReady() };
  }

  get state(): VoiceState {
    return this.value;
  }

  /** The mic button / ⇧⌘Space: start listening, or (while listening) finish now. */
  async toggle(): Promise<void> {
    if (this.value.phase === 'listening') {
      this.stop();
      return;
    }
    await this.start();
  }

  async start(): Promise<void> {
    const { phase } = this.value;
    if (phase === 'downloading' || phase === 'loading' || phase === 'transcribing') return;
    if (!this.deps.modelReady()) {
      this.set({ phase: 'needs-model', error: null, micBlocked: false, modelReady: false });
      return;
    }
    if (!(await this.deps.micAccess())) {
      this.set({
        phase: 'error',
        micBlocked: true,
        error:
          'Orbit can’t use the microphone. Allow it in System Settings → Privacy & Security → Microphone.',
      });
      return;
    }
    this.clearIdle();
    this.set({ phase: 'loading', level: 0, error: null, micBlocked: false, modelReady: true });
    this.host ??= this.deps.createHost();
    this.host.send('start');
  }

  /** Finish listening now (what was said so far is transcribed). */
  stop(): void {
    if (this.value.phase === 'listening' || this.value.phase === 'loading') this.host?.send('stop');
  }

  /** Esc, or the command bar closed: stop without using what was said. */
  cancel(): void {
    this.downloading?.abort();
    this.downloading = null;
    this.startAfterDownload = false;
    if (this.value.phase === 'listening' || this.value.phase === 'loading') {
      this.host?.send('cancel');
    }
    if (this.value.phase !== 'idle')
      this.set({ phase: 'idle', level: 0, progress: null, error: null });
    this.scheduleIdle();
  }

  /** The one-time model download (the user agreed); listening starts when it's done. */
  async download(): Promise<void> {
    if (this.downloading) return;
    const abort = new AbortController();
    this.downloading = abort;
    this.startAfterDownload = true;
    this.set({ phase: 'downloading', progress: 0, error: null });
    try {
      await this.deps.download((share) => this.set({ progress: share }), abort.signal);
      if (abort.signal.aborted) return;
      this.downloading = null;
      this.set({ phase: 'idle', progress: null, modelReady: true });
      if (this.startAfterDownload) await this.start();
    } catch (error) {
      if (abort.signal.aborted) return;
      this.downloading = null;
      this.set({
        phase: 'error',
        progress: null,
        error: error instanceof Error ? error.message : 'The speech model couldn’t be downloaded',
      });
    }
  }

  /** The model was removed (Settings): the page lets go of it too. */
  modelRemoved(): void {
    this.closeHost();
    this.set({ ...IDLE_VOICE, modelReady: false });
  }

  /** Something the voice page reported. */
  onHostEvent(event: HostEvent): void {
    switch (event.kind) {
      case 'loading':
        this.set({ phase: 'loading' });
        return;
      case 'listening':
        this.set({ phase: 'listening', level: 0 });
        return;
      case 'level':
        if (this.value.phase === 'listening') this.set({ level: meterLevel(event.rms) });
        return;
      case 'transcribing':
        this.set({ phase: 'transcribing', level: 0 });
        return;
      case 'result': {
        const text = cleanTranscript(event.text);
        this.set({
          phase: text ? 'idle' : 'error',
          level: 0,
          error: text ? null : 'Didn’t catch that — try again',
          transcript: text ? { text, at: Date.now() } : this.value.transcript,
        });
        this.scheduleIdle();
        return;
      }
      case 'error':
        this.set({
          phase: 'error',
          level: 0,
          error: event.message,
          micBlocked: event.micDenied ?? false,
        });
        this.scheduleIdle();
    }
  }

  /** The voice page went away (crashed, or Orbit is quitting). */
  hostGone(): void {
    this.host = null;
    if (this.value.phase !== 'idle' && this.value.phase !== 'needs-model') {
      this.set({ phase: 'error', level: 0, error: 'Voice stopped unexpectedly — try again' });
    }
  }

  destroy(): void {
    this.downloading?.abort();
    this.clearIdle();
    this.closeHost();
  }

  private closeHost(): void {
    this.clearIdle();
    this.host?.close();
    this.host = null;
  }

  private scheduleIdle(): void {
    this.clearIdle();
    if (!this.host) return;
    this.idleTimer = setTimeout(() => this.closeHost(), this.deps.idleMs ?? 3 * 60_000);
  }

  private clearIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private set(patch: Partial<VoiceState>): void {
    this.value = { ...this.value, ...patch };
    this.deps.broadcast(this.value);
  }
}
