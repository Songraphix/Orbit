import { useEffect, useState } from 'react';
import type { InvokeOutput } from '@shared/ipc/contract';
import type { VoicePrefs } from '@shared/voice';
import { buttonClass, FIELD } from '../../ui/controls';
import { Group, Row, Section } from './parts';

const mb = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;

/**
 * Settings → Voice (roadmap R2 M2): push-to-talk's speech model (on this Mac), whether what you
 * say runs at once, and reading Orbit AI's answers aloud — with which of the Mac's voices.
 */
export function VoiceSection() {
  const [status, setStatus] = useState<InvokeOutput<'voice:settings'> | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [wakeError, setWakeError] = useState<string | null>(null);
  const load = () => void window.orbit.invoke('voice:settings', {}).then(setStatus);
  useEffect(() => {
    load();
    const read = () => setVoices(speechSynthesis.getVoices().filter((v) => v.localService));
    read();
    speechSynthesis.addEventListener('voiceschanged', read);
    return () => speechSynthesis.removeEventListener('voiceschanged', read);
  }, []);
  if (!status) return null;
  const { prefs } = status;
  const set = (patch: Partial<VoicePrefs>) => {
    setStatus({ ...status, prefs: { ...prefs, ...patch } });
    void window.orbit.invoke('voice:setPrefs', patch).then((r) => {
      setWakeError(r.wakeError ?? null);
      load();
    });
  };
  const language = navigator.language.slice(0, 2);
  const listed = [
    ...voices.filter((v) => v.lang.startsWith(language)),
    ...voices.filter((v) => !v.lang.startsWith(language)),
  ];
  const preview = () => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance('Here is a summary of the page you’re reading.');
    const chosen = voices.find((v) => v.name === prefs.voice);
    if (chosen) u.voice = chosen;
    if (status.quiet) u.volume = 0;
    speechSynthesis.speak(u);
  };
  return (
    <Section
      id="voice"
      title="Voice"
      description="Talk to Orbit AI: Shift+Space, ⇧⌘Space, “Hey Orbit”, or a microphone (the command bar, the Homepage, the assistant)."
    >
      <Group title="Speech to text">
        <Row
          label={status.modelReady ? 'Speech model: on this Mac' : 'Speech model: not downloaded'}
          hint={
            status.modelReady
              ? `OpenAI’s Whisper (base), ${mb(status.modelBytes)}. Your voice becomes text here; no audio is sent anywhere.`
              : `Downloaded the first time you use voice, after you agree (${mb(status.modelBytes)}, once). Everything after that happens on this Mac.`
          }
        >
          {status.modelReady ? (
            <button
              type="button"
              className={buttonClass()}
              onClick={() => void window.orbit.invoke('voice:removeModel', {}).then(load)}
              data-testid="voice-remove-model"
            >
              Remove
            </button>
          ) : (
            <span className="text-meta text-neutral-400" data-testid="voice-model-missing">
              Not downloaded
            </span>
          )}
        </Row>
        <Row
          label="Run what I say right away"
          hint="Off: what you say waits in the command bar for you to check and press ⏎."
        >
          <input
            type="checkbox"
            role="switch"
            checked={prefs.autoRun}
            onChange={(e) => set({ autoRun: e.target.checked })}
            className="orbit-switch"
            data-testid="voice-auto-run"
          />
        </Row>
      </Group>

      <Group title="“Hey Orbit”">
        <Row
          label="Listen for “Hey Orbit”"
          hint="Off until you turn it on. While on, the microphone stays open (macOS shows its orange dot, and Orbit's toolbar a small microphone — click it to stop). Speech is checked on this Mac for the phrase; nothing is recorded, kept or sent. Pauses while Orbit speaks and when the screen is locked."
        >
          <input
            type="checkbox"
            role="switch"
            checked={prefs.wakeWord}
            onChange={(e) => set({ wakeWord: e.target.checked })}
            className="orbit-switch"
            data-testid="voice-wake-word"
          />
        </Row>
        <Row
          label="Keep listening on battery"
          hint="Off: “Hey Orbit” pauses while your Mac runs on battery (it uses a little power while people talk nearby)."
        >
          <input
            type="checkbox"
            role="switch"
            checked={prefs.wakeOnBattery}
            disabled={!prefs.wakeWord}
            onChange={(e) => set({ wakeOnBattery: e.target.checked })}
            className="orbit-switch"
            data-testid="voice-wake-battery"
          />
        </Row>
        {wakeError && (
          <p
            className="px-4 py-3 text-meta text-red-600"
            role="alert"
            data-testid="voice-wake-error"
          >
            {wakeError}
          </p>
        )}
        <div className="px-4 py-3 text-meta text-neutral-500">
          Shift+Space (outside a text box) or ⇧⌘Space opens the voice popup too. Say “Hey Orbit,
          open Spotify” in one go, or just “Hey Orbit” and then your question.
        </div>
      </Group>

      <Group title="Spoken answers">
        <Row
          label="Read answers to spoken questions aloud"
          hint="Short answers in full, long ones up to their first few sentences (the rest stays on screen). Esc or a new question stops it; any answer has Read Aloud."
        >
          <input
            type="checkbox"
            role="switch"
            checked={prefs.speakAnswers}
            onChange={(e) => set({ speakAnswers: e.target.checked })}
            className="orbit-switch"
            data-testid="voice-speak-answers"
          />
        </Row>
        <Row
          label="Voice"
          hint="One of the voices on your Mac (add more in System Settings → Accessibility → Spoken Content)."
        >
          <div className="flex items-center gap-2">
            <select
              value={prefs.voice ?? ''}
              onChange={(e) => set({ voice: e.target.value || null })}
              className={`${FIELD} max-w-[220px]`}
              aria-label="Voice"
              data-testid="voice-voice"
            >
              <option value="">System voice</option>
              {listed.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
            <button type="button" className={buttonClass()} onClick={preview}>
              Listen
            </button>
          </div>
        </Row>
        <div className="px-4 py-3 text-meta text-neutral-500" data-testid="voice-privacy">
          The microphone is on only while Orbit is listening — the command bar shows it, with a
          level meter — and stops when you stop talking, press ⇧⌘Space or Esc. Nothing is recorded
          or kept. A question you ask Orbit AI by voice is sent like a typed one.
        </div>
      </Group>
    </Section>
  );
}
