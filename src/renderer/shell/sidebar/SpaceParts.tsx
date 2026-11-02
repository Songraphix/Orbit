import { ArrowDownToLine, Library, Moon, Plus, Sparkles, Sun, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { SidebarSnapshot, SpaceView } from '@shared/types/space';
import { RenameInput } from './Rows';
import { RecentFiles } from './RecentFiles';
import { Tip } from '../../tooltip/Tip';
import { SpaceIcon } from './SpaceIcon';
import { useColorMode } from '../use-color-mode';
import { useShown } from '../../ui/prefs-store';

const invoke = window.orbit.invoke;

/** The divider between Pinned and Today: space icon and name, with Clear (F-03, Img 5). */
export function SpaceHeader({
  space,
  renaming,
  onRenamed,
  hasToday,
  tidy,
}: {
  space: SpaceView;
  renaming: boolean;
  onRenamed: () => void;
  hasToday: boolean;
  tidy: SidebarSnapshot['tidy'];
}) {
  return (
    <div
      className="flex items-center gap-2 px-3 pt-2 pb-1 text-[13px]"
      onContextMenu={(e) => {
        e.preventDefault();
        void invoke('sidebar:spaceMenu', { spaceId: space.id });
      }}
      data-testid="space-header"
    >
      <span className="opacity-80">
        <SpaceIcon icon={space.icon} size={15} />
      </span>
      {renaming ? (
        <RenameInput
          // A new space's rename can start before the sidebar shows that space; keying by id
          // restarts the field with the right name instead of saving the previous space's.
          key={space.id}
          initial={space.name}
          onDone={(value) => {
            if (value?.trim() && value.trim() !== space.name)
              void invoke('spaces:update', { spaceId: space.id, name: value.trim() });
            onRenamed();
          }}
        />
      ) : (
        <span
          className="min-w-0 truncate font-semibold"
          onDoubleClick={() => window.dispatchEvent(new CustomEvent('orbit:rename-space'))}
          data-testid="space-name"
        >
          {space.name}
        </span>
      )}
      <span className="h-px flex-1 bg-[var(--sidebar-muted)] opacity-40" />
      {tidy.canUndo ? (
        <button
          type="button"
          className="flex items-center gap-1 rounded px-1 text-xs text-[var(--sidebar-muted)] hover:bg-[var(--hover)] hover:text-[var(--sidebar-fg)]"
          onClick={() => void invoke('sidebar:untidy', {})}
          title="Put the tabs back as they were"
          data-testid="untidy"
        >
          <Undo2 size={12} />
          Undo
        </button>
      ) : (
        tidy.available &&
        hasToday && (
          <button
            type="button"
            disabled={tidy.running}
            className={`flex items-center gap-1 rounded px-1 text-xs text-[var(--sidebar-muted)] hover:bg-[var(--hover)] hover:text-[var(--sidebar-fg)] ${tidy.running ? 'animate-pulse' : ''}`}
            onClick={() => void invoke('sidebar:tidy', {})}
            title="Group Today’s tabs into folders with Claude (titles and sites only)"
            data-testid="tidy"
          >
            <Sparkles size={12} />
            {tidy.running ? 'Tidying…' : 'Tidy'}
          </button>
        )
      )}
      {hasToday && (
        <button
          type="button"
          className="flex items-center gap-1 rounded px-1 text-xs text-[var(--sidebar-muted)] hover:bg-[var(--hover)] hover:text-[var(--sidebar-fg)]"
          onClick={() => void invoke('sidebar:clearToday', {})}
          title="Close all Today tabs (⇧⌘T brings them back)"
          data-testid="clear-today"
        >
          <ArrowDownToLine size={12} />
          Clear
        </button>
      )}
    </div>
  );
}

/** Library (left), one icon per space (middle), "+" (right) — F-07, Img 1/2/7. */
export function BottomBar({
  spaces,
  activeSpaceId,
}: {
  spaces: SpaceView[];
  activeSpaceId: string;
}) {
  // Hovering the Library button shows recent files (after a short pause, like a tooltip).
  const [recent, setRecent] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const libraryShown = useShown('library');
  const showRecent = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setRecent(true), 250);
  };
  const hideRecent = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setRecent(false), 200);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <div
      className="no-drag relative flex h-11 shrink-0 items-center gap-1 px-2"
      data-testid="bottom-bar"
    >
      {recent && (
        <div
          className="absolute inset-x-2 bottom-full"
          onPointerEnter={showRecent}
          onPointerLeave={hideRecent}
        >
          <RecentFiles />
        </div>
      )}
      {libraryShown && (
        <Tip label="View Library" keys="⌥⌘L" side="right">
          <button
            onPointerEnter={showRecent}
            onPointerLeave={hideRecent}
            type="button"
            aria-label="Library"
            onClick={() => {
              setRecent(false);
              window.clearTimeout(timer.current);
              void invoke('library:open', { section: 'media' });
            }}
            className="hover-lean grid size-8 place-items-center rounded-[11px] text-[var(--sidebar-muted)] hover:bg-[var(--hover)] hover:text-[var(--sidebar-fg)]"
            data-testid="library-button"
          >
            <Library size={16} />
          </button>
        </Tip>
      )}
      <ThemeToggle />
      <div className="flex min-w-0 flex-1 items-center justify-center gap-0.5 overflow-hidden">
        {spaces.map((space, i) => (
          <Tip key={space.id} label={space.name} keys={i < 9 ? `⌃${i + 1}` : undefined} side="top">
            <button
              type="button"
              aria-label={space.name}
              aria-current={space.id === activeSpaceId ? 'true' : undefined}
              className={`grid size-8 place-items-center rounded-[11px] transition ${
                space.id === activeSpaceId
                  ? 'bg-[var(--row-active)] opacity-100'
                  : 'opacity-55 hover:bg-[var(--hover)] hover:opacity-90'
              }`}
              onClick={() => void invoke('spaces:activate', { spaceId: space.id })}
              onContextMenu={(e) => {
                e.preventDefault();
                void invoke('sidebar:spaceMenu', { spaceId: space.id });
              }}
              data-testid="space-button"
            >
              {/* Switching to a space gives its icon a little bounce. */}
              <span
                key={space.id === activeSpaceId ? 'active' : 'idle'}
                className={`grid ${space.id === activeSpaceId ? 'anim-pop' : ''}`}
              >
                <SpaceIcon icon={space.icon} size={15} />
              </span>
            </button>
          </Tip>
        ))}
      </div>
      <Tip label="New Space, Folder, Note…" side="top">
        <button
          type="button"
          aria-label="Create"
          className="press hover-turn grid size-8 place-items-center rounded-[11px] hover:bg-[var(--hover)]"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            void invoke('sidebar:createMenu', {
              anchor: { x: r.x, y: r.y, width: r.width, height: r.height },
            });
          }}
          data-testid="create-button"
        >
          <Plus size={17} />
        </button>
      </Tip>
    </div>
  );
}

/** Light ↔ dark for the whole app (Settings → Appearance has System too). */
function ThemeToggle() {
  const mode = useColorMode();
  const next = mode === 'dark' ? 'Light' : 'Dark';
  return (
    <Tip label={`${next} Mode`} keys="⌥⌘D" side="top">
      <button
        type="button"
        aria-label={`Switch to ${next} Mode`}
        onClick={() => void invoke('appearance:toggle', {})}
        className="press grid size-8 place-items-center rounded-[11px] text-[var(--sidebar-muted)] hover:bg-[var(--hover)] hover:text-[var(--sidebar-fg)]"
        data-testid="appearance-toggle"
        data-mode={mode}
      >
        <span key={mode} className="anim-pop grid">
          {mode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </span>
      </button>
    </Tip>
  );
}
