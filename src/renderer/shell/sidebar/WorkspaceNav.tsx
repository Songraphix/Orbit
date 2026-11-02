import { FolderClosed, NotebookPen, PenTool, SquareCheck } from 'lucide-react';
import { isShown } from '@shared/ui-prefs';
import { useUiPrefs } from '../../ui/prefs-store';

const ITEMS = [
  { view: 'projects', label: 'Projects', icon: FolderClosed },
  { view: 'notes', label: 'Notes', icon: NotebookPen },
  { view: 'tasks', label: 'Tasks', icon: SquareCheck },
  { view: 'easels', label: 'Easels', icon: PenTool },
] as const;

/** Projects, Notes and Tasks (owner request): each opens the productivity panel on its tab.
 *  Easels (owner request) opens the Library on your Easels. */
export function WorkspaceNav() {
  const prefs = useUiPrefs(); // Settings → Appearance → Show can hide rows
  if (ITEMS.every(({ view }) => !isShown(prefs, view))) return null;
  return (
    <nav
      className="mb-2 flex flex-col gap-0.5 px-2"
      aria-label="Workspace"
      data-testid="workspace-nav"
    >
      {ITEMS.filter(({ view }) => isShown(prefs, view)).map(({ view, label, icon: Icon }) => (
        <button
          key={view}
          type="button"
          onClick={() =>
            view === 'easels'
              ? void window.orbit.invoke('library:open', { section: 'easels' })
              : void window.orbit.invoke('notes:panel', { view })
          }
          className="press flex h-[var(--row-h,34px)] items-center gap-2.5 rounded-[12px] px-2 text-left text-[13px] text-[var(--sidebar-fg)] hover:bg-[var(--hover)]"
          data-testid="workspace-item"
          data-view={view}
        >
          <Icon size={16} strokeWidth={1.9} className="opacity-80" />
          {label}
        </button>
      ))}
      <div className="mx-2 mt-1.5 h-px bg-[var(--hover)]" />
    </nav>
  );
}
