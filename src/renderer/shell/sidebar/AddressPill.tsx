import { Check, Link2, Lock, NotebookPen, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Tip } from '../../tooltip/Tip';
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
  // Copied: the link icon turns into a tick for a moment (and pops).
  const [copiedAt, setCopiedAt] = useState(0);
  useEffect(() => {
    if (!copiedAt) return;
    const timer = setTimeout(() => setCopiedAt(0), 1400);
    return () => clearTimeout(timer);
  }, [copiedAt]);
  if (!tab) return null;
  const { text, secure, web } = shown(tab);
  return (
    <div
      className="no-drag mx-2.5 mb-2 flex h-9 items-center gap-0.5 rounded-[13px] bg-[var(--tile-bg)] p-1 shadow-[inset_0_0.5px_0_rgb(255_255_255/0.08)]"
      data-testid="address-pill"
    >
      <Tip label="Copy Link" keys="⇧⌘C">
        <button
          type="button"
          disabled={!web}
          aria-label="Copy link"
          onClick={() => {
            void window.orbit.invoke('tabs:copyUrl', {});
            setCopiedAt(Date.now());
          }}
          className="press grid size-7 shrink-0 place-items-center rounded-[10px] text-[var(--sidebar-muted)] hover:bg-[var(--hover)] hover:text-[var(--sidebar-fg)] disabled:opacity-60 disabled:hover:bg-transparent"
          data-testid="address-copy"
        >
          {web && copiedAt ? (
            <span key={copiedAt} className="anim-pop grid text-[var(--accent)]">
              <Check size={15} strokeWidth={2.6} />
            </span>
          ) : web ? (
            <Link2 size={15} />
          ) : tab?.url.startsWith('orbit://note/') ? (
            <NotebookPen size={14} />
          ) : (
            <Sparkles size={14} />
          )}
        </button>
      </Tip>
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
