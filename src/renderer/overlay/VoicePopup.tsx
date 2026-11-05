import { ExternalLink, Mic, MicOff, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { speakableText, VOICE_MODEL_BYTES } from '@shared/voice';
import type { VoiceState } from '@shared/voice';
import type { OverlayState } from '@shared/types/command-bar';
import { useVoice } from './use-voice';

type Popup = NonNullable<OverlayState['voicePopup']>;

const invoke = window.orbit.invoke;
const close = () => {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  void invoke('voicepop:close', {});
};

/**
 * The voice popup (Siri-style; owner request): a glowing orb at the foot of the window and a
 * light along its edge while Orbit listens — both follow the microphone's real level — then what
 * you said and Orbit AI's answer, read aloud. Esc or ✕ stops everything; Open in Panel carries
 * the conversation on. The orb never pretends: listening follows your voice, thinking turns
 * slowly, speaking breathes.
 */
export function VoicePopup({ popup }: { popup: Popup }) {
  const voice = useVoice(() => undefined);
  const mine = voice.target === 'popup';
  const listening = mine && (voice.phase === 'listening' || voice.phase === 'loading');
  const transcribing = mine && voice.phase === 'transcribing';
  const answer = popup.answer;
  const thinking = answer?.status === 'thinking';
  const [speaking, setSpeaking] = useState(false);
  const spoken = useRef<string | null>(null);

  // Read the finished answer aloud (once), with the Mac's voices.
  useEffect(() => {
    if (!answer || answer.status !== 'done' || !popup.speak || !answer.text) return;
    const key = `${popup.at}:${answer.text.length}`;
    if (spoken.current === key || typeof speechSynthesis === 'undefined') return;
    spoken.current = key;
    const utterance = new SpeechSynthesisUtterance(speakableText(answer.text).text);
    const chosen = speechSynthesis.getVoices().find((v) => v.name === popup.voice);
    if (chosen) utterance.voice = chosen;
    if (popup.quiet) utterance.volume = 0;
    utterance.onstart = () => {
      setSpeaking(true);
      void invoke('voicepop:speaking', { speaking: true });
    };
    utterance.onend = utterance.onerror = () => {
      setSpeaking(false);
      void invoke('voicepop:speaking', { speaking: false });
    };
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }, [answer, popup.at, popup.speak, popup.voice, popup.quiet]);
  useEffect(
    () => () => {
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    },
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const state: OrbState = listening
    ? 'listening'
    : transcribing || thinking || answer?.status === 'writing'
      ? 'thinking'
      : speaking
        ? 'speaking'
        : 'idle';
  const level = listening ? voice.level : 0;

  return (
    <div
      className="fixed inset-0 animate-[orbit-fade-in_var(--dur-modal)_var(--ease-out)]"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
      data-testid="voice-popup-backdrop"
    >
      {/* Light along the window's foot while listening, as bright as your voice. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 transition-opacity duration-[var(--dur-popover)]"
        style={{
          opacity: listening ? 0.35 + level * 0.65 : state === 'thinking' ? 0.3 : 0,
          background:
            'radial-gradient(60% 100% at 50% 100%, rgb(124 196 181 / 0.55), rgb(141 180 209 / 0.25) 45%, transparent 75%)',
        }}
      />
      <div
        className="surface-popover animate-rise absolute bottom-8 left-1/2 flex w-[min(560px,92vw)] -translate-x-1/2 items-start gap-4 rounded-[26px] p-4 text-[#f3f6f7]"
        role="dialog"
        aria-label="Orbit voice"
        aria-live="polite"
        data-testid="voice-popup"
        data-state={state}
      >
        <Orb state={state} level={level} />
        <div className="min-w-0 flex-1 pt-1">
          <Status voice={voice} mine={mine} popup={popup} />
          {answer && (answer.text || answer.error) && (
            <div
              className="mt-2 max-h-[38vh] overflow-y-auto text-[14px] leading-[1.55] whitespace-pre-wrap text-[rgb(243_246_247/0.90)]"
              data-testid="voice-popup-answer"
            >
              {answer.error && !answer.text ? answer.error : speakableText(answer.text, 4000).text}
            </div>
          )}
          {answer && answer.actions.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" data-testid="voice-popup-actions">
              {answer.actions.map((a, i) => (
                <li
                  key={i}
                  className="surface-clear rounded-full px-2.5 py-1 text-[12px] text-[rgb(243_246_247/0.85)]"
                >
                  {a.label}
                </li>
              ))}
            </ul>
          )}
          {popup.ai && answer && answer.status !== 'thinking' && (
            <button
              type="button"
              onClick={() => void invoke('voicepop:panel', {})}
              className="lift mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] text-[rgb(243_246_247/0.75)] hover:bg-[rgb(255_255_255/0.1)] hover:text-[#f3f6f7]"
              data-testid="voice-popup-panel"
            >
              <ExternalLink size={12} />
              Open in Panel
            </button>
          )}
        </div>
        <button
          type="button"
          aria-label={speaking ? 'Stop' : 'Close'}
          onClick={close}
          className="lift grid size-8 shrink-0 place-items-center rounded-full text-[rgb(243_246_247/0.65)] hover:bg-[rgb(255_255_255/0.1)] hover:text-[#f3f6f7]"
          data-testid="voice-popup-close"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

function Status({ voice, mine, popup }: { voice: VoiceState; mine: boolean; popup: Popup }) {
  const line = 'text-[15px] font-medium';
  if (mine && voice.phase === 'needs-model') {
    return (
      <div>
        <p className={line}>Voice needs its speech model</p>
        <p className="mt-1 text-[13px] text-[rgb(243_246_247/0.65)]">
          A one-time {Math.round(VOICE_MODEL_BYTES / 1e6)} MB download. After that your voice is
          turned into text on this Mac — no audio leaves it.
        </p>
        <button
          type="button"
          onClick={() => void invoke('voice:download', {})}
          className="lift mt-2 rounded-full bg-[var(--accent-fill)] px-3 py-1.5 text-[13px] font-medium text-on-accent"
          data-testid="voice-popup-download"
        >
          Download
        </button>
      </div>
    );
  }
  if (mine && voice.phase === 'downloading') {
    return (
      <p className={line}>
        Downloading the speech model… {Math.round((voice.progress ?? 0) * 100)}%
      </p>
    );
  }
  if (mine && voice.phase === 'error') {
    return (
      <div className="flex items-start gap-2">
        <MicOff size={16} className="mt-0.5 shrink-0 text-[#ff9b8f]" />
        <div>
          <p className={line} data-testid="voice-popup-error">
            {voice.error}
          </p>
          {voice.micBlocked ? (
            <button
              type="button"
              onClick={() => void invoke('voice:micSettings', {})}
              className="mt-2 text-[13px] underline underline-offset-2"
            >
              Open System Settings
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void invoke('voice:toggle', { target: 'popup' })}
              className="mt-2 inline-flex items-center gap-1 text-[13px] underline underline-offset-2"
            >
              <Mic size={12} /> Try again
            </button>
          )}
        </div>
      </div>
    );
  }
  if (mine && (voice.phase === 'listening' || voice.phase === 'loading')) {
    return (
      <p className={`${line} text-[rgb(243_246_247/0.85)]`} data-testid="voice-popup-status">
        {voice.phase === 'loading' ? 'Getting ready…' : 'Listening…'}
      </p>
    );
  }
  if (mine && voice.phase === 'transcribing') {
    return <p className={`${line} text-[rgb(243_246_247/0.70)]`}>…</p>;
  }
  return (
    <p className={`${line} text-[rgb(243_246_247/0.70)]`} data-testid="voice-popup-heard">
      {popup.heard ? `“${popup.heard}”` : 'Say something, or press Esc.'}
    </p>
  );
}

type OrbState = 'listening' | 'thinking' | 'speaking' | 'idle';

/** The orb: listening swells with your real voice; thinking turns; speaking breathes. */
function Orb({ state, level }: { state: OrbState; level: number }) {
  return (
    <span className="relative grid size-14 shrink-0 place-items-center" aria-hidden>
      <span
        className="absolute inset-0 rounded-full transition-transform duration-75"
        style={{
          transform: `scale(${state === 'listening' ? 1 + level * 0.35 : 1})`,
          background:
            'radial-gradient(circle at 35% 30%, rgb(247 244 239 / 0.95), rgb(124 196 181 / 0.9) 38%, rgb(54 116 140 / 0.95) 72%, rgb(18 48 58) 100%)',
          boxShadow: `0 0 ${18 + level * 40}px rgb(124 196 181 / ${0.35 + level * 0.4})`,
        }}
      />
      <span
        className={`absolute inset-0 rounded-full mix-blend-screen ${
          state === 'thinking'
            ? 'ambient animate-[spin_3.2s_linear_infinite]'
            : state === 'speaking'
              ? 'ambient animate-[orbit-breathe_2.4s_var(--ease-in-out)_infinite]'
              : ''
        }`}
        style={{
          background:
            'conic-gradient(from 0deg, transparent, rgb(141 180 209 / 0.7), transparent 40%, rgb(220 205 181 / 0.55), transparent 75%)',
          opacity: state === 'idle' ? 0.35 : 0.8,
        }}
      />
    </span>
  );
}
