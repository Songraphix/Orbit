import type { VoiceEngine } from './engine';

/**
 * The hidden voice page (push-to-talk, roadmap R2 M2): listens while you speak and turns it into
 * text on this Mac. Main opens it in a window that's never shown, in a session of its own that
 * may use the microphone, and tells it when to start and stop. The speech engine (Whisper via
 * transformers.js) loads on first use.
 */
let engine: VoiceEngine | null = null;
const ready = import('./engine').then(({ VoiceEngine: Engine }) => {
  engine = new Engine((event) => void window.orbit.invoke('voice:hostEvent', event));
  return engine;
});
window.orbit.on('voice:command', ({ command }) => {
  void ready.then((e) => {
    if (command === 'start') void e.start();
    else if (command === 'stop') e.stop();
    else if (command === 'cancel') e.cancel();
    else if (command === 'wake-on') void e.setWake(true);
    else if (command === 'wake-off') void e.setWake(false);
    else if (command === 'wake-pause') void e.pauseWake(true);
    else void e.pauseWake(false);
  });
});
window.addEventListener('pagehide', () => engine?.cancel());
