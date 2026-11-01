import {
  ArrowLeft,
  ArrowRight,
  Ellipsis,
  File,
  Folder,
  FolderOpen,
  Globe,
  Images,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  Wand2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { groupByDay } from '@shared/time';
import type {
  BoostEntry,
  DownloadEntry,
  LibrarySection,
  MediaItem,
  SpaceEntry,
} from '@shared/types/library';
import { SpaceIcon } from '../../shell/sidebar/SpaceIcon';
import { ArchivePage } from '../ArchivePage';
import { useAppearance } from '../appearance';
import { EaselsSection } from './EaselsSection';

const invoke = window.orbit.invoke;

/**
 * orbit://library/<section> (F-11): the content area while the sidebar is in Library mode. Like
 * Arc's, it sits straight on the space's colours (the view is transparent) and uses its theme.
 */
export function LibraryPage({ section }: { section: LibrarySection }) {
  const mode = useAppearance();
  if (!mode) return null;
  return (
    <main
      className="min-h-screen px-6 pt-4 pb-10 text-[var(--sidebar-fg)]"
      data-testid="library-page"
    >
      {section === 'media' && <MediaSection />}
      {section === 'downloads' && <DownloadsSection />}
      {section === 'easels' && <EaselsSection />}
      {section === 'spaces' && <SpacesSection />}
      {section === 'boosts' && <BoostsSection />}
      {section === 'archive' && <ArchivePage embedded />}
    </main>
  );
}

/** The search field at the top of a section ("Search Media…"), with room for a button. */
export function SearchField(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  testId: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <label className="flex h-10 flex-1 items-center gap-2 rounded-xl bg-[var(--tile-bg)] px-3">
        <Search size={15} className="text-[var(--sidebar-muted)]" />
        <input
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder}
          className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--sidebar-muted)]"
          data-testid={props.testId}
        />
      </label>
      {props.children}
    </div>
  );
}

export function Heading({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <h1 className="flex flex-1 items-center gap-2 text-lg font-semibold">
        {icon} {title}
      </h1>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p
      className="rounded-2xl bg-[var(--tile-bg)] px-6 py-12 text-center text-sm text-[var(--sidebar-muted)]"
      data-testid="library-empty"
    >
      {children}
    </p>
  );
}

/** Refetches when the page regains focus (things change while the Library is open). */
function useLoad<T>(load: () => Promise<T>): [T | null, () => void] {
  const [data, setData] = useState<T | null>(null);
  const loader = useRef(load); // the first loader; sections pass a fixed request
  const reload = useCallback(() => void loader.current().then(setData), []);
  useEffect(() => {
    reload();
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
  }, [reload]);
  return [data, reload];
}

function MediaSection() {
  const [data] = useLoad(() => invoke('library:media', {}));
  const [query, setQuery] = useState('');
  const items = data?.items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Search Media…"
        testId="media-search"
      />
      {data && data.items.length === 0 && (
        <Empty>Images and videos you download, and screenshots you take, show up here.</Empty>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
        {items?.map((item) => (
          <MediaTile key={item.id} item={item} />
        ))}
      </div>
    </>
  );
}

function MediaTile({ item }: { item: MediaItem }) {
  return (
    <figure className="group relative" data-testid="media-item" data-source={item.source}>
      <button
        type="button"
        onClick={() => void invoke('library:mediaAct', { id: item.id, action: 'open' })}
        className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-2xl bg-[var(--tile-bg)] p-3 hover:bg-[var(--hover)]"
        title={item.name}
      >
        {item.thumbnail ? (
          <img
            src={item.thumbnail}
            alt=""
            className="max-h-full max-w-full rounded-md object-contain shadow-[0_0_0_3px_white,0_6px_18px_rgb(0_0_0/0.35)]"
          />
        ) : (
          <Images size={28} className="text-[var(--sidebar-muted)]" />
        )}
        {item.kind === 'video' && (
          <span className="absolute grid size-9 place-items-center rounded-full bg-black/55 text-white">
            <Play size={16} />
          </span>
        )}
      </button>
      <button
        type="button"
        aria-label="Show in Finder"
        title="Show in Finder"
        onClick={() => void invoke('library:mediaAct', { id: item.id, action: 'reveal' })}
        className="absolute top-2 right-2 grid size-7 place-items-center rounded-lg bg-black/50 text-white opacity-0 group-hover:opacity-100"
      >
        <FolderOpen size={13} />
      </button>
    </figure>
  );
}

function DownloadsSection() {
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState<{ items: DownloadEntry[]; at: number } | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      void invoke('library:downloads', { query }).then((r) =>
        setLoaded({ items: r.items, at: Date.now() }),
      );
    }, 80);
    return () => clearTimeout(timer);
  }, [query]);
  const items = loaded?.items ?? null;

  return (
    <>
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Search Downloads…"
        testId="downloads-search"
      />
      {items && items.length === 0 && (
        <Empty>{query ? 'No downloads match.' : 'Files you download show up here.'}</Empty>
      )}
      {loaded &&
        groupByDay(loaded.items, (d) => d.startedAt, loaded.at).map(([label, group]) => (
          <section key={label} className="mb-4">
            <h2 className="mb-1 px-1 text-[12px] font-semibold text-[var(--sidebar-muted)]">
              {label}
            </h2>
            <ul className="flex flex-col">
              {group.map((d) => (
                <li
                  key={d.id}
                  className="group flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-[var(--hover)]"
                  data-testid="download-entry"
                >
                  <button
                    type="button"
                    disabled={!d.exists || d.state !== 'completed'}
                    onClick={() => void invoke('library:downloadAct', { id: d.id, action: 'open' })}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    title={d.exists ? `Open ${d.filename}` : 'Moved or deleted'}
                    data-testid="download-open"
                  >
                    <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-md bg-[var(--tile-bg)]">
                      {d.thumbnail ? (
                        <img src={d.thumbnail} alt="" className="size-full object-cover" />
                      ) : (
                        <File size={16} className="text-[var(--sidebar-muted)]" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={`block truncate text-sm ${d.exists ? '' : 'line-through opacity-50'}`}
                      >
                        {d.filename}
                      </span>
                      <span className="block truncate text-[12px] text-[var(--sidebar-muted)]">
                        {d.exists ? d.kind : 'Moved or deleted'}
                      </span>
                    </span>
                  </button>
                  <IconButton
                    disabled={!d.exists}
                    onClick={() =>
                      void invoke('library:downloadAct', { id: d.id, action: 'reveal' })
                    }
                    label="Show in Finder"
                    testId="download-reveal"
                  >
                    <FolderOpen size={14} />
                  </IconButton>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </>
  );
}

/** Library → Spaces (Arc): a column per space with its pinned and Today tabs. */
function SpacesSection() {
  const [data, reload] = useLoad(() => invoke('library:spaces', {}));
  const spaces = data?.spaces ?? [];
  const act = (space: SpaceEntry, action: 'open' | 'up' | 'down' | 'menu', name?: string) =>
    void invoke('library:spaceAct', { spaceId: space.id, action, name }).then(reload);

  return (
    <div className="flex items-stretch gap-4 overflow-x-auto pb-2" data-testid="spaces-columns">
      {spaces.map((space, i) => (
        <section
          key={space.id}
          className={`flex min-h-[70vh] w-64 shrink-0 flex-col rounded-2xl p-3 ${
            space.active ? 'bg-[var(--row-active)]' : 'bg-[var(--tile-bg)]'
          }`}
          data-testid="space-entry"
        >
          <header className="mb-2 flex items-center gap-2 px-1">
            <SpaceIcon icon={space.icon} size={15} />
            <SpaceName space={space} onRenamed={reload} />
          </header>
          <ItemList items={space.pinned} />
          {space.today.length > 0 && (
            <>
              <div className="mx-1 my-2 h-px bg-[var(--sidebar-muted)] opacity-30" />
              <ItemList items={space.today} />
            </>
          )}
          {space.pinned.length + space.today.length === 0 && (
            <p className="px-1 text-[12px] text-[var(--sidebar-muted)]">No tabs</p>
          )}
          <footer className="mt-auto flex items-center gap-1 pt-3">
            <IconButton
              disabled={i === 0}
              onClick={() => act(space, 'up')}
              label="Move left"
              testId="space-up"
            >
              <ArrowLeft size={14} />
            </IconButton>
            <IconButton
              disabled={i === spaces.length - 1}
              onClick={() => act(space, 'down')}
              label="Move right"
              testId="space-down"
            >
              <ArrowRight size={14} />
            </IconButton>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => act(space, 'open')}
              className="rounded-lg px-2 py-1 text-[12px] font-medium hover:bg-[var(--hover)]"
              data-testid="space-open"
            >
              Open
            </button>
            <IconButton onClick={() => act(space, 'menu')} label="More" testId="space-menu">
              <Ellipsis size={15} />
            </IconButton>
          </footer>
        </section>
      ))}
      <div className="flex shrink-0 items-center px-2">
        <button
          type="button"
          aria-label="New Space"
          title="New Space"
          onClick={() => void invoke('library:newSpace', {}).then(reload)}
          className="grid size-9 place-items-center rounded-full bg-[var(--accent)] text-white shadow hover:brightness-110"
          data-testid="space-new"
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}

function SpaceName({ space, onRenamed }: { space: SpaceEntry; onRenamed: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        key={space.name}
        defaultValue={space.name}
        aria-label="Space name"
        onBlur={(e) => {
          const name = e.currentTarget.value.trim();
          if (name && name !== space.name)
            void invoke('library:spaceAct', { spaceId: space.id, action: 'rename', name }).then(
              onRenamed,
            );
          else e.currentTarget.value = space.name;
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="min-w-0 flex-1 rounded bg-transparent px-1 text-[13px] font-semibold outline-none focus:bg-[var(--hover)]"
        data-testid="space-name"
      />
      <IconButton onClick={() => input.current?.select()} label="Rename" testId="space-rename">
        <Pencil size={13} />
      </IconButton>
    </>
  );
}

function ItemList({ items }: { items: SpaceEntry['pinned'] }) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            disabled={item.folder}
            onClick={() => void invoke('library:openItem', { itemId: item.id })}
            className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left text-[13px] hover:bg-[var(--hover)] disabled:hover:bg-transparent"
            style={{ paddingLeft: 4 + item.depth * 14 }}
            title={item.title}
          >
            {item.folder ? (
              <Folder size={15} className="shrink-0" />
            ) : item.favicon ? (
              <img src={item.favicon} alt="" className="size-4 shrink-0 rounded-sm" />
            ) : (
              <Globe size={15} className="shrink-0 opacity-60" />
            )}
            <span className="truncate">{item.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function BoostsSection() {
  const [data, reload] = useLoad(() => invoke('library:boosts', {}));
  const boosts = data?.boosts ?? null;
  const act = (boost: BoostEntry, action: 'on' | 'off' | 'edit' | 'delete') =>
    void invoke('library:boostAct', { id: boost.id, action }).then(reload);

  return (
    <>
      <Heading icon={<Wand2 size={18} />} title="Boosts" />
      {boosts && boosts.length === 0 && (
        <Empty>
          No Boosts yet. On any site, open site controls and click the wand to make one.
        </Empty>
      )}
      <ul className="flex flex-col gap-1">
        {boosts?.map((boost) => (
          <li
            key={boost.id}
            className="flex items-center gap-3 rounded-xl bg-[var(--tile-bg)] px-3 py-2.5"
            data-testid="boost-entry"
          >
            <span className="grid size-8 place-items-center rounded-lg bg-[var(--accent)] text-white">
              <Wand2 size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{boost.name}</div>
              <div className="truncate text-[12px] text-[var(--sidebar-muted)]">
                {boost.domain || 'No website'}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={boost.enabled}
              aria-label={boost.enabled ? 'Turn off' : 'Turn on'}
              onClick={() => act(boost, boost.enabled ? 'off' : 'on')}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${boost.enabled ? 'bg-[var(--accent)]' : 'bg-[var(--hover)]'}`}
              data-testid="boost-entry-toggle"
            >
              <span
                className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left] ${boost.enabled ? 'left-[18px]' : 'left-0.5'}`}
              />
            </button>
            <IconButton onClick={() => act(boost, 'edit')} label="Edit" testId="boost-entry-edit">
              <Pencil size={14} />
            </IconButton>
            <IconButton
              onClick={() => act(boost, 'delete')}
              label="Delete"
              testId="boost-entry-delete"
            >
              <Trash2 size={14} />
            </IconButton>
          </li>
        ))}
      </ul>
    </>
  );
}

export function IconButton(props: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      aria-label={props.label}
      title={props.label}
      className="grid size-7 shrink-0 place-items-center rounded-lg text-[var(--sidebar-muted)] hover:bg-[var(--hover)] hover:text-[var(--sidebar-fg)] disabled:opacity-30 disabled:hover:bg-transparent"
      data-testid={props.testId}
    >
      {props.children}
    </button>
  );
}
