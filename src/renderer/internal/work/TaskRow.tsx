import { Check, Crosshair, Trash2 } from 'lucide-react';
import { PRIORITY_LABEL, colorHex, dueLabel } from '@shared/work';
import type { Project, Task } from '@shared/work';
import { useWork } from './context';

const invoke = window.orbit.invoke;
const PRIORITY_COLOR = { low: '#64748b', medium: '#f59e0b', high: '#ef4444' } as const;

/** One task: tick it off, open it to edit, delete it. Shows priority, due date and status. */
export function TaskRow({
  task,
  project,
  today,
}: {
  task: Task;
  /** Shown in the all-tasks list (not inside its own project). */
  project?: Project | null;
  today: string;
}) {
  const { set, run, editTask } = useWork();
  const done = task.status === 'done';
  const due = task.dueDate ? dueLabel(task.dueDate, today, done) : null;
  const toggle = async () => {
    const next = await run(
      invoke('work:taskStatus', { id: task.id, status: done ? 'todo' : 'done' }),
    );
    if (next) set(next);
  };
  const remove = async () => {
    const result = await run(invoke('work:deleteTask', { id: task.id }));
    if (result) set(result.data);
  };
  return (
    <li
      className="group animate-row-in flex items-start gap-3 rounded-[12px] px-2 py-2 hover:bg-[var(--note-hover)]"
      data-testid="task-row"
      data-done={done}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={task.title}
        onClick={() => void toggle()}
        className={`press mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-[6px] border-[1.5px] transition ${
          done
            ? 'border-[var(--work-accent)] bg-[var(--work-accent)] text-white'
            : 'border-[var(--note-muted)] hover:border-[var(--work-accent)]'
        }`}
        data-testid="task-check"
      >
        {done && <Check size={12} strokeWidth={3} />}
      </button>
      <button
        type="button"
        onClick={() => editTask({ task })}
        className="min-w-0 flex-1 text-left"
        data-testid="task-open"
      >
        <span
          className={`block truncate text-[13.5px] ${done ? 'text-[var(--note-muted)] line-through' : ''}`}
          data-testid="task-title-text"
        >
          {task.title}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px] text-[var(--note-muted)]">
          <span className="flex items-center gap-1">
            <span
              className="size-1.5 rounded-full"
              style={{ background: PRIORITY_COLOR[task.priority] }}
            />
            {PRIORITY_LABEL[task.priority]}
          </span>
          {due && (
            <span
              className={due.overdue ? 'font-medium text-[#ef4444]' : ''}
              data-testid="task-due-label"
            >
              {due.text}
            </span>
          )}
          {task.status === 'doing' && (
            <span className="rounded-full bg-[var(--work-accent-soft)] px-1.5 text-[var(--work-accent-text)]">
              In Progress
            </span>
          )}
          {project && (
            <span className="flex min-w-0 items-center gap-1">
              <span
                className="size-1.5 rounded-sm"
                style={{ background: colorHex(project.color) }}
              />
              <span className="truncate">{project.name}</span>
            </span>
          )}
        </span>
      </button>
      {!done && (
        <button
          type="button"
          aria-label={`Focus on ${task.title}`}
          title="Focus on this"
          onClick={() => void invoke('focus:start', { taskId: task.id })}
          className="grid size-7 shrink-0 place-items-center rounded-[8px] text-[var(--note-muted)] opacity-0 group-hover:opacity-100 hover:bg-[var(--note-hover)] hover:text-[var(--work-accent-text)] focus-visible:opacity-100"
          data-testid="task-focus"
        >
          <Crosshair size={13} />
        </button>
      )}
      <button
        type="button"
        aria-label={`Delete ${task.title}`}
        onClick={() => void remove()}
        className="grid size-7 shrink-0 place-items-center rounded-[8px] text-[var(--note-muted)] opacity-0 group-hover:opacity-100 hover:bg-[var(--note-hover)] hover:text-[#ef4444] focus-visible:opacity-100"
        data-testid="task-remove"
      >
        <Trash2 size={13} />
      </button>
    </li>
  );
}
