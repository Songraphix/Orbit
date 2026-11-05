import { Mic, MicOff, Square } from 'lucide-react';
import { VOICE_MODEL_BYTES } from '@shared/voice';
import type { VoiceState } from '@shared/voice';

/**
 * Voice in the command bar (roadmap R2 M2): the microphone button, and what voice is doing —
 * the one-time model download, listening (with a level meter), writing it down, or what went
 * wrong. What you say lands in the box to check before ⏎ (unless Settings says run at once).
 */
export function VoiceButton({ voice }: { voice: VoiceState }) {
  const listening = voice.phase === 'listening';
  const label = listening ? 'Stop listening' : 'Speak (⇧⌘Space)';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(e) => e.preventDefault()} // keep the box focused
      onClick={() => void window.orbit.invoke('voice:toggle', {})}
      className={`relative grid size-9 shrink-0 place-items-center rounded-full transition-colors duration-150 ${
        listening
          ? 'bg-[var(--accent)] text-on-accent'
          : 'text-white/55 hover:bg-white/[0.1] hover:text-white'
      }`}
      data-testid="voice-button"
      data-phase={voice.phase}
    >
      {listening && (
        // A soft ring that swells with your voice.
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-[var(--accent)] opacity-40 transition-transform duration-75"
          style={{ transform: `scale(${1 + voice.level * 0.55})` }}
        />
      )}
      <span className="relative">
        {listening ? <Square size={13} fill="currentColor" /> : <Mic size={17} strokeWidth={2.1} />}
      </span>
    </button>
  );
}

const pct = (share: number | null) => `${Math.round((share ?? 0) * 100)}%`;
const mb = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;

export function VoiceStatus({ voice }: { voice: VoiceState }) {
  const invoke = (
    channel: 'voice:download' | 'voice:cancel' | 'voice:toggle' | 'voice:micSettings',
  ) => void window.orbit.invoke(channel, {});
  const row = 'flex items-center gap-3 border-t border-white/[0.08] px-5 py-3 text-[13px]';
  const button =
    'press shrink-0 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors duration-100';
  const primary = `${button} bg-[var(--accent)] text-on-accent hover:brightness-110`;
  const quiet = `${button} bg-white/[0.08] text-white/85 hover:bg-white/[0.14]`;

  switch (voice.phase) {
    case 'needs-model':
      return (
        <div className={row} data-testid="voice-status" data-phase="needs-model">
          <Mic size={16} className="shrink-0 opacity-60" />
          <p className="min-w-0 flex-1 leading-5 text-white/80">
            Voice turns speech into text on this Mac — your audio never leaves it. It needs a
            one-time download of the speech model ({mb(VOICE_MODEL_BYTES)}).
          </p>
          <button type="button" className={quiet} onClick={() => invoke('voice:cancel')}>
            Not Now
          </button>
          <button
            type="button"
            className={primary}
            onClick={() => invoke('voice:download')}
            data-testid="voice-download"
          >
            Download
          </button>
        </div>
      );
    case 'downloading':
      return (
        <div className={row} data-testid="voice-status" data-phase="downloading">
          <span className="min-w-0 flex-1">
            <span className="block text-white/80">
              Downloading the speech model… {pct(voice.progress)}
            </span>
            <span className="mt-2 block h-1 overflow-hidden rounded-full bg-white/[0.1]">
              <span
                className="block h-full rounded-full bg-[var(--accent)] transition-[width] duration-200"
                style={{ width: pct(voice.progress) }}
              />
            </span>
          </span>
          <button type="button" className={quiet} onClick={() => invoke('voice:cancel')}>
            Cancel
          </button>
        </div>
      );
    case 'loading':
    case 'listening':
    case 'transcribing':
      return (
        <div className={row} data-testid="voice-status" data-phase={voice.phase}>
          <Bars
            level={voice.phase === 'listening' ? voice.level : 0}
            busy={voice.phase !== 'listening'}
          />
          <span className="min-w-0 flex-1 text-white/75">
            {voice.phase === 'listening'
              ? 'Listening — stop talking to finish, or press ⇧⌘Space.'
              : voice.phase === 'loading'
                ? 'Getting ready to listen…'
                : 'Writing down what you said — on this Mac.'}
          </span>
          <span className="shrink-0 text-[12px] text-white/40">Esc to cancel</span>
        </div>
      );
    case 'error':
      return (
        <div className={row} data-testid="voice-status" data-phase="error">
          <MicOff size={16} className="shrink-0 text-[#ff8a80]" />
          <span className="min-w-0 flex-1 text-white/80" data-testid="voice-error">
            {voice.error}
          </span>
          {voice.micBlocked ? (
            <button type="button" className={primary} onClick={() => invoke('voice:micSettings')}>
              Open System Settings
            </button>
          ) : (
            <button type="button" className={quiet} onClick={() => invoke('voice:toggle')}>
              Try Again
            </button>
          )}
        </div>
      );
    default:
      return null;
  }
}

/** Five bars that follow the voice (or ripple while it gets ready / writes). */
function Bars({ level, busy }: { level: number; busy: boolean }) {
  const shape = [0.45, 0.75, 1, 0.75, 0.45];
  return (
    <span className="flex h-5 w-7 shrink-0 items-center justify-between" aria-hidden>
      {shape.map((s, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-full bg-[var(--accent-fill,var(--accent))] ${busy ? 'animate-[orbit-bars_0.9s_ease-in-out_infinite]' : 'transition-[height] duration-75'}`}
          style={{
            height: busy ? '60%' : `${Math.max(18, Math.min(100, level * s * 130))}%`,
            animationDelay: busy ? `${i * 0.12}s` : undefined,
          }}
        />
      ))}
    </span>
  );
}
