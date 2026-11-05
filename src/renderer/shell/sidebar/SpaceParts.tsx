import {
  ArrowDownToLine,
  FolderTree,
  Library,
  Moon,
  Plus,
  Settings,
  Sparkles,
  Sun,
  Undo2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { SidebarSnapshot, SpaceView } from '@shared/types/space';
import { RenameInput } from './Rows';
import { RecentFiles } from './RecentFiles';
import { Tip } from '../../tooltip/Tip';
import { SpaceIcon } from './SpaceIcon';
import { useColorMode } from '../use-color-mode';
import { useShown } from '../../ui/prefs-store';

const invoke = window.orbit.invoke;

/** A Space's icon on a chip of its own colour (the Spaces list, UI spec §11). */
export function SpaceChip({ space, size = 26 }: { space: SpaceView; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.3),0_2px_6px_-2px_rgb(0_0_0/0.35)]"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(160deg, ${space.theme.colors[0] ?? '#6c5ce7'}, ${space.theme.colors.at(-1) ?? '#4834d4'})`,
      }}
    >
      <SpaceIcon icon={space.icon} size={Math.round(size * 0.55)} />
    </span>
  );
}

/** A Space you aren't in: its chip and name; a click goes there (⌃1…9 too). */
export function SpaceRow({ space, index }: { space: SpaceView; index: number }) {
  return (
    <Tip label={space.name} keys={index < 9 ? `⌃${index + 1}` : undefined} side="right">
      <button
        type="button"
        aria-label={space.name}
        className="press mat-hover flex h-[var(--row-h,38px)] w-full items-center gap-2.5 rounded-[12px] px-1.5 text-left text-[13.5px] text-[var(--fg-muted)] hover:text-[var(--fg)]"
        onClick={() => void invoke('spaces:activate', { spaceId: space.id })}
        onContextMenu={(e) => {
          e.preventDefault();
          void invoke('sidebar:spaceMenu', { spaceId: space.id });
        }}
        data-testid="space-button"
      >
        <SpaceChip space={space} size={24} />
        <span className="min-w-0 flex-1 truncate">{space.name}</span>
      </button>
    </Tip>
  );
}

/** The Space you're in, at its place in the Spaces list: chip and name (double-click renames),
 *  with Tidy / Group and Clear for its Today tabs, which are listed below it (F-03). */
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
      className="flex h-[var(--row-h,38px)] items-center gap-2.5 px-1.5 text-[13.5px]"
      onContextMenu={(e) => {
        e.preventDefault();
        void invoke('sidebar:spaceMenu', { spaceId: space.id });
      }}
      data-testid="space-header"
    >
      <button
        type="button"
        aria-label={space.name}
        aria-current="true"
        className="press shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
        onClick={() => void invoke('spaces:activate', { spaceId: space.id })}
        data-testid="space-button"
      >
        <span key={space.id} className="anim-pop grid">
          <SpaceChip space={space} size={24} />
        </span>
      </button>
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
      <span className="flex-1" />
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
      {!tidy.canUndo && tidy.suggestGroups && hasToday && (
        // A crowded Today: Orbit has folders to suggest (by site and topic; a preview first).
        <button
          type="button"
          className="flex items-center gap-1 rounded px-1 text-xs font-medium text-[var(--accent-text,var(--sidebar-fg))] hover:bg-[var(--hover)]"
          onClick={() => void invoke('grouping:open', {})}
          title="Group Today’s tabs into folders by site and topic — see them first"
          data-testid="suggest-groups"
        >
          <FolderTree size={12} />
          Group
        </button>
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

/** The utility row at the sidebar's foot (UI spec §11): Library, light/dark, Settings, then
 *  "+" (new Space, folder, note…). Spaces themselves are in the list above. */
export function BottomBar() {
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
      <Tip label="Settings" keys="⌘," side="top">
        <button
          type="button"
          aria-label="Settings"
          onClick={() => void invoke('profile:open', { page: 'settings' })}
          className="press hover-turn grid size-8 place-items-center rounded-[11px] text-[var(--sidebar-muted)] hover:bg-[var(--hover)] hover:text-[var(--sidebar-fg)]"
          data-testid="settings-button"
        >
          <Settings size={16} />
        </button>
      </Tip>
      <span className="flex-1" />
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
