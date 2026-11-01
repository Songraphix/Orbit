import {
  AppWindow,
  ArrowLeft,
  FolderClosed,
  NotebookPen,
  PanelRight,
  PictureInPicture2,
  Pin,
  PinOff,
  Plus,
  Search,
  SquareCheck,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { noteTitle } from '@shared/note-text';
import { relativeTime } from '@shared/time';
import type { NoteAction, NoteEntry } from '@shared/types/notes';
import { NoteEditor } from '../../notes/NoteEditor';
import { showPanelView, useWork } from '../work/context';
import { BoardView } from '../work/BoardView';
import { ProjectDetail, ProjectsView } from '../work/ProjectsView';
import { QuickActions } from '../work/QuickActions';
import { TasksView } from '../work/TasksView';
import { ResearchView } from '../work/research';
import { WorkProvider } from '../work/WorkProvider';
import { saveOpenNotes } from '../../notes/save-notes';
import { useAppearance } from '../appearance';

const invoke = window.orbit.invoke;
/** Moves (or deletes) a note — after saving every keystroke, so the next place has it all. */
const act = async (id: string, action: NoteAction) => {
  await saveOpenNotes();
  return invoke('notes:act', { id, action });
};

/** A button in a notes header: an icon with a tooltip. */
function IconButton(props: {
  label: string;
  onClick: () => void;
  testId: string;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      aria-pressed={props.active}
      title={props.label}
      onClick={props.onClick}
      className={`press no-drag grid size-7 place-items-center rounded-[10px] ${
        props.active
          ? 'bg-[var(--note-hover)] text-[var(--note-accent)]'
          : 'text-[var(--note-muted)] hover:bg-[var(--note-hover)] hover:text-[var(--note-fg)]'
      }`}
      data-testid={props.testId}
    >
      {props.children}
    </button>
  );
}

/** orbit://note/<id>: a note in a tab — pin it, make it a favorite, like any tab. It sits in the
 *  page card under the toolbar, so it's always paper-light, like a page. */
export function NoteTabPage({ id }: { id: string }) {
  useEffect(() => {
    document.documentElement.style.background = '#fffdf8';
  }, []);
  return (
    <main
      data-note-theme="light"
      className="min-h-screen bg-[var(--note-bg)] text-[var(--note-fg)]"
      data-testid="note-tab"
    >
      <header className="sticky top-0 z-10 flex h-11 items-center justify-end gap-0.5 bg-[var(--note-bg)]/90 px-3 backdrop-blur">
        <IconButton
          label="Open in Notes Panel"
          onClick={() => void act(id, 'panel')}
          testId="note-to-panel"
        >
          <PanelRight size={15} />
        </IconButton>
        <IconButton
          label="Float on Top"
          onClick={() => void act(id, 'float')}
          testId="note-to-float"
        >
          <PictureInPicture2 size={15} />
        </IconButton>
        <IconButton label="Delete Note" onClick={() => void act(id, 'delete')} testId="note-delete">
          <Trash2 size={15} />
        </IconButton>
      </header>
      <div className="mx-auto flex min-h-[calc(100vh-44px)] max-w-[720px] flex-col px-8 pt-6">
        <NoteEditor
          key={id}
          id={id}
          autoFocus
          onText={(text) => (document.title = noteTitle(text))}
        />
      </div>
    </main>
  );
}

/** The hash's note, for the panel (`#/notes/panel/<id>`). */
const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
};
/** Where the panel is: '#/notes/panel/<a>/<b>' → [a, b] ('' when absent). */
const panelRoute = () => window.location.hash;
const showInPanel = (id: string | null) => {
  window.location.hash = id ? `#/notes/panel/${id}` : '#/notes/panel';
};

/**
 * orbit://notes/panel: the Notes panel docked on the right of the window — the list of notes
 * (search, new), or one note open in the editor.
 */
export function NotesPanelPage() {
  const mode = useAppearance();
  const hash = useSyncExternalStore(subscribe, panelRoute);
  const [a = '', b = ''] = hash.split('/').slice(3);
  const tab: PanelTab =
    a === 'projects' || a === 'board' || a === 'research'
      ? 'projects'
      : a === 'tasks'
        ? 'tasks'
        : 'notes';
  // The board's Back returns to whichever list opened it.
  const lastList = useRef<PanelTab>('projects');
  useEffect(() => {
    if (a !== 'board') lastList.current = tab;
  }, [a, tab]);
  // Main remembers where the panel is, so a restart comes back here.
  useEffect(() => {
    void invoke('notes:panelRoute', { route: hash.replace(/^#\/notes\//, '') });
  }, [hash]);
  useEffect(() => {
    document.documentElement.style.background = 'transparent';
  }, []);
  if (!mode) return null;
  let body: ReactNode;
  if (a === 'projects') body = b ? <ProjectDetail key={b} id={b} /> : <ProjectsView />;
  else if (a === 'tasks') body = <TasksView />;
  else if (a === 'research') body = <ResearchView filter={b} />;
  else if (a === 'board') body = <BoardView onBack={() => showPanelView(lastList.current)} />;
  else body = a ? <PanelNote key={a} id={a} /> : <NotesList />;
  // Lists get the Quick Actions at their foot; a note, a project's page and the board don't.
  const lists = (a === 'projects' && !b) || a === 'tasks';
  return (
    <main
      data-note-theme={mode}
      className="relative flex h-screen flex-col overflow-hidden bg-[var(--note-bg)] text-[var(--note-fg)]"
      data-testid="notes-panel"
    >
      <WorkProvider>
        <PanelTabs current={tab} />
        {a === '' || !['projects', 'tasks', 'board', 'research'].includes(a) ? (
          body
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-testid="panel-body">
            {body}
            {lists && <QuickActions />}
          </div>
        )}
      </WorkProvider>
    </main>
  );
}

type PanelTab = 'notes' | 'projects' | 'tasks';

/** Notes · Projects · Tasks across the top of the panel (and Close). */
function PanelTabs({ current }: { current: PanelTab }) {
  const tabs: { id: PanelTab; label: string; icon: ReactNode }[] = [
    { id: 'notes', label: 'Notes', icon: <NotebookPen size={15} /> },
    { id: 'projects', label: 'Projects', icon: <FolderClosed size={15} /> },
    { id: 'tasks', label: 'Tasks', icon: <SquareCheck size={15} /> },
  ];
  return (
    <nav
      className="flex shrink-0 items-center gap-1 border-b border-[var(--work-border)] px-2.5 py-2"
      aria-label="Panel"
      data-testid="panel-tabs"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-current={t.id === current ? 'page' : undefined}
          onClick={() => showPanelView(t.id)}
          className={`press flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[11px] text-[13px] font-medium ${
            t.id === current
              ? 'bg-[var(--work-accent)] text-white shadow-[0_6px_16px_-8px_var(--work-accent)]'
              : 'text-[var(--note-muted)] hover:bg-[var(--note-hover)] hover:text-[var(--note-fg)]'
          }`}
          data-testid="panel-tab"
          data-tab={t.id}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
      <IconButton label="Close Panel (⇧⌘N)" onClick={closePanel} testId="notes-close">
        <X size={15} />
      </IconButton>
    </nav>
  );
}

function PanelHeader({ children }: { children: ReactNode }) {
  return <header className="flex h-11 shrink-0 items-center gap-0.5 px-2.5">{children}</header>;
}

const closePanel = () => void invoke('notes:panel', { open: false });

function NotesList() {
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState<NoteEntry[] | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let live = true;
    const load = () =>
      void invoke('notes:list', { query }).then(({ notes: list }) => {
        if (!live) return;
        setNotes(list);
        setNow(Date.now());
      });
    load();
    // Notes written elsewhere (a floating note, a tab) show up here too.
    const timer = setInterval(load, 2000);
    window.addEventListener('focus', load);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener('focus', load);
    };
  }, [query]);

  const create = async () => showInPanel((await invoke('notes:create', {})).id);

  return (
    <>
      <PanelHeader>
        <span className="flex flex-1 items-center gap-2 pl-1.5 text-[14px] font-semibold">
          <NotebookPen size={15} className="text-[var(--note-accent)]" />
          Notes
        </span>
        <IconButton label="New Note" onClick={() => void create()} testId="notes-new">
          <Plus size={16} />
        </IconButton>
      </PanelHeader>
      <label className="mx-3 mb-2 flex h-8 shrink-0 items-center gap-2 rounded-[10px] bg-[var(--note-hover)] px-2.5 text-[13px]">
        <Search size={13} className="shrink-0 text-[var(--note-muted)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notes"
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[var(--note-muted)]"
          data-testid="notes-search"
        />
      </label>
      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" data-testid="notes-list">
        {notes?.map((note) => (
          <li key={note.id} className="animate-row-in">
            <button
              type="button"
              onClick={() => showInPanel(note.id)}
              className="press block w-full rounded-[12px] px-2.5 py-2 text-left hover:bg-[var(--note-hover)]"
              data-testid="notes-item"
            >
              <span className="block truncate text-[13.5px] font-semibold">{note.title}</span>
              <span className="mt-0.5 flex gap-1.5 text-[12px] text-[var(--note-muted)]">
                <span className="shrink-0 tabular-nums">{relativeTime(note.updatedAt, now)}</span>
                <span className="truncate">{note.preview}</span>
              </span>
            </button>
          </li>
        ))}
        {notes?.length === 0 && (
          <li className="flex flex-col items-center gap-3 px-6 pt-16 text-center text-[13px] text-[var(--note-muted)]">
            {query ? (
              'No notes match.'
            ) : (
              <>
                <NotebookPen size={28} strokeWidth={1.5} className="text-[var(--note-accent)]" />
                <span>Jot things down while you browse. Notes stay here, beside every page.</span>
                <button
                  type="button"
                  onClick={() => void create()}
                  className="press rounded-full bg-[var(--note-hover)] px-3.5 py-1.5 font-medium text-[var(--note-fg)]"
                  data-testid="notes-empty-new"
                >
                  New Note
                </button>
              </>
            )}
          </li>
        )}
        <li>
          <QuickActions />
        </li>
      </ul>
    </>
  );
}

/** Which project the note belongs to (roadmap P1.1): pick one, or none. */
function NoteProject({ id }: { id: string }) {
  const { data } = useWork();
  const [projectId, setProjectId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    void invoke('notes:get', { id }).then((note) => setProjectId(note?.projectId ?? null));
  }, [id]);
  if (projectId === undefined || !data || data.projects.length === 0) return null;
  return (
    <select
      value={projectId ?? ''}
      onChange={(e) => {
        const next = e.target.value || null;
        setProjectId(next);
        void invoke('notes:setProject', { id, projectId: next });
      }}
      aria-label="Project"
      title="Project"
      className="mr-1 h-7 max-w-[120px] truncate rounded-[9px] bg-[var(--note-hover)] px-1.5 text-[12px] text-[var(--note-muted)] outline-none"
      data-testid="note-project"
    >
      <option value="">No project</option>
      {data.projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

function PanelNote({ id }: { id: string }) {
  // Back to the list (a note left empty is deleted as the editor goes).
  const back = () => showInPanel(null);
  const move = async (action: 'tab' | 'float' | 'delete') => {
    if ((await act(id, action)).done) showInPanel(null);
  };
  return (
    <>
      <PanelHeader>
        <button
          type="button"
          onClick={back}
          className="press flex h-7 items-center gap-1 rounded-[10px] pr-2 pl-1 text-[13px] font-medium text-[var(--note-muted)] hover:bg-[var(--note-hover)] hover:text-[var(--note-fg)]"
          data-testid="notes-back"
        >
          <ArrowLeft size={15} />
          Notes
        </button>
        <span className="flex-1" />
        <NoteProject id={id} />
        <IconButton label="Open as Tab" onClick={() => void move('tab')} testId="note-to-tab">
          <AppWindow size={15} />
        </IconButton>
        <IconButton label="Float on Top" onClick={() => void move('float')} testId="note-to-float">
          <PictureInPicture2 size={15} />
        </IconButton>
        <IconButton label="Delete Note" onClick={() => void move('delete')} testId="note-delete">
          <Trash2 size={15} />
        </IconButton>
      </PanelHeader>
      <div className="animate-panel-in flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pt-1">
        <NoteEditor id={id} autoFocus discardIfBlank />
      </div>
    </>
  );
}

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');
const subscribeScheme = (onChange: () => void) => {
  const query = darkQuery();
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

/**
 * orbit://notes/float/<id>: a floating note — its own small window, frosted glass, that stays
 * above other apps while pinned. Follows the Mac's light or dark appearance.
 */
export function FloatingNotePage({ id }: { id: string }) {
  const dark = useSyncExternalStore(subscribeScheme, () => darkQuery().matches);
  const [onTop, setOnTop] = useState(true);
  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    void invoke('notes:onTop', {}).then((r) => setOnTop(r.onTop));
  }, []);
  const toggleTop = () =>
    void invoke('notes:onTop', { onTop: !onTop }).then((r) => setOnTop(r.onTop));
  return (
    <main
      data-note-theme={dark ? 'dark' : 'light'}
      className={`flex h-screen flex-col overflow-hidden text-[var(--note-fg)] ${
        dark ? 'bg-[rgb(31_31_34/0.72)]' : 'bg-[rgb(255_253_248/0.78)]'
      }`}
      data-testid="note-float"
    >
      <header className="drag-region flex h-[38px] shrink-0 items-center justify-end gap-0.5 pr-2 pl-20">
        <IconButton
          label={onTop ? 'Kept on Top — click to let it go behind' : 'Keep on Top'}
          onClick={toggleTop}
          active={onTop}
          testId="note-pin"
        >
          {onTop ? <Pin size={14} /> : <PinOff size={14} />}
        </IconButton>
        <IconButton
          label="Open in Orbit"
          onClick={() => void act(id, 'panel')}
          testId="note-to-panel"
        >
          <PanelRight size={15} />
        </IconButton>
        <IconButton label="Delete Note" onClick={() => void act(id, 'delete')} testId="note-delete">
          <Trash2 size={14} />
        </IconButton>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-1">
        <NoteEditor key={id} id={id} autoFocus toolbar={false} />
      </div>
    </main>
  );
}
