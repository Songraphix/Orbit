import {
  ArrowRight,
  Bookmark,
  Code2,
  ExternalLink,
  Globe,
  Image as ImageIcon,
  ListPlus,
  Quote,
  SquareCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { captureLabel, hostOf, taskFromCapture } from '@shared/capture';
import { knownService } from '@shared/task-transfer';
import type { Capture } from '@shared/capture';
import { relativeTime } from '@shared/time';
import { colorHex } from '@shared/work';
import { showResearch, useWork } from './context';
import type { Work } from './context';
import { Sheet } from './forms';
import { Empty, MoreMenu, ViewHeader } from './parts';
import type { MenuItem } from './parts';

const invoke = window.orbit.invoke;

/** Thumbnails are fetched once, when first shown. */
const thumbs = new Map<string, string | null>();

function CaptureThumb({ id, size }: { id: string; size: number }) {
  const [src, setSrc] = useState<string | null>(() => thumbs.get(id) ?? null);
  useEffect(() => {
    if (thumbs.has(id)) return;
    let live = true;
    void invoke('research:image', { id, size: 'thumb' }).then(({ image }) => {
      thumbs.set(id, image);
      if (live) setSrc(image);
    });
    return () => {
      live = false;
    };
  }, [id]);
  return src ? (
    <img
      src={src}
      alt=""
      className="shrink-0 rounded-[10px] object-cover ring-1 ring-[var(--work-border)]"
      style={{ width: size, height: size }}
    />
  ) : (
    <KindIcon kind="image" size={size} />
  );
}

const KIND_ICON = { link: Globe, text: Quote, code: Code2, image: ImageIcon } as const;

function KindIcon({ kind, size }: { kind: Capture['kind']; size: number }) {
  const Icon = KIND_ICON[kind];
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[10px] bg-[var(--work-accent-soft)] text-[var(--work-accent-text)]"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Icon size={size * 0.45} />
    </span>
  );
}

/** Make Task / Open Task, Open Source, Copy, Delete. */
function captureActions(work: Work, c: Capture): MenuItem[] {
  const task = c.taskId ? work.data?.tasks.find((t) => t.id === c.taskId) : undefined;
  return [
    task
      ? {
          label: 'Open Task',
          onSelect: () => work.editTask({ task }),
          testId: 'research-open-task',
        }
      : {
          label: 'Make Task…',
          onSelect: () => makeTask(work, c),
          testId: 'research-make-task',
        },
    {
      label: 'Open Source',
      onSelect: () => void invoke('notes:openUrl', { url: c.url }),
      testId: 'research-open-source',
    },
    {
      label: 'Open in Split View',
      onSelect: () => void invoke('toolkit:split', { url: c.url }),
      testId: 'research-open-split',
    },
    {
      label: 'Copy',
      onSelect: () =>
        void work.run(invoke('research:copy', { id: c.id }), 'Copied').then(() => undefined),
      testId: 'research-copy',
    },
    { divider: true },
    {
      label: 'Delete…',
      danger: true,
      testId: 'research-delete',
      onSelect: () => void deleteCapture(work, c.id),
    },
  ];
}

/** A finding turned into a task: the form opens filled in, and saving links them. */
function makeTask(work: Work, c: Capture): void {
  work.editTask({ projectId: c.projectId, prefill: taskFromCapture(c), captureId: c.id });
}

async function deleteCapture(work: Work, id: string): Promise<boolean> {
  const result = await work.run(invoke('research:delete', { id }));
  if (!result) return false;
  work.set(result.data);
  if (result.deleted) work.flash('Finding deleted');
  return result.deleted;
}

/** One finding in a list: open it for all of it, or act from its ⋯ menu. */
export function CaptureRow({
  capture: c,
  showProject,
}: {
  capture: Capture;
  showProject?: boolean;
}) {
  const work = useWork();
  const [now] = useState(() => Date.now());
  const project = showProject ? work.data?.projects.find((p) => p.id === c.projectId) : undefined;
  // A Figma file, a Google Doc, a Jira ticket… named as such (roadmap P4.3).
  const service = knownService(c.url);
  const snippet =
    c.kind === 'text' || c.kind === 'code'
      ? c.text.replace(/\s+/g, ' ').trim()
      : c.comment
        ? c.title
        : '';
  return (
    <li className="group animate-row-in" data-testid="research-row" data-kind={c.kind}>
      <div className="flex items-start gap-3 rounded-[12px] px-2 py-2 hover:bg-[var(--note-hover)]">
        <button
          type="button"
          onClick={() => work.openCapture(c)}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
          data-testid="research-open"
        >
          {c.hasImage ? <CaptureThumb id={c.id} size={40} /> : <KindIcon kind={c.kind} size={40} />}
          <span className="min-w-0 flex-1">
            <span
              className="block truncate text-[13.5px] font-semibold"
              data-testid="research-label"
            >
              {captureLabel(c)}
            </span>
            {snippet && snippet !== captureLabel(c) && (
              <span
                className={`block truncate text-[12px] text-[var(--note-muted)] ${c.kind === 'code' ? 'font-mono' : ''}`}
              >
                {snippet}
              </span>
            )}
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-[var(--note-muted)]">
              {service ? (
                <span
                  className="rounded-full bg-[var(--work-accent-soft)] px-1.5 font-medium text-[var(--work-accent-text)]"
                  data-testid="research-service"
                >
                  {service.name}
                </span>
              ) : (
                <span className="truncate">{hostOf(c.url) || c.title}</span>
              )}
              <span>{relativeTime(c.createdAt, now)}</span>
              {project && (
                <span className="flex items-center gap-1">
                  <span
                    className="size-1.5 rounded-sm"
                    style={{ background: colorHex(project.color) }}
                  />
                  {project.name}
                </span>
              )}
              {c.taskId && (
                <span
                  className="flex items-center gap-1 text-[var(--work-accent-text)]"
                  data-testid="research-has-task"
                >
                  <SquareCheck size={11} />
                  Task
                </span>
              )}
            </span>
          </span>
        </button>
        <MoreMenu label="Finding actions" items={captureActions(work, c)} />
      </div>
    </li>
  );
}

/** A finding's sheet: the whole quote, snippet or screenshot, its source, and moving it. */
export function CaptureSheet({ capture: c, onClose }: { capture: Capture; onClose: () => void }) {
  const work = useWork();
  const [image, setImage] = useState<string | null>(null);
  const current = work.data?.captures.find((x) => x.id === c.id) ?? c;
  useEffect(() => {
    if (!c.hasImage) return;
    let live = true;
    void invoke('research:image', { id: c.id, size: 'full' }).then(
      (r) => live && setImage(r.image),
    );
    return () => {
      live = false;
    };
  }, [c.id, c.hasImage]);
  const move = async (projectId: string | null) => {
    const data = await work.run(invoke('research:move', { id: c.id, projectId }), 'Moved');
    if (data) work.set(data);
  };
  const task = current.taskId ? work.data?.tasks.find((t) => t.id === current.taskId) : undefined;
  return (
    <Sheet title={captureLabel(current)} onClose={onClose} testId="research-sheet">
      {current.kind === 'image' && (image || current.hasImage) && (
        <img
          src={image ?? undefined}
          alt="Screenshot"
          className="mb-3 max-h-[260px] w-full rounded-[12px] bg-[var(--work-card)] object-contain"
        />
      )}
      {current.kind === 'text' && (
        <blockquote className="mb-3 max-h-[220px] overflow-y-auto rounded-[12px] border-l-[3px] border-[var(--work-accent)] bg-[var(--work-card)] px-3 py-2 text-[13.5px] leading-relaxed whitespace-pre-wrap">
          {current.text.trim()}
        </blockquote>
      )}
      {current.kind === 'code' && (
        <pre className="mb-3 max-h-[240px] overflow-auto rounded-[12px] bg-[var(--work-card)] p-3 font-mono text-[12.5px] leading-snug ring-1 ring-[var(--work-border)]">
          {current.language && (
            <span className="mb-1 block font-sans text-[11px] text-[var(--note-muted)]">
              {current.language}
            </span>
          )}
          {current.text.trimEnd()}
        </pre>
      )}
      {current.comment && (
        <p className="mb-3 text-[13px]">
          <span className="text-[var(--note-muted)]">Note: </span>
          {current.comment}
        </p>
      )}
      <button
        type="button"
        onClick={() => void invoke('notes:openUrl', { url: current.url })}
        className="press mb-3 flex w-full items-center gap-2.5 rounded-[12px] bg-[var(--work-card)] px-3 py-2.5 text-left ring-1 ring-[var(--work-border)] hover:bg-[var(--note-hover)]"
        data-testid="research-source"
      >
        <Globe size={15} className="shrink-0 text-[var(--note-muted)]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">
            {current.title || current.url}
          </span>
          <span className="block truncate text-[11.5px] text-[var(--note-muted)]">
            {current.url}
          </span>
        </span>
        <ExternalLink size={14} className="shrink-0 text-[var(--note-muted)]" />
      </button>
      <label className="mb-4 block">
        <span className="mb-1 block text-[12px] font-medium text-[var(--note-muted)]">Project</span>
        <select
          value={current.projectId ?? ''}
          onChange={(e) => void move(e.target.value || null)}
          className="h-9 w-full rounded-[10px] bg-[var(--work-card)] px-3 text-[13.5px] ring-1 ring-[var(--work-border)] outline-none"
          data-testid="research-move"
        >
          <option value="">Unsorted</option>
          {work.data?.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        {task ? (
          <SheetButton
            primary
            onClick={() => work.editTask({ task })}
            testId="research-sheet-open-task"
          >
            <SquareCheck size={14} /> Open Task
          </SheetButton>
        ) : (
          <SheetButton
            primary
            onClick={() => makeTask(work, current)}
            testId="research-sheet-make-task"
          >
            <ListPlus size={14} /> Make Task
          </SheetButton>
        )}
        <SheetButton
          onClick={() => void work.run(invoke('research:copy', { id: current.id }), 'Copied')}
          testId="research-sheet-copy"
        >
          Copy
        </SheetButton>
        <span className="flex-1" />
        <SheetButton
          danger
          onClick={() => void deleteCapture(work, current.id).then((gone) => gone && onClose())}
          testId="research-sheet-delete"
        >
          Delete
        </SheetButton>
      </div>
    </Sheet>
  );
}

function SheetButton(props: {
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
  testId: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`press flex h-9 items-center gap-1.5 rounded-[11px] px-3.5 text-[13px] font-semibold ${
        props.primary
          ? 'bg-[var(--work-accent)] text-white'
          : props.danger
            ? 'text-[#ef4444] hover:bg-[#ef4444]/10'
            : 'bg-[var(--work-card)] ring-1 ring-[var(--work-border)] hover:bg-[var(--note-hover)]'
      }`}
      data-testid={props.testId}
    >
      {props.children}
    </button>
  );
}

const HINT = 'Select text or right-click a page and choose “Save to Orbit” (⇧⌘S).';

/** All your findings, one project's, or the Unsorted ones. */
export function ResearchView({ filter }: { filter: string }) {
  const work = useWork();
  if (!work.data) return null;
  const { captures, projects } = work.data;
  const shown = captures.filter((c) =>
    filter === '' ? true : filter === 'unsorted' ? c.projectId === null : c.projectId === filter,
  );
  return (
    <section data-testid="research-view">
      <ViewHeader
        title="Research"
        action={
          <select
            value={filter}
            onChange={(e) => showResearch(e.target.value)}
            aria-label="Show"
            className="h-8 max-w-[52%] rounded-[10px] bg-[var(--work-card)] px-2 text-[12.5px] ring-1 ring-[var(--work-border)] outline-none"
            data-testid="research-filter"
          >
            <option value="">All research</option>
            <option value="unsorted">Unsorted</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        }
      />
      {shown.length > 0 ? (
        <ul className="flex flex-col px-2" data-testid="research-list">
          {shown.map((c) => (
            <CaptureRow key={c.id} capture={c} showProject={filter === ''} />
          ))}
        </ul>
      ) : (
        <Empty
          icon={<Bookmark size={30} strokeWidth={1.5} />}
          title="Nothing saved here yet"
          hint={HINT}
        />
      )}
    </section>
  );
}

/** The project page's Research: its latest findings, and the way to all of them. */
export function ProjectResearch({ projectId }: { projectId: string }) {
  const work = useWork();
  const mine = work.data?.captures.filter((c) => c.projectId === projectId) ?? [];
  return (
    <div className="mt-5" data-testid="project-research">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[14px] font-semibold">Research</h2>
        {mine.length > 4 && (
          <button
            type="button"
            onClick={() => showResearch(projectId)}
            className="press flex h-7 items-center gap-1 rounded-[9px] px-2 text-[12.5px] font-semibold text-[var(--work-accent-text)] hover:bg-[var(--work-accent-soft)]"
            data-testid="project-research-all"
          >
            See all {mine.length}
            <ArrowRight size={13} />
          </button>
        )}
      </div>
      {mine.length > 0 ? (
        <ul className="-mx-2 flex flex-col">
          {mine.slice(0, 4).map((c) => (
            <CaptureRow key={c.id} capture={c} />
          ))}
        </ul>
      ) : (
        <p className="py-2 text-[12.5px] text-[var(--note-muted)]">{HINT}</p>
      )}
    </div>
  );
}

/** Findings saved without a project wait here (on the Projects tab). */
export function UnsortedResearch() {
  const work = useWork();
  const count = work.data?.captures.filter((c) => c.projectId === null).length ?? 0;
  if (count === 0) return null;
  return (
    <button
      type="button"
      onClick={() => showResearch('unsorted')}
      className="press mx-3 mb-2 flex w-[calc(100%-1.5rem)] items-center gap-2.5 rounded-[12px] bg-[var(--work-card)] px-3 py-2 text-left text-[13px] ring-1 ring-[var(--work-border)] hover:bg-[var(--note-hover)]"
      data-testid="unsorted-research"
    >
      <Bookmark size={15} className="text-[var(--work-accent-text)]" />
      <span className="flex-1 font-medium">Unsorted research</span>
      <span className="text-[var(--note-muted)] tabular-nums">{count}</span>
      <ArrowRight size={14} className="text-[var(--note-muted)]" />
    </button>
  );
}
