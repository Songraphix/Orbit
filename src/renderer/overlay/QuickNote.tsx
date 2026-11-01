import { AppWindow, NotebookPen, PanelRight, PictureInPicture2 } from 'lucide-react';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import type { NoteAction } from '@shared/types/notes';
import { NoteEditor } from '../notes/NoteEditor';
import { saveOpenNotes } from '../notes/save-notes';
import { Glass } from './Glass';

const close = () =>
  void saveOpenNotes().then(() => window.orbit.invoke('notes:quick', { open: false }));

function MoveButton(props: {
  label: string;
  onClick: () => void;
  testId: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      className="press grid size-7 place-items-center rounded-[10px] text-white/55 hover:bg-white/[0.1] hover:text-white"
      data-testid={props.testId}
    >
      {props.children}
    </button>
  );
}

/**
 * The quick note (F-33, ⌃⇧N): a glass card over the page to jot something down without leaving
 * it. Esc or a click outside closes it (an empty note is thrown away); it can move on to the
 * Notes panel, a floating window or a tab.
 */
export function QuickNote({ id }: { id: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // Save every keystroke first, so the next place shows all of it.
  const move = (action: NoteAction) =>
    void saveOpenNotes().then(() => window.orbit.invoke('notes:act', { id, action }));
  return (
    <div
      className="fixed inset-0 flex justify-center bg-black/[0.14] pt-[14vh] animate-[orbit-fade-in_160ms_var(--ease-out)]"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
      data-testid="quick-note-backdrop"
    >
      <Glass
        className="animate-pop flex h-[min(420px,68vh)] w-[min(600px,90vw)] flex-col rounded-[24px]"
        data-testid="quick-note"
      >
        <div data-note-theme="dark" className="flex min-h-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-0.5 pr-3 pl-5">
            <span className="flex flex-1 items-center gap-2 text-[13px] font-medium text-white/60">
              <NotebookPen size={14} className="text-[var(--note-accent)]" />
              Quick Note
            </span>
            <MoveButton
              label="Move to Notes Panel"
              onClick={() => move('panel')}
              testId="note-to-panel"
            >
              <PanelRight size={15} />
            </MoveButton>
            <MoveButton label="Float on Top" onClick={() => move('float')} testId="note-to-float">
              <PictureInPicture2 size={15} />
            </MoveButton>
            <MoveButton label="Open as Tab" onClick={() => move('tab')} testId="note-to-tab">
              <AppWindow size={15} />
            </MoveButton>
          </header>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pt-1">
            <NoteEditor key={id} id={id} autoFocus toolbar={false} discardIfBlank />
          </div>
          <footer className="flex h-9 shrink-0 items-center justify-between border-t border-white/[0.07] px-5 text-[11.5px] text-white/35">
            <span>Saved as you type</span>
            <span>esc to close</span>
          </footer>
        </div>
      </Glass>
    </div>
  );
}
