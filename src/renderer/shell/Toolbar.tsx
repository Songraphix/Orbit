import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  BookmarkPlus,
  Bug,
  Check,
  Lock,
  PanelLeft,
  RotateCw,
  NotebookPen,
  Sparkles,
  SlidersHorizontal,
  Target,
  Pause,
  Play,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { formatAddress } from '@shared/format-address';
import type { FindState } from '@shared/types/find';
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

const TOAST_MS = 1600;

/** Short confirmations from main ("Copied link", "Zoom 120%"), shown in place of the address. */
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

/**
 * The compact toolbar above the page (F-14, Img 6): back / forward / reload on the left,
 * "domain / title" in the middle, a thin loading bar along the bottom. The strip itself is a
 * window drag region; only the controls opt out.
 */
export function Toolbar({
  tab,
  height,
  sidebarVisible,
  find,
  focused = true,
  inSplit = false,
  notesOpen,
  assistant = false,
  profile,
  focus,
}: {
  tab: TabState | null;
  height: number;
  /** Hidden sidebar → this toolbar shows the "Show sidebar" button (left pane only). */
  sidebarVisible: boolean;
  find: FindState | null;
  /** Split view: only the focused pane shows find and toasts. */
  focused?: boolean;
  /** Split view: show the swap and "show alone" buttons. */
  inSplit?: boolean;
  /** The Notes button (right-most toolbar only): whether the panel is open. */
  notesOpen?: boolean | undefined;
  /** The assistant's ✦ button (right-most toolbar only, unless AI is turned off). */
  assistant?: boolean;
  /** The profile button (right-most toolbar only). */
  profile?: ProfileView | null | undefined;
  /** Focus mode's pill (right-most toolbar only). */
  focus?: FocusSession | null | undefined;
}) {
  const toastMessage = useToast();
  // Settings → Appearance → Show: hidden features lose their toolbar buttons.
  const prefs = useUiPrefs();
  const shown = {
    capture: isShown(prefs, 'capture'),
    focus: isShown(prefs, 'focus'),
    assistant: isShown(prefs, 'assistant'),
    notes: isShown(prefs, 'notes'),
  };
  const toast = focused ? toastMessage : null;
  const navigate = (action: NavAction) => {
    if (tab) void window.orbit.invoke('tabs:navigate', { tabId: tab.id, action });
  };
  const address = tab ? formatAddress(tab.url, tab.title) : null;

  return (
    <div
      className="drag-region relative flex items-center gap-1 border-b border-black/5 px-2 text-neutral-600"
      style={{ height }}
      data-testid="toolbar"
    >
      {!sidebarVisible && (
        <ToolbarButton
          label="Show Sidebar"
          keys="⌘S"
          onClick={() => void window.orbit.invoke('sidebar:toggle', {})}
          testId="toolbar-sidebar"
        >
          <PanelLeft size={15} />
        </ToolbarButton>
      )}
      <ToolbarButton
        label="Back"
        keys="⌘["
        anim="nudge-left"
        disabled={!tab?.canGoBack}
        onClick={() => navigate('back')}
        testId="toolbar-back"
      >
        <ArrowLeft size={15} />
      </ToolbarButton>
      <ToolbarButton
        label="Forward"
        keys="⌘]"
        anim="nudge-right"
        disabled={!tab?.canGoForward}
        onClick={() => navigate('forward')}
        testId="toolbar-forward"
      >
        <ArrowRight size={15} />
      </ToolbarButton>
      <ToolbarButton
        label={tab?.isLoading ? 'Stop' : 'Reload'}
        keys={tab?.isLoading ? undefined : '⌘R'}
        anim={tab?.isLoading ? undefined : 'spin'}
        disabled={!tab}
        onClick={() => navigate(tab?.isLoading ? 'stop' : 'reload')}
        testId="toolbar-reload"
      >
        {tab?.isLoading ? <X size={15} /> : <RotateCw size={14} />}
      </ToolbarButton>

      {toast && (
        // Arc-style confirmation: a small dark pill by the toolbar's right edge.
        <div
          key={toast}
          className="animate-pop pointer-events-none absolute right-11 z-10 flex h-[26px] origin-right items-center gap-1.5 rounded-[9px] bg-[rgb(28_27_34/0.92)] pr-2.5 pl-2 text-[12.5px] font-medium text-on-accent shadow-[inset_0_0.5px_0_rgb(255_255_255/0.14),0_0_0_0.5px_rgb(0_0_0/0.3),0_6px_18px_-4px_rgb(0_0_0/0.35)]"
          style={{ top: Math.max(0, (height - 26) / 2) }}
          role="status"
          data-testid="toolbar-toast"
        >
          <span className="grid size-4 place-items-center rounded-full bg-[var(--accent)]">
            <Check size={10} strokeWidth={3} />
          </span>
          {toast}
        </div>
      )}
      {focused && find?.open ? (
        <FindBar state={find} />
      ) : (
        address && (
          // Clicking the address edits it in the command bar (⌘L), like Arc.
          <button
            type="button"
            // Centred in the toolbar; while focusing, it gives way to the focus pill instead.
            className={`no-drag flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[13px] hover:bg-black/5 ${
              focus ? 'mx-2 flex-1' : 'absolute inset-x-28 mx-auto w-fit max-w-[calc(100%-14rem)]'
            }`}
            title={tab?.url}
            onClick={() => void window.orbit.invoke('commandbar:open', { mode: 'edit' })}
            data-testid="toolbar-address"
          >
            {tab?.devMode ? (
              // Developer Mode (F-30): the whole URL, port and path included.
              <span
                className="truncate font-mono text-[12px] text-neutral-700"
                data-testid="toolbar-full-url"
              >
                {tab.url}
              </span>
            ) : (
              <>
                {address.domain && address.secure && (
                  <Lock size={11} className="shrink-0 text-neutral-400" aria-label="Secure" />
                )}
                {address.domain && (
                  <span className="shrink-0 font-medium text-neutral-800">{address.domain}</span>
                )}
                {address.domain && address.title && (
                  <span className="shrink-0 text-neutral-300">/</span>
                )}
                {address.title && (
                  <span className="truncate text-neutral-500">{address.title}</span>
                )}
              </>
            )}
          </button>
        )
      )}

      <div className="ml-auto flex items-center gap-0.5">
        {tab?.devMode && (
          <ToolbarButton
            label={`Developer Tools${tab.consoleErrors ? ` (${tab.consoleErrors} errors)` : ''}`}
            onClick={() => void window.orbit.invoke('tabs:devtools', { tabId: tab.id })}
            testId="toolbar-devtools"
          >
            <span className="relative">
              <Bug size={14} />
              {tab.consoleErrors > 0 && (
                <span
                  className="absolute -top-1.5 -right-2 min-w-3.5 rounded-full bg-red-500 px-1 text-[9px] leading-3.5 font-semibold text-on-accent"
                  data-testid="toolbar-errors"
                >
                  {tab.consoleErrors > 99 ? '99+' : tab.consoleErrors}
                </span>
              )}
            </span>
          </ToolbarButton>
        )}
        {tab?.kind === 'web' && (
          <ToolbarButton
            label="Site Controls"
            onClick={(event) => {
              const r = event.currentTarget.getBoundingClientRect();
              const anchor = { x: r.x, y: r.y, width: r.width, height: r.height };
              void window.orbit.invoke('sitecontrols:open', { anchor });
            }}
            testId="toolbar-site-controls"
          >
            <SlidersHorizontal size={14} />
          </ToolbarButton>
        )}
        {tab?.kind === 'web' && shown.capture && (
          <ToolbarButton
            label="Save to Orbit"
            keys="⇧⌘S"
            anim="pop"
            onClick={() => void window.orbit.invoke('capture:open', {})}
            testId="toolbar-capture"
          >
            <BookmarkPlus size={14} />
          </ToolbarButton>
        )}
        {focus && <FocusPill session={focus} />}
        {notesOpen !== undefined && shown.focus && <FocusButton />}
        {assistant && shown.assistant && (
          <ToolbarButton
            label="Ask Orbit"
            keys="⌘J"
            anim="pop"
            onClick={() => void window.orbit.invoke('assistant:open', {})}
            testId="toolbar-assistant"
          >
            <Sparkles size={14} />
          </ToolbarButton>
        )}
        {notesOpen !== undefined && shown.notes && (
          <ToolbarButton
            label={notesOpen ? 'Hide Notes' : 'Notes'}
            keys="⇧⌘N"
            anim="pop"
            onClick={() => void window.orbit.invoke('notes:panel', {})}
            active={notesOpen}
            testId="toolbar-notes"
          >
            <NotebookPen size={14} />
          </ToolbarButton>
        )}
        {profile && (
          <Tip
            label={profile.displayName ? `${profile.name} · ${profile.displayName}` : profile.name}
          >
            <button
              type="button"
              aria-label={`Profile: ${profile.name}`}
              onClick={(event) => {
                const r = event.currentTarget.getBoundingClientRect();
                const anchor = { x: r.x, y: r.y, width: r.width, height: r.height };
                void window.orbit.invoke('profile:menu', { anchor });
              }}
              className="press no-drag grid size-7 place-items-center rounded-full hover:ring-2 hover:ring-black/10"
              data-testid="toolbar-profile"
            >
              <Avatar profile={profile} size={22} />
            </button>
          </Tip>
        )}
        {inSplit && (
          <>
            <ToolbarButton
              label="Swap Panes"
              onClick={() => void window.orbit.invoke('split:swap', {})}
              testId="split-swap"
            >
              <ArrowLeftRight size={14} />
            </ToolbarButton>
            {/* Ends the split, keeping this pane's page (a click here focuses it first). */}
            <ToolbarButton
              label="Close Split View"
              onClick={() => void window.orbit.invoke('split:exit', {})}
              testId="split-exit"
            >
              <X size={14} />
            </ToolbarButton>
          </>
        )}
      </div>

      {tab?.isLoading && (
        <div
          className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden"
          data-testid="toolbar-loading"
          role="progressbar"
          aria-label="Loading"
        >
          <div className="h-full w-1/3 animate-[orbit-loading_1.1s_ease-in-out_infinite] rounded-full bg-[var(--accent)]" />
        </div>
      )}
    </div>
  );
}

function ToolbarButton(props: {
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
        className={`press no-drag grid size-7 place-items-center rounded-[10px] hover:bg-black/[0.06] disabled:opacity-30 disabled:hover:bg-transparent ${
          props.active ? 'bg-black/[0.07] text-neutral-900' : ''
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
          onClick={() => void window.orbit.invoke('sounds:pause', { paused: !paused })}
          testId="toolbar-sound-pause"
        >
          {paused ? <Play size={13} /> : <Pause size={13} />}
        </ToolbarButton>
      )}
      <ToolbarButton
        label={playing ? `Focus & Sounds · ${soundName(playing)}` : 'Focus & Sounds'}
        keys="⌥⌘F"
        anim="pop"
        onClick={() => void window.orbit.invoke('focus:open', {})}
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
          <Target size={14} />
        )}
      </ToolbarButton>
    </>
  );
}
