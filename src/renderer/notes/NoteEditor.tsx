import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import { Bold, Heading, Italic, List, ListChecks, Strikethrough } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import './notes.css';

const invoke = window.orbit.invoke;

/** Typing settles for this long before the note is saved. */
const SAVE_DELAY_MS = 350;
/** How often an editor that isn't being typed in checks for edits made elsewhere. */
const SYNC_EVERY_MS = 1500;

const textOf = (editor: Editor) => editor.getText({ blockSeparator: '\n' });

function parseDoc(doc: string): object | string {
  if (!doc) return '';
  try {
    return JSON.parse(doc) as object;
  } catch {
    return '';
  }
}

/**
 * The note editor (F-33), shared by a note's tab, the Notes panel, floating notes and the quick
 * note. Rich text with Markdown shortcuts (# heading, - list, [ ] checklist, **bold**); saves as
 * you type; picks up edits made to the same note in another place.
 */
export function NoteEditor({
  id,
  autoFocus = false,
  onText,
  toolbar = true,
  discardIfBlank = false,
}: {
  id: string;
  autoFocus?: boolean;
  /** The note's plain text whenever it changes (titles, empty checks). */
  onText?: (text: string) => void;
  toolbar?: boolean;
  /** Leaving a note nothing was written in deletes it (the panel, the quick note). */
  discardIfBlank?: boolean;
}) {
  const version = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The latest document, kept outside the editor so it can still be saved while unmounting. */
  const latest = useRef<{ doc: string; text: string } | null>(null);
  const blank = useRef(true);
  const [missing, setMissing] = useState(false);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, linkOnPaste: true },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: ({ editor: e, pos }) =>
          pos === 0
            ? 'Title'
            : e.state.doc.childCount <= 2
              ? 'Write something… # heading, - list, [ ] checklist'
              : '',
      }),
    ],
    autofocus: autoFocus ? 'end' : false,
    immediatelyRender: true,
    editorProps: {
      attributes: { 'data-testid': 'note-editor', spellcheck: 'true' },
      // ⌘-click opens a link as a tab (a plain click places the cursor, so links stay editable).
      handleClick: (_view, _pos, event) => {
        const link = (event.target as HTMLElement | null)?.closest('a');
        if (!link || !event.metaKey) return false;
        void invoke('notes:openUrl', { url: link.href });
        return true;
      },
    },
    onUpdate: ({ editor: e }) => {
      const text = textOf(e);
      blank.current = text.trim() === '';
      latest.current = { doc: JSON.stringify(e.getJSON()), text };
      onTextRef.current?.(text);
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(flush, SAVE_DELAY_MS);
    },
    // Moving focus to a button (Float, Open as Tab…) saves first, so the next place sees it all.
    onBlur: () => flush(),
  });

  /** Saves now if anything is waiting. IPC keeps order, so whatever is sent next sees it. */
  function flush(): void {
    if (pending.current) clearTimeout(pending.current);
    pending.current = null;
    const next = latest.current;
    if (!next) return;
    latest.current = null;
    void invoke('notes:save', { id, ...next }).then(({ updatedAt }) => {
      if (updatedAt === null) setMissing(true);
      else version.current = Math.max(version.current, updatedAt);
    });
  }

  // Load the note, then keep in step with edits made elsewhere (another tab, the panel…).
  useEffect(() => {
    let live = true;
    const load = async (force: boolean) => {
      const note = await invoke('notes:get', { id });
      if (!live || editor.isDestroyed) return;
      if (!note) {
        setMissing(true);
        return;
      }
      if (!force && note.updatedAt <= version.current) return;
      version.current = Math.max(version.current, note.updatedAt);
      // Typing already started (a quick note opens empty and you type at once): keep it.
      if (latest.current || pending.current) return;
      if (!note.doc && editor.isEmpty) return; // a new note: nothing to load
      editor.commands.setContent(parseDoc(note.doc), { emitUpdate: false });
      const text = textOf(editor);
      blank.current = text.trim() === '';
      onTextRef.current?.(text);
      if (force && autoFocus) editor.commands.focus('end');
    };
    void load(true);
    const check = async () => {
      // Never pull the text out from under someone typing here.
      if (document.hidden || editor.isFocused || pending.current) return;
      const { updatedAt } = await invoke('notes:version', { id });
      if (updatedAt === null) setMissing(true);
      else if (updatedAt > version.current) void load(false);
    };
    const timer = setInterval(() => void check(), SYNC_EVERY_MS);
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [id, editor, autoFocus]);

  // Leaving (or the window closing): write what's still waiting, then drop an empty note.
  useEffect(() => {
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
      if (discardIfBlank && blank.current) void invoke('notes:discardIfBlank', { id });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per note (keyed by id)
  }, []);

  if (missing) {
    return (
      <p className="px-1 py-6 text-[13px] text-[var(--note-muted)]" data-testid="note-missing">
        This note was deleted.
      </p>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {toolbar && <FormatBar editor={editor} />}
      <EditorContent editor={editor} className="note-prose min-h-0 flex-1" />
    </div>
  );
}

/** A quiet row of formatting buttons (the Markdown shortcuts and ⌘B/⌘I work too). */
function FormatBar({ editor }: { editor: Editor }) {
  // Re-render as the selection moves, so the buttons show what's on.
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    editor.on('selectionUpdate', bump);
    editor.on('transaction', bump);
    return () => {
      editor.off('selectionUpdate', bump);
      editor.off('transaction', bump);
    };
  }, [editor]);
  const chain = () => editor.chain().focus();
  return (
    <div className="mb-2 flex shrink-0 items-center gap-0.5" data-testid="note-format-bar">
      <FormatButton
        label="Heading"
        on={editor.isActive('heading')}
        run={() => chain().toggleHeading({ level: 2 }).run()}
      >
        <Heading size={15} />
      </FormatButton>
      <FormatButton
        label="Bold (⌘B)"
        on={editor.isActive('bold')}
        run={() => chain().toggleBold().run()}
      >
        <Bold size={15} />
      </FormatButton>
      <FormatButton
        label="Italic (⌘I)"
        on={editor.isActive('italic')}
        run={() => chain().toggleItalic().run()}
      >
        <Italic size={15} />
      </FormatButton>
      <FormatButton
        label="Strikethrough"
        on={editor.isActive('strike')}
        run={() => chain().toggleStrike().run()}
      >
        <Strikethrough size={15} />
      </FormatButton>
      <span className="mx-1 h-4 w-px bg-[var(--note-line)]" />
      <FormatButton
        label="Bulleted List"
        on={editor.isActive('bulletList')}
        run={() => chain().toggleBulletList().run()}
      >
        <List size={15} />
      </FormatButton>
      <FormatButton
        label="Checklist"
        on={editor.isActive('taskList')}
        run={() => chain().toggleTaskList().run()}
        testId="note-checklist"
      >
        <ListChecks size={15} />
      </FormatButton>
    </div>
  );
}

function FormatButton(props: {
  label: string;
  on: boolean;
  run: () => void;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      aria-pressed={props.on}
      title={props.label}
      // Keep the editor's selection: act on mouse down, before focus moves.
      onMouseDown={(e) => {
        e.preventDefault();
        props.run();
      }}
      className={`press grid size-7 place-items-center rounded-[9px] ${
        props.on
          ? 'bg-[var(--note-hover)] text-[var(--note-fg)]'
          : 'text-[var(--note-muted)] hover:bg-[var(--note-hover)] hover:text-[var(--note-fg)]'
      }`}
      data-testid={props.testId}
    >
      {props.children}
    </button>
  );
}
