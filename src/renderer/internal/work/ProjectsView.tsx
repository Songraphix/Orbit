import {
  AppWindow,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CircleCheck,
  Crosshair,
  FolderOpen,
  ListChecks,
  NotebookPen,
  Plus,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { relativeTime } from '@shared/time';
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABEL,
  continueWith,
  dateKey,
  filterProjects,
  filterTasks,
  projectCounts,
  projectProgress,
} from '@shared/work';
import type { Project, ProjectFilter, ProjectStatus } from '@shared/work';
import { showProject, useWork } from './context';
import type { Work } from './context';
import {
  Empty,
  FilterPills,
  FolderIcon,
  MoreMenu,
  PrimaryButton,
  ProgressBar,
  ViewHeader,
} from './parts';
import type { MenuItem } from './parts';
import { TaskRow } from './TaskRow';
import { ProjectResearch, UnsortedResearch } from './research';

import { ProjectGithub, SaveTemplateSheet } from './github';

const invoke = window.orbit.invoke;

/** Edit, change status, delete — the ⋯ menu on a card and on a project's page. */
function projectMenu(
  work: Work,
  project: Project,
  onDeleted?: () => void,
  onSaveTemplate?: () => void,
): MenuItem[] {
  const status = (next: ProjectStatus) => async () => {
    const data = await work.run(
      invoke('work:projectStatus', { id: project.id, status: next }),
      `Marked ${PROJECT_STATUS_LABEL[next]}`,
    );
    if (data) work.set(data);
  };
  return [
    { label: 'Edit Project', onSelect: () => work.editProject(project), testId: 'menu-edit' },
    ...(onSaveTemplate
      ? [{ label: 'Save as Template…', onSelect: onSaveTemplate, testId: 'menu-save-template' }]
      : []),
    { divider: true },
    {
      label: 'Export Tasks as CSV…',
      onSelect: () => void exportTasks(work, project, 'csv'),
      testId: 'menu-export-csv',
    },
    {
      label: 'Export Tasks as Markdown…',
      onSelect: () => void exportTasks(work, project, 'md'),
      testId: 'menu-export-md',
    },
    {
      label: 'Import Tasks…',
      onSelect: () =>
        void work.run(invoke('work:importTasks', { projectId: project.id })).then((result) => {
          if (!result) return;
          work.set(result.data);
          if (result.imported > 0) {
            work.flash(`Imported ${result.imported} task${result.imported === 1 ? '' : 's'}`);
          }
        }),
      testId: 'menu-import',
    },
    { divider: true },
    ...PROJECT_STATUSES.map((s) => ({
      label: PROJECT_STATUS_LABEL[s],
      checked: project.status === s,
      onSelect: () => void status(s)(),
      testId: `menu-status-${s}`,
    })),
    { divider: true },
    {
      label: 'Delete Project…',
      danger: true,
      testId: 'menu-delete',
      onSelect: () =>
        void work.run(invoke('work:deleteProject', { id: project.id })).then((result) => {
          if (!result) return;
          work.set(result.data);
          if (result.deleted) {
            work.flash('Project deleted');
            onDeleted?.();
          }
        }),
    },
  ];
}

/** Export Tasks (roadmap P4.3): main asks where to save. */
async function exportTasks(work: Work, project: Project, format: 'csv' | 'md') {
  const result = await work.run(invoke('work:exportTasks', { projectId: project.id, format }));
  if (result?.saved) work.flash('Tasks exported');
}

/** Goes to a project's workspace (its Space, with its tabs as they were left). */
function useOpenWorkspace() {
  const work = useWork();
  return async (project: Project) => {
    const data = await work.run(invoke('work:openProject', { id: project.id, workspace: true }));
    if (!data) return;
    work.set(data);
    const space = data.spaces.find((s) => s.id === project.spaceId);
    if (space) work.flash(`Switched to ${space.name}`);
  };
}

/** "Continue where you left off": the open project looked at last, and its next task. */
function ContinueCard({ project, next }: { project: Project; next: { title: string } | null }) {
  const openWorkspace = useOpenWorkspace();
  return (
    <div
      className="mx-3 mt-3 rounded-[16px] bg-[var(--work-accent-soft)] p-3 ring-1 ring-[var(--work-accent)]/30"
      data-testid="continue-card"
    >
      <div className="text-[11px] font-semibold tracking-wide text-[var(--work-accent-text)] uppercase">
        Continue where you left off
      </div>
      <button
        type="button"
        onClick={() => showProject(project.id)}
        className="mt-1.5 flex w-full items-center gap-3 text-left"
        data-testid="continue-open"
      >
        <FolderIcon color={project.color} size={34} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">{project.name}</span>
          <span className="block truncate text-[12px] text-[var(--note-muted)]">
            {next ? `Next: ${next.title}` : 'No open tasks'}
          </span>
        </span>
        <ArrowRight size={16} className="text-[var(--note-muted)]" />
      </button>
      {project.spaceId && (
        <button
          type="button"
          onClick={() => void openWorkspace(project)}
          className="press mt-2.5 flex h-8 w-full items-center justify-center gap-1.5 rounded-[10px] bg-[var(--work-accent)] text-[12.5px] font-semibold text-white"
          data-testid="continue-workspace"
        >
          <AppWindow size={14} />
          Open Workspace
        </button>
      )}
    </div>
  );
}

/** The Projects tab: filters with live counts and a card per project. */
export function ProjectsView() {
  const work = useWork();
  const [filter, setFilter] = useState<ProjectFilter>('all');
  if (!work.data) return null;
  const { projects, tasks } = work.data;
  const counts = projectCounts(projects);
  const shown = filterProjects(projects, filter);
  const resume = continueWith(projects, tasks);
  return (
    <section data-testid="projects-view">
      {resume && <ContinueCard {...resume} />}
      <ViewHeader
        title="Projects"
        action={
          <PrimaryButton onClick={() => work.editProject()} testId="new-project">
            <Plus size={15} strokeWidth={2.4} />
            New Project
          </PrimaryButton>
        }
      />
      <div className="px-4 pb-3">
        <FilterPills
          value={filter}
          onChange={setFilter}
          testId="project-filters"
          options={[
            { id: 'all', label: 'All', count: counts.all },
            { id: 'active', label: 'Active', count: counts.active },
            { id: 'on-hold', label: 'On Hold', count: counts['on-hold'] },
            { id: 'done', label: 'Done', count: counts.done },
          ]}
        />
      </div>
      <UnsortedResearch />
      <ul className="flex flex-col gap-2 px-3" data-testid="project-list">
        {shown.map((project) => {
          const progress = projectProgress(project.id, tasks);
          const complete =
            project.status === 'done' || (progress.total > 0 && progress.percent === 100);
          return (
            <li key={project.id} className="animate-row-in">
              <div
                role="button"
                tabIndex={0}
                onClick={() => showProject(project.id)}
                onKeyDown={(e) => e.key === 'Enter' && showProject(project.id)}
                className="press flex cursor-default gap-3 rounded-[16px] bg-[var(--work-card)] p-3 ring-1 ring-[var(--work-border)] hover:ring-[var(--work-accent)]/40"
                data-testid="project-card"
                data-status={project.status}
              >
                <FolderIcon color={project.color} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div
                        className="truncate text-[14px] font-semibold"
                        data-testid="project-card-name"
                      >
                        {project.name}
                      </div>
                      {project.description && (
                        <div className="truncate text-[12px] text-[var(--note-muted)]">
                          {project.description}
                        </div>
                      )}
                    </div>
                    {complete && (
                      <CircleCheck
                        size={20}
                        className="mt-1 shrink-0 fill-[#22c55e] text-[var(--work-sheet)]"
                        aria-label="Completed"
                        data-testid="project-complete"
                      />
                    )}
                    <MoreMenu
                      label={`${project.name} actions`}
                      items={projectMenu(work, project)}
                    />
                  </div>
                  <div className="mt-2.5 flex items-center gap-3">
                    <ProgressBar percent={progress.percent} color={project.color} />
                    <span
                      className="w-9 text-right text-[12px] font-semibold tabular-nums"
                      data-testid="project-percent"
                    >
                      {progress.percent}%
                    </span>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {projects.length === 0 && (
        <Empty
          icon={<FolderOpen size={30} strokeWidth={1.5} />}
          title="No projects yet"
          hint="Group your tasks into projects and watch them fill up."
          action={{
            label: 'Create Project',
            onClick: () => work.editProject(),
            testId: 'empty-new-project',
          }}
        />
      )}
      {projects.length > 0 && shown.length === 0 && (
        <Empty
          icon={<FolderOpen size={30} strokeWidth={1.5} />}
          title={`No ${PROJECT_STATUS_LABEL[filter as ProjectStatus].toLowerCase()} projects`}
          action={{ label: 'Show All', onClick: () => setFilter('all') }}
        />
      )}
    </section>
  );
}

function Stat({ label, value, testId }: { label: string; value: string | number; testId: string }) {
  return (
    <div className="rounded-[12px] bg-[var(--work-card)] px-3 py-2 ring-1 ring-[var(--work-border)]">
      <div className="text-[17px] font-bold tabular-nums" data-testid={testId}>
        {value}
      </div>
      <div className="text-[11px] text-[var(--note-muted)]">{label}</div>
    </div>
  );
}

const STATUS_STYLE: Record<ProjectStatus, string> = {
  active: 'bg-[#3b82f6]/15 text-[#3b82f6]',
  'on-hold': 'bg-[#f59e0b]/15 text-[#f59e0b]',
  done: 'bg-[#22c55e]/15 text-[#22c55e]',
};

const fmt = (key: string) => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

/** One project: its overview, stats and its tasks (add, tick, edit, delete). */
export function ProjectDetail({ id }: { id: string }) {
  const work = useWork();
  const openWorkspace = useOpenWorkspace();
  const { set } = work;
  const [savingTemplate, setSavingTemplate] = useState(false);
  // Opening the page counts as working on it ("Continue where you left off").
  useEffect(() => {
    void invoke('work:openProject', { id, workspace: false }).then(set, () => undefined);
  }, [id, set]);
  if (!work.data) return null;
  const project = work.data.projects.find((p) => p.id === id);
  if (!project) {
    return (
      <Empty
        icon={<FolderOpen size={30} strokeWidth={1.5} />}
        title="This project was deleted"
        action={{ label: 'Back to Projects', onClick: () => showProject(null) }}
      />
    );
  }
  const today = dateKey(new Date());
  const progress = projectProgress(project.id, work.data.tasks);
  const tasks = filterTasks(
    work.data.tasks.filter((t) => t.projectId === project.id),
    'all',
    today,
  );
  return (
    <section className="px-4 pt-2" data-testid="project-detail">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => showProject(null)}
          className="press flex h-7 items-center gap-1 rounded-[9px] pr-2 pl-1 text-[13px] font-medium text-[var(--note-muted)] hover:bg-[var(--note-hover)] hover:text-[var(--note-fg)]"
          data-testid="project-back"
        >
          <ArrowLeft size={15} />
          Projects
        </button>
        <MoreMenu
          label={`${project.name} actions`}
          items={projectMenu(
            work,
            project,
            () => showProject(null),
            () => setSavingTemplate(true),
          )}
        />
      </div>
      <div className="flex gap-3">
        <FolderIcon color={project.color} size={48} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[19px] leading-tight font-bold" data-testid="project-title">
            {project.name}
          </h1>
          {project.description && (
            <p className="mt-0.5 text-[12.5px] text-[var(--note-muted)]">{project.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px] text-[var(--note-muted)]">
            <span
              className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_STYLE[project.status]}`}
              data-testid="project-status-badge"
            >
              {PROJECT_STATUS_LABEL[project.status]}
            </span>
            {(project.startDate || project.dueDate) && (
              <span className="flex items-center gap-1">
                <CalendarDays size={12} />
                {project.startDate && fmt(project.startDate)}
                {project.startDate && project.dueDate && ' – '}
                {project.dueDate && `${project.startDate ? '' : 'Due '}${fmt(project.dueDate)}`}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <ProgressBar percent={progress.percent} color={project.color} />
        <span className="text-[13px] font-bold tabular-nums" data-testid="detail-percent">
          {progress.percent}%
        </span>
      </div>
      {project.status === 'done' && progress.remaining > 0 && (
        <p className="mt-2 text-[12px] text-[#f59e0b]" data-testid="done-with-open">
          Marked Done with {progress.remaining} open {progress.remaining === 1 ? 'task' : 'tasks'}.
        </p>
      )}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Tasks" value={progress.total} testId="stat-total" />
        <Stat label="Completed" value={progress.done} testId="stat-done" />
        <Stat label="Remaining" value={progress.remaining} testId="stat-remaining" />
      </div>
      <Workspace
        project={project}
        spaces={work.data.spaces}
        onOpen={() => void openWorkspace(project)}
      />
      <div className="mt-5 mb-1 flex items-center gap-2">
        <h2 className="flex-1 text-[14px] font-semibold">Tasks</h2>
        {tasks.some((t) => t.status !== 'done') && (
          // Focus mode (roadmap P2.3) on the next open task.
          <button
            type="button"
            onClick={() =>
              void invoke('focus:start', {
                taskId: tasks.find((t) => t.status !== 'done')!.id,
              })
            }
            className="press flex h-7 items-center gap-1 rounded-[9px] px-2 text-[12.5px] font-semibold text-[var(--work-accent-text)] hover:bg-[var(--work-accent-soft)]"
            data-testid="project-focus"
          >
            <Crosshair size={13} />
            Focus
          </button>
        )}
        <PrimaryButton
          small
          onClick={() => work.editTask({ projectId: project.id })}
          testId="project-add-task"
        >
          <Plus size={13} strokeWidth={2.4} />
          Add Task
        </PrimaryButton>
      </div>
      {tasks.length > 0 ? (
        <ul className="-mx-2 flex flex-col" data-testid="project-tasks">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} today={today} />
          ))}
        </ul>
      ) : (
        <Empty
          icon={<ListChecks size={28} strokeWidth={1.5} />}
          title="No tasks in this project"
          hint="Progress is counted from tasks — add the first one."
          action={{
            label: 'Add Task',
            onClick: () => work.editTask({ projectId: project.id }),
            testId: 'empty-add-task',
          }}
        />
      )}
      <ProjectGithub project={project} />
      <ProjectResearch projectId={project.id} />
      <ProjectNotes
        projectId={project.id}
        notes={work.data.notes.filter((n) => n.projectId === project.id)}
      />
      {savingTemplate && (
        <SaveTemplateSheet project={project} onClose={() => setSavingTemplate(false)} />
      )}
    </section>
  );
}

/** Where the project's tabs live: its Space, one click away (or a way to give it one). */
function Workspace(props: {
  project: Project;
  spaces: { id: string; name: string }[];
  onOpen: () => void;
}) {
  const work = useWork();
  const space = props.spaces.find((s) => s.id === props.project.spaceId);
  return (
    <div
      className="mt-3 flex items-center gap-3 rounded-[12px] bg-[var(--work-card)] px-3 py-2.5 ring-1 ring-[var(--work-border)]"
      data-testid="project-workspace"
    >
      <AppWindow size={16} className="shrink-0 text-[var(--note-muted)]" />
      <span className="min-w-0 flex-1 text-[12.5px]">
        {space ? (
          <>
            <span className="block text-[var(--note-muted)]">Workspace</span>
            <span className="block truncate font-semibold">{space.name}</span>
          </>
        ) : (
          <span className="text-[var(--note-muted)]">
            No workspace — link a Space to keep this project&rsquo;s tabs together.
          </span>
        )}
      </span>
      {space ? (
        <PrimaryButton small onClick={props.onOpen} testId="open-workspace">
          Open Workspace
        </PrimaryButton>
      ) : (
        <button
          type="button"
          onClick={() => work.editProject(props.project)}
          className="press shrink-0 rounded-[9px] px-2 py-1 text-[12.5px] font-semibold text-[var(--work-accent-text)] hover:bg-[var(--work-accent-soft)]"
          data-testid="link-workspace"
        >
          Link a Space
        </button>
      )}
    </div>
  );
}

/** The project's notes: open one, or write a new one that belongs to it. */
function ProjectNotes(props: {
  projectId: string;
  notes: { id: string; title: string; updatedAt: number }[];
}) {
  const work = useWork();
  const [now] = useState(() => Date.now());
  const create = async () => {
    const result = await work.run(invoke('notes:create', { projectId: props.projectId }));
    if (result) window.location.hash = `#/notes/panel/${result.id}`;
  };
  return (
    <div className="mt-5 pb-4" data-testid="project-notes">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[14px] font-semibold">Notes</h2>
        <button
          type="button"
          onClick={() => void create()}
          className="press flex h-7 items-center gap-1 rounded-[9px] px-2 text-[12.5px] font-semibold text-[var(--work-accent-text)] hover:bg-[var(--work-accent-soft)]"
          data-testid="project-new-note"
        >
          <Plus size={13} strokeWidth={2.4} />
          New Note
        </button>
      </div>
      {props.notes.length > 0 ? (
        <ul className="-mx-2 flex flex-col">
          {props.notes.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => (window.location.hash = `#/notes/panel/${n.id}`)}
                className="press flex w-full items-center gap-2.5 rounded-[11px] px-2 py-2 text-left hover:bg-[var(--note-hover)]"
                data-testid="project-note"
              >
                <NotebookPen size={14} className="shrink-0 text-[var(--note-muted)]" />
                <span className="min-w-0 flex-1 truncate text-[13.5px]">{n.title}</span>
                <span className="shrink-0 text-[11.5px] text-[var(--note-muted)]">
                  {relativeTime(n.updatedAt, now)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-2 text-[12.5px] text-[var(--note-muted)]">
          Research, briefs and ideas for this project go here.
        </p>
      )}
    </div>
  );
}
