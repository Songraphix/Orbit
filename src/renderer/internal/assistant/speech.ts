import { useSyncExternalStore } from 'react';

/**
 * Reads Orbit AI's answers aloud with the Mac's own voices (speechSynthesis; nothing is sent
 * anywhere). One answer at a time; a new question, Stop or Esc ends it.
 */
let speakingId: string | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
/** Answers already read aloud by themselves (each is only read once). */
const autoSpoken = new Set<string>();

function setSpeaking(id: string | null): void {
  speakingId = id;
  notify();
}

export function speak(
  id: string,
  text: string,
  options: { voice: string | null; quiet?: boolean } = { voice: null },
): void {
  stopSpeaking();
  if (!text.trim() || typeof speechSynthesis === 'undefined') return;
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  const chosen =
    (options.voice && voices.find((v) => v.name === options.voice)) ||
    voices.find((v) => v.default && v.lang.startsWith(navigator.language.slice(0, 2))) ||
    voices.find((v) => v.lang.startsWith(navigator.language.slice(0, 2)));
  if (chosen) utterance.voice = chosen;
  // Test runs stay silent (the words are still "spoken", just at no volume).
  if (options.quiet) utterance.volume = 0;
  utterance.onend = () => {
    if (speakingId === id) setSpeaking(null);
  };
  utterance.onerror = utterance.onend;
  setSpeaking(id);
  speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  if (speakingId !== null) setSpeaking(null);
}

/** Reads a spoken question's answer once, when it's done. */
export function speakOnce(
  id: string,
  text: string,
  options: { voice: string | null; quiet?: boolean },
) {
  if (autoSpoken.has(id)) return;
  autoSpoken.add(id);
  speak(id, text, options);
}

export function useSpeakingId(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => speakingId,
  );
}
