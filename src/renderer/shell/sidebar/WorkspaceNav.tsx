import { FolderClosed, NotebookPen, SquareCheck } from 'lucide-react';

const ITEMS = [
  { view: 'projects', label: 'Projects', icon: FolderClosed },
  { view: 'notes', label: 'Notes', icon: NotebookPen },
  { view: 'tasks', label: 'Tasks', icon: SquareCheck },
] as const;

/** Projects, Notes and Tasks (owner request): each opens the productivity panel on its tab. */
export function WorkspaceNav() {
  return (
    <nav
      className="mb-2 flex flex-col gap-0.5 px-2"
      aria-label="Workspace"
      data-testid="workspace-nav"
    >
      {ITEMS.map(({ view, label, icon: Icon }) => (
        <button
          key={view}
          type="button"
          onClick={() => void window.orbit.invoke('notes:panel', { view })}
          className="press flex h-[34px] items-center gap-2.5 rounded-[12px] px-2 text-left text-[13px] text-[var(--sidebar-fg)] hover:bg-[var(--hover)]"
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
