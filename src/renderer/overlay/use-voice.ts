import { useEffect, useRef, useState } from 'react';
import { IDLE_VOICE } from '@shared/voice';
import type { VoiceState } from '@shared/voice';

/**
 * Voice's state for the command bar, and what you said: words that arrive while the bar is open
 * go to `onTranscript` once each (with Settings → Voice → Run right away).
 */
export function useVoice(onTranscript: (text: string, runAtOnce: boolean) => void): VoiceState {
  const [voice, setVoice] = useState<VoiceState>(IDLE_VOICE);
  const [opened] = useState(() => Date.now());
  const autoRun = useRef(false);
  const handler = useRef(onTranscript);
  useEffect(() => {
    handler.current = onTranscript;
  });
  const lastAt = useRef(0);

  useEffect(() => {
    void window.orbit.invoke('voice:get', {}).then(setVoice);
    void window.orbit.invoke('voice:setPrefs', {}).then((prefs) => {
      autoRun.current = prefs.autoRun;
    });
    return window.orbit.on('state:voice', setVoice);
  }, []);

  useEffect(() => {
    const t = voice.transcript;
    if (!t || t.at < opened || t.at === lastAt.current) return;
    lastAt.current = t.at;
    handler.current(t.text, autoRun.current);
  }, [voice.transcript, opened]);

  return voice;
}
