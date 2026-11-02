import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AudioLines,
  AudioWaveform,
  Bell,
  BellRing,
  Brain,
  Check,
  CloudRain,
  Coffee,
  Droplets,
  Flame,
  Moon,
  Pause,
  Play,
  Plus,
  Radio,
  RotateCcw,
  ShieldBan,
  Sparkles,
  Square,
  Target,
  Volume2,
  WavesHorizontal,
  Wind,
  X,
} from 'lucide-react';
import {
  FOCUS_DURATIONS,
  focusClock,
  focusProgress,
  focusRemaining,
  focusTotal,
  normalizeSite,
} from '@shared/focus';
import type { FocusView as FocusState } from '@shared/focus';
import { SOUND_GROUPS, SOUNDS } from '@shared/sounds';
import type { SoundId } from '@shared/sounds';
import { useWork } from '../work/context';
import { Toggle } from '../../ui/Toggle';

const invoke = window.orbit.invoke;

const ICONS: Record<SoundId, ReactNode> = {
  rain: <CloudRain size={18} />,
  ocean: <WavesHorizontal size={18} />,
  stream: <Droplets size={18} />,
  wind: <Wind size={18} />,
  fire: <Flame size={18} />,
  white: <AudioWaveform size={18} />,
  pink: <Radio size={18} />,
  brown: <AudioLines size={18} />,
  alpha: <Brain size={18} />,
  theta: <Moon size={18} />,
  drone: <Sparkles size={18} />,
  bowls: <BellRing size={18} />,
};

type SetPrefs = (patch: Partial<FocusState['prefs']>) => void;

/** The Focus view's state from main; preference changes show at once, then main's answer. */
function useFocus(): [FocusState | null, SetPrefs] {
  const [state, setState] = useState<FocusState | null>(null);
  useEffect(() => {
    const off = window.orbit.on('focus:update', setState);
    void invoke('focus:view', {}).then(setState);
    return off;
  }, []);
  const setPrefs: SetPrefs = (patch) => {
    setState((s) => (s ? { ...s, prefs: { ...s.prefs, ...patch } } : s));
    void invoke('focus:setPrefs', patch).then(setState);
  };
  return [state, setPrefs];
}

function useNow(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [running]);
  return now;
}

/**
 * orbit://notes/panel/focus: Focus mode and its sounds. Pick what to work on and for how long,
 * whether to block distracting sites, and a sound; then a timer with Pause, Done and a break.
 */
export function FocusView() {
  const [state, setPrefs] = useFocus();
  const now = useNow(state?.session != null);
  if (!state) return null;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8" data-testid="focus-view">
      {state.session ? (
        <Session state={state} now={now} />
      ) : (
        <Setup state={state} setPrefs={setPrefs} />
      )}
      <History history={state.history} />
      <Sounds state={state} setPrefs={setPrefs} />
    </div>
  );
}

function Session({ state, now }: { state: FocusState; now: number }) {
  const session = state.session!;
  const left = focusRemaining(session, now);
  const progress = focusProgress(session, now);
  const paused = session.pausedAt !== null;
  const over = left <= 0;
  const brk = session.kind === 'break';
  const size = 200;
  const r = 88;
  const circumference = 2 * Math.PI * r;
  const colour = brk ? '#34c759' : over ? '#ff9f0a' : 'var(--work-accent)';
  return (
    <section className="flex flex-col items-center pt-6" data-testid="focus-session">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--work-border)"
            strokeWidth="8"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={colour}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            style={{ transition: 'stroke-dashoffset 0.5s linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11.5px] font-semibold tracking-wide text-[var(--note-muted)] uppercase">
            {paused ? 'Paused' : brk ? 'Break' : over ? 'Time’s up' : 'Focus'}
          </span>
          <span
            className="text-[44px] leading-tight font-semibold tabular-nums"
            style={{ color: over && !brk ? '#ff9f0a' : undefined }}
            data-testid="focus-clock"
          >
            {focusClock(left)}
          </span>
        </div>
      </div>
      <p className="mt-3 max-w-full truncate text-[15px] font-medium" data-testid="focus-title">
        {session.title}
      </p>
      {session.block && (
        <p className="mt-1 flex items-center gap-1 text-[12px] text-[var(--note-muted)]">
          <ShieldBan size={12} /> Blocking {state.prefs.blocklist.length} distracting sites
        </p>
      )}

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {over ? (
          brk ? (
            <Big primary onClick={() => void invoke('focus:start', {})} testId="focus-next">
              <Target size={15} /> Start Focus
            </Big>
          ) : (
            <>
              <Big
                primary
                onClick={() => void invoke('focus:start', { kind: 'break' })}
                testId="focus-break"
              >
                <Coffee size={15} /> {state.prefs.breakMinutes}-Minute Break
              </Big>
              <Big
                onClick={() => void invoke('focus:extend', { minutes: 5 })}
                testId="focus-extend"
              >
                <Plus size={15} /> 5 Minutes
              </Big>
            </>
          )
        ) : (
          <Big
            primary
            onClick={() => void invoke('focus:pause', { paused: !paused })}
            testId="focus-pause"
          >
            {paused ? <Play size={15} /> : <Pause size={15} />} {paused ? 'Resume' : 'Pause'}
          </Big>
        )}
        {session.taskId && !brk && (
          <Big onClick={() => void invoke('focus:end', { complete: true })} testId="focus-done">
            <Check size={15} /> Done
          </Big>
        )}
        <Big onClick={() => void invoke('focus:end', { complete: false })} testId="focus-end">
          <Square size={13} /> {brk ? 'End Break' : 'End'}
        </Big>
      </div>
      <button
        type="button"
        onClick={() => void invoke('focus:restart', {})}
        className="mt-2 flex items-center gap-1 text-[12px] text-[var(--note-muted)] hover:text-[var(--note-fg)]"
        data-testid="focus-restart"
      >
        <RotateCcw size={12} /> Start over
      </button>
    </section>
  );
}

/** Today's focused time and the week, from Orbit's own log (it never leaves the Mac). */
function History({ history }: { history: FocusState['history'] }) {
  const max = Math.max(...history.week, 25 * 60_000);
  // The last 7 days' initials, oldest first, in the Mac's language.
  const [now] = useState(() => Date.now());
  const day = (i: number) =>
    new Date(now - (6 - i) * 86_400_000).toLocaleDateString(undefined, {
      weekday: 'narrow',
    });
  return (
    <section
      className="mt-6 flex items-end gap-4 rounded-[12px] border border-[var(--work-border)] bg-[var(--work-card)] px-3.5 py-3"
      data-testid="focus-history"
    >
      <div className="min-w-0 flex-1">
        <div className="text-[11.5px] font-semibold tracking-wide text-[var(--note-muted)] uppercase">
          Today
        </div>
        <div
          className="text-[22px] leading-tight font-semibold tabular-nums"
          data-testid="focus-today"
        >
          {focusTotal(history.todayMs)}
        </div>
        <div className="text-[12px] text-[var(--note-muted)]">
          {history.todaySessions} {history.todaySessions === 1 ? 'session' : 'sessions'}
        </div>
      </div>
      <div className="flex h-12 items-end gap-1" aria-label="The last 7 days">
        {history.week.map((ms, i) => {
          return (
            <div key={i} className="flex flex-col items-center gap-0.5" title={focusTotal(ms)}>
              <span
                className={`w-2.5 rounded-full ${i === 6 ? 'bg-[var(--work-accent)]' : 'bg-[var(--work-accent-soft)]'}`}
                style={{ height: Math.max(3, Math.round((ms / max) * 36)) }}
              />
              <span className="text-[9.5px] text-[var(--note-muted)]">{day(i)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Setup({ state, setPrefs }: { state: FocusState; setPrefs: SetPrefs }) {
  const { data } = useWork();
  const { prefs } = state;
  const open = useMemo(() => (data?.tasks ?? []).filter((t) => t.status !== 'done'), [data?.tasks]);
  // Starts on the task already under way, if there is one.
  const [chosen, setTaskId] = useState<string | null>(null);
  const taskId = chosen ?? open.find((t) => t.status === 'doing')?.id ?? '';
  const [editing, setEditing] = useState(false);
  const [site, setSite] = useState('');
  const projects = data?.projects ?? [];
  const groups = [
    ...projects.map((p) => ({ name: p.name, tasks: open.filter((t) => t.projectId === p.id) })),
    { name: 'No project', tasks: open.filter((t) => t.projectId === null) },
  ].filter((g) => g.tasks.length > 0);

  const addSite = () => {
    const normal = normalizeSite(site);
    if (!normal) return;
    setPrefs({ blocklist: [...prefs.blocklist, normal] });
    setSite('');
  };

  return (
    <section className="pt-4" data-testid="focus-setup">
      <h2 className="flex items-center gap-2 text-[17px] font-semibold">
        <Target size={17} className="text-[var(--work-accent-text)]" /> Focus
      </h2>
      <p className="mt-0.5 text-[12.5px] text-[var(--note-muted)]">
        A timer for one thing at a time. The sidebar steps aside until you’re done.
      </p>

      <Label>Working on</Label>
      <select
        value={taskId}
        onChange={(e) => setTaskId(e.target.value)}
        className="h-9 w-full rounded-[10px] border border-[var(--work-border)] bg-[var(--work-card)] px-2.5 text-[13px]"
        data-testid="focus-task"
      >
        <option value="">Just focus (no task)</option>
        {groups.map((g) => (
          <optgroup key={g.name} label={g.name}>
            {g.tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <Label>For</Label>
      <div className="flex gap-1.5" role="radiogroup" aria-label="Minutes">
        {FOCUS_DURATIONS.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={prefs.minutes === m}
            onClick={() => setPrefs({ minutes: m })}
            className={`press h-9 flex-1 rounded-[10px] text-[13px] font-medium ${
              prefs.minutes === m
                ? 'bg-[var(--work-accent-soft)] text-[var(--work-accent-text)] ring-1 ring-[var(--work-accent)]'
                : 'border border-[var(--work-border)] bg-[var(--work-card)] hover:bg-[var(--note-hover)]'
            }`}
            data-testid="focus-minutes"
            data-value={m}
          >
            {m} min
          </button>
        ))}
      </div>
      <label className="mt-2 flex items-center gap-2 text-[12.5px] text-[var(--note-muted)]">
        Then a break of
        <select
          value={prefs.breakMinutes}
          onChange={(e) => setPrefs({ breakMinutes: Number(e.target.value) })}
          className="rounded-[8px] border border-[var(--work-border)] bg-[var(--work-card)] px-1.5 py-0.5 text-[12.5px] text-[var(--note-fg)]"
          data-testid="focus-break-minutes"
        >
          {[5, 10, 15, 20].map((m) => (
            <option key={m} value={m}>
              {m} minutes
            </option>
          ))}
        </select>
      </label>

      <div className="mt-4 rounded-[12px] border border-[var(--work-border)] bg-[var(--work-card)] px-3 py-2.5">
        <label className="flex items-center gap-2.5 text-[13px]">
          <ShieldBan size={16} className="shrink-0 text-[var(--work-accent-text)]" />
          <span className="flex-1">
            Block distracting sites
            <span className="block text-[11.5px] text-[var(--note-muted)]">
              {prefs.blocklist.length} sites, until the session ends ·{' '}
              <button
                type="button"
                className="text-[var(--work-accent-text)] hover:underline"
                onClick={() => setEditing(!editing)}
                data-testid="focus-edit-sites"
              >
                {editing ? 'Done' : 'Edit'}
              </button>
            </span>
          </span>
          <Toggle
            checked={prefs.block}
            onChange={(block) => setPrefs({ block })}
            label="Block distracting sites"
            testId="focus-block"
          />
        </label>
        {editing && (
          <div className="mt-2.5" data-testid="focus-sites">
            <div className="flex flex-wrap gap-1.5">
              {prefs.blocklist.map((s) => (
                <span
                  key={s}
                  className="flex items-center gap-1 rounded-full bg-[var(--note-hover)] py-0.5 pr-1 pl-2.5 text-[12px]"
                  data-testid="focus-site"
                >
                  {s}
                  <button
                    type="button"
                    aria-label={`Unblock ${s}`}
                    className="grid size-4 place-items-center rounded-full hover:bg-[var(--work-border)]"
                    onClick={() => setPrefs({ blocklist: prefs.blocklist.filter((x) => x !== s) })}
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <form
              className="mt-2 flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                addSite();
              }}
            >
              <input
                value={site}
                onChange={(e) => setSite(e.target.value)}
                placeholder="Add a site, like news.com"
                className="h-8 min-w-0 flex-1 rounded-[9px] border border-[var(--work-border)] bg-transparent px-2.5 text-[12.5px]"
                data-testid="focus-site-input"
              />
              <button
                type="submit"
                disabled={!normalizeSite(site)}
                className="h-8 rounded-[9px] border border-[var(--work-border)] px-2.5 text-[12.5px] disabled:opacity-40"
              >
                Add
              </button>
            </form>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2 text-[13px]">
        <label className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <BellRing size={14} className="text-[var(--note-muted)]" /> Chime when time’s up
          </span>
          <Toggle
            checked={prefs.chime}
            onChange={(chime) => setPrefs({ chime })}
            label="Chime when time’s up"
            testId="focus-chime"
          />
        </label>
        <label className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Bell size={14} className="text-[var(--note-muted)]" /> Notify me when time’s up
          </span>
          <Toggle
            checked={prefs.notify}
            onChange={(notify) => setPrefs({ notify })}
            label="Notify me when time’s up"
            testId="focus-notify"
          />
        </label>
      </div>

      <Big
        primary
        wide
        onClick={() => void invoke('focus:start', { taskId: taskId || null })}
        testId="focus-start"
      >
        <Play size={15} /> Start Focus · {prefs.minutes} min
      </Big>
    </section>
  );
}

function Sounds({ state, setPrefs }: { state: FocusState; setPrefs: SetPrefs }) {
  const { playing, paused, volume } = state.sounds;
  // While dragging, the slider shows where it is; otherwise main's volume.
  const [dragging, setLevel] = useState<number | null>(null);
  const level = dragging ?? volume;
  return (
    <section className="mt-7" data-testid="focus-sounds">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-[11.5px] font-semibold tracking-wide text-[var(--note-muted)] uppercase">
          Sounds
        </h2>
        {playing && (
          <button
            type="button"
            className="flex items-center gap-1 text-[12px] font-medium text-[var(--work-accent-text)]"
            onClick={() => void invoke('sounds:pause', { paused: !paused })}
            data-testid="sounds-pause"
          >
            {paused ? <Play size={11} /> : <Pause size={11} />} {paused ? 'Resume' : 'Pause'}
          </button>
        )}
        {playing && (
          <button
            type="button"
            className="ml-2 flex items-center gap-1 text-[12px] font-medium text-[var(--work-accent-text)]"
            onClick={() => {
              void invoke('sounds:stop', {});
              setPrefs({ sound: null });
            }}
            data-testid="sounds-stop"
          >
            <Square size={11} /> Stop
          </button>
        )}
      </div>
      <p className="mt-0.5 mb-2 text-[12px] text-[var(--note-muted)]">
        Made on your Mac — they keep playing as you browse, and start with each focus session.
      </p>
      {SOUND_GROUPS.map((group) => (
        <div key={group} className="mt-2.5">
          <h3 className="mb-1.5 text-[12px] font-medium text-[var(--note-muted)]">{group}</h3>
          <div className="grid grid-cols-3 gap-1.5">
            {SOUNDS.filter((s) => s.group === group).map((s) => {
              const on = playing === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  title={s.hint}
                  onClick={() => {
                    if (on) void invoke('sounds:stop', {});
                    else void invoke('sounds:play', { id: s.id });
                    setPrefs({ sound: on ? null : s.id });
                  }}
                  className={`press flex h-[68px] flex-col items-center justify-center gap-1.5 rounded-[12px] text-[12px] font-medium ${
                    on
                      ? 'bg-[var(--work-accent)] text-white shadow-[0_8px_18px_-10px_var(--work-accent)]'
                      : 'border border-[var(--work-border)] bg-[var(--work-card)] hover:bg-[var(--note-hover)]'
                  }`}
                  data-testid="sound"
                  data-sound={s.id}
                >
                  {on && !paused ? <PlayingBars /> : ICONS[s.id]}
                  <span className="max-w-full truncate px-1">{s.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <label className="mt-3 flex items-center gap-2.5 text-[var(--note-muted)]">
        <Volume2 size={15} className="shrink-0" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={level}
          aria-label="Volume"
          onChange={(e) => {
            const v = Number(e.target.value);
            setLevel(v);
            void invoke('sounds:volume', { volume: v });
          }}
          onPointerUp={() => setLevel(null)}
          onKeyUp={() => setLevel(null)}
          className="flex-1 accent-[var(--work-accent)]"
          data-testid="sounds-volume"
        />
      </label>
    </section>
  );
}

/** Three bars bouncing: this sound is playing. */
function PlayingBars() {
  return (
    <span className="flex h-[18px] items-end gap-[3px]" aria-hidden>
      {[0, 0.2, 0.4].map((delay) => (
        <span
          key={delay}
          className="w-[3px] rounded-full bg-current motion-safe:animate-[orbit-bars_0.9s_ease-in-out_infinite]"
          style={{ height: '100%', animationDelay: `${delay}s` }}
        />
      ))}
    </span>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 mb-1.5 text-[12px] font-medium text-[var(--note-muted)]">{children}</div>
  );
}

function Big(props: {
  onClick: () => void;
  children: ReactNode;
  testId: string;
  primary?: boolean;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`press flex h-10 items-center justify-center gap-1.5 rounded-[12px] px-4 text-[13.5px] font-semibold ${
        props.wide ? 'mt-4 w-full' : ''
      } ${
        props.primary
          ? 'bg-[var(--work-accent)] text-white shadow-[0_8px_18px_-10px_var(--work-accent)] hover:brightness-110'
          : 'border border-[var(--work-border)] bg-[var(--work-card)] hover:bg-[var(--note-hover)]'
      }`}
      data-testid={props.testId}
    >
      {props.children}
    </button>
  );
}
