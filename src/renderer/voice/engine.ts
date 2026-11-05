import { env, pipeline } from '@huggingface/transformers';
import type { AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import mjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import { listenStep, VOICE_MODEL, wakeMatch, wakeStep } from '@shared/voice';
import type { ListenState, WakeState } from '@shared/voice';

type HostEvent =
  | { kind: 'wake'; rest: string }
  | { kind: 'wakeState'; listening: boolean }
  | { kind: 'loading' }
  | { kind: 'listening' }
  | { kind: 'level'; rms: number }
  | { kind: 'transcribing' }
  | { kind: 'result'; text: string }
  | { kind: 'error'; message: string; micDenied?: boolean };

/** Model files are asked of main (they live in Orbit's data folder), never fetched from the web. */
const MODEL_PREFIX = '/__orbit_voice_model__/';
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = MODEL_PREFIX;
env.useBrowserCache = false;
// Load ONNX Runtime's files as they are (no blob: copies, which this page's CSP refuses).
env.useWasmCache = false;
// ONNX Runtime's WebAssembly ships with Orbit (not from a CDN); one thread (pages here aren't
// cross-origin isolated, so there's no SharedArrayBuffer).
const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown; numThreads?: number } };
if (onnx.wasm) {
  onnx.wasm.wasmPaths = { mjs: mjsUrl, wasm: wasmUrl };
  onnx.wasm.numThreads = 1;
}
const plainFetch = globalThis.fetch.bind(globalThis);
env.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const at = url.indexOf(MODEL_PREFIX);
  if (at < 0) return plainFetch(input, init);
  const path = url.slice(at + MODEL_PREFIX.length).replace(`${VOICE_MODEL.id}/`, '');
  try {
    const bytes = await window.orbit.invoke('voice:modelFile', { path });
    return new Response(bytes as BodyInit, { status: 200 });
  } catch {
    return new Response(null, { status: 404 });
  }
}) as typeof fetch;

/** Languages Whisper knows by code (the common ones); others fall back to English. */
const WHISPER_LANGUAGES = new Set(
  'en fr de es it pt nl sv da no fi pl cs sk hu ro bg el tr ru uk ar he fa hi ur bn ta te ja ko zh vi th id ms sw yo ha ig af ca gl eu cy ga'.split(
    ' ',
  ),
);
function speechLanguage(): string {
  const code = navigator.language.slice(0, 2).toLowerCase();
  return WHISPER_LANGUAGES.has(code) ? code : 'en';
}

const SAMPLE_RATE = 16_000;
/** ~64 ms of audio per chunk: the meter and end-of-speech check run at this pace. */
const CHUNK = 1024;
/** Wake listening keeps this much recent audio (to transcribe a burst that just ended). */
const WAKE_KEEP_MS = 8000;

type Mic = { stream: MediaStream; context: AudioContext };

const MIC_ERROR = (error: unknown): HostEvent => {
  const denied = error instanceof DOMException && error.name === 'NotAllowedError';
  const missing = error instanceof DOMException && error.name === 'NotFoundError';
  return {
    kind: 'error',
    micDenied: denied,
    message: missing
      ? 'No microphone found — connect one and try again'
      : denied
        ? 'Orbit can’t use the microphone. Allow it in System Settings → Privacy & Security → Microphone.'
        : 'The microphone couldn’t start — try again',
  };
};

/**
 * Push-to-talk listens until you stop speaking (or main says stop), then transcribes it.
 * "Hey Orbit" (opt-in) keeps the microphone open, cuts out bursts of speech by their level, and
 * transcribes only those, looking for the phrase. Audio is only ever held in memory (the last
 * few seconds for wake listening) and never leaves this page. Push-to-talk takes the microphone
 * from wake listening while it runs.
 */
export class VoiceEngine {
  private asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null;
  private mic: Mic | null = null;
  private chunks: Float32Array[] = [];
  private listen: ListenState | null = null;
  private session = 0;
  /** Wake listening: wanted (Settings), paused (Orbit speaking, battery…), its own microphone. */
  private wakeWanted = false;
  private wakePaused = false;
  private wakeMic: Mic | null = null;
  private wakeRing: { at: number; samples: Float32Array }[] = [];
  private wake: WakeState = { speaking: false, loudSince: null };
  private wakeBusy = false;

  constructor(private readonly emit: (event: HostEvent) => void) {}

  private model(): Promise<AutomaticSpeechRecognitionPipeline> {
    this.asr ??= pipeline('automatic-speech-recognition', VOICE_MODEL.id, {
      dtype: 'q8',
      device: 'wasm',
    }) as Promise<AutomaticSpeechRecognitionPipeline>;
    this.asr.catch(() => (this.asr = null));
    return this.asr;
  }

  /** Opens the microphone; each ~64 ms chunk goes to `onChunk` with its level. */
  private async openMic(onChunk: (samples: Float32Array, rms: number) => void): Promise<Mic> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    const context = new AudioContext({ sampleRate: SAMPLE_RATE });
    await context.resume();
    const source = context.createMediaStreamSource(stream);
    // ScriptProcessor is old but needs no extra module (AudioWorklet would); fine for 16 kHz mono.
    const processor = context.createScriptProcessor(CHUNK, 1, 1);
    processor.onaudioprocess = (event) => {
      const samples = new Float32Array(event.inputBuffer.getChannelData(0));
      let sum = 0;
      for (const x of samples) sum += x * x;
      onChunk(samples, Math.sqrt(sum / samples.length));
    };
    source.connect(processor);
    processor.connect(context.destination);
    return { stream, context };
  }

  private closeMic(mic: Mic | null): void {
    mic?.stream.getTracks().forEach((t) => t.stop());
    void mic?.context.close().catch(() => undefined);
  }

  // ── Push-to-talk ──────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.mic) return;
    const session = ++this.session;
    this.emit({ kind: 'loading' });
    // The model is ready before the microphone opens: loading it takes this page's thread for a
    // moment (the first time after launch), and audio captured meanwhile would be lost.
    try {
      await this.model();
    } catch (error) {
      console.error(error);
      this.emit({ kind: 'error', message: 'The speech model couldn’t load — try again' });
      return;
    }
    if (session !== this.session) return;
    this.stopWakeMic(); // push-to-talk has the microphone now
    this.chunks = [];
    this.listen = { started: performance.now(), spoke: false, lastSpeech: 0 };
    let mic: Mic;
    try {
      mic = await this.openMic((samples, rms) => {
        if (session !== this.session || !this.listen) return;
        this.chunks.push(samples);
        this.emit({ kind: 'level', rms });
        const step = listenStep(this.listen, rms, performance.now());
        this.listen = step.state;
        if (step.stop === 'nothing-said') this.finish(session, false);
        else if (step.stop) this.finish(session, true);
      });
    } catch (error) {
      this.listen = null;
      this.emit(MIC_ERROR(error));
      void this.resumeWake();
      return;
    }
    if (session !== this.session) {
      this.closeMic(mic);
      return;
    }
    this.mic = mic;
    this.emit({ kind: 'listening' });
  }

  /** Finish now and transcribe what was said. */
  stop(): void {
    if (this.mic) this.finish(this.session, true);
  }

  /** Stop without transcribing. */
  cancel(): void {
    this.session++;
    this.release();
    void this.resumeWake();
  }

  private finish(session: number, transcribe: boolean): void {
    if (session !== this.session) return;
    this.session++;
    const audio = this.collect();
    this.release();
    if (!transcribe || audio.length < SAMPLE_RATE / 4) {
      this.emit({ kind: 'result', text: '' });
      void this.resumeWake();
      return;
    }
    this.emit({ kind: 'transcribing' });
    void this.transcribe(audio).finally(() => void this.resumeWake());
  }

  private async text(audio: Float32Array): Promise<string> {
    const asr = await this.model();
    const output = await asr(audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
      // Your Mac's language (Whisper would otherwise assume English).
      language: speechLanguage(),
      task: 'transcribe',
    });
    return Array.isArray(output) ? output.map((o) => o.text).join(' ') : output.text;
  }

  private async transcribe(audio: Float32Array): Promise<void> {
    try {
      this.emit({ kind: 'result', text: await this.text(audio) });
    } catch (error) {
      console.error(error);
      this.emit({ kind: 'error', message: 'Voice couldn’t turn that into text — try again' });
    }
  }

  private collect(): Float32Array {
    const audio = join(this.chunks);
    this.chunks = [];
    return audio;
  }

  private release(): void {
    this.listen = null;
    this.closeMic(this.mic);
    this.mic = null;
  }

  // ── "Hey Orbit" ───────────────────────────────────────────────────────────────

  /** Settings → Voice → Listen for "Hey Orbit" (on or off). */
  async setWake(on: boolean): Promise<void> {
    this.wakeWanted = on;
    if (on) await this.resumeWake();
    else this.stopWakeMic();
  }

  /** Orbit is speaking, or on battery: stop listening for a while (and so not hear itself). */
  async pauseWake(paused: boolean): Promise<void> {
    this.wakePaused = paused;
    if (paused) this.stopWakeMic();
    else await this.resumeWake();
  }

  private async resumeWake(): Promise<void> {
    if (!this.wakeWanted || this.wakePaused || this.wakeMic || this.mic || this.listen) return;
    try {
      await this.model();
    } catch {
      return;
    }
    if (!this.wakeWanted || this.wakePaused || this.wakeMic || this.mic || this.listen) return;
    this.wakeRing = [];
    this.wake = { speaking: false, loudSince: null };
    try {
      this.wakeMic = await this.openMic((samples, rms) => this.onWakeChunk(samples, rms));
    } catch (error) {
      this.emit(MIC_ERROR(error));
      return;
    }
    this.emit({ kind: 'wakeState', listening: true });
  }

  private stopWakeMic(): void {
    if (!this.wakeMic) return;
    this.closeMic(this.wakeMic);
    this.wakeMic = null;
    this.wakeRing = [];
    this.emit({ kind: 'wakeState', listening: false });
  }

  private onWakeChunk(samples: Float32Array, rms: number): void {
    const now = performance.now();
    this.wakeRing.push({ at: now, samples });
    while (this.wakeRing.length && now - this.wakeRing[0]!.at > WAKE_KEEP_MS) this.wakeRing.shift();
    const step = wakeStep(this.wake, rms, now);
    this.wake = step.state;
    if (!step.burst || this.wakeBusy) return;
    // The burst, with a little audio before it (the first syllable starts quietly).
    const { from, to } = step.burst;
    const audio = join(
      this.wakeRing.filter((c) => c.at >= from - 250 && c.at <= to).map((c) => c.samples),
    );
    this.wakeBusy = true;
    void this.text(audio)
      .then((heard) => {
        const match = wakeMatch(heard);
        if (match && this.wakeMic) this.emit({ kind: 'wake', rest: match.rest });
      })
      .catch(() => undefined)
      .finally(() => {
        this.wakeBusy = false;
      });
  }
}

function join(chunks: Float32Array[]): Float32Array {
  const audio = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    audio.set(chunk, offset);
    offset += chunk.length;
  }
  return audio;
}
