import { z } from 'zod';

/**
 * Voice (roadmap R2 M2): push-to-talk. Speech becomes text on this Mac with OpenAI's Whisper
 * (base, multilingual, 8-bit) run by transformers.js — no audio leaves the Mac. The model is
 * downloaded once, when you first use voice and agree, pinned to one revision and checked file
 * by file. Pure.
 */

/** The speech model: Hugging Face repository, pinned revision and its files (with checks). */
export const VOICE_MODEL = {
  id: 'whisper-base',
  repo: 'onnx-community/whisper-base',
  revision: '1846881b6b3a3024392c1eea3ad983695bc23925',
  license: 'Apache-2.0 (model: MIT, OpenAI Whisper)',
  /** sha256 for the large (LFS) files; git's blob sha1 for the small ones. */
  files: [
    { path: 'config.json', size: 2243, gitSha1: 'ce7faf5d5e56e82d4800e55f524582a525639ff7' },
    {
      path: 'generation_config.json',
      size: 3832,
      gitSha1: 'a57cdbf036979f80bb7ff092a0fee6256a81d329',
    },
    {
      path: 'preprocessor_config.json',
      size: 339,
      gitSha1: '91876762a536a746d268353c5cba57286e76b058',
    },
    { path: 'tokenizer.json', size: 2480466, gitSha1: '1e95340ff836fad1b5932e800fb7b8c5e6d78a74' },
    {
      path: 'tokenizer_config.json',
      size: 282682,
      gitSha1: '25be523be5ac50a7671a77f55acba082459d6314',
    },
    {
      path: 'onnx/encoder_model_quantized.onnx',
      size: 23201314,
      sha256: '5862993336bf33acd23736071aae2b32261d3b1b2f37780194460d4ef974dd46',
    },
    {
      path: 'onnx/decoder_model_merged_quantized.onnx',
      size: 53693315,
      sha256: 'fa3ef9902734ce5ae6f9ef2bdb2ba9a6c4b5785b09f4f420ce036573dc9d090b',
    },
  ],
} as const;

export type VoiceModelFile = (typeof VOICE_MODEL.files)[number];

/** The model's total download size in bytes. */
export const VOICE_MODEL_BYTES = VOICE_MODEL.files.reduce((sum, f) => sum + f.size, 0);

/** Whether a path is one of the model's files (what the voice page may ask main for). */
export function isModelFile(path: string): boolean {
  return VOICE_MODEL.files.some((f) => f.path === path);
}

export const VOICE_PHASES = [
  'idle',
  /** Voice needs the model: the UI offers the one-time download. */
  'needs-model',
  'downloading',
  /** The model is loading into memory (first use after launch). */
  'loading',
  'listening',
  'transcribing',
  'error',
] as const;
export type VoicePhase = (typeof VOICE_PHASES)[number];

export const voiceStateSchema = z.object({
  phase: z.enum(VOICE_PHASES),
  /** Microphone level 0–1 while listening (drives the meter). */
  level: z.number().min(0).max(1),
  /** Download progress 0–1, while downloading. */
  progress: z.number().min(0).max(1).nullable(),
  /** What went wrong, in plain words. */
  error: z.string().nullable(),
  /** The microphone is blocked in macOS: the UI offers System Settings. */
  micBlocked: z.boolean(),
  /** The last thing said (consumed by the command bar), and when (so repeats register). */
  transcript: z.object({ text: z.string(), at: z.number() }).nullable(),
  modelReady: z.boolean(),
  /** "Hey Orbit" is on (the toolbar shows it, with its off switch)… */
  wakeEnabled: z.boolean().default(false),
  /** …and listening right now (not paused while Orbit speaks, on battery, or locked). */
  wakeListening: z.boolean().default(false),
  /** Where what's said goes: the command bar, the voice popup, or the assistant panel. */
  target: z.enum(['bar', 'popup', 'panel']).default('bar'),
});
export type VoiceTarget = 'bar' | 'popup' | 'panel';
export type VoiceState = z.output<typeof voiceStateSchema>;

export const IDLE_VOICE: VoiceState = {
  phase: 'idle',
  level: 0,
  progress: null,
  error: null,
  micBlocked: false,
  transcript: null,
  modelReady: false,
  wakeEnabled: false,
  wakeListening: false,
  target: 'bar',
};

export const voicePrefsSchema = z.object({
  /** Run the top result as soon as you stop speaking (otherwise it waits for ⏎). */
  autoRun: z.boolean(),
  /** Read Orbit AI's answers to spoken questions aloud (short ones, or the start of long ones). */
  speakAnswers: z.boolean(),
  /** A Mac voice by name, or null for the system's default. */
  voice: z.string().max(200).nullable(),
  /** "Hey Orbit": listen on this Mac for the phrase (opt-in; the microphone stays on). */
  wakeWord: z.boolean().default(false),
  /** …and keep listening on battery power (off: it pauses until the Mac is plugged in). */
  wakeOnBattery: z.boolean().default(false),
});
export type VoicePrefs = z.output<typeof voicePrefsSchema>;

/** A change to some voice settings. (Not voicePrefsSchema.partial(): zod 4 keeps `.default()`
 *  inside optional fields, so an empty change would turn "Hey Orbit" off.) */
export const voicePrefsPatchSchema = voicePrefsSchema
  .extend({ wakeWord: z.boolean(), wakeOnBattery: z.boolean() })
  .partial()
  .strict();
export const DEFAULT_VOICE_PREFS: VoicePrefs = {
  autoRun: false,
  speakAnswers: true,
  voice: null,
  wakeWord: false,
  wakeOnBattery: false,
};

/**
 * "Hey Orbit" in what Whisper heard (with the ways it tends to spell it), and whatever was said
 * after it ("Hey Orbit, open Spotify" → "open Spotify"). Null if the phrase isn't there. Pure.
 */
export function wakeMatch(text: string): { rest: string } | null {
  // "Orbit" by its sound, as Whisper writes it: Orbit, Obe, Obi, Orb, Arbit, all bit, our bit…
  const orbit = String.raw`(?:o|au|aw|oar|ore)r?\s?b\w{0,3}|(?:al|all|ar|our)[\s,.-]?b[eiu]t\w*`;
  const m = new RegExp(
    String.raw`\b(?:hey|hay|hi|hey there|ok|okay|yo)[\s,.!-]*(?:${orbit})\b[\s,.!?:-]*(.*)$`,
    'i',
  ).exec(text.trim());
  if (!m) return null;
  return { rest: cleanTranscript(m[1] ?? '').replace(/^[,.!?\s]+/, '') };
}

/** Wake listening: speech bursts are cut out of the stream by level, then checked for the phrase. */
export const WAKE = {
  /** Speech starts after this much sound above the speech level… */
  startMs: 120,
  /** …ends after this much quiet… */
  endMs: 600,
  /** …and a burst is never longer than this (the phrase plus a short request). */
  maxMs: 6000,
  /** Shorter bursts (a cough, a click) aren't worth transcribing. */
  minMs: 450,
} as const;

export type WakeState =
  | { speaking: false; loudSince: number | null }
  | { speaking: true; started: number; lastLoud: number };

/**
 * One step of cutting speech bursts out of the microphone stream (pure): returns the new state
 * and, when a burst ends, its start and end time (to transcribe that audio).
 */
export function wakeStep(
  state: WakeState,
  rms: number,
  now: number,
): { state: WakeState; burst: { from: number; to: number } | null } {
  const loud = rms >= SPEECH_RMS;
  if (!state.speaking) {
    if (!loud) return { state: { speaking: false, loudSince: null }, burst: null };
    const since = state.loudSince ?? now;
    if (now - since >= WAKE.startMs) {
      return { state: { speaking: true, started: since, lastLoud: now }, burst: null };
    }
    return { state: { speaking: false, loudSince: since }, burst: null };
  }
  const lastLoud = loud ? now : state.lastLoud;
  const ended = now - lastLoud >= WAKE.endMs || now - state.started >= WAKE.maxMs;
  if (!ended) return { state: { ...state, lastLoud }, burst: null };
  const burst = lastLoud - state.started >= WAKE.minMs ? { from: state.started, to: now } : null;
  return { state: { speaking: false, loudSince: null }, burst };
}

/** Listening stops by itself after this long without speech once you've spoken… */
export const SILENCE_MS = 1300;
/** …or if nothing is said at all for this long, or at the most after this. */
export const NO_SPEECH_MS = 6000;
export const MAX_LISTEN_MS = 30_000;
/** Microphone level (RMS) counted as speech. */
export const SPEECH_RMS = 0.02;

export type ListenState = { started: number; spoke: boolean; lastSpeech: number };

/**
 * Push-to-talk's end of speech: one step per audio chunk (its RMS level). Returns whether to
 * stop, and why. Pure.
 */
export function listenStep(
  state: ListenState,
  rms: number,
  now: number,
): { state: ListenState; stop: null | 'silence' | 'nothing-said' | 'too-long' } {
  const speaking = rms >= SPEECH_RMS;
  const next: ListenState = speaking
    ? { started: state.started, spoke: true, lastSpeech: now }
    : state;
  if (now - next.started >= MAX_LISTEN_MS) return { state: next, stop: 'too-long' };
  if (next.spoke && now - next.lastSpeech >= SILENCE_MS) return { state: next, stop: 'silence' };
  if (!next.spoke && now - next.started >= NO_SPEECH_MS) {
    return { state: next, stop: 'nothing-said' };
  }
  return { state: next, stop: null };
}

/** The meter's level for an RMS reading (speech sits around 0.02–0.2). Pure. */
export function meterLevel(rms: number): number {
  return Math.max(0, Math.min(1, Math.sqrt(rms / 0.25)));
}

/**
 * Whisper's text, tidied: no leading/trailing space, no "[BLANK_AUDIO]"/"(music)" markers, and
 * nothing at all for the phrases it invents from silence. Pure.
 */
export function cleanTranscript(text: string): string {
  const cleaned = text
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const bare = cleaned
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .trim();
  if (!bare || /^(you|thank you|thanks for watching|bye)$/.test(bare)) return '';
  // A word repeated over and over is Whisper hearing things in silence, not speech.
  if (/\b(\w+)\b(?:[\s,.!?]+\1\b){5,}/i.test(cleaned)) return '';
  return cleaned;
}

/**
 * Whether typed or spoken words are for Orbit AI rather than a web search: a question, or a
 * request about this page, your notes, tabs, history or apps. Pure.
 */
export function looksLikeQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (t.endsWith('?')) return true;
  if (
    /^(what|why|how|who|when|where|which|whose|is|are|was|were|can|could|should|would|will|do|does|did|summari[sz]e|compare|explain|translate|find|save|note|remind|plan|tell|write|draft|help|read)\b/.test(
      t,
    )
  ) {
    return true;
  }
  if (/\b(this page|this tab|these tabs|my (notes?|tabs|history|tasks|projects))\b/.test(t)) {
    return true;
  }
  return /^(open|show|switch|put)\b.*\b(sidebar|side panel|panel|beside|split)\b/.test(t);
}

/**
 * An answer as words to speak: no Markdown, no source numbers, links as their text; long ones
 * are cut at a sentence after about `max` characters (the rest stays on screen). Pure.
 */
export function speakableText(markdown: string, max = 600): { text: string; cut: boolean } {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\d+(?:,\s*\d+)*\]/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[*_~>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= max) return { text: plain, cut: false };
  const head = plain.slice(0, max);
  const end = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '));
  return { text: end > max / 3 ? head.slice(0, end + 1) : `${head.trimEnd()}…`, cut: true };
}
