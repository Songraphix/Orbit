import { env, pipeline } from '@huggingface/transformers';
import type { AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import mjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import { listenStep, VOICE_MODEL } from '@shared/voice';
import type { ListenState } from '@shared/voice';

type HostEvent =
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

/**
 * Listens to the microphone until you stop speaking (or main says stop), then transcribes it.
 * The microphone is released as soon as listening ends; audio is only ever held in memory.
 */
export class VoiceEngine {
  private asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private chunks: Float32Array[] = [];
  private listen: ListenState | null = null;
  private session = 0;

  constructor(private readonly emit: (event: HostEvent) => void) {}

  private model(): Promise<AutomaticSpeechRecognitionPipeline> {
    this.asr ??= pipeline('automatic-speech-recognition', VOICE_MODEL.id, {
      dtype: 'q8',
      device: 'wasm',
    }) as Promise<AutomaticSpeechRecognitionPipeline>;
    this.asr.catch(() => (this.asr = null));
    return this.asr;
  }

  async start(): Promise<void> {
    if (this.stream) return;
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
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch (error) {
      const denied = error instanceof DOMException && error.name === 'NotAllowedError';
      const missing = error instanceof DOMException && error.name === 'NotFoundError';
      this.emit({
        kind: 'error',
        micDenied: denied,
        message: missing
          ? 'No microphone found — connect one and try again'
          : denied
            ? 'Orbit can’t use the microphone. Allow it in System Settings → Privacy & Security → Microphone.'
            : 'The microphone couldn’t start — try again',
      });
      return;
    }
    if (session !== this.session) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;
    const context = new AudioContext({ sampleRate: SAMPLE_RATE });
    this.context = context;
    await context.resume();
    const source = context.createMediaStreamSource(stream);
    // ScriptProcessor is old but needs no extra module (AudioWorklet would); fine for 16 kHz mono.
    const processor = context.createScriptProcessor(CHUNK, 1, 1);
    this.chunks = [];
    this.listen = { started: performance.now(), spoke: false, lastSpeech: 0 };
    processor.onaudioprocess = (event) => {
      if (session !== this.session || !this.listen) return;
      const samples = new Float32Array(event.inputBuffer.getChannelData(0));
      this.chunks.push(samples);
      let sum = 0;
      for (const s of samples) sum += s * s;
      const rms = Math.sqrt(sum / samples.length);
      this.emit({ kind: 'level', rms });
      const step = listenStep(this.listen, rms, performance.now());
      this.listen = step.state;
      if (step.stop === 'nothing-said') this.finish(session, false);
      else if (step.stop) this.finish(session, true);
    };
    source.connect(processor);
    processor.connect(context.destination);
    this.emit({ kind: 'listening' });
  }

  /** Finish now and transcribe what was said. */
  stop(): void {
    if (this.stream) this.finish(this.session, true);
  }

  /** Stop without transcribing. */
  cancel(): void {
    this.session++;
    this.release();
  }

  private finish(session: number, transcribe: boolean): void {
    if (session !== this.session) return;
    this.session++;
    const audio = this.collect();
    this.release();
    if (!transcribe || audio.length < SAMPLE_RATE / 4) {
      this.emit({ kind: 'result', text: '' });
      return;
    }
    this.emit({ kind: 'transcribing' });
    void this.transcribe(audio);
  }

  private async transcribe(audio: Float32Array): Promise<void> {
    try {
      const asr = await this.model();
      const output = await asr(audio, {
        chunk_length_s: 30,
        stride_length_s: 5,
        // Your Mac's language (Whisper would otherwise assume English).
        language: speechLanguage(),
        task: 'transcribe',
      });
      const text = Array.isArray(output) ? output.map((o) => o.text).join(' ') : output.text;
      this.emit({ kind: 'result', text });
    } catch (error) {
      console.error(error);
      this.emit({ kind: 'error', message: 'Voice couldn’t turn that into text — try again' });
    }
  }

  private collect(): Float32Array {
    const length = this.chunks.reduce((n, c) => n + c.length, 0);
    const audio = new Float32Array(length);
    let offset = 0;
    for (const chunk of this.chunks) {
      audio.set(chunk, offset);
      offset += chunk.length;
    }
    this.chunks = [];
    return audio;
  }

  private release(): void {
    this.listen = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.context?.close().catch(() => undefined);
    this.context = null;
  }
}
