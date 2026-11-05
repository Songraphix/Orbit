import { AppWindow, ArrowLeft, ExternalLink, Pin, PinOff, Plus, RotateCw, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { panelApps } from '@shared/apps';
import type { Rect } from '@shared/types/layout';
import type { SidebarRow } from '@shared/types/space';
import { LoadErrorCard } from './LoadErrorCard';
import { Tip } from '../tooltip/Tip';
import { useMainState } from './use-main-state';

/**
 * The docked app's header (App Hub, brief M5): a switcher with this Space's other panel apps
 * (one click swaps; + adds apps in Settings), the app's name, and Back, Reload, Open as Tab and
 * Close. The app itself is a native view main places just below it.
 */
export function AppPanelHeader({
  rect,
  radius,
  favorites,
}: {
  rect: Rect;
  radius: number;
  favorites: SidebarRow[];
}) {
  const app = useMainState('state:appPanel');
  if (!app) return null;
  const act = (
    action: 'close' | 'back' | 'reload' | 'openAsTab' | 'openInWindow' | 'manage' | 'pin' | 'unpin',
  ) => void window.orbit.invoke('apps:panel', { action });
  const apps = panelApps(favorites);
  return (
    <>
      {app.loadError !== null && (
        // The app couldn't load: main hid its page, so this card shows in the panel.
        <div
          className="ui-light absolute overflow-hidden bg-white"
          style={{
            left: rect.x,
            top: rect.y + 40,
            width: rect.width,
            height: Math.max(0, rect.height - 40),
            borderBottomLeftRadius: radius,
            borderBottomRightRadius: radius,
          }}
        >
          <LoadErrorCard
            compact
            code={app.loadError}
            url={app.url}
            actions={[
              {
                label: 'Try Again',
                primary: true,
                testId: 'load-error-retry',
                onClick: () => act('reload'),
              },
              { label: 'Open as Tab', testId: 'load-error-tab', onClick: () => act('openAsTab') },
              {
                label: 'Open in Window',
                testId: 'load-error-window',
                onClick: () => act('openInWindow'),
              },
            ]}
          />
        </div>
      )}
      <div
        className="absolute flex items-center gap-1 overflow-hidden px-2 text-[var(--fg)]"
        style={{
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: 40,
          borderTopLeftRadius: radius,
          borderTopRightRadius: radius,
        }}
        data-testid="app-panel-header"
      >
        {apps.length > 1 ? (
          <div
            className="scrollbar-none flex max-w-[55%] shrink-0 items-center gap-0.5 overflow-x-auto"
            role="tablist"
            aria-label="Panel apps"
            data-testid="app-panel-switcher"
          >
            {apps.map((row) => {
              const current = row.id === app.itemId;
              return (
                <Tip key={row.id} label={row.title || row.url || 'App'}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={current}
                    aria-label={row.title || row.url || 'App'}
                    onClick={() => {
                      if (!current) void window.orbit.invoke('tabs:activate', { tabId: row.id });
                    }}
                    className={`press grid size-7 shrink-0 place-items-center rounded-[9px] transition-colors ${current ? 'mat-sel' : 'opacity-60 hover:bg-[var(--glass-hover)] hover:opacity-100'}`}
                    data-testid="app-panel-switch"
                    data-current={current}
                  >
                    <AppIcon favicon={row.favicon} title={row.title || row.url || ''} />
                  </button>
                </Tip>
              );
            })}
          </div>
        ) : (
          <AppIcon favicon={app.favicon} title={app.title} />
        )}
        <span
          className="ml-1 min-w-0 flex-1 truncate text-[14px] font-semibold"
          data-testid="app-panel-title"
        >
          {app.title}
        </span>
        <HeaderButton label="Add Apps…" onClick={() => act('manage')} testId="app-panel-add">
          <Plus size={14} />
        </HeaderButton>
        <HeaderButton
          label="Back"
          onClick={() => act('back')}
          disabled={!app.canGoBack}
          testId="app-panel-back"
        >
          <ArrowLeft size={14} />
        </HeaderButton>
        <HeaderButton label="Reload" onClick={() => act('reload')} testId="app-panel-reload">
          <RotateCw size={13} className={app.isLoading ? 'animate-spin' : ''} />
        </HeaderButton>
        <HeaderButton label="Open as Tab" onClick={() => act('openAsTab')} testId="app-panel-tab">
          <ExternalLink size={13} />
        </HeaderButton>
        <HeaderButton
          label="Open in Its Own Window"
          onClick={() => act('openInWindow')}
          testId="app-panel-window"
        >
          <AppWindow size={13} />
        </HeaderButton>
        {app.canPin && (
          <HeaderButton
            label={
              app.pinned
                ? 'Unpin — float over the page (tucks away when you click the page)'
                : 'Pin beside the page'
            }
            onClick={() => act(app.pinned ? 'unpin' : 'pin')}
            testId="app-panel-pin"
            active={app.pinned}
          >
            {app.pinned ? <Pin size={13} /> : <PinOff size={13} />}
          </HeaderButton>
        )}
        <HeaderButton
          label="Close (the app keeps running)"
          onClick={() => act('close')}
          testId="app-panel-close"
        >
          <X size={14} />
        </HeaderButton>
        {app.isLoading && (
          // A thin loading line along the header's foot.
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] overflow-hidden"
            data-testid="app-panel-loading"
          >
            <div className="h-full w-1/3 animate-[orbit-loading_1.1s_ease-in-out_infinite] rounded-full bg-[var(--accent)]" />
          </div>
        )}
      </div>
    </>
  );
}

/** An app's icon; without one, its initial (so apps in the switcher stay tellable apart). */
function AppIcon({ favicon, title }: { favicon: string | null; title: string }) {
  return favicon ? (
    <img src={favicon} alt="" className="size-5 shrink-0 rounded-[5px]" />
  ) : (
    <span className="grid size-4 shrink-0 place-items-center rounded-[4px] bg-white/25 text-[10px] leading-none font-semibold">
      {(title.replace(/^https?:\/\/(www\.)?/, '')[0] ?? '?').toUpperCase()}
    </span>
  );
}

export function HeaderButton(props: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  testId: string;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <Tip label={props.label}>
      <button
        type="button"
        aria-label={props.label}
        onClick={props.onClick}
        disabled={props.disabled}
        aria-pressed={props.active}
        className={`press grid size-7 shrink-0 place-items-center rounded-full text-[var(--icon)] hover:bg-[var(--glass-hover)] hover:text-[var(--fg)] disabled:opacity-30 ${props.active ? 'text-[var(--fg)]' : ''}`}
        data-testid={props.testId}
      >
        {props.children}
      </button>
    </Tip>
  );
}
