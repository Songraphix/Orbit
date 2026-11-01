import { Link2, Lock, NotebookPen, Sparkles } from 'lucide-react';
import type { TabState } from '@shared/types/tabs';

/** "perplexity.ai" from a page address (or the page's title for Orbit's own pages). */
function shown(tab: TabState): { text: string; secure: boolean; web: boolean } {
  if (tab.kind !== 'web') return { text: tab.title, secure: false, web: false };
  try {
    const url = new URL(tab.url);
    return {
      text: url.hostname.replace(/^www\./, ''),
      secure: url.protocol === 'https:',
      web: true,
    };
  } catch {
    return { text: tab.url, secure: false, web: true };
  }
}

/**
 * Arc's address pill at the top of the sidebar: the site, a link icon that copies the address
 * (one click, a "Copied link" toast), and a click anywhere else edits it in the command bar.
 */
export function AddressPill({ tab }: { tab: TabState | null }) {
  if (!tab) return null;
  const { text, secure, web } = shown(tab);
  return (
    <div
      className="no-drag mx-2.5 mb-2 flex h-9 items-center gap-0.5 rounded-[13px] bg-[var(--tile-bg)] p-1 shadow-[inset_0_0.5px_0_rgb(255_255_255/0.08)]"
      data-testid="address-pill"
    >
      <button
        type="button"
        disabled={!web}
        aria-label="Copy link"
        title="Copy link"
        onClick={() => void window.orbit.invoke('tabs:copyUrl', {})}
        className="press grid size-7 shrink-0 place-items-center rounded-[10px] text-[var(--sidebar-muted)] hover:bg-[var(--hover)] hover:text-[var(--sidebar-fg)] disabled:opacity-60 disabled:hover:bg-transparent"
        data-testid="address-copy"
      >
        {web ? (
          <Link2 size={15} />
        ) : tab?.url.startsWith('orbit://note/') ? (
          <NotebookPen size={14} />
        ) : (
          <Sparkles size={14} />
        )}
      </button>
      <button
        type="button"
        onClick={() => void window.orbit.invoke('commandbar:open', { mode: 'edit' })}
        className="press flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-[10px] px-1.5 text-left text-[13px] font-medium hover:bg-[var(--hover)]"
        title={tab.kind === 'web' ? tab.url : tab.title}
        data-testid="address-pill-text"
      >
        <span className="truncate">{text}</span>
        {secure && <Lock size={11} className="shrink-0 opacity-40" aria-label="Secure" />}
      </button>
    </div>
  );
}
