import { Globe, Plus, Sparkles, X } from 'lucide-react';
import type { MouseEvent } from 'react';
import type { TabState, TabsSnapshot } from '@shared/types/tabs';

/** "+ New Tab" row plus the flat list of tabs (F-04, flat until spaces/pinning in Phase 3). */
export function TabList({ snapshot }: { snapshot: TabsSnapshot }) {
  return (
    <nav className="no-drag flex flex-col gap-0.5 px-2" aria-label="Tabs">
      <button
        type="button"
        className="flex h-8 items-center gap-2.5 rounded-lg px-2 text-left text-[13px] opacity-60 hover:bg-[var(--hover)] hover:opacity-90"
        onClick={() => void window.orbit.invoke('tabs:create', {})}
        data-testid="new-tab-row"
      >
        <Plus size={16} strokeWidth={2} />
        New Tab
      </button>
      <ul className="flex flex-col gap-0.5" data-testid="tab-list">
        {snapshot.tabs.map((tab) => (
          <TabRow key={tab.id} tab={tab} active={tab.id === snapshot.activeTabId} />
        ))}
      </ul>
    </nav>
  );
}

function TabRow({ tab, active }: { tab: TabState; active: boolean }) {
  const close = (e: MouseEvent) => {
    e.stopPropagation();
    void window.orbit.invoke('tabs:close', { tabId: tab.id });
  };

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        aria-current={active ? 'page' : undefined}
        className={`group flex h-8 items-center gap-2.5 rounded-lg px-2 text-[13px] ${
          active ? 'bg-white/15 shadow-sm' : 'hover:bg-[var(--hover)]'
        }`}
        onClick={() => void window.orbit.invoke('tabs:activate', { tabId: tab.id })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void window.orbit.invoke('tabs:activate', { tabId: tab.id });
        }}
        onAuxClick={(e) => e.button === 1 && close(e)} // middle-click closes (F-04)
        data-testid="tab-row"
        data-tab-id={tab.id}
      >
        <TabIcon tab={tab} />
        <span className="min-w-0 flex-1 truncate" title={tab.title}>
          {tab.title || tab.url}
        </span>
        <button
          type="button"
          aria-label={`Close ${tab.title}`}
          className="grid size-5 shrink-0 place-items-center rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-white/10"
          onClick={close}
          data-testid="tab-close"
        >
          <X size={13} strokeWidth={2.25} />
        </button>
      </div>
    </li>
  );
}

function TabIcon({ tab }: { tab: TabState }) {
  const className = `size-4 shrink-0 ${tab.isLoading ? 'animate-pulse' : ''}`;
  if (tab.kind === 'internal') return <Sparkles className={className} strokeWidth={1.75} />;
  if (tab.favicon) return <img src={tab.favicon} alt="" className={`${className} rounded-sm`} />;
  return <Globe className={`${className} opacity-60`} strokeWidth={1.75} />;
}
