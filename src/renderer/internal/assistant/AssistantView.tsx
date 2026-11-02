import {
  ArrowUp,
  BookMarked,
  Check,
  ClipboardCopy,
  FileText,
  ListChecks,
  NotebookPen,
  Plus,
  Quote,
  Sparkles,
  Square,
  SquarePen,
  X,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { AI_MODELS } from '@shared/ai';
import type { AssistantReply, AssistantState, TaskSuggestion } from '@shared/assistant';
import { citeMarker, parseMarkdown } from '@shared/markdown';
import { useWork } from '../work/context';
import { Markdown } from './Markdown';
import { Tip } from '../../tooltip/Tip';
import './assistant.css';

const invoke = window.orbit.invoke;
const modelName = (id: string) => AI_MODELS.find((m) => m.id === id)?.name ?? id;

/** The assistant's conversation, kept in main; this view shows it and sends what you do. */
function useAssistant(): AssistantState | null {
  const [state, setState] = useState<AssistantState | null>(null);
  useEffect(() => {
    let live = true;
    const off = window.orbit.on('assistant:update', (next) => setState(next));
    void invoke('assistant:get', {}).then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
      off();
    };
  }, []);
  return state;
}

/** orbit://notes/panel/assistant: ask Claude about what you attach (roadmap P3.1–P3.4). */
export function AssistantView() {
  const state = useAssistant();
  if (!state) return <div className="flex-1" />;
  const empty = state.messages.length === 0;
  return (
    <div className="assistant flex min-h-0 flex-1 flex-col" data-testid="assistant">
      <header className="flex h-11 shrink-0 items-center gap-2 px-4">
        <Sparkles size={15} className="text-[var(--work-accent)]" aria-hidden />
        <h1 className="text-[14px] font-semibold">Assistant</h1>
        <span
          className="truncate rounded-full bg-[var(--work-accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--work-accent)]"
          data-testid="assistant-model"
        >
          {modelName(state.model)}
        </span>
        <span className="flex-1" />
        {!empty && (
          <Tip label="New Chat">
            <button
              type="button"
              className="press grid size-7 place-items-center rounded-[9px] text-[var(--note-muted)] hover:bg-[var(--note-hover)] hover:text-[var(--note-fg)]"
              aria-label="New Chat"
              onClick={() => void invoke('assistant:clear', {})}
              data-testid="assistant-clear"
            >
              <SquarePen size={15} />
            </button>
          </Tip>
        )}
      </header>
      <Conversation state={state} />
      {state.tasks && <TasksCard tasks={state.tasks} />}
      <Composer state={state} />
    </div>
  );
}

function Conversation({ state }: { state: AssistantState }) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const last = state.messages.at(-1);
  const lastLength =
    last?.role === 'assistant' ? last.parts.reduce((n, p) => n + p.text.length, 0) : 0;
  // Follow a streaming answer — unless you've scrolled up to read.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [state.messages.length, lastLength]);
  return (
    <div
      ref={scroller}
      className="min-h-0 flex-1 overflow-y-auto px-4 pb-3"
      onScroll={(event) => {
        const el = event.currentTarget;
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
      data-testid="assistant-conversation"
    >
      {state.messages.length === 0 ? (
        <Welcome state={state} />
      ) : (
        state.messages.map((message) =>
          message.role === 'user' ? (
            <div key={message.id} className="mt-3 flex flex-col items-end gap-1">
              <div
                className="max-w-[88%] rounded-[16px] rounded-br-[6px] bg-[var(--work-accent)] px-3 py-2 text-[13.5px] leading-[1.45] whitespace-pre-wrap text-white"
                data-testid="assistant-question"
              >
                {message.text}
              </div>
              {message.context.length > 0 && (
                <div className="flex max-w-[88%] flex-wrap justify-end gap-1">
                  {message.context.map((c, i) => (
                    <span
                      key={i}
                      className="flex max-w-full items-center gap-1 truncate rounded-full bg-[var(--work-card)] px-2 py-0.5 text-[11px] text-[var(--note-muted)]"
                      title={
                        c.partial ? 'Only the first part of this long page was read' : undefined
                      }
                      data-testid="assistant-sent-context"
                    >
                      {c.kind === 'page' ? (
                        <FileText size={11} />
                      ) : c.kind === 'selection' ? (
                        <Quote size={11} />
                      ) : (
                        <BookMarked size={11} />
                      )}
                      <span className="truncate">{c.label}</span>
                      {c.partial && <span aria-hidden>· first part</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <Reply key={message.id} reply={message} />
          ),
        )
      )}
    </div>
  );
}

function Reply({ reply }: { reply: AssistantReply }) {
  const [copied, setCopied] = useState(false);
  const markdown = useMemo(
    () => reply.parts.map((p) => p.text + citeMarker(p.cites)).join(''),
    [reply.parts],
  );
  const blocks = useMemo(() => parseMarkdown(markdown), [markdown]);
  const show = (n: number) => void invoke('assistant:source', { messageId: reply.id, n });
  const finished = reply.status === 'done' || reply.status === 'stopped';
  return (
    <article className="mt-4" data-testid="assistant-answer" data-status={reply.status}>
      {reply.status === 'thinking' && (
        <div
          className="thinking flex items-center gap-2 text-[13px]"
          data-testid="assistant-thinking"
        >
          <Sparkles size={14} className="spin-slow text-[var(--work-accent)]" />
          <span>Thinking…</span>
        </div>
      )}
      {blocks.length > 0 && (
        <div
          className={`md text-[13.5px] leading-[1.55] ${reply.status === 'writing' ? 'streaming' : ''}`}
          data-testid="assistant-answer-text"
        >
          <Markdown
            blocks={blocks}
            sources={reply.sources}
            onCite={show}
            onLink={(url) => void invoke('notes:openUrl', { url })}
          />
        </div>
      )}
      {reply.status === 'stopped' && (
        <p className="mt-1 text-[12px] text-[var(--note-muted)]">Stopped</p>
      )}
      {reply.error && (
        <p
          className="mt-2 rounded-[10px] bg-[rgb(255_59_48/0.1)] px-3 py-2 text-[12.5px] text-[#d70015] dark:text-[#ff6961]"
          role="alert"
          data-testid="assistant-error"
        >
          {reply.error}
        </p>
      )}
      {finished && reply.sources.length > 0 && (
        <section className="mt-3" aria-label="Sources">
          <h2 className="mb-1.5 text-[11px] font-semibold tracking-wide text-[var(--note-muted)] uppercase">
            Sources
          </h2>
          <ol className="flex flex-col gap-1">
            {reply.sources.map((source) => (
              <li key={source.n}>
                <button
                  type="button"
                  className="press flex w-full gap-2 rounded-[10px] bg-[var(--work-card)] px-2.5 py-2 text-left hover:bg-[var(--note-hover)]"
                  onClick={() => show(source.n)}
                  data-testid="assistant-source"
                >
                  <span className="cite static">{source.n}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium">
                      {source.title}
                      <span className="font-normal text-[var(--note-muted)]"> · {source.host}</span>
                    </span>
                    <span className="line-clamp-2 text-[12px] text-[var(--note-muted)]">
                      “{source.quote}”
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
      {finished && reply.parts.length > 0 && (
        <div className="mt-2 flex gap-1">
          <SmallAction
            label={copied ? 'Copied' : 'Copy'}
            onClick={() => {
              void navigator.clipboard.writeText(reply.parts.map((p) => p.text).join(''));
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            testId="assistant-copy"
          >
            {copied ? <Check size={13} /> : <ClipboardCopy size={13} />}
          </SmallAction>
          <SmallAction
            label="Save to Notes"
            onClick={() => void invoke('assistant:toNote', { messageId: reply.id })}
            testId="assistant-save-note"
          >
            <NotebookPen size={13} />
          </SmallAction>
        </div>
      )}
    </article>
  );
}

function SmallAction(props: {
  label: string;
  onClick: () => void;
  testId: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="press flex h-7 items-center gap-1.5 rounded-[9px] px-2 text-[12px] text-[var(--note-muted)] hover:bg-[var(--note-hover)] hover:text-[var(--note-fg)]"
      data-testid={props.testId}
    >
      {props.children}
      {props.label}
    </button>
  );
}

/** Before the first question: what the assistant can do, and what it sees. */
function Welcome({ state }: { state: AssistantState }) {
  const ask = (text: string, attachPage: boolean) => {
    if (attachPage) void invoke('assistant:attach', { page: true });
    void invoke('assistant:ask', { text, action: 'ask' });
  };
  return (
    <div className="flex flex-col items-center pt-8 text-center" data-testid="assistant-welcome">
      <div className="orb mb-3 grid size-12 place-items-center rounded-[16px] text-white">
        <Sparkles size={22} />
      </div>
      <h2 className="text-[16px] font-semibold">Ask Orbit</h2>
      <p className="mt-1 max-w-[260px] text-[12.5px] leading-[1.45] text-[var(--note-muted)]">
        Claude sees only what you attach below — this page, a selection, or research you pick — and
        shows where each answer comes from.
      </p>
      {state.blocked ? (
        <div
          className="mt-5 w-full rounded-[14px] border border-[var(--work-border)] bg-[var(--work-card)] p-3 text-left text-[12.5px]"
          data-testid="assistant-blocked"
        >
          <p>{state.blocked}</p>
          <button
            type="button"
            className="press mt-2 rounded-full bg-[var(--work-accent)] px-3 py-1 text-[12.5px] font-semibold text-white"
            onClick={() => void invoke('notes:openUrl', { url: 'orbit://settings/ai' })}
            data-testid="assistant-open-settings"
          >
            Open Settings
          </button>
        </div>
      ) : (
        state.page && (
          <div className="mt-5 flex w-full flex-col gap-1.5">
            <Suggestion
              icon={<FileText size={15} />}
              label="Summarize this page"
              onClick={() => void invoke('assistant:ask', { text: '', action: 'summarize' })}
              testId="assistant-summarize"
            />
            <Suggestion
              icon={<Sparkles size={15} />}
              label="What should I know from this page?"
              onClick={() => ask('What should I know from this page? Keep it short.', true)}
              testId="assistant-key-points"
            />
            <Suggestion
              icon={<ListChecks size={15} />}
              label="Make tasks from this page"
              onClick={() => void invoke('assistant:suggestTasks', { from: 'page' })}
              testId="assistant-page-tasks"
            />
          </div>
        )
      )}
    </div>
  );
}

function Suggestion(props: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="press flex items-center gap-2.5 rounded-[12px] border border-[var(--work-border)] bg-[var(--work-card)] px-3 py-2.5 text-left text-[13px] hover:border-[var(--work-accent)] hover:bg-[var(--work-accent-soft)]"
      data-testid={props.testId}
    >
      <span className="text-[var(--work-accent)]">{props.icon}</span>
      {props.label}
    </button>
  );
}

/** Tasks Claude found: tick the ones you want, pick a project, add them. */
function TasksCard({ tasks }: { tasks: NonNullable<AssistantState['tasks']> }) {
  const { data } = useWork();
  const [skipped, setSkipped] = useState<ReadonlySet<number>>(() => new Set());
  const [projectId, setProjectId] = useState<string | null>(tasks.projectId);
  const chosen: TaskSuggestion[] = tasks.items.filter((_, i) => !skipped.has(i));
  const projects = (data?.projects ?? []).filter((p) => p.status !== 'done');
  return (
    <section
      className="mx-3 mb-2 max-h-[45%] shrink-0 overflow-y-auto rounded-[14px] border border-[var(--work-border)] bg-[var(--work-sheet)] p-3 shadow-[0_8px_24px_-12px_rgb(0_0_0/0.25)]"
      aria-label="Suggested tasks"
      data-testid="assistant-tasks"
    >
      <div className="flex items-center gap-2">
        <ListChecks size={15} className="text-[var(--work-accent)]" />
        <h2 className="flex-1 text-[13px] font-semibold">Tasks from {tasks.from}</h2>
        <button
          type="button"
          className="press grid size-6 place-items-center rounded-[8px] text-[var(--note-muted)] hover:bg-[var(--note-hover)]"
          aria-label="Dismiss"
          title="Dismiss"
          onClick={() => void invoke('assistant:dismissTasks', {})}
          data-testid="assistant-tasks-dismiss"
        >
          <X size={14} />
        </button>
      </div>
      {tasks.busy && (
        <p className="thinking mt-2 text-[12.5px]" data-testid="assistant-tasks-busy">
          Reading {tasks.from}…
        </p>
      )}
      {tasks.error && (
        <p
          className="mt-2 text-[12.5px] text-[var(--note-muted)]"
          data-testid="assistant-tasks-error"
        >
          {tasks.error}
        </p>
      )}
      {tasks.items.length > 0 && (
        <>
          <ul className="mt-2 flex flex-col gap-1">
            {tasks.items.map((task, i) => (
              <li key={i}>
                <label className="flex cursor-pointer gap-2 rounded-[9px] px-1.5 py-1 hover:bg-[var(--note-hover)]">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-[var(--work-accent)]"
                    checked={!skipped.has(i)}
                    onChange={() =>
                      setSkipped((current) => {
                        const next = new Set(current);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      })
                    }
                    data-testid="assistant-task-check"
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px]" data-testid="assistant-task-title">
                      {task.title}
                    </span>
                    {task.notes && (
                      <span className="line-clamp-2 text-[11.5px] text-[var(--note-muted)]">
                        {task.notes}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center gap-2">
            <select
              className="h-8 min-w-0 flex-1 rounded-[9px] border border-[var(--work-border)] bg-transparent px-2 text-[12.5px]"
              value={projectId ?? ''}
              onChange={(e) => setProjectId(e.target.value || null)}
              aria-label="Project"
              data-testid="assistant-tasks-project"
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={chosen.length === 0}
              className="press h-8 rounded-[9px] bg-[var(--work-accent)] px-3 text-[12.5px] font-semibold text-white disabled:opacity-40"
              onClick={() => void invoke('assistant:addTasks', { projectId, tasks: chosen })}
              data-testid="assistant-tasks-add"
            >
              Add {chosen.length} task{chosen.length === 1 ? '' : 's'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function Composer({ state }: { state: AssistantState }) {
  const [text, setText] = useState('');
  const [picking, setPicking] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  // Typing starts here whenever the assistant opens.
  useEffect(() => input.current?.focus(), []);
  const send = () => {
    if (!text.trim() || state.busy || state.blocked) return;
    void invoke('assistant:ask', { text, action: 'ask' });
    setText('');
  };
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };
  const placeholder = state.page?.attached
    ? 'Ask about this page…'
    : state.research
      ? 'Ask about your research…'
      : state.selection
        ? 'Ask about the selection…'
        : 'Ask anything…';
  return (
    <div className="shrink-0 border-t border-[var(--work-border)] px-3 pt-2 pb-3">
      <div className="mb-2 flex flex-wrap gap-1.5" data-testid="assistant-chips">
        {state.page &&
          (state.page.attached ? (
            <Chip
              icon={
                state.page.favicon ? (
                  <img src={state.page.favicon} alt="" className="size-3.5 rounded-[3px]" />
                ) : (
                  <FileText size={12} />
                )
              }
              label={state.page.title}
              onRemove={() => void invoke('assistant:attach', { page: false })}
              testId="assistant-page-chip"
              attached
            />
          ) : (
            <button
              type="button"
              className="press flex h-6 max-w-[200px] items-center gap-1 rounded-full border border-dashed border-[var(--note-muted)] px-2 text-[11.5px] text-[var(--note-muted)] hover:border-[var(--work-accent)] hover:text-[var(--work-accent)]"
              onClick={() => void invoke('assistant:attach', { page: true })}
              title={`Attach “${state.page.title}” to your next question`}
              data-testid="assistant-attach-page"
            >
              <Plus size={12} />
              <span className="truncate">This page</span>
            </button>
          ))}
        {state.selection && (
          <Chip
            icon={<Quote size={12} />}
            label={`“${state.selection.text}”`}
            onRemove={() => void invoke('assistant:attach', { selection: null })}
            testId="assistant-selection-chip"
            attached
          />
        )}
        {state.research ? (
          <Chip
            icon={<BookMarked size={12} />}
            label={`${state.research.label} · ${state.research.count}`}
            onRemove={() => void invoke('assistant:attach', { research: null })}
            testId="assistant-research-chip"
            attached
          />
        ) : (
          <div className="relative">
            <button
              type="button"
              className="press flex h-6 items-center gap-1 rounded-full border border-dashed border-[var(--note-muted)] px-2 text-[11.5px] text-[var(--note-muted)] hover:border-[var(--work-accent)] hover:text-[var(--work-accent)]"
              onClick={() => setPicking((open) => !open)}
              aria-expanded={picking}
              data-testid="assistant-attach-research"
            >
              <Plus size={12} />
              Research
            </button>
            {picking && <ResearchPicker onClose={() => setPicking(false)} />}
          </div>
        )}
      </div>
      <div className="composer flex items-end gap-2 rounded-[14px] border border-[var(--work-border)] bg-[var(--work-card)] p-1.5 pl-3 focus-within:border-[var(--work-accent)]">
        <textarea
          ref={input}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder={state.blocked ? 'Set up AI in Settings to ask' : placeholder}
          disabled={state.blocked !== null}
          maxLength={4000}
          className="max-h-[132px] min-h-[28px] flex-1 resize-none bg-transparent py-1 text-[13.5px] leading-[1.4] outline-none placeholder:text-[var(--note-muted)] [field-sizing:content]"
          aria-label="Ask Orbit"
          data-testid="assistant-input"
        />
        {state.busy ? (
          <button
            type="button"
            className="press grid size-7 shrink-0 place-items-center rounded-full bg-[var(--note-fg)] text-[var(--note-bg)]"
            onClick={() => void invoke('assistant:stop', {})}
            aria-label="Stop"
            title="Stop"
            data-testid="assistant-stop"
          >
            <Square size={11} fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            className="press grid size-7 shrink-0 place-items-center rounded-full bg-[var(--work-accent)] text-white disabled:opacity-35"
            onClick={send}
            disabled={!text.trim() || state.blocked !== null}
            aria-label="Send"
            title="Send (⏎)"
            data-testid="assistant-send"
          >
            <ArrowUp size={15} strokeWidth={2.4} />
          </button>
        )}
      </div>
    </div>
  );
}

function Chip(props: {
  icon: ReactNode;
  label: string;
  onRemove: () => void;
  testId: string;
  attached?: boolean;
}) {
  return (
    <span
      className="flex h-6 max-w-[220px] items-center gap-1 rounded-full bg-[var(--work-accent-soft)] pr-0.5 pl-2 text-[11.5px] text-[var(--work-accent)]"
      data-testid={props.testId}
    >
      {props.icon}
      <span className="truncate">{props.label}</span>
      <button
        type="button"
        className="grid size-5 place-items-center rounded-full hover:bg-[var(--work-accent-soft)]"
        onClick={props.onRemove}
        aria-label={`Remove ${props.label}`}
        title="Remove"
        data-testid={`${props.testId}-remove`}
      >
        <X size={11} />
      </button>
    </span>
  );
}

/** Pick saved research to ask about: all of a project's findings (or the unsorted ones). */
function ResearchPicker({ onClose }: { onClose: () => void }) {
  const { data } = useWork();
  const groups = useMemo(() => {
    const captures = (data?.captures ?? []).filter((c) => c.kind !== 'image');
    const byProject = new Map<string | null, string[]>();
    for (const capture of captures) {
      const list = byProject.get(capture.projectId) ?? [];
      list.push(capture.id);
      byProject.set(capture.projectId, list);
    }
    const named = (data?.projects ?? [])
      .filter((p) => byProject.has(p.id))
      .map((p) => ({ id: p.id as string | null, name: p.name, ids: byProject.get(p.id)! }));
    const unsorted = byProject.get(null);
    return unsorted ? [...named, { id: null, name: 'Unsorted', ids: unsorted }] : named;
  }, [data]);
  useEffect(() => {
    const close = (event: globalThis.KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  return (
    <div
      className="absolute bottom-8 left-0 z-20 w-[250px] rounded-[12px] border border-[var(--work-border)] bg-[var(--work-sheet)] p-1 shadow-[0_12px_32px_-8px_rgb(0_0_0/0.35)]"
      role="menu"
      data-testid="assistant-research-picker"
    >
      {groups.length === 0 ? (
        <p className="px-2.5 py-2 text-[12px] text-[var(--note-muted)]">
          No saved research yet. Save findings with ⇧⌘S.
        </p>
      ) : (
        groups.map((group) => (
          <button
            key={group.id ?? 'unsorted'}
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-[9px] px-2.5 py-1.5 text-left text-[12.5px] hover:bg-[var(--note-hover)]"
            onClick={() => {
              void invoke('assistant:attach', {
                research: { projectId: group.id, captureIds: group.ids.slice(0, 40) },
              });
              onClose();
            }}
            data-testid="assistant-research-option"
          >
            <BookMarked size={13} className="text-[var(--work-accent)]" />
            <span className="flex-1 truncate">{group.name}</span>
            <span className="text-[11px] text-[var(--note-muted)]">{group.ids.length}</span>
          </button>
        ))
      )}
    </div>
  );
}
