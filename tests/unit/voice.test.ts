import { describe, expect, it } from 'vitest';
import {
  cleanTranscript,
  isModelFile,
  listenStep,
  looksLikeQuestion,
  meterLevel,
  NO_SPEECH_MS,
  SILENCE_MS,
  speakableText,
  VOICE_MODEL,
  VOICE_MODEL_BYTES,
} from '../../src/shared/voice';

describe('listenStep', () => {
  const start = { started: 0, spoke: false, lastSpeech: 0 };
  it('keeps listening while you speak, and stops after a pause', () => {
    let state = start;
    for (let t = 100; t <= 1000; t += 100) {
      const step = listenStep(state, 0.1, t);
      expect(step.stop).toBeNull();
      state = step.state;
    }
    expect(listenStep(state, 0.001, 1000 + SILENCE_MS - 1).stop).toBeNull();
    expect(listenStep(state, 0.001, 1000 + SILENCE_MS).stop).toBe('silence');
  });
  it('gives up when nothing is said, and never listens past 30 s', () => {
    expect(listenStep(start, 0.001, NO_SPEECH_MS).stop).toBe('nothing-said');
    expect(listenStep({ started: 0, spoke: true, lastSpeech: 29_900 }, 0.1, 30_000).stop).toBe(
      'too-long',
    );
  });
  it('maps levels to a 0–1 meter', () => {
    expect(meterLevel(0)).toBe(0);
    expect(meterLevel(0.25)).toBe(1);
    expect(meterLevel(5)).toBe(1);
    expect(meterLevel(0.0625)).toBeCloseTo(0.5);
  });
});

describe('cleanTranscript', () => {
  it('tidies Whisper’s text and drops what it invents from silence', () => {
    expect(cleanTranscript(' What is on my list today? ')).toBe('What is on my list today?');
    expect(cleanTranscript('[BLANK_AUDIO]')).toBe('');
    expect(cleanTranscript(' (music) Open Spotify ')).toBe('Open Spotify');
    expect(cleanTranscript('Thank you.')).toBe('');
    expect(cleanTranscript('Bye bye bye bye bye bye bye bye')).toBe('');
    expect(cleanTranscript('no no no, not that one')).toBe('no no no, not that one');
  });
});

describe('looksLikeQuestion', () => {
  it('sends questions and requests to Orbit AI, other words to search', () => {
    for (const q of [
      'what is on my list today?',
      'Summarize this page',
      'compare these tabs',
      'find the article I read yesterday',
      'open spotify in the sidebar',
      'save these points to my notes',
      'flights to lisbon?',
    ]) {
      expect(looksLikeQuestion(q), q).toBe(true);
    }
    for (const q of ['flights to lisbon', 'open spotify', 'react hooks', 'github.com', '']) {
      expect(looksLikeQuestion(q), q).toBe(false);
    }
  });
});

describe('speakableText', () => {
  it('reads Markdown as words, without source numbers or link addresses', () => {
    const { text, cut } = speakableText(
      '## Today\n\n- **Send** the [invoice](https://x.y/1) [1]\n- Call `Ama` [2, 3]',
    );
    expect(text).toBe('Today Send the invoice Call Ama');
    expect(cut).toBe(false);
  });
  it('cuts long answers at a sentence', () => {
    const long = `${'This is a sentence. '.repeat(50)}`;
    const { text, cut } = speakableText(long, 100);
    expect(cut).toBe(true);
    expect(text.endsWith('.')).toBe(true);
    expect(text.length).toBeLessThanOrEqual(100);
  });
});

describe('the speech model', () => {
  it('is pinned to one revision, every file checked, about 80 MB', () => {
    expect(VOICE_MODEL.revision).toMatch(/^[0-9a-f]{40}$/);
    for (const f of VOICE_MODEL.files) {
      expect('sha256' in f || 'gitSha1' in f).toBe(true);
    }
    expect(Math.round(VOICE_MODEL_BYTES / 1e6)).toBe(80);
    expect(isModelFile('onnx/encoder_model_quantized.onnx')).toBe(true);
    expect(isModelFile('../../secrets.json')).toBe(false);
  });
});
