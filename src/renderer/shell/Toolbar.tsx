import { ArrowLeft, ArrowRight, Lock, PanelLeft, RotateCw, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatAddress } from '@shared/format-address';
import type { TabState } from '@shared/types/tabs';

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
}: {
  tab: TabState | null;
  height: number;
  sidebarVisible: boolean;
}) {
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

      {address && (
        <div
          className="pointer-events-none absolute inset-x-28 flex min-w-0 items-center justify-center gap-1.5 text-[13px]"
          title={tab?.url}
          data-testid="toolbar-address"
        >
          {address.domain && address.secure && (
            <Lock size={11} className="shrink-0 text-neutral-400" aria-label="Secure" />
          )}
          {address.domain && (
            <span className="shrink-0 font-medium text-neutral-800">{address.domain}</span>
          )}
          {address.domain && address.title && <span className="shrink-0 text-neutral-300">/</span>}
          {address.title && <span className="truncate text-neutral-500">{address.title}</span>}
        </div>
      )}

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
  onClick: () => void;
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
