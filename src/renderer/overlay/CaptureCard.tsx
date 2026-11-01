import { Bookmark, Camera, Check, Code2, Globe, Quote, TextSelect, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { hostOf } from '@shared/capture';
import type { CaptureDraft } from '@shared/capture';
import { Glass } from './Glass';

const invoke = window.orbit.invoke;
const close = () => {
  carried = null;
  void invoke('capture:close', {});
};

/** What you'd typed survives the card stepping aside for a screenshot (same draft only; kept
 *  until you save or close, so a second mount can't lose it). */
let carried: {
  draftId: string;
  projectId: string | null;
  comment: string;
  makeTask: boolean;
} | null = null;

const COLOR: Record<string, string> = {
  purple: '#8b5cf6',
  blue: '#3b82f6',
  orange: '#f97316',
  green: '#22c55e',
  pink: '#ec4899',
  teal: '#14b8a6',
  red: '#ef4444',
  yellow: '#eab308',
};

/**
 * Orbit Capture (roadmap P2.1, ⇧⌘S): save the page, a selection (a snippet, if it's code), a
 * link, an image or an area screenshot to a project's research — and, if you like, make it a
 * task straight away. ⏎ saves, Esc closes.
 */
export function CaptureCard() {
  const [draft, setDraft] = useState<CaptureDraft | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [makeTask, setMakeTask] = useState(false);
  const [saving, setSaving] = useState(false);
  const commentRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    void invoke('capture:draft', {}).then((next) => {
      if (!live) return;
      setDraft(next);
      if (carried && next && carried.draftId === next.id) {
        setProjectId(carried.projectId);
        setComment(carried.comment);
        setMakeTask(carried.makeTask);
      } else {
        carried = null;
        setProjectId(next?.projectId ?? null);
      }
      commentRef.current?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      live = false;
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  if (!draft) return null;

  const pick = (kind: 'link' | 'text') =>
    void invoke('capture:kind', { kind }).then((next) => next && setDraft(next));
  const screenshot = () => {
    carried = { draftId: draft.id, projectId, comment, makeTask };
    void invoke('capture:screenshot', {});
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    carried = null;
    void invoke('capture:save', { projectId, comment: comment.trim(), makeTask });
  };
  const isText = draft.kind === 'text' || draft.kind === 'code';

  return (
    <div
      className="fixed inset-0 flex justify-center bg-black/[0.14] pt-[12vh] animate-[orbit-fade-in_160ms_var(--ease-out)]"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
      data-testid="capture-backdrop"
    >
      <Glass
        className="animate-pop h-fit w-[min(560px,92vw)] rounded-[24px] text-white"
        role="dialog"
        aria-label="Save to Orbit"
        data-testid="capture-card"
      >
        <form onSubmit={save}>
          <header className="flex items-center gap-2 px-5 pt-4 pb-3">
            <Bookmark size={15} className="text-[#a99bff]" />
            <span className="flex-1 text-[14px] font-semibold">Save to Orbit</span>
            <Chip
              on={draft.kind === 'link'}
              onClick={() => pick('link')}
              testId="capture-kind-link"
            >
              <Globe size={13} /> Page
            </Chip>
            <Chip
              on={isText}
              disabled={!draft.hasSelection}
              onClick={() => pick('text')}
              testId="capture-kind-text"
              title={draft.hasSelection ? undefined : 'Select text on the page first'}
            >
              <TextSelect size={13} /> Selection
            </Chip>
            <Chip on={draft.kind === 'image'} onClick={screenshot} testId="capture-kind-image">
              <Camera size={13} /> Screenshot
            </Chip>
            <button
              type="button"
              aria-label="Close"
              onClick={close}
              className="press ml-1 grid size-7 place-items-center rounded-[9px] text-white/50 hover:bg-white/10 hover:text-white"
            >
              <X size={15} />
            </button>
          </header>

          <div
            className="mx-5 rounded-[16px] bg-white/[0.07] p-3.5 ring-1 ring-white/[0.08]"
            data-testid="capture-preview"
          >
            {draft.kind === 'image' && draft.preview && (
              <img
                src={draft.preview}
                alt="Screenshot"
                className="mx-auto max-h-[200px] rounded-[10px] object-contain"
              />
            )}
            {draft.kind === 'text' && (
              <p className="flex max-h-[140px] gap-2 overflow-y-auto text-[14px] leading-relaxed whitespace-pre-wrap text-white/90">
                <Quote
                  size={14}
                  className="mt-1 shrink-0 fill-current text-white/40"
                  strokeWidth={0}
                />
                {draft.text.trim()}
              </p>
            )}
            {draft.kind === 'code' && (
              <div>
                <span className="mb-1.5 flex items-center gap-1.5 text-[11.5px] text-white/50">
                  <Code2 size={12} />
                  {draft.language ? draft.language : 'Code'}
                </span>
                <pre className="max-h-[150px] overflow-auto rounded-[10px] bg-black/30 p-2.5 font-mono text-[12.5px] leading-snug text-white/90">
                  {draft.text.trimEnd()}
                </pre>
              </div>
            )}
            <Source title={draft.title} url={draft.url} big={draft.kind === 'link'} />
          </div>

          <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2.5 px-5 pt-4">
            <label htmlFor="capture-project" className="text-[12.5px] text-white/55">
              Project
            </label>
            <div className="relative">
              <span
                className="pointer-events-none absolute top-1/2 left-3 size-2 -translate-y-1/2 rounded-full"
                style={{
                  background:
                    COLOR[draft.projects.find((p) => p.id === projectId)?.color ?? ''] ??
                    'rgb(255 255 255 / 0.3)',
                }}
              />
              <select
                id="capture-project"
                value={projectId ?? ''}
                onChange={(e) => setProjectId(e.target.value || null)}
                className="h-9 w-full appearance-none rounded-[11px] bg-white/[0.08] pr-3 pl-7 text-[13.5px] ring-1 ring-white/10 outline-none focus:ring-white/30"
                data-testid="capture-project"
              >
                <option value="">Unsorted</option>
                {draft.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <label htmlFor="capture-comment" className="text-[12.5px] text-white/55">
              Note
            </label>
            <input
              id="capture-comment"
              ref={commentRef}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={500}
              placeholder="Why it matters (optional)"
              className="h-9 rounded-[11px] bg-white/[0.08] px-3 text-[13.5px] ring-1 ring-white/10 outline-none placeholder:text-white/35 focus:ring-white/30"
              data-testid="capture-comment"
            />
          </div>

          <footer className="flex items-center gap-3 px-5 pt-4 pb-4">
            <label className="flex flex-1 cursor-pointer items-center gap-2 text-[13px] text-white/75">
              <span
                className={`grid size-[18px] place-items-center rounded-[5px] border-[1.5px] ${
                  makeTask ? 'border-[#7c6cff] bg-[#7c6cff]' : 'border-white/40'
                }`}
              >
                {makeTask && <Check size={12} strokeWidth={3} />}
              </span>
              <input
                type="checkbox"
                checked={makeTask}
                onChange={(e) => setMakeTask(e.target.checked)}
                className="sr-only"
                data-testid="capture-make-task"
              />
              Also add a task
            </label>
            <button
              type="button"
              onClick={close}
              className="press h-9 rounded-[11px] px-3.5 text-[13.5px] font-medium text-white/70 hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="press h-9 rounded-[11px] bg-[#7c6cff] px-4 text-[13.5px] font-semibold shadow-[0_6px_16px_-6px_#7c6cff] disabled:opacity-50"
              data-testid="capture-save"
            >
              Save
            </button>
          </footer>
        </form>
      </Glass>
    </div>
  );
}

function Chip(props: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  title?: string | undefined;
  testId: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={props.on}
      disabled={props.disabled}
      title={props.title}
      onClick={props.onClick}
      className={`press flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium disabled:opacity-35 ${
        props.on
          ? 'bg-white text-neutral-900'
          : 'text-white/70 ring-1 ring-white/15 hover:bg-white/10'
      }`}
      data-testid={props.testId}
    >
      {props.children}
    </button>
  );
}

function Source({ title, url, big }: { title: string; url: string; big: boolean }) {
  return (
    <div className={`flex min-w-0 items-center gap-2 ${big ? '' : 'mt-2.5'}`}>
      <Globe size={big ? 16 : 12} className="shrink-0 text-white/45" />
      <div className="min-w-0">
        {big && <div className="truncate text-[14px] font-semibold">{title || url}</div>}
        <div className={`truncate text-white/50 ${big ? 'text-[12px]' : 'text-[11.5px]'}`}>
          {big ? url : `${title ? `${title} · ` : ''}${hostOf(url)}`}
        </div>
      </div>
    </div>
  );
}
