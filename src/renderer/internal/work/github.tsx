import {
  CircleDot,
  ExternalLink,
  GitPullRequest,
  GitPullRequestDraft,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { taskFromGithub } from '@shared/github';
import type { GithubItem, GithubRepoView } from '@shared/github';
import { relativeTime } from '@shared/time';
import type { Project } from '@shared/work';
import { useWork } from './context';
import { Sheet } from './forms';

const invoke = window.orbit.invoke;

/**
 * GitHub on a project's page (roadmap P4.2): the repository's open pull requests and issues —
 * open one in a tab, or make it a task (linked back to GitHub in its description).
 */
export function ProjectGithub({ project }: { project: Project }) {
  const work = useWork();
  const [view, setView] = useState<GithubRepoView | null>(null);
  const [tab, setTab] = useState<'pull' | 'issue'>('pull');
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const repo = project.githubRepo;
  useEffect(() => {
    if (!repo) return;
    let live = true;
    void invoke('github:repo', { projectId: project.id }).then((next) => {
      if (!live) return;
      setView(next);
      setNow(Date.now());
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [project.id, repo]);
  if (!repo) return null;
  const refresh = () => {
    setLoading(true);
    void invoke('github:repo', { projectId: project.id, refresh: true }).then((next) => {
      setView(next);
      setNow(Date.now());
      setLoading(false);
    });
  };
  const items = view ? (tab === 'pull' ? view.pulls : view.issues) : [];
  return (
    <section className="mt-6" data-testid="project-github">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate text-[14px] font-semibold">
          GitHub <span className="font-normal text-[var(--note-muted)]">· {repo}</span>
        </h2>
        <button
          type="button"
          onClick={refresh}
          className="press grid size-7 place-items-center rounded-[9px] text-[var(--note-muted)] hover:bg-[var(--note-hover)] hover:text-[var(--note-fg)]"
          aria-label="Refresh"
          title="Refresh"
          data-testid="github-refresh"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
        <button
          type="button"
          onClick={() => void invoke('notes:openUrl', { url: `https://github.com/${repo}` })}
          className="press grid size-7 place-items-center rounded-[9px] text-[var(--note-muted)] hover:bg-[var(--note-hover)] hover:text-[var(--note-fg)]"
          aria-label="Open on GitHub"
          title="Open on GitHub"
        >
          <ExternalLink size={13} />
        </button>
      </div>
      <div className="mb-2 flex gap-1" role="tablist">
        {(['pull', 'issue'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            role="tab"
            aria-selected={tab === kind}
            onClick={() => setTab(kind)}
            className={`press flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium ${
              tab === kind
                ? 'bg-[var(--work-accent-soft)] text-[var(--work-accent-text)]'
                : 'text-[var(--note-muted)] hover:bg-[var(--note-hover)]'
            }`}
            data-testid="github-tab"
            data-kind={kind}
          >
            {kind === 'pull' ? <GitPullRequest size={13} /> : <CircleDot size={13} />}
            {kind === 'pull' ? 'Pull requests' : 'Issues'}
            {view && (
              <span className="tabular-nums">
                {kind === 'pull' ? view.pulls.length : view.issues.length}
              </span>
            )}
          </button>
        ))}
      </div>
      {view?.error && (
        <p
          className="mb-2 rounded-[10px] bg-[var(--work-card)] px-3 py-2 text-[12px] text-[var(--note-muted)]"
          role="status"
          data-testid="github-error"
        >
          {view.error}
        </p>
      )}
      {view && !view.error && items.length === 0 && (
        <p className="px-1 text-[12.5px] text-[var(--note-muted)]" data-testid="github-empty">
          No open {tab === 'pull' ? 'pull requests' : 'issues'}.
        </p>
      )}
      <ul className="-mx-2 flex flex-col" data-testid="github-items">
        {items.slice(0, 15).map((item) => (
          <GithubRow
            key={`${item.kind}-${item.number}`}
            item={item}
            now={now}
            onTask={() =>
              work.editTask({ projectId: project.id, prefill: taskFromGithub(item, repo) })
            }
          />
        ))}
      </ul>
    </section>
  );
}

function GithubRow(props: { item: GithubItem; now: number; onTask: () => void }) {
  const { item } = props;
  const Icon =
    item.kind === 'issue' ? CircleDot : item.draft ? GitPullRequestDraft : GitPullRequest;
  return (
    <li
      className="group flex items-start gap-2 rounded-[10px] px-2 py-1.5 hover:bg-[var(--note-hover)]"
      data-testid="github-item"
    >
      <Icon
        size={14}
        className={`mt-0.5 shrink-0 ${item.draft ? 'text-[var(--note-muted)]' : 'text-[#1f883d]'}`}
      />
      <button
        type="button"
        onClick={() => void invoke('notes:openUrl', { url: item.url })}
        className="min-w-0 flex-1 text-left"
        title={item.url}
      >
        <span className="block truncate text-[13px]">
          <span className="text-[var(--note-muted)]">#{item.number}</span> {item.title}
        </span>
        <span className="flex flex-wrap items-center gap-1 text-[11px] text-[var(--note-muted)]">
          {item.author && <span>{item.author}</span>}
          {item.updatedAt > 0 && <span>· {relativeTime(item.updatedAt, props.now)}</span>}
          {item.labels.map((label) => (
            <span
              key={label}
              className="rounded-full bg-[var(--work-card)] px-1.5 ring-1 ring-[var(--work-border)]"
            >
              {label}
            </span>
          ))}
        </span>
      </button>
      <button
        type="button"
        onClick={props.onTask}
        className="press flex h-6 shrink-0 items-center gap-0.5 rounded-[8px] px-1.5 text-[11.5px] font-semibold text-[var(--work-accent-text)] opacity-0 group-hover:opacity-100 hover:bg-[var(--work-accent-soft)] focus-visible:opacity-100"
        aria-label={`Make a task from #${item.number}`}
        data-testid="github-make-task"
      >
        <Plus size={12} />
        Task
      </button>
    </li>
  );
}

/** Save as Template (roadmap P4.1): name it; its tasks start new projects. */
export function SaveTemplateSheet(props: { project: Project; onClose: () => void }) {
  const work = useWork();
  const [name, setName] = useState(props.project.name);
  const tasks = work.data?.tasks.filter((t) => t.projectId === props.project.id).length ?? 0;
  return (
    <Sheet title="Save as Template" onClose={props.onClose} testId="template-sheet">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void work
            .run(
              invoke('work:saveProjectTemplate', { projectId: props.project.id, name }),
              'Template saved',
            )
            .then((data) => {
              if (!data) return;
              work.set(data);
              props.onClose();
            });
        }}
      >
        <label className="block text-[12px] font-medium text-[var(--note-muted)]">
          Template name
          <input
            ref={(el) => el?.focus()}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            className="mt-1 h-9 w-full rounded-[10px] border border-[var(--work-border)] bg-transparent px-3 text-[13.5px] text-[var(--note-fg)] outline-none focus:border-[var(--work-accent)]"
            data-testid="template-name"
          />
        </label>
        <p className="mt-2 text-[12px] text-[var(--note-muted)]">
          New projects started from it get its {tasks} task{tasks === 1 ? '' : 's'}, with due dates
          kept relative to the start date.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={props.onClose}
            className="press h-9 rounded-[11px] px-3.5 text-[13.5px] font-medium hover:bg-[var(--note-hover)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="press h-9 rounded-[11px] bg-[var(--work-accent)] px-3.5 text-[13.5px] font-semibold text-white disabled:opacity-40"
            data-testid="template-save"
          >
            Save Template
          </button>
        </div>
      </form>
    </Sheet>
  );
}
