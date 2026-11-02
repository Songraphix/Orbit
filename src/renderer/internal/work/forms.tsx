import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { githubRepo } from '@shared/github';
import type { FormEvent, ReactNode } from 'react';
import {
  PRIORITIES,
  PRIORITY_LABEL,
  PROJECT_COLORS,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  projectProblem,
  taskProblem,
} from '@shared/work';
import type { Priority, Project, ProjectColor, ProjectStatus, TaskStatus } from '@shared/work';
import { useWork } from './context';
import type { TaskDraft } from './context';

const invoke = window.orbit.invoke;
const NEW_SPACE = '__new__';
const TEMPLATE = '__template__:';

/** A form sliding up over the panel; Esc or a click on the dim area cancels. */
export function Sheet(props: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  testId: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <div
      className="absolute inset-0 z-40 flex flex-col justify-end bg-black/35 animate-[orbit-fade-in_160ms_var(--ease-out)]"
      onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}
    >
      <div
        role="dialog"
        aria-label={props.title}
        className="animate-rise max-h-[92%] overflow-y-auto rounded-t-[22px] bg-[var(--work-sheet)] px-4 pt-3 pb-4 shadow-[0_-12px_40px_-12px_rgb(0_0_0/0.5)]"
        data-testid={props.testId}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold">{props.title}</h2>
          <button
            type="button"
            aria-label="Cancel"
            onClick={props.onClose}
            className="press grid size-7 place-items-center rounded-[9px] text-[var(--note-muted)] hover:bg-[var(--note-hover)]"
          >
            <X size={15} />
          </button>
        </div>
        {props.children}
      </div>
    </div>
  );
}

const INPUT =
  'h-9 w-full rounded-[10px] bg-[var(--work-card)] px-3 text-[13.5px] outline-none ring-1 ring-[var(--work-border)] placeholder:text-[var(--note-muted)] focus:ring-2 focus:ring-[var(--work-accent)]';

function Field(props: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-[12px] font-medium text-[var(--note-muted)]">
        {props.label}
        {props.required && <span className="text-[var(--work-accent-text)]"> *</span>}
      </span>
      {props.children}
    </label>
  );
}

function Choices<T extends string>(props: {
  value: T;
  options: readonly T[];
  label: (v: T) => string;
  onChange: (v: T) => void;
  testId: string;
}) {
  return (
    <div
      className="flex gap-1 rounded-[11px] bg-[var(--work-card)] p-1 ring-1 ring-[var(--work-border)]"
      data-testid={props.testId}
    >
      {props.options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={o === props.value}
          onClick={() => props.onChange(o)}
          className={`h-7 flex-1 rounded-[8px] text-[12.5px] font-medium ${
            o === props.value
              ? 'bg-[var(--work-accent)] text-white'
              : 'text-[var(--note-muted)] hover:text-[var(--note-fg)]'
          }`}
          data-value={o}
        >
          {props.label(o)}
        </button>
      ))}
    </div>
  );
}

function Actions(props: {
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  label: string;
}) {
  return (
    <>
      {props.error && (
        <p className="mb-2 text-[12.5px] text-[#ef4444]" role="alert" data-testid="form-error">
          {props.error}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={props.onCancel}
          className="press h-9 rounded-[11px] px-4 text-[13.5px] font-medium text-[var(--note-muted)] hover:bg-[var(--note-hover)]"
          data-testid="form-cancel"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={props.saving}
          className="press h-9 rounded-[11px] bg-[var(--work-accent)] px-4 text-[13.5px] font-semibold text-white disabled:opacity-50"
          data-testid="form-save"
        >
          {props.label}
        </button>
      </div>
    </>
  );
}

/** New or edit a project: name (required), description, status, colour, dates. */
export function ProjectForm({ project, onClose }: { project?: Project; onClose: () => void }) {
  const { data, set, run, flash } = useWork();
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'active');
  const [color, setColor] = useState<ProjectColor>(project?.color ?? 'purple');
  const [startDate, setStartDate] = useState(project?.startDate ?? '');
  const [dueDate, setDueDate] = useState(project?.dueDate ?? '');
  /** '' = no workspace, NEW_SPACE = make one, else a Space's id. */
  const [space, setSpace] = useState(project?.spaceId ?? '');
  /** A new project's starting tasks (roadmap P4.1): '' = blank. */
  const [startFrom, setStartFrom] = useState('');
  /** A GitHub repository to follow (roadmap P4.2), as typed. */
  const [repo, setRepo] = useState(project?.githubRepo ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return; // no double submits
    const input = {
      ...(project ? { id: project.id } : {}),
      name,
      description,
      status,
      color,
      startDate: startDate || null,
      dueDate: dueDate || null,
      spaceId: space && space !== NEW_SPACE && !space.startsWith(TEMPLATE) ? space : null,
      ...(space === NEW_SPACE ? { newSpace: true } : {}),
      ...(space.startsWith(TEMPLATE) ? { templateId: space.slice(TEMPLATE.length) } : {}),
      githubRepo: repo.trim() ? repo.trim() : null,
      ...(!project && startFrom ? { projectTemplate: startFrom } : {}),
    };
    const problem =
      projectProblem(input) ??
      (repo.trim() && !githubRepo(repo) ? 'Use owner/repository for GitHub' : null);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    const result = await run(invoke('work:saveProject', input));
    setSaving(false);
    if (!result) return;
    set(result.data);
    flash(project ? 'Project saved' : 'Project created');
    onClose();
  };

  return (
    <Sheet title={project ? 'Edit Project' : 'New Project'} onClose={onClose} testId="project-form">
      <form onSubmit={(e) => void submit(e)} noValidate>
        <Field label="Project name" required>
          <input
            ref={(el) => {
              if (el && !project) el.focus();
            }}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            maxLength={80}
            placeholder="Brand guide, website…"
            className={INPUT}
            data-testid="project-name"
          />
        </Field>
        {!project && (data?.projectTemplates.length ?? 0) > 0 && (
          <Field label="Start from">
            <select
              value={startFrom}
              onChange={(e) => {
                const id = e.target.value;
                setStartFrom(id);
                const template = data?.projectTemplates.find((t) => t.id === id);
                // A template suggests its description and colour (yours wins once typed).
                if (template && !description.trim()) setDescription(template.description);
                if (template && PROJECT_COLORS.some((c) => c.id === template.color)) {
                  setColor(template.color as ProjectColor);
                }
              }}
              className={INPUT}
              data-testid="project-template"
            >
              <option value="">Blank project</option>
              {data?.projectTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.tasks} task{t.tasks === 1 ? '' : 's'}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Description">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
            placeholder="What it covers"
            className={INPUT}
            data-testid="project-description"
          />
        </Field>
        <Field label="Status">
          <Choices
            value={status}
            options={PROJECT_STATUSES}
            label={(s) => PROJECT_STATUS_LABEL[s]}
            onChange={setStatus}
            testId="project-status"
          />
        </Field>
        <Field label="Color">
          <div className="flex flex-wrap gap-2" data-testid="project-color">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-label={c.id}
                aria-pressed={c.id === color}
                onClick={() => setColor(c.id)}
                className={`press size-7 rounded-full ${
                  c.id === color
                    ? 'ring-2 ring-[var(--note-fg)] ring-offset-2 ring-offset-[var(--work-sheet)]'
                    : ''
                }`}
                style={{ background: c.hex }}
              />
            ))}
          </div>
        </Field>
        <Field label="Workspace">
          <select
            value={space}
            onChange={(e) => setSpace(e.target.value)}
            className={INPUT}
            data-testid="project-space"
          >
            <option value="">No workspace</option>
            {data?.spaces.map((s) => (
              <option key={s.id} value={s.id}>
                Space: {s.name}
              </option>
            ))}
            <option value={NEW_SPACE}>+ New Space for this project</option>
            {data?.templates.map((t) => (
              <option key={t.id} value={`${TEMPLATE}${t.id}`}>
                + New Space from template: {t.name}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11.5px] text-[var(--note-muted)]">
            The Space keeps the project&rsquo;s tabs. Open Workspace takes you back to them.
          </span>
        </Field>
        <Field label="GitHub repository">
          <input
            value={repo}
            onChange={(e) => {
              setRepo(e.target.value);
              setError(null);
            }}
            maxLength={140}
            placeholder="owner/repository (optional)"
            spellCheck={false}
            className={INPUT}
            data-testid="project-github"
          />
          <span className="mt-1 block text-[11.5px] text-[var(--note-muted)]">
            Its open pull requests and issues show on the project&rsquo;s page.
          </span>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Start date">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={INPUT}
              data-testid="project-start"
            />
          </Field>
          <Field label="Due date">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={INPUT}
              data-testid="project-due"
            />
          </Field>
        </div>
        <Actions
          saving={saving}
          error={error}
          onCancel={onClose}
          label={project ? 'Save' : 'Create Project'}
        />
      </form>
    </Sheet>
  );
}

/** New or edit a task: title (required), description, project, priority, status, due date. */
export function TaskForm({ draft, onClose }: { draft: TaskDraft; onClose: () => void }) {
  const { data, set, run, flash } = useWork();
  const task = 'task' in draft ? draft.task : null;
  const prefill = 'task' in draft ? undefined : draft.prefill;
  const captureId = 'task' in draft ? undefined : draft.captureId;
  const [title, setTitle] = useState(task?.title ?? prefill?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? prefill?.description ?? '');
  const [projectId, setProjectId] = useState<string>(
    task ? (task.projectId ?? '') : 'projectId' in draft ? (draft.projectId ?? '') : '',
  );
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'medium');
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'todo');
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const problem = taskProblem({ title });
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    const result = await run(
      invoke('work:saveTask', {
        ...(task ? { id: task.id } : {}),
        ...(captureId ? { captureId } : {}),
        projectId: projectId || null,
        title,
        description,
        priority,
        status,
        dueDate: dueDate || null,
      }),
    );
    setSaving(false);
    if (!result) return;
    set(result.data);
    flash(task ? 'Task saved' : 'Task added');
    onClose();
  };

  const remove = async () => {
    if (!task) return;
    const result = await run(invoke('work:deleteTask', { id: task.id }));
    if (!result) return;
    set(result.data);
    if (result.deleted) {
      flash('Task deleted');
      onClose();
    }
  };

  return (
    <Sheet title={task ? 'Edit Task' : 'Add Task'} onClose={onClose} testId="task-form">
      <form onSubmit={(e) => void submit(e)} noValidate>
        <Field label="Task" required>
          <input
            ref={(el) => {
              if (el && !task) el.focus();
            }}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setError(null);
            }}
            maxLength={200}
            placeholder="What needs doing?"
            className={INPUT}
            data-testid="task-title"
          />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={2}
            placeholder="Details (optional)"
            className={`${INPUT} h-auto resize-none py-2`}
            data-testid="task-description"
          />
        </Field>
        <Field label="Project">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={INPUT}
            data-testid="task-project"
          >
            <option value="">No project</option>
            {data?.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <Choices
            value={priority}
            options={PRIORITIES}
            label={(p) => PRIORITY_LABEL[p]}
            onChange={setPriority}
            testId="task-priority"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className={INPUT}
              data-testid="task-status"
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Due date">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={INPUT}
              data-testid="task-due"
            />
          </Field>
        </div>
        {task && (
          <button
            type="button"
            onClick={() => void remove()}
            className="mb-2 text-[12.5px] font-medium text-[#ef4444] hover:underline"
            data-testid="task-delete"
          >
            Delete task
          </button>
        )}
        <Actions
          saving={saving}
          error={error}
          onCancel={onClose}
          label={task ? 'Save' : 'Add Task'}
        />
      </form>
    </Sheet>
  );
}
