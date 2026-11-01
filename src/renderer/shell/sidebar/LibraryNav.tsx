import { ArrowLeft } from 'lucide-react';
import type { LibrarySection } from '@shared/types/library';
import { Tip } from '../../tooltip/Tip';
import { LibraryIcon, OrbitMark } from './LibraryIcons';

const SECTIONS: { id: LibrarySection; label: string }[] = [
  { id: 'media', label: 'Media' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'easels', label: 'Easels' },
  { id: 'spaces', label: 'Spaces' },
  { id: 'boosts', label: 'Boosts' },
  { id: 'archive', label: 'Archived Tabs' },
];

/**
 * Library mode (F-11, like Arc): Orbit's mark, the sections as roomy tiles whose icons fill with
 * colour and move when chosen, and a back arrow to the tabs.
 */
export function LibraryNav({ section }: { section: LibrarySection }) {
  return (
    <>
      <div className="no-drag flex shrink-0 justify-center pt-3 pb-4 text-[var(--sidebar-fg)]">
        <OrbitMark />
      </div>
      <nav
        className="animate-panel-in no-drag flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2"
        aria-label="Library"
        data-testid="library-nav"
      >
        {SECTIONS.map((s) => {
          const active = s.id === section;
          return (
            <button
              key={s.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => void window.orbit.invoke('library:open', { section: s.id })}
              className={`press flex flex-col items-center gap-2 rounded-[16px] pt-3.5 pb-3 text-[11.5px] font-bold tracking-[0.005em] transition-colors duration-150 ${
                active
                  ? 'bg-white/[0.09] text-[var(--sidebar-fg)] shadow-[inset_0_0.5px_0_rgb(255_255_255/0.1),0_4px_14px_-6px_rgb(0_0_0/0.35)]'
                  : 'text-[var(--sidebar-muted)] hover:bg-[var(--hover)] hover:text-[var(--sidebar-fg)]'
              }`}
              data-testid="library-section"
              data-section={s.id}
            >
              {/* Remounted on choosing, so its movement plays each time. */}
              <LibraryIcon key={active ? 'on' : 'off'} section={s.id} active={active} />
              {s.label}
            </button>
          );
        })}
      </nav>
      <div className="no-drag flex h-11 shrink-0 items-center px-2">
        <Tip label="Back to Tabs" side="top">
          <button
            type="button"
            aria-label="Back to tabs"
            onClick={() => void window.orbit.invoke('library:close', {})}
            className="press grid size-8 place-items-center rounded-lg text-[var(--sidebar-muted)] hover:bg-[var(--hover)] hover:text-[var(--sidebar-fg)]"
            data-testid="library-back"
          >
            <ArrowLeft size={16} />
          </button>
        </Tip>
      </div>
    </>
  );
}
