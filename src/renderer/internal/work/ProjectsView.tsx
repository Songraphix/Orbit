import { ArrowLeft, CalendarDays, CircleCheck, FolderOpen, ListChecks, Plus } from 'lucide-react';
import { useState } from 'react';
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABEL,
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

const invoke = window.orbit.invoke;

/** Edit, change status, delete — the ⋯ menu on a card and on a project's page. */
function projectMenu(work: Work, project: Project, onDeleted?: () => void): MenuItem[] {
  const status = (next: ProjectStatus) => async () => {
    const data = await work.run(
      invoke('work:projectStatus', { id: project.id, status: next }),
      `Marked ${PROJECT_STATUS_LABEL[next]}`,
    );
    if (data) work.set(data);
  };
  return [
    { label: 'Edit Project', onSelect: () => work.editProject(project), testId: 'menu-edit' },
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

/** The Projects tab: filters with live counts and a card per project. */
export function ProjectsView() {
  const work = useWork();
  const [filter, setFilter] = useState<ProjectFilter>('all');
  if (!work.data) return null;
  const { projects, tasks } = work.data;
  const counts = projectCounts(projects);
  const shown = filterProjects(projects, filter);
  return (
    <section data-testid="projects-view">
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
          items={projectMenu(work, project, () => showProject(null))}
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
      <div className="mt-5 mb-1 flex items-center justify-between">
        <h2 className="text-[14px] font-semibold">Tasks</h2>
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
    </section>
  );
}
