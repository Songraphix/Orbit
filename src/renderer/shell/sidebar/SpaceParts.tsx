import { ArrowDownToLine, Library, Plus } from 'lucide-react';
import type { SpaceView } from '@shared/types/space';
import { RenameInput } from './Rows';
import { SpaceIcon } from './SpaceIcon';

const invoke = window.orbit.invoke;

/** The divider between Pinned and Today: space icon and name, with Clear (F-03, Img 5). */
export function SpaceHeader({
  space,
  renaming,
  onRenamed,
  hasToday,
}: {
  space: SpaceView;
  renaming: boolean;
  onRenamed: () => void;
  hasToday: boolean;
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
          initial={space.name}
          onDone={(value) => {
            if (value?.trim())
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
  return (
    <div className="no-drag flex h-11 shrink-0 items-center gap-1 px-2" data-testid="bottom-bar">
      <button
        type="button"
        aria-label="Library"
        title="Library (coming in Phase 9)"
        disabled
        className="grid size-8 place-items-center rounded-lg opacity-40"
      >
        <Library size={16} />
      </button>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-0.5 overflow-hidden">
        {spaces.map((space, i) => (
          <button
            key={space.id}
            type="button"
            aria-label={space.name}
            aria-current={space.id === activeSpaceId ? 'true' : undefined}
            title={`${space.name}${i < 9 ? ` (⌃${i + 1})` : ''}`}
            className={`grid size-8 place-items-center rounded-lg transition ${
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
            <SpaceIcon icon={space.icon} size={15} />
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-label="Create"
        title="New space, folder or tab"
        className="grid size-8 place-items-center rounded-lg hover:bg-[var(--hover)]"
        onClick={() => void invoke('sidebar:createMenu', {})}
        data-testid="create-button"
      >
        <Plus size={17} />
      </button>
    </div>
  );
}
