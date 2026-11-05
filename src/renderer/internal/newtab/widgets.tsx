import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  CalendarClock,
  Check,
  Cloud,
  CloudSun,
  Copy,
  FolderClosed,
  Globe2,
  HardDrive,
  History,
  LayoutGrid,
  NotebookPen,
  Sparkles,
  Target,
  Timer,
  FileText,
  GripVertical,
  Mic,
  Maximize2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  Shuffle,
  Square,
  X,
} from 'lucide-react';
import {
  daysUntil,
  layoutFromPreset,
  moveWidget,
  newWidget,
  nextSize,
  PRESETS,
  weatherLabel,
  WIDGETS,
  WIDGET_TYPES,
} from '@shared/home-widgets';
import type {
  HomeLayout,
  Place,
  Weather,
  Widget,
  WidgetData,
  WidgetOptions,
  WidgetType,
} from '@shared/home-widgets';
import { focusClock, focusRemaining, focusTotal } from '@shared/focus';
import type { FocusSession } from '@shared/focus';
import { soundName } from '@shared/sounds';
import type { SoundState } from '@shared/sounds';
import { harmony, HARMONIES } from '@shared/toolkit/palette';
import { hslToRgb } from '@shared/toolkit/color';
import { dateKey } from '@shared/work';
import { SpaceIcon } from '../../shell/sidebar/SpaceIcon';

const invoke = window.orbit.invoke;

/** Tile sizes in the grid (brief M3; after UI REFERENCE S3): s 1×1, m 2×1, l 2×2. */
const SPAN: Record<Widget['size'], string> = {
  s: 'col-span-1 row-span-1',
  m: 'col-span-2 row-span-1',
  l: 'col-span-2 row-span-2',
};

/**
 * The Homepage's widgets (brief M3): a grid you arrange. Edit mode lets you drag to reorder,
 * change a widget's size, set it up, remove it, add more from a gallery, start from a preset or
 * reset. Today and Quote are drawn by the Homepage itself (`builtin`).
 */
export function WidgetGrid(props: {
  layout: HomeLayout;
  light: boolean;
  editing: boolean;
  onEditing: (on: boolean) => void;
  onLayout: (layout: HomeLayout) => void;
  builtin: (type: 'today' | 'quote') => ReactNode;
  glass: string;
  /** Whose layout: every Space's, or only this one's (brief M9). */
  scope: 'all' | 'space';
  spaceName: string;
  onScope: (scope: 'all' | 'space') => void;
}) {
  const { layout, editing } = props;
  const [adding, setAdding] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [setup, setSetup] = useState<string | null>(null);
  const data = useWidgetData(layout);

  const update = (id: string, patch: Partial<Widget>) =>
    props.onLayout({
      widgets: layout.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    });
  const setOptions = (id: string, options: WidgetOptions) => update(id, { options });

  return (
    <section
      className="flex flex-col items-center gap-4"
      aria-label="Widgets"
      data-testid="widgets"
    >
      {editing && (
        <div
          className={`flex flex-wrap items-center gap-2 rounded-full px-2 py-1.5 ${props.glass}`}
          data-testid="widgets-toolbar"
        >
          <BarButton onClick={() => setAdding((a) => !a)} testId="widgets-add" primary>
            <Plus size={15} /> Add Widget
          </BarButton>
          <label className="flex items-center gap-1.5 px-2 text-[13px] opacity-80">
            Start from
            <select
              value=""
              onChange={(e) => e.target.value && props.onLayout(layoutFromPreset(e.target.value))}
              className="rounded-full bg-white/10 px-2 py-1 text-[13px] outline-none"
              data-testid="widgets-preset"
            >
              <option value="">a preset…</option>
              {Object.entries(PRESETS).map(([key, p]) => (
                <option key={key} value={key}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <BarButton
            onClick={() => props.onLayout(layoutFromPreset('productivity'))}
            testId="widgets-reset"
            title="Back to the standard layout"
          >
            <RotateCcw size={14} /> Reset
          </BarButton>
          {props.spaceName && (
            <div
              className="flex rounded-full bg-white/10 p-0.5 text-[12.5px]"
              role="radiogroup"
              aria-label="Layout for"
              data-testid="widgets-scope"
            >
              {(
                [
                  ['all', 'All Spaces'],
                  ['space', `Only ${props.spaceName}`],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={props.scope === value}
                  onClick={() => props.scope !== value && props.onScope(value)}
                  className={`h-7 max-w-[160px] truncate rounded-full px-3 ${
                    props.scope === value
                      ? 'bg-white/25 font-semibold'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                  title={
                    value === 'all'
                      ? 'One layout for every Space'
                      : `${props.spaceName} keeps its own layout`
                  }
                  data-value={value}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <BarButton onClick={() => props.onEditing(false)} testId="widgets-done">
            <Check size={15} /> Done
          </BarButton>
        </div>
      )}
      {editing && adding && (
        <Gallery
          glass={props.glass}
          onAdd={(type) => {
            props.onLayout({ widgets: [...layout.widgets, newWidget(type)] });
            setAdding(false);
          }}
        />
      )}

      {layout.widgets.length === 0 ? (
        !editing && (
          <button
            type="button"
            onClick={() => props.onEditing(true)}
            className={`press rounded-full px-4 py-2 text-[13.5px] opacity-80 hover:opacity-100 ${props.glass}`}
            data-testid="widgets-empty"
          >
            <Plus size={14} className="mr-1 inline" /> Add widgets
          </button>
        )
      ) : (
        <div
          className="grid w-full max-w-[1120px] grid-flow-row-dense auto-rows-[172px] grid-cols-[repeat(auto-fill,172px)] justify-center gap-3.5"
          data-testid="widget-grid"
        >
          {layout.widgets.map((widget, index) => (
            <article
              key={widget.id}
              className={`group relative flex min-h-0 flex-col overflow-hidden rounded-[22px] p-4 ${SPAN[widget.size]} ${props.glass} ${
                editing ? 'cursor-grab ring-1 ring-white/30 ring-dashed' : ''
              } ${dragFrom === index ? 'opacity-40' : ''}`}
              draggable={editing}
              onDragStart={(e) => {
                setDragFrom(index);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => setDragFrom(null)}
              onDragOver={(e) => editing && dragFrom !== null && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null && dragFrom !== index) {
                  props.onLayout(moveWidget(layout, dragFrom, index));
                }
                setDragFrom(null);
              }}
              aria-label={WIDGETS[widget.type].name}
              data-testid="widget"
              data-type={widget.type}
              data-size={widget.size}
            >
              {editing && (
                <div
                  className="absolute top-2 right-2 z-10 flex gap-1"
                  data-testid="widget-controls"
                >
                  <GripVertical size={14} className="m-1 opacity-60" aria-hidden />
                  {hasSetup(widget.type) && (
                    <TileButton
                      label="Set Up"
                      onClick={() => setSetup(setup === widget.id ? null : widget.id)}
                      testId="widget-setup"
                    >
                      <Settings2 size={13} />
                    </TileButton>
                  )}
                  {WIDGETS[widget.type].sizes.length > 1 && (
                    <TileButton
                      label="Change Size"
                      onClick={() => update(widget.id, { size: nextSize(widget) })}
                      testId="widget-size"
                    >
                      <Maximize2 size={12} />
                    </TileButton>
                  )}
                  <TileButton
                    label="Remove"
                    onClick={() =>
                      props.onLayout({ widgets: layout.widgets.filter((w) => w.id !== widget.id) })
                    }
                    testId="widget-remove"
                  >
                    <X size={13} />
                  </TileButton>
                </div>
              )}
              {widget.type === 'today' || widget.type === 'quote' ? (
                props.builtin(widget.type)
              ) : (
                <WidgetBody
                  widget={widget}
                  data={data}
                  setupOpen={setup === widget.id || needsSetup(widget)}
                  onOptions={(o) => {
                    setOptions(widget.id, o);
                    setSetup(null);
                  }}
                />
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

const hasSetup = (type: WidgetType) =>
  type === 'weather' || type === 'countdown' || type === 'clocks';
const needsSetup = (w: Widget) =>
  (w.type === 'weather' && !w.options.place) || (w.type === 'countdown' && !w.options.date);

function Gallery({ onAdd, glass }: { onAdd: (type: WidgetType) => void; glass: string }) {
  return (
    <div
      className={`grid w-full max-w-[720px] grid-cols-2 gap-1.5 rounded-[22px] p-3 sm:grid-cols-3 ${glass}`}
      data-testid="widget-gallery"
    >
      {WIDGET_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => onAdd(type)}
          className="press flex flex-col items-start rounded-[14px] px-3 py-2 text-left hover:bg-white/10"
          data-testid="gallery-item"
          data-type={type}
        >
          <span className="text-[14px] font-semibold">{WIDGETS[type].name}</span>
          <span className="text-[12px] opacity-65">{WIDGETS[type].description}</span>
        </button>
      ))}
    </div>
  );
}

function BarButton(props: {
  onClick: () => void;
  children: ReactNode;
  testId: string;
  primary?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      title={props.title}
      className={`press flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium ${
        props.primary ? 'bg-[#0a84ff] text-on-accent' : 'hover:bg-white/10'
      }`}
      data-testid={props.testId}
    >
      {props.children}
    </button>
  );
}

function TileButton(props: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  testId: string;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      className="press grid size-6 place-items-center rounded-full bg-black/45 text-white hover:bg-black/65"
      data-testid={props.testId}
    >
      {props.children}
    </button>
  );
}

/** The work widgets' data, fetched when the page opens or regains focus. */
function useWidgetData(layout: HomeLayout): WidgetData | null {
  const [data, setData] = useState<WidgetData | null>(null);
  const wants = layout.widgets.some((w) =>
    ['projects', 'notes', 'recent', 'apps', 'spaces'].includes(w.type),
  );
  useEffect(() => {
    if (!wants) return;
    const load = () => void invoke('newtab:widgetData', {}).then(setData);
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [wants]);
  return data;
}

/** A widget's heading (UI spec §9): an icon, its name, and an action on the right. */
function Title({
  children,
  action,
  icon,
}: {
  children: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <h3 className="mb-1.5 flex items-center gap-2 text-[13.5px] leading-[18px] font-semibold tracking-[-0.005em]">
      {icon && <span className="grid shrink-0 place-items-center opacity-85">{icon}</span>}
      <span className="flex-1">{children}</span>
      {action && <span className="text-[12px] font-medium opacity-70">{action}</span>}
    </h3>
  );
}

function WidgetBody(props: {
  widget: Widget;
  data: WidgetData | null;
  setupOpen: boolean;
  onOptions: (options: WidgetOptions) => void;
}) {
  const { widget } = props;
  switch (widget.type) {
    case 'focus':
      return <FocusWidget size={widget.size} />;
    case 'projects':
      return <ProjectsWidget data={props.data} />;
    case 'notes':
      return <NotesWidget data={props.data} />;
    case 'recent':
      return <RecentWidget data={props.data} />;
    case 'weather':
      return (
        <WeatherWidget widget={widget} setupOpen={props.setupOpen} onOptions={props.onOptions} />
      );
    case 'countdown':
      return (
        <CountdownWidget widget={widget} setupOpen={props.setupOpen} onOptions={props.onOptions} />
      );
    case 'clocks':
      return (
        <ClocksWidget widget={widget} setupOpen={props.setupOpen} onOptions={props.onOptions} />
      );
    case 'stopwatch':
      return <StopwatchWidget />;
    case 'palette':
      return <PaletteWidget size={widget.size} />;
    case 'apps':
      return <AppsWidget data={props.data} />;
    case 'spaces':
      return <SpacesWidget data={props.data} />;
    case 'ask':
      return <AskWidget />;
    case 'drive':
      return <DriveWidget />;
    default:
      return null;
  }
}

/** Your favourites (this Space's): each opens where it's set to — a tab, the panel, a window. */
function AppsWidget({ data }: { data: WidgetData | null }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="apps-widget">
      <Title icon={<LayoutGrid size={16} />}>Quick Access</Title>
      {data && data.apps.length === 0 && (
        <Empty>Add favourites (or Settings → Apps) to keep them here.</Empty>
      )}
      <ul className="grid min-h-0 grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1 overflow-y-auto">
        {data?.apps.map((app) => (
          <li key={app.id}>
            <button
              type="button"
              onClick={() => void invoke('newtab:open', { kind: 'app', id: app.id })}
              className="press flex w-full flex-col items-center gap-1 rounded-[12px] px-1 py-2 hover:bg-white/10"
              title={
                app.openIn === 'panel'
                  ? `${app.title} — opens beside the page`
                  : app.openIn === 'window'
                    ? `${app.title} — opens in a window`
                    : app.title
              }
              data-testid="apps-widget-item"
            >
              <span className="grid size-9 place-items-center rounded-[10px] bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)]">
                {app.favicon ? (
                  <img src={app.favicon} alt="" className="size-5" />
                ) : (
                  <span className="text-[14px] font-semibold text-neutral-600">
                    {app.title.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </span>
              <span className="w-full truncate text-center text-[11.5px] opacity-80">
                {app.title}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The profile's Spaces: one click goes there. */
function SpacesWidget({ data }: { data: WidgetData | null }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="spaces-widget">
      <Title icon={<Cloud size={16} />}>Spaces</Title>
      <ul className="flex min-h-0 flex-wrap gap-1.5 overflow-y-auto">
        {data?.spaces.map((space) => (
          <li key={space.id}>
            <button
              type="button"
              disabled={space.active}
              onClick={() => void invoke('newtab:open', { kind: 'space', id: space.id })}
              className={`press flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] ${
                space.active ? 'bg-white/25 font-semibold' : 'bg-white/10 hover:bg-white/20'
              }`}
              data-testid="spaces-widget-item"
            >
              <SpaceIcon icon={space.icon} size={13} />
              <span className="max-w-[120px] truncate">{space.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ask Orbit AI from the Homepage — typed, or spoken with the microphone (push-to-talk). */
function AskWidget() {
  const [text, setText] = useState('');
  const ask = () => {
    const question = text.trim();
    if (!question) return;
    void invoke('newtab:ask', { text: question });
    setText('');
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="ask-widget">
      <Title icon={<Sparkles size={16} />}>Ask Orbit</Title>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Summarize this page, plan my week…"
          aria-label="Ask Orbit AI"
          className={inputClass}
          data-testid="ask-widget-input"
        />
        <button
          type="button"
          aria-label="Speak (⇧⌘Space)"
          title="Speak (⇧⌘Space)"
          onClick={() => void invoke('voice:toggle', {})}
          className="press grid size-8 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20"
          data-testid="ask-widget-voice"
        >
          <Mic size={15} />
        </button>
      </form>
      <p className="mt-2 text-[12px] opacity-60">
        Answers open in the panel. Orbit AI sees only what you attach or allow (Settings → AI).
      </p>
    </div>
  );
}

type DriveFile = { id: string; name: string; kind: string; edited: string; url: string };

/** Google Drive's files edited lately (when it's connected; asked of Drive when shown). */
function DriveWidget() {
  const [files, setFiles] = useState<DriveFile[] | null | undefined>(undefined);
  useEffect(() => {
    const load = () => void invoke('newtab:driveRecent', {}).then(setFiles);
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, []);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="drive-widget">
      <Title icon={<HardDrive size={16} />}>Google Drive</Title>
      {files === null && (
        <Empty>
          <button
            type="button"
            onClick={() => void invoke('newtab:open', { kind: 'settings', id: 'integrations' })}
            className="underline decoration-white/40 underline-offset-2 hover:decoration-white"
            data-testid="drive-widget-connect"
          >
            Connect Google Drive
          </button>{' '}
          to see files you edited lately.
        </Empty>
      )}
      {files && files.length === 0 && <Empty>No files yet.</Empty>}
      <ul className="flex min-h-0 flex-col overflow-y-auto">
        {files?.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              onClick={() => void invoke('newtab:navigate', { input: f.url })}
              className="flex w-full items-center gap-2 rounded-[8px] py-1 text-left text-[14px] hover:bg-white/10"
              title={f.url}
              data-testid="drive-widget-item"
            >
              <FileText size={14} className="shrink-0 opacity-60" />
              <span className="flex-1 truncate">{f.name}</span>
              <span className="shrink-0 text-[12px] opacity-55">
                {f.kind}
                {f.edited ? ` · ${f.edited.replace('edited ', '')}` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function useTick(ms: number, on = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms, on]);
  return now;
}

/** The existing focus timer and sounds (no second timer): their state, read every second. */
function FocusWidget({ size }: { size: Widget['size'] }) {
  const [session, setSession] = useState<FocusSession | null>(null);
  const [sounds, setSounds] = useState<SoundState | null>(null);
  const [todayMs, setTodayMs] = useState(0);
  const now = useTick(1000);
  useEffect(() => {
    void invoke('focus:view', {}).then((view) => {
      setSession(view.session);
      setSounds(view.sounds);
      setTodayMs(view.history.todayMs);
    });
  }, [now]);
  const left = session ? focusRemaining(session, now) : null;
  const paused = session?.pausedAt != null;
  return (
    <div className="flex h-full flex-col" data-testid="focus-widget">
      <Title
        icon={<Target size={16} />}
        action={
          todayMs >= 60_000 ? (
            <span className="normal-case" data-testid="focus-widget-today">
              {focusTotal(todayMs)} today
            </span>
          ) : undefined
        }
      >
        {session ? (session.kind === 'break' ? 'Break' : 'Your Focus') : 'Your Focus'}
      </Title>
      <div className="flex flex-1 items-center gap-4">
        <div className="min-w-0 flex-1">
          <div
            className="text-[38px] leading-none font-semibold tabular-nums"
            data-testid="focus-widget-clock"
          >
            {left !== null ? focusClock(left) : '25:00'}
          </div>
          <div className="mt-1 truncate text-[13px] opacity-70">
            {session ? session.title : 'Ready when you are'}
          </div>
        </div>
        {size === 'm' && sounds && (
          <button
            type="button"
            onClick={() => {
              const done = sounds.playing
                ? invoke('sounds:pause', { paused: !sounds.paused })
                : invoke('sounds:play', { id: 'rain' });
              void done.then(() => invoke('sounds:get', {}).then(setSounds));
            }}
            className="press flex max-w-[140px] items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[12.5px] hover:bg-white/20"
            data-testid="focus-widget-sound"
          >
            {sounds.playing && !sounds.paused ? <Pause size={13} /> : <Play size={13} />}
            <span className="truncate">{sounds.playing ? soundName(sounds.playing) : 'Rain'}</span>
          </button>
        )}
      </div>
      <div className="flex gap-1.5">
        {session ? (
          <>
            <SmallPill
              onClick={() => void invoke('focus:pause', { paused: !paused })}
              testId="focus-widget-pause"
            >
              {paused ? <Play size={13} /> : <Pause size={13} />} {paused ? 'Resume' : 'Pause'}
            </SmallPill>
            <SmallPill
              onClick={() => void invoke('focus:end', { complete: false })}
              testId="focus-widget-end"
            >
              <Square size={11} /> End
            </SmallPill>
          </>
        ) : (
          <SmallPill
            onClick={() => void invoke('focus:start', {})}
            testId="focus-widget-start"
            primary
          >
            <Play size={13} /> Start Focus
          </SmallPill>
        )}
      </div>
    </div>
  );
}

function SmallPill(props: {
  onClick: () => void;
  children: ReactNode;
  testId: string;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`press flex h-7 items-center gap-1 rounded-full px-3 text-[12.5px] font-medium ${
        props.primary ? 'bg-[#0a84ff] text-on-accent' : 'bg-white/10 hover:bg-white/20'
      }`}
      data-testid={props.testId}
    >
      {props.children}
    </button>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-[13px] opacity-60">{children}</p>;
}

function ProjectsWidget({ data }: { data: WidgetData | null }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="projects-widget">
      <Title icon={<FolderClosed size={16} />}>Projects</Title>
      {data && data.projects.length === 0 && <Empty>No active projects.</Empty>}
      <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto">
        {data?.projects.map((p) => {
          const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => void invoke('newtab:open', { kind: 'project', id: p.id })}
                className="flex w-full flex-col gap-1 text-left"
                data-testid="projects-widget-item"
              >
                <span className="flex items-center gap-2 text-[14px]">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: p.color }}
                  />
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="text-[12px] tabular-nums opacity-65">
                    {p.done}/{p.total}
                  </span>
                </span>
                <span className="h-1 overflow-hidden rounded-full bg-white/15">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${pct}%`, background: p.color }}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const ago = (t: number) => {
  const min = Math.round((Date.now() - t) / 60_000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  if (min < 60 * 24) return `${Math.round(min / 60)}h`;
  return `${Math.round(min / 1440)}d`;
};

function NotesWidget({ data }: { data: WidgetData | null }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="notes-widget">
      <Title icon={<NotebookPen size={16} />}>Notes</Title>
      {data && data.notes.length === 0 && <Empty>No notes yet.</Empty>}
      <ul className="flex min-h-0 flex-col overflow-y-auto">
        {data?.notes.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => void invoke('newtab:open', { kind: 'note', id: n.id })}
              className="flex w-full items-center gap-2 rounded-[8px] py-1 text-left text-[14px] hover:bg-white/10"
              data-testid="notes-widget-item"
            >
              <span className="flex-1 truncate">{n.title || 'Untitled'}</span>
              <span className="text-[12px] opacity-55">{ago(n.updatedAt)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecentWidget({ data }: { data: WidgetData | null }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="recent-widget">
      <Title icon={<History size={16} />}>Recent</Title>
      {data && data.recent.length === 0 && <Empty>Pages you open show here.</Empty>}
      <ul className="flex min-h-0 flex-col overflow-y-auto">
        {data?.recent.map((r) => (
          <li key={r.url}>
            <button
              type="button"
              onClick={() => void invoke('newtab:navigate', { input: r.url })}
              className="flex w-full items-center gap-2 rounded-[8px] py-1 text-left text-[14px] hover:bg-white/10"
              title={r.url}
              data-testid="recent-widget-item"
            >
              {r.favicon ? (
                <img src={r.favicon} alt="" className="size-4 shrink-0 rounded-[4px]" />
              ) : (
                <span className="size-4 shrink-0 rounded-[4px] bg-white/20" />
              )}
              <span className="truncate">{r.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const inputClass =
  'h-8 w-full min-w-0 rounded-[10px] bg-white/10 px-2.5 text-[13px] outline-none ring-1 ring-white/15 placeholder:opacity-50 focus:ring-white/40';

function WeatherWidget(props: {
  widget: Widget;
  setupOpen: boolean;
  onOptions: (o: WidgetOptions) => void;
}) {
  const { place, units = 'c' } = props.widget.options;
  const [weather, setWeather] = useState<Weather | null>(null);
  const [error, setError] = useState('');
  const tick = useTick(20 * 60_000, place !== undefined);
  useEffect(() => {
    if (!place) return;
    invoke('newtab:weather', { place, units }).then(
      (w) => {
        setWeather(w);
        setError('');
      },
      (e: unknown) => setError(String(e instanceof Error ? e.message : e).replace(/^.*?: /, '')),
    );
  }, [place, units, tick]);

  if (props.setupOpen || !place) {
    return <PlaceSearch current={props.widget.options} onOptions={props.onOptions} />;
  }
  const label = weather ? weatherLabel(weather.code) : null;
  return (
    <div className="flex h-full flex-col" data-testid="weather-widget">
      <Title>{place.name}</Title>
      {error && !weather && <Empty>{error}</Empty>}
      {weather && label && (
        <>
          <div className="flex items-center gap-3">
            <span
              className="text-[42px] leading-none font-semibold tabular-nums"
              data-testid="weather-temp"
            >
              {weather.temperature}°
            </span>
            <span className="text-[30px]" aria-hidden>
              {label.icon}
            </span>
          </div>
          <div className="mt-1 text-[13px] opacity-75" data-testid="weather-text">
            {label.text}
            <span className="block opacity-80">
              H {weather.high}° · L {weather.low}°
            </span>
          </div>
          {props.widget.size === 'm' && (
            <div className="mt-auto flex justify-between text-center text-[12px]">
              {weather.hours.map((h) => (
                <span key={h.time} className="flex flex-col">
                  <span className="opacity-60">{h.time}</span>
                  <span aria-hidden>{weatherLabel(h.code).icon}</span>
                  <span>{h.temperature}°</span>
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PlaceSearch(props: { current: WidgetOptions; onOptions: (o: WidgetOptions) => void }) {
  const [query, setQuery] = useState(props.current.place?.name ?? '');
  const [found, setFound] = useState<Place[] | null>(null);
  const [error, setError] = useState('');
  const units = props.current.units ?? 'c';
  const search = () => {
    if (query.trim().length < 2) return;
    setError('');
    invoke('newtab:findPlace', { query: query.trim() }).then(setFound, (e: unknown) =>
      setError(String(e instanceof Error ? e.message : e).replace(/^.*?: /, '')),
    );
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" data-testid="weather-setup">
      <Title icon={<CloudSun size={16} />}>Weather</Title>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Your city"
          className={inputClass}
          data-testid="weather-city"
        />
        <button type="submit" className="rounded-[10px] bg-white/15 px-2.5 text-[13px]">
          Find
        </button>
      </form>
      <div className="flex items-center gap-2 text-[12px] opacity-75">
        <span>Only the city’s name goes to Open-Meteo.</span>
        <button
          type="button"
          onClick={() => props.onOptions({ ...props.current, units: units === 'c' ? 'f' : 'c' })}
          className="ml-auto rounded-full bg-white/10 px-2 py-0.5"
          data-testid="weather-units"
        >
          °{units.toUpperCase()}
        </button>
      </div>
      {error && <Empty>{error}</Empty>}
      <ul className="min-h-0 overflow-y-auto">
        {found?.length === 0 && <Empty>No city by that name.</Empty>}
        {found?.map((p) => (
          <li key={`${p.latitude},${p.longitude}`}>
            <button
              type="button"
              onClick={() => props.onOptions({ ...props.current, place: p })}
              className="w-full truncate rounded-[8px] px-1.5 py-1 text-left text-[13px] hover:bg-white/10"
              data-testid="weather-place"
            >
              {p.name} <span className="opacity-60">{p.country}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CountdownWidget(props: {
  widget: Widget;
  setupOpen: boolean;
  onOptions: (o: WidgetOptions) => void;
}) {
  const { title = '', date } = props.widget.options;
  const [draft, setDraft] = useState({ title, date: date ?? '' });
  const today = dateKey(new Date(useTick(60_000)));
  if (props.setupOpen || !date) {
    return (
      <form
        className="flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.date) props.onOptions({ title: draft.title.trim(), date: draft.date });
        }}
        data-testid="countdown-setup"
      >
        <Title icon={<CalendarClock size={16} />}>Countdown</Title>
        <input
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          placeholder="What’s coming up"
          maxLength={60}
          className={inputClass}
          data-testid="countdown-title"
        />
        <input
          type="date"
          value={draft.date}
          onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          className={inputClass}
          data-testid="countdown-date"
        />
        <button
          type="submit"
          className="mt-1 h-7 rounded-full bg-[#0a84ff] text-[12.5px] font-medium text-on-accent"
          data-testid="countdown-save"
        >
          Save
        </button>
      </form>
    );
  }
  const days = daysUntil(date, today);
  const when = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  return (
    <div
      className="flex h-full flex-col items-center justify-center text-center"
      data-testid="countdown-widget"
    >
      <div className="truncate text-[13px] font-medium opacity-75">{title || 'Countdown'}</div>
      <div
        className="text-[40px] leading-tight font-semibold tabular-nums"
        data-testid="countdown-days"
      >
        {days === 0 ? 'Today' : days > 0 ? `D-${days}` : `${-days}d ago`}
      </div>
      <div className="text-[12.5px] opacity-60">{when}</div>
    </div>
  );
}

/** A few time zones people pick; any IANA zone works. */
const ZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Africa/Lagos',
  'Africa/Accra',
  'Africa/Johannesburg',
  'Africa/Nairobi',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
];
const DEFAULT_ZONES = ['Europe/London', 'America/New_York', 'Asia/Tokyo'];
const cityOf = (zone: string) => zone.split('/').pop()!.replace(/_/g, ' ');

function ClocksWidget(props: {
  widget: Widget;
  setupOpen: boolean;
  onOptions: (o: WidgetOptions) => void;
}) {
  const zones = props.widget.options.zones ?? DEFAULT_ZONES;
  const now = useTick(15_000);
  const shown = props.widget.size === 'l' ? zones : zones.slice(0, 3);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="clocks-widget">
      <Title icon={<Globe2 size={16} />}>World Clocks</Title>
      {props.setupOpen && (
        <div className="mb-2 flex flex-wrap gap-1" data-testid="clocks-setup">
          {zones.map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => props.onOptions({ zones: zones.filter((x) => x !== z) })}
              className="rounded-full bg-white/10 px-2 py-0.5 text-[12px] hover:bg-white/20"
              title="Remove"
            >
              {cityOf(z)} ×
            </button>
          ))}
          {zones.length < 8 && (
            <select
              value=""
              onChange={(e) =>
                e.target.value && props.onOptions({ zones: [...zones, e.target.value] })
              }
              className="rounded-full bg-white/10 px-2 py-0.5 text-[12px] outline-none"
              data-testid="clocks-add"
            >
              <option value="">+ City</option>
              {ZONES.filter((z) => !zones.includes(z)).map((z) => (
                <option key={z} value={z}>
                  {cityOf(z)}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      <ul className={`grid gap-2 ${props.widget.size === 'l' ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {shown.map((zone) => {
          const time = new Date(now).toLocaleTimeString(undefined, {
            timeZone: zone,
            hour: 'numeric',
            minute: '2-digit',
          });
          const day = new Date(now).toLocaleDateString(undefined, {
            timeZone: zone,
            weekday: 'short',
          });
          return (
            <li key={zone} className="min-w-0" data-testid="world-clock">
              <div className="truncate text-[12.5px] opacity-70">{cityOf(zone)}</div>
              <div className="text-[20px] leading-tight font-semibold tabular-nums">{time}</div>
              <div className="text-[11.5px] opacity-50">{day}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StopwatchWidget() {
  const [started, setStarted] = useState<number | null>(null);
  const [kept, setKept] = useState(0);
  const now = useTick(100, started !== null);
  const total = kept + (started !== null ? now - started : 0);
  const s = Math.floor(total / 1000);
  const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.${Math.floor((total % 1000) / 100)}`;
  return (
    <div className="flex h-full flex-col" data-testid="stopwatch-widget">
      <Title icon={<Timer size={16} />}>Stopwatch</Title>
      <div
        className="flex flex-1 items-center text-[32px] font-semibold tabular-nums"
        data-testid="stopwatch-time"
      >
        {text}
      </div>
      <div className="flex gap-1.5">
        <SmallPill
          primary={started === null}
          onClick={() => {
            if (started === null) setStarted(Date.now());
            else {
              setKept(kept + Date.now() - started);
              setStarted(null);
            }
          }}
          testId="stopwatch-toggle"
        >
          {started === null ? <Play size={13} /> : <Pause size={13} />}
          {started === null ? 'Start' : 'Stop'}
        </SmallPill>
        {total > 0 && started === null && (
          <SmallPill onClick={() => setKept(0)} testId="stopwatch-reset">
            Reset
          </SmallPill>
        )}
      </div>
    </div>
  );
}

/** A palette for the day (the same all day), or a new one on Shuffle; a click copies. */
function PaletteWidget({ size }: { size: Widget['size'] }) {
  const [seed, setSeed] = useState(() => {
    const d = new Date();
    return d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate();
  });
  const [copied, setCopied] = useState<string | null>(null);
  const copiedTimer = useRef<number | undefined>(undefined);
  const hue = (seed * 137.5) % 360;
  const mode = HARMONIES[seed % HARMONIES.length]!;
  const colors = harmony({ ...hslToRgb(hue, 62, 55), a: 1 }, mode);
  return (
    <div className="flex h-full flex-col" data-testid="palette-widget">
      <Title
        action={
          <button
            type="button"
            onClick={() => setSeed((n) => n + 1)}
            aria-label="Shuffle"
            title="Shuffle"
            className="rounded-full p-1 opacity-80 hover:bg-white/10"
            data-testid="palette-widget-shuffle"
          >
            <Shuffle size={13} />
          </button>
        }
      >
        Palette
      </Title>
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-[12px]">
        {colors.map((c, i) => (
          <button
            key={`${c}-${i}`}
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(c);
              setCopied(c);
              window.clearTimeout(copiedTimer.current);
              copiedTimer.current = window.setTimeout(() => setCopied(null), 1200);
            }}
            title={`Copy ${c}`}
            className="group relative flex-1"
            style={{ background: c }}
            data-testid="palette-widget-color"
          >
            {size === 'm' && (
              <span className="absolute inset-x-0 bottom-1 font-mono text-[10px] text-white opacity-0 mix-blend-difference group-hover:opacity-100">
                {copied === c ? <Copy size={10} className="mx-auto" /> : c}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
