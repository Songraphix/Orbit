import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Bug,
  Check,
  Lock,
  Maximize2,
  PanelLeft,
  RotateCw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { formatAddress } from '@shared/format-address';
import type { FindState } from '@shared/types/find';
import type { TabState } from '@shared/types/tabs';
import { FindBar } from './FindBar';

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
}) {
  const toastMessage = useToast();
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
          label="Show sidebar"
          onClick={() => void window.orbit.invoke('sidebar:toggle', {})}
          testId="toolbar-sidebar"
        >
          <PanelLeft size={15} />
        </ToolbarButton>
      )}
      <ToolbarButton
        label="Back"
        disabled={!tab?.canGoBack}
        onClick={() => navigate('back')}
        testId="toolbar-back"
      >
        <ArrowLeft size={15} />
      </ToolbarButton>
      <ToolbarButton
        label="Forward"
        disabled={!tab?.canGoForward}
        onClick={() => navigate('forward')}
        testId="toolbar-forward"
      >
        <ArrowRight size={15} />
      </ToolbarButton>
      <ToolbarButton
        label={tab?.isLoading ? 'Stop' : 'Reload'}
        disabled={!tab}
        onClick={() => navigate(tab?.isLoading ? 'stop' : 'reload')}
        testId="toolbar-reload"
      >
        {tab?.isLoading ? <X size={15} /> : <RotateCw size={14} />}
      </ToolbarButton>

      {focused && find?.open ? (
        <FindBar state={find} />
      ) : toast ? (
        <div
          className="absolute inset-x-28 flex items-center justify-center gap-1.5 text-[13px] font-medium text-neutral-700"
          role="status"
          data-testid="toolbar-toast"
        >
          <Check size={13} className="text-[var(--accent)]" />
          {toast}
        </div>
      ) : (
        address && (
          // Clicking the address edits it in the command bar (⌘L), like Arc.
          <button
            type="button"
            className="no-drag absolute inset-x-28 mx-auto flex w-fit max-w-[calc(100%-14rem)] min-w-0 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[13px] hover:bg-black/5"
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
                  className="absolute -top-1.5 -right-2 min-w-3.5 rounded-full bg-red-500 px-1 text-[9px] leading-3.5 font-semibold text-white"
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
        {inSplit && (
          <>
            <ToolbarButton
              label="Swap Panes"
              onClick={() => void window.orbit.invoke('split:swap', {})}
              testId="split-swap"
            >
              <ArrowLeftRight size={14} />
            </ToolbarButton>
            <ToolbarButton
              label="Show This Page Alone"
              onClick={() => void window.orbit.invoke('split:exit', {})}
              testId="split-exit"
            >
              <Maximize2 size={13} />
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
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  testId: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className="no-drag grid size-7 place-items-center rounded-md hover:bg-black/5 disabled:opacity-30 disabled:hover:bg-transparent"
      data-testid={props.testId}
    >
      {props.children}
    </button>
  );
}
