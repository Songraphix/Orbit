import {
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  Bug,
  Camera,
  Check,
  ChevronDown,
  Link2,
  Lock,
  Mic,
  NotebookPen,
  PanelLeft,
  Pause,
  Play,
  RotateCw,
  SlidersHorizontal,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { formatAddress } from '@shared/format-address';
import type { FindState } from '@shared/types/find';
import type { Rect } from '@shared/types/layout';
import { NEW_TAB_URL } from '@shared/types/tabs';
import type { TabState } from '@shared/types/tabs';
import { FindBar } from './FindBar';
import { Tip } from '../tooltip/Tip';
import { FocusPill } from './FocusPill';
import { useMainState } from './use-main-state';
import { useUiPrefs } from '../ui/prefs-store';
import { isShown } from '@shared/ui-prefs';
import { soundName } from '@shared/sounds';
import type { FocusSession } from '@shared/focus';
import type { ProfileView } from '@shared/profile';
import { Avatar } from '../profile/Avatar';
import { OrbitMark } from './OrbitMark';

const TOAST_MS = 1600;
const invoke = window.orbit.invoke;

/** Short confirmations from main ("Copied link", "Zoom 120%"), shown beside the address. */
function useToast(): string | null {
  const [toast, setToast] = useState<{ message: string; at: number } | null>(null);
  useEffect(() => window.orbit.on('toast:show', setToast), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);
  return toast?.message ?? null;
}

type NavAction = 'back' | 'forward' | 'reload' | 'stop';

const anchorOf = (event: ReactMouseEvent<HTMLElement>) => {
  const r = event.currentTarget.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
};

/** The window's tools on the right (UI spec §5): Focus, Orbit AI, Notes, then your profile. */
export type ToolsProps = {
  notesOpen: boolean;
  assistant: boolean;
  profile: ProfileView | null | undefined;
  focus: FocusSession | null;
};

/**
 * The toolbar row on the canvas (UI spec §5, UI 1 and UI 2): the traffic lights' room, the
 * Orbit menu, back / forward / reload in one glass pill, the address in a wide light pill (the
 * page's own actions at its end), and the tools on the right. With tabs on top it's the second
 * row over the page (`compact`: no menu and no tools — the tab row has them).
 */
export function Toolbar(props: {
  rect: Rect;
  /** Where the page's card starts (the nav pill lines up with it when there's room). */
  contentX: number;
  tab: TabState | null;
  find: FindState | null;
  /** The row starts at the window's left edge: leave room for the traffic lights. */
  lights: boolean;
  /** Show the Orbit menu here (not when the sidebar holds it). */
  menu: boolean;
  /** The sidebar is hidden (a Show Sidebar button), shown (Hide), or not ours to toggle. */
  sidebar: 'shown' | 'hidden' | null;
  /** The second row under the tabs: just navigation and the address. */
  compact?: boolean;
  tools: ToolsProps;
}) {
  const { rect, tab } = props;
  const toast = useToast();
  const prefs = useUiPrefs();
  const navigate = (action: NavAction) => {
    if (tab) void invoke('tabs:navigate', { tabId: tab.id, action });
  };
  // The left group reaches the page's edge so the nav pill lines up with the card below — when
  // the window is wide enough; a narrow one gives the address the room instead.
  const roomy = rect.width - (props.contentX - rect.x) >= 760;
  const leftWidth = roomy ? Math.max(0, props.contentX - rect.x - 10) : 0;
  const narrow = rect.width < 900;

  return (
    <div
      className="drag-region absolute flex items-center gap-2 pr-2.5 text-[var(--fg)]"
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
      onContextMenu={(e) => {
        // Tabs, apps and text fields have their own menus.
        if (e.defaultPrevented || (e.target as HTMLElement).closest('input, textarea')) return;
        e.preventDefault();
        void invoke('toolbar:menu', {});
      }}
      data-testid="toolbar"
    >
      <div
        className="flex shrink-0 items-center gap-1.5"
        style={{
          minWidth: props.compact ? undefined : leftWidth,
          paddingLeft: props.lights ? 84 : 10,
        }}
      >
        {props.menu && <OrbitMenuButton compact={narrow} />}
        {props.sidebar && (
          <ToolbarButton
            label={props.sidebar === 'hidden' ? 'Show Sidebar' : 'Hide Sidebar'}
            keys="⌘S"
            onClick={() => void invoke('sidebar:toggle', {})}
            testId={props.sidebar === 'hidden' ? 'toolbar-sidebar' : 'sidebar-toggle'}
          >
            <PanelLeft size={16} />
          </ToolbarButton>
        )}
      </div>
      <div
        className="no-drag mat-light flex h-9 shrink-0 items-center gap-0.5 rounded-full px-1"
        data-testid="nav-pill"
      >
        <ToolbarButton
          label="Back"
          keys="⌘["
          anim="nudge-left"
          disabled={!tab?.canGoBack}
          onClick={() => navigate('back')}
          testId="toolbar-back"
        >
          <ArrowLeft size={16} />
        </ToolbarButton>
        <ToolbarButton
          label="Forward"
          keys="⌘]"
          anim="nudge-right"
          disabled={!tab?.canGoForward}
          onClick={() => navigate('forward')}
          testId="toolbar-forward"
        >
          <ArrowRight size={16} />
        </ToolbarButton>
        <ToolbarButton
          label={tab?.isLoading ? 'Stop' : 'Reload'}
          keys={tab?.isLoading ? undefined : '⌘R'}
          anim={tab?.isLoading ? undefined : 'spin'}
          disabled={!tab}
          onClick={() => navigate(tab?.isLoading ? 'stop' : 'reload')}
          testId="toolbar-reload"
        >
          {tab?.isLoading ? <X size={16} /> : <RotateCw size={15} />}
        </ToolbarButton>
      </div>

      {props.find?.open ? (
        <FindBar state={props.find} />
      ) : (
        <AddressPill tab={tab} toast={toast} prefs={prefs} />
      )}

      {!props.compact && <Tools {...props.tools} />}
    </div>
  );
}

/** The address (UI spec §5): prominent but light; a click edits it in the command bar. */
function AddressPill({
  tab,
  toast,
  prefs,
}: {
  tab: TabState | null;
  toast: string | null;
  prefs: ReturnType<typeof useUiPrefs>;
}) {
  const home = !tab || tab.url === NEW_TAB_URL;
  const address = tab && !home ? formatAddress(tab.url, tab.title) : null;
  const web = tab?.kind === 'web';
  return (
    <div
      className="no-drag mat-light @container relative flex h-9 min-w-0 flex-1 items-center gap-0.5 overflow-hidden rounded-full pr-1"
      data-testid="address-pill"
    >
      <button
        type="button"
        className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-full pl-3.5 text-left text-[13.5px] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
        title={tab?.url}
        onClick={() => void invoke('commandbar:open', { mode: home ? 'new' : 'edit' })}
        data-testid="toolbar-address"
      >
        {home || !address ? (
          <>
            <Sparkles size={15} className="shrink-0 text-[var(--fg-muted)]" />
            <span className="truncate text-[var(--fg-faint)]">Search or enter a website…</span>
          </>
        ) : tab?.devMode ? (
          <span className="truncate font-mono text-[12px]" data-testid="toolbar-full-url">
            {tab.url}
          </span>
        ) : (
          <>
            {address.domain && address.secure ? (
              <Lock size={13} className="shrink-0 text-[var(--fg-muted)]" aria-label="Secure" />
            ) : (
              <Sparkles size={15} className="shrink-0 text-[var(--fg-muted)]" />
            )}
            {address.domain && <span className="shrink-0 font-medium">{address.domain}</span>}
            {address.domain && address.title && (
              <span className="shrink-0 text-[var(--fg-faint)]">/</span>
            )}
            {address.title && (
              <span className="truncate text-[var(--fg-muted)]">{address.title}</span>
            )}
          </>
        )}
      </button>
      {toast && (
        <div
          key={toast}
          className="animate-pop pointer-events-none flex h-7 shrink-0 origin-right items-center gap-1.5 rounded-full bg-[rgb(28_27_34/0.9)] pr-2.5 pl-1.5 text-[12.5px] font-medium text-white"
          role="status"
          data-testid="toolbar-toast"
        >
          <span className="grid size-4 place-items-center rounded-full bg-[var(--accent-fill)]">
            <Check size={10} strokeWidth={3} />
          </span>
          {toast}
        </div>
      )}
      {web && (
        // A narrow pill keeps the address readable: these stay in the menus and shortcuts.
        <span className="contents @max-[26rem]:hidden">
          <CopyLink />
        </span>
      )}
      {tab?.devMode && (
        <ToolbarButton
          label={`Developer Tools${tab.consoleErrors ? ` (${tab.consoleErrors} errors)` : ''}`}
          onClick={() => void invoke('tabs:devtools', { tabId: tab.id })}
          testId="toolbar-devtools"
        >
          <span className="relative">
            <Bug size={15} />
            {tab.consoleErrors > 0 && (
              <span
                className="absolute -top-1.5 -right-2 min-w-3.5 rounded-full bg-red-500 px-1 text-[9px] leading-3.5 font-semibold text-white"
                data-testid="toolbar-errors"
              >
                {tab.consoleErrors > 99 ? '99+' : tab.consoleErrors}
              </span>
            )}
          </span>
        </ToolbarButton>
      )}
      {web && (
        <ToolbarButton
          label="Site Controls"
          onClick={(event) => void invoke('sitecontrols:open', { anchor: anchorOf(event) })}
          testId="toolbar-site-controls"
        >
          <SlidersHorizontal size={15} />
        </ToolbarButton>
      )}
      {web && isShown(prefs, 'screenshot') && (
        <span className="contents @max-[30rem]:hidden">
          <ToolbarButton
            label="Take Screenshot"
            keys="⇧⌘2"
            anim="pop"
            onClick={() => void invoke('shot:start', {})}
            testId="toolbar-screenshot"
          >
            <Camera size={15} />
          </ToolbarButton>
        </span>
      )}
      {web && isShown(prefs, 'capture') && (
        <span className="contents @max-[30rem]:hidden">
          <ToolbarButton
            label="Save to Orbit"
            keys="⇧⌘S"
            anim="pop"
            onClick={() => void invoke('capture:open', {})}
            testId="toolbar-capture"
          >
            <BookmarkPlus size={15} />
          </ToolbarButton>
        </span>
      )}
      {tab?.isLoading && (
        <div
          className="pointer-events-none absolute inset-x-4 bottom-0 h-[2px] overflow-hidden rounded-full"
          data-testid="toolbar-loading"
          role="progressbar"
          aria-label="Loading"
        >
          <div className="h-full w-1/3 animate-[orbit-loading_1.1s_ease-in-out_infinite] rounded-full bg-[var(--canvas-accent,var(--accent))]" />
        </div>
      )}
    </div>
  );
}

/** Copies the page's address (one click; a check and a "Copied link" toast answer). */
function CopyLink() {
  const [copiedAt, setCopiedAt] = useState(0);
  useEffect(() => {
    if (!copiedAt) return;
    const timer = setTimeout(() => setCopiedAt(0), 1400);
    return () => clearTimeout(timer);
  }, [copiedAt]);
  return (
    <ToolbarButton
      label="Copy Link"
      keys="⇧⌘C"
      onClick={() => {
        void invoke('tabs:copyUrl', {});
        setCopiedAt(Date.now());
      }}
      testId="address-copy"
    >
      {copiedAt ? (
        <span key={copiedAt} className="anim-pop grid">
          <Check size={15} strokeWidth={2.6} />
        </span>
      ) : (
        <Link2 size={15} />
      )}
    </ToolbarButton>
  );
}

/** "◯ Orbit ⌄" (UI spec §5): Orbit's own menu — Home, the command bar, Spaces, profiles… */
export function OrbitMenuButton({ compact = false }: { compact?: boolean }) {
  return (
    <Tip label="Orbit Menu">
      <button
        type="button"
        aria-label="Orbit menu"
        aria-haspopup="menu"
        onClick={(event) => void invoke('orbitmenu:open', { anchor: anchorOf(event) })}
        className="no-drag lift mat-light flex h-9 shrink-0 items-center gap-2 rounded-full pr-2.5 pl-2 text-[14px] font-semibold"
        data-testid="orbit-menu-button"
      >
        <OrbitMark size={20} />
        {!compact && 'Orbit'}
        <ChevronDown size={14} className="text-[var(--fg-muted)]" />
      </button>
    </Tip>
  );
}

/** The tools on the right: "Hey Orbit", the focus session, Focus, Orbit AI, Notes, profile. */
export function Tools({ notesOpen, assistant, profile, focus }: ToolsProps) {
  const prefs = useUiPrefs();
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <WakeIndicator />
      {focus && <FocusPill session={focus} />}
      <div className="no-drag mat-light flex h-9 items-center gap-0.5 rounded-full px-1">
        {isShown(prefs, 'focus') && <FocusButton />}
        {assistant && isShown(prefs, 'assistant') && (
          <ToolbarButton
            label="Ask Orbit"
            keys="⌘J"
            anim="pop"
            onClick={() => void invoke('assistant:open', {})}
            testId="toolbar-assistant"
          >
            <Sparkles size={16} />
          </ToolbarButton>
        )}
        {isShown(prefs, 'notes') && (
          <ToolbarButton
            label={notesOpen ? 'Hide Notes' : 'Notes'}
            keys="⇧⌘N"
            anim="pop"
            onClick={() => void invoke('notes:panel', {})}
            active={notesOpen}
            testId="toolbar-notes"
          >
            <NotebookPen size={16} />
          </ToolbarButton>
        )}
      </div>
      {profile && (
        <Tip
          label={profile.displayName ? `${profile.name} · ${profile.displayName}` : profile.name}
        >
          <button
            type="button"
            aria-label={`Profile: ${profile.name}`}
            onClick={(event) => void invoke('profile:menu', { anchor: anchorOf(event) })}
            className="press no-drag grid size-9 place-items-center rounded-full ring-1 ring-[var(--glass-border)] hover:ring-2 hover:ring-[var(--sel-border)]"
            data-testid="toolbar-profile"
          >
            <Avatar profile={profile} size={30} />
          </button>
        </Tip>
      )}
    </div>
  );
}

export function ToolbarButton(props: {
  label: string;
  /** Its shortcut, shown in the tooltip ("⌘R"). */
  keys?: string;
  /** A little motion when clicked (reload spins, back nudges left…). */
  anim?: 'spin' | 'nudge-left' | 'nudge-right' | 'pop';
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  /** A toggle that's on (e.g. the Notes panel is open). */
  active?: boolean;
  testId: string;
  children: ReactNode;
}) {
  const [played, setPlayed] = useState(0);
  return (
    <Tip label={props.label} keys={props.keys}>
      <button
        type="button"
        aria-label={props.label}
        aria-pressed={props.active}
        disabled={props.disabled}
        onClick={(event) => {
          if (props.anim) setPlayed((n) => n + 1);
          props.onClick(event);
        }}
        className={`press no-drag grid size-8 shrink-0 place-items-center rounded-full text-[var(--icon)] transition-colors hover:bg-[var(--glass-hover)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-35 disabled:hover:bg-transparent ${
          props.active ? 'mat-sel text-[var(--fg)]' : ''
        }`}
        data-testid={props.testId}
      >
        <span
          key={played}
          className={`grid place-items-center ${played > 0 && props.anim ? `anim-${props.anim}` : ''}`}
        >
          {props.children}
        </span>
      </button>
    </Tip>
  );
}

/** Focus & Sounds (⌥⌘F): the panel's Focus view; bars bounce while a sound plays, and a
 *  pause button sits beside it while there's a sound. */
function FocusButton() {
  const sounds = useMainState('state:sounds');
  const playing = sounds?.playing ?? null;
  const paused = sounds?.paused ?? false;
  return (
    <>
      {playing && (
        <ToolbarButton
          label={paused ? `Resume ${soundName(playing)}` : `Pause ${soundName(playing)}`}
          onClick={() => void invoke('sounds:pause', { paused: !paused })}
          testId="toolbar-sound-pause"
        >
          {paused ? <Play size={14} /> : <Pause size={14} />}
        </ToolbarButton>
      )}
      <ToolbarButton
        label={playing ? `Focus & Sounds · ${soundName(playing)}` : 'Focus & Sounds'}
        keys="⌥⌘F"
        anim="pop"
        onClick={() => void invoke('focus:open', {})}
        active={playing !== null && !paused}
        testId="toolbar-focus"
      >
        {playing && !paused ? (
          <span
            className="flex h-3.5 items-end gap-[2px]"
            aria-hidden
            data-testid="toolbar-playing"
          >
            {[0, 0.2, 0.4].map((delay) => (
              <span
                key={delay}
                className="h-full w-[2.5px] rounded-full bg-current motion-safe:animate-[orbit-bars_0.9s_ease-in-out_infinite]"
                style={{ animationDelay: `${delay}s` }}
              />
            ))}
          </span>
        ) : (
          <Target size={16} />
        )}
      </ToolbarButton>
    </>
  );
}

/** "Hey Orbit" is on: a small microphone says so (dimmed while it's paused — Orbit speaking,
 *  on battery, the screen locked); clicking it turns it off. */
function WakeIndicator() {
  const [wake, setWake] = useState({ on: false, listening: false });
  useEffect(() => {
    const read = (v: { wakeEnabled: boolean; wakeListening: boolean }) =>
      setWake({ on: v.wakeEnabled, listening: v.wakeListening });
    void invoke('voice:get', {}).then(read);
    return window.orbit.on('state:voice', read);
  }, []);
  if (!wake.on) return null;
  return (
    <div className="no-drag mat-light flex h-9 items-center rounded-full px-0.5">
      <ToolbarButton
        label={
          wake.listening
            ? 'Listening for “Hey Orbit” — click to turn off'
            : '“Hey Orbit” is paused — click to turn off'
        }
        onClick={() => void invoke('voice:setPrefs', { wakeWord: false })}
        testId="toolbar-wake"
      >
        <span
          className={`relative grid place-items-center ${wake.listening ? '' : 'opacity-45'}`}
          data-testid="toolbar-wake-state"
          data-listening={wake.listening}
        >
          {wake.listening && (
            <span className="ambient absolute size-4 animate-[orbit-breathe_2.4s_var(--ease-in-out)_infinite] rounded-full bg-[var(--canvas-accent,var(--accent))] opacity-30" />
          )}
          <Mic size={15} className="relative" />
        </span>
      </ToolbarButton>
    </div>
  );
}
