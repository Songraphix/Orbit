import { FilePlus2, LayoutGrid, ListPlus, Plus, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { showPanelView, useWork } from './context';

/** New Project, Add Task, New Note, Project Board — at the foot of the panel's lists. */
export function QuickActions() {
  const work = useWork();
  const newNote = async () => {
    const result = await work.run(window.orbit.invoke('notes:create', {}));
    if (result) window.location.hash = `#/notes/panel/${result.id}`;
  };
  return (
    <section
      className="mx-4 mt-6 mb-4 border-t border-[var(--work-border)] pt-4"
      data-testid="quick-actions"
    >
      <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
        <Zap size={16} className="text-[var(--work-accent-text)]" />
        Quick Actions
      </h2>
      <div className="grid grid-cols-2 gap-2">
        <Action
          primary
          icon={<Plus size={16} />}
          label="New Project"
          onClick={() => work.editProject()}
          testId="qa-project"
        />
        <Action
          icon={<ListPlus size={16} />}
          label="Add Task"
          onClick={() => work.editTask({ projectId: null })}
          testId="qa-task"
        />
        <Action
          icon={<FilePlus2 size={16} />}
          label="New Note"
          onClick={() => void newNote()}
          testId="qa-note"
        />
        <Action
          icon={<LayoutGrid size={16} />}
          label="Project Board"
          onClick={() => showPanelView('board')}
          testId="qa-board"
        />
      </div>
    </section>
  );
}

function Action(props: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`press flex h-11 items-center gap-2.5 rounded-[13px] px-3.5 text-[13px] font-semibold ring-1 ${
        props.primary
          ? 'bg-[var(--work-accent-soft)] text-[var(--note-fg)] ring-[var(--work-accent)]/40 hover:bg-[var(--work-accent)]/30'
          : 'bg-[var(--work-card)] ring-[var(--work-border)] hover:bg-[var(--note-hover)]'
      }`}
      data-testid={props.testId}
    >
      <span
        className={props.primary ? 'text-[var(--work-accent-text)]' : 'text-[var(--note-muted)]'}
      >
        {props.icon}
      </span>
      {props.label}
    </button>
  );
}
