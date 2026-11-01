import { Archive, ArrowLeft, CircleArrowDown, Images, Layers, PenTool, Wand2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { LibrarySection } from '@shared/types/library';

const SECTIONS: { id: LibrarySection; label: string; icon: ReactNode }[] = [
  { id: 'media', label: 'Media', icon: <Images size={20} /> },
  { id: 'downloads', label: 'Downloads', icon: <CircleArrowDown size={20} /> },
  { id: 'easels', label: 'Easels', icon: <PenTool size={20} /> },
  { id: 'spaces', label: 'Spaces', icon: <Layers size={20} /> },
  { id: 'boosts', label: 'Boosts', icon: <Wand2 size={20} /> },
  { id: 'archive', label: 'Archived Tabs', icon: <Archive size={20} /> },
];

/** Library mode (F-11, Img 4): the sections as large tiles, and a back arrow to the tabs. */
export function LibraryNav({ section }: { section: LibrarySection }) {
  return (
    <>
      <nav
        className="animate-panel-in no-drag flex min-h-0 flex-1 flex-col justify-center gap-1.5 overflow-y-auto px-2"
        aria-label="Library"
        data-testid="library-nav"
      >
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-current={s.id === section ? 'page' : undefined}
            onClick={() => void window.orbit.invoke('library:open', { section: s.id })}
            className={`press flex flex-col items-center gap-1.5 rounded-[14px] py-3.5 text-[11.5px] font-semibold tracking-[0.01em] ${
              s.id === section
                ? 'bg-[var(--row-active)] text-[var(--sidebar-fg)] shadow-[var(--row-shadow)]'
                : 'text-[var(--sidebar-muted)] hover:bg-[var(--hover)] hover:text-[var(--sidebar-fg)]'
            }`}
            data-testid="library-section"
            data-section={s.id}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </nav>
      <div className="no-drag flex h-11 shrink-0 items-center px-2">
        <button
          type="button"
          aria-label="Back to tabs"
          title="Back to tabs"
          onClick={() => void window.orbit.invoke('library:close', {})}
          className="press grid size-8 place-items-center rounded-lg text-[var(--sidebar-muted)] hover:bg-[var(--hover)] hover:text-[var(--sidebar-fg)]"
          data-testid="library-back"
        >
          <ArrowLeft size={16} />
        </button>
      </div>
    </>
  );
}
