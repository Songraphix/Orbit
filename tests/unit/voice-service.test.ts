import { afterEach, describe, expect, it, vi } from 'vitest';
import { VoiceService } from '../../src/main/voice/service';
import type { VoiceDeps } from '../../src/main/voice/service';
import type { VoiceState } from '../../src/shared/voice';

function setup(over: Partial<VoiceDeps> = {}) {
  const states: VoiceState[] = [];
  const sent: string[] = [];
  let ready = true;
  const host = { send: vi.fn((c: string) => sent.push(c)), close: vi.fn() };
  const deps: VoiceDeps = {
    modelReady: () => ready,
    download: async (onProgress) => {
      onProgress(0.5);
      ready = true;
    },
    micAccess: async () => true,
    createHost: vi.fn(() => host),
    broadcast: (s) => states.push(s),
    idleMs: 50,
    ...over,
  };
  const voice = new VoiceService(deps);
  return {
    voice,
    states,
    sent,
    host,
    deps,
    setReady: (r: boolean) => (ready = r),
    last: () => states.at(-1)!,
  };
}

afterEach(() => vi.useRealTimers());

describe('VoiceService', () => {
  it('without the model, offers the download; after it, starts listening', async () => {
    const t = setup();
    t.setReady(false);
    await t.voice.start();
    expect(t.last()).toMatchObject({ phase: 'needs-model', modelReady: false });
    expect(t.deps.createHost).not.toHaveBeenCalled(); // no microphone before the model
    await t.voice.download();
    expect(t.states.some((s) => s.phase === 'downloading' && s.progress === 0.5)).toBe(true);
    expect(t.last()).toMatchObject({ phase: 'loading', modelReady: true });
    expect(t.sent).toEqual(['start']);
  });

  it('listens, meters, finishes on toggle, and hands over what was said', async () => {
    const t = setup();
    await t.voice.toggle();
    t.voice.onHostEvent({ kind: 'listening' });
    t.voice.onHostEvent({ kind: 'level', rms: 0.25 });
    expect(t.last()).toMatchObject({ phase: 'listening', level: 1 });
    await t.voice.toggle(); // again: finish now
    expect(t.sent).toEqual(['start', 'stop']);
    t.voice.onHostEvent({ kind: 'transcribing' });
    t.voice.onHostEvent({ kind: 'result', text: ' Open Spotify in the sidebar ' });
    expect(t.last()).toMatchObject({ phase: 'idle', error: null });
    expect(t.last().transcript?.text).toBe('Open Spotify in the sidebar');
  });

  it('says so when nothing was caught, or the microphone is blocked', async () => {
    const t = setup();
    await t.voice.start();
    t.voice.onHostEvent({ kind: 'result', text: '[BLANK_AUDIO]' });
    expect(t.last()).toMatchObject({ phase: 'error', error: 'Didn’t catch that — try again' });

    const blocked = setup({ micAccess: async () => false });
    await blocked.voice.start();
    expect(blocked.last()).toMatchObject({ phase: 'error', micBlocked: true });
    expect(blocked.deps.createHost).not.toHaveBeenCalled();
  });

  it('cancel stops the microphone and drops what was said', async () => {
    const t = setup();
    await t.voice.start();
    t.voice.onHostEvent({ kind: 'listening' });
    t.voice.cancel();
    expect(t.sent).toEqual(['start', 'cancel']);
    expect(t.last().phase).toBe('idle');
  });

  it('lets the page (and the model’s memory) go after a while idle', async () => {
    vi.useFakeTimers();
    const t = setup();
    await t.voice.start();
    t.voice.onHostEvent({ kind: 'result', text: 'hello there' });
    vi.advanceTimersByTime(60);
    expect(t.host.close).toHaveBeenCalled();
  });
});
