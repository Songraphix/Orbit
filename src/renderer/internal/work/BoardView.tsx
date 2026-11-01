import { ArrowLeft, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DragEvent } from 'react';
import {
  PRIORITY_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  colorHex,
  dateKey,
  dueLabel,
} from '@shared/work';
import type { Task, TaskStatus } from '@shared/work';
import { useWork } from './context';
import { MoreMenu } from './parts';

const invoke = window.orbit.invoke;
const DRAG = 'application/x-orbit-task';
const COLUMN_DOT: Record<TaskStatus, string> = {
  todo: '#94a3b8',
  doing: '#7c6cff',
  done: '#22c55e',
};

/**
 * The Project Board (Quick Actions): every task in To Do / In Progress / Done columns, for one
 * project or all. Drag a card to another column, or use its menu. The panel widens meanwhile.
 */
export function BoardView({ onBack }: { onBack: () => void }) {
  const work = useWork();
  const [projectId, setProjectId] = useState<string>('all');
  const [over, setOver] = useState<TaskStatus | null>(null);

  useEffect(() => {
    void invoke('work:panelWide', { wide: true });
    return () => void invoke('work:panelWide', { wide: false });
  }, []);

  if (!work.data) return null;
  const today = dateKey(new Date());
  const { projects } = work.data;
  const tasks = work.data.tasks.filter((t) => projectId === 'all' || t.projectId === projectId);
  const move = async (task: Task, status: TaskStatus) => {
    if (task.status === status) return;
    const data = await work.run(invoke('work:taskStatus', { id: task.id, status }));
    if (data) work.set(data);
  };
  const drop = (status: TaskStatus) => (e: DragEvent) => {
    e.preventDefault();
    setOver(null);
    const task = work.data?.tasks.find((t) => t.id === e.dataTransfer.getData(DRAG));
    if (task) void move(task, status);
  };

  return (
    <section className="flex h-full min-h-0 flex-col px-4 pt-2" data-testid="board-view">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="press flex h-7 items-center gap-1 rounded-[9px] pr-2 pl-1 text-[13px] font-medium text-[var(--note-muted)] hover:bg-[var(--note-hover)] hover:text-[var(--note-fg)]"
          data-testid="board-back"
        >
          <ArrowLeft size={15} />
          Back
        </button>
        <h1 className="flex-1 text-[18px] font-bold">Project Board</h1>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          aria-label="Project"
          className="h-8 max-w-[45%] rounded-[10px] bg-[var(--work-card)] px-2 text-[12.5px] ring-1 ring-[var(--work-border)] outline-none"
          data-testid="board-project"
        >
          <option value="all">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-2.5 pb-3">
        {TASK_STATUSES.map((status) => {
          const column = tasks.filter((t) => t.status === status);
          return (
            <div
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver((s) => (s === status ? null : s))}
              onDrop={drop(status)}
              className={`flex min-h-0 flex-col rounded-[16px] bg-[var(--work-card)] p-2 ring-1 transition ${
                over === status ? 'ring-2 ring-[var(--work-accent)]' : 'ring-[var(--work-border)]'
              }`}
              data-testid="board-column"
              data-status={status}
            >
              <div className="mb-2 flex items-center gap-2 px-1.5 pt-1 text-[12.5px] font-semibold">
                <span className="size-2 rounded-full" style={{ background: COLUMN_DOT[status] }} />
                {TASK_STATUS_LABEL[status]}
                <span className="font-normal text-[var(--note-muted)]">{column.length}</span>
              </div>
              <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
                {column.map((task) => {
                  const project = projects.find((p) => p.id === task.projectId);
                  const due = task.dueDate
                    ? dueLabel(task.dueDate, today, status === 'done')
                    : null;
                  return (
                    <li
                      key={task.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DRAG, task.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={() => work.editTask({ task })}
                      className="animate-row-in cursor-grab rounded-[12px] bg-[var(--work-sheet)] p-2.5 shadow-[0_1px_2px_rgb(0_0_0/0.15)] ring-1 ring-[var(--work-border)] active:cursor-grabbing"
                      data-testid="board-card"
                    >
                      <div className="flex items-start gap-1">
                        <span
                          className={`min-w-0 flex-1 text-[12.5px] leading-snug font-medium ${status === 'done' ? 'text-[var(--note-muted)] line-through' : ''}`}
                        >
                          {task.title}
                        </span>
                        <MoreMenu
                          label={`Move ${task.title}`}
                          items={TASK_STATUSES.map((s) => ({
                            label: `Move to ${TASK_STATUS_LABEL[s]}`,
                            checked: s === task.status,
                            onSelect: () => void move(task, s),
                            testId: `move-${s}`,
                          }))}
                        />
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--note-muted)]">
                        <span>{PRIORITY_LABEL[task.priority]}</span>
                        {due && (
                          <span className={due.overdue ? 'text-[#ef4444]' : ''}>{due.text}</span>
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
                      </div>
                    </li>
                  );
                })}
              </ul>
              {status !== 'done' && (
                <button
                  type="button"
                  onClick={() =>
                    work.editTask({ projectId: projectId === 'all' ? null : projectId })
                  }
                  className="press mt-1.5 flex h-8 items-center justify-center gap-1 rounded-[10px] text-[12px] text-[var(--note-muted)] hover:bg-[var(--note-hover)] hover:text-[var(--note-fg)]"
                  data-testid="board-add"
                >
                  <Plus size={13} /> Add Task
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
