import {
  ArrowDown,
  ArrowUp,
  CircleArrowDown,
  File,
  FolderOpen,
  Images,
  Layers,
  Pencil,
  Play,
  Search,
  Trash2,
  Wand2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  BoostEntry,
  DownloadEntry,
  LibrarySection,
  MediaItem,
  SpaceEntry,
} from '@shared/types/library';
import { SpaceIcon } from '../../shell/sidebar/SpaceIcon';
import { ArchivePage } from '../ArchivePage';
import { EaselsSection } from './EaselsSection';

const invoke = window.orbit.invoke;

/** orbit://library/<section> (F-11): the content area while the sidebar is in Library mode. */
export function LibraryPage({ section }: { section: LibrarySection }) {
  if (section === 'archive') return <ArchivePage />;
  return (
    <main className="mx-auto max-w-4xl px-8 py-10 text-neutral-800" data-testid="library-page">
      {section === 'media' && <MediaSection />}
      {section === 'downloads' && <DownloadsSection />}
      {section === 'easels' && <EaselsSection />}
      {section === 'spaces' && <SpacesSection />}
      {section === 'boosts' && <BoostsSection />}
    </main>
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
    <div className="mb-6 flex items-center gap-3">
      <h1 className="flex flex-1 items-center gap-2 text-2xl font-semibold">
        {icon} {title}
      </h1>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p
      className="rounded-xl border border-dashed border-neutral-200 px-6 py-12 text-center text-sm text-neutral-400"
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
  const items = data?.items ?? null;
  return (
    <>
      <Heading icon={<Images size={22} />} title="Media" />
      {items && items.length === 0 && (
        <Empty>Images and videos you download, and screenshots you take, show up here.</Empty>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
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
        className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-xl bg-neutral-100 ring-[#5b5bd6] hover:ring-2"
        title={`Open ${item.name}`}
      >
        {item.thumbnail ? (
          <img src={item.thumbnail} alt="" className="size-full object-cover" />
        ) : (
          <Images size={28} className="text-neutral-400" />
        )}
        {item.kind === 'video' && (
          <span className="absolute grid size-9 place-items-center rounded-full bg-black/55 text-white">
            <Play size={16} />
          </span>
        )}
      </button>
      <figcaption className="mt-1 flex items-center gap-1 text-xs text-neutral-500">
        <span className="min-w-0 flex-1 truncate" title={item.name}>
          {item.name}
        </span>
        <button
          type="button"
          aria-label="Show in Finder"
          title="Show in Finder"
          onClick={() => void invoke('library:mediaAct', { id: item.id, action: 'reveal' })}
          className="grid size-6 place-items-center rounded opacity-0 group-hover:opacity-100 hover:bg-neutral-100"
        >
          <FolderOpen size={13} />
        </button>
      </figcaption>
    </figure>
  );
}

const formatBytes = (bytes: number) =>
  bytes <= 0
    ? ''
    : bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

const STATE_LABEL: Record<DownloadEntry['state'], string> = {
  progressing: 'Downloading…',
  completed: '',
  cancelled: 'Cancelled',
  interrupted: 'Failed',
};

function DownloadsSection() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<DownloadEntry[] | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      void invoke('library:downloads', { query }).then((r) => setItems(r.items));
    }, 80);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <>
      <Heading icon={<CircleArrowDown size={22} />} title="Downloads" />
      <label className="mb-4 flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-sm focus-within:border-[#5b5bd6]">
        <Search size={15} className="text-neutral-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search downloads"
          className="flex-1 bg-transparent outline-none"
          data-testid="downloads-search"
        />
      </label>
      {items && items.length === 0 && (
        <Empty>{query ? 'No downloads match.' : 'Files you download show up here.'}</Empty>
      )}
      <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 empty:hidden">
        {items?.map((d) => (
          <li
            key={d.id}
            className="flex items-center gap-3 px-4 py-2.5"
            data-testid="download-entry"
          >
            <File size={18} className="shrink-0 text-neutral-400" />
            <div className="min-w-0 flex-1">
              <div
                className={`truncate text-sm ${d.exists ? '' : 'text-neutral-400 line-through'}`}
              >
                {d.filename}
              </div>
              <div className="truncate text-xs text-neutral-400">
                {[
                  new Date(d.startedAt).toLocaleDateString([], {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  }),
                  formatBytes(d.totalBytes),
                  d.exists ? STATE_LABEL[d.state] : 'Moved or deleted',
                  hostOf(d.url),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
            <SmallButton
              disabled={!d.exists || d.state !== 'completed'}
              onClick={() => void invoke('library:downloadAct', { id: d.id, action: 'open' })}
              testId="download-open"
            >
              Open
            </SmallButton>
            <SmallButton
              disabled={!d.exists}
              onClick={() => void invoke('library:downloadAct', { id: d.id, action: 'reveal' })}
              label="Show in Finder"
              testId="download-reveal"
            >
              <FolderOpen size={14} />
            </SmallButton>
          </li>
        ))}
      </ul>
    </>
  );
}

function SpacesSection() {
  const [data, reload] = useLoad(() => invoke('library:spaces', {}));
  const spaces = data?.spaces ?? [];
  const act = (space: SpaceEntry, action: 'open' | 'up' | 'down' | 'delete', name?: string) =>
    void invoke('library:spaceAct', { spaceId: space.id, action, name }).then(reload);

  return (
    <>
      <Heading icon={<Layers size={22} />} title="Spaces" />
      <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
        {spaces.map((space, i) => (
          <li
            key={space.id}
            className="flex items-center gap-3 px-4 py-2.5"
            data-testid="space-entry"
          >
            <span className="grid size-8 place-items-center rounded-lg bg-neutral-100">
              <SpaceIcon icon={space.icon} size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <input
                key={space.name}
                defaultValue={space.name}
                aria-label="Space name"
                onBlur={(e) => {
                  const name = e.currentTarget.value.trim();
                  if (name && name !== space.name)
                    void invoke('library:spaceAct', {
                      spaceId: space.id,
                      action: 'rename',
                      name,
                    }).then(reload);
                  else e.currentTarget.value = space.name;
                }}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                className="w-full rounded bg-transparent px-1 text-sm font-medium outline-none hover:bg-neutral-50 focus:bg-neutral-100"
                data-testid="space-name"
              />
              <div className="px-1 text-xs text-neutral-400">
                {space.profileName} profile · {space.tabs} tab{space.tabs === 1 ? '' : 's'}
              </div>
            </div>
            <SmallButton onClick={() => act(space, 'open')} testId="space-open">
              Open
            </SmallButton>
            <SmallButton
              disabled={i === 0}
              onClick={() => act(space, 'up')}
              label="Move up"
              testId="space-up"
            >
              <ArrowUp size={14} />
            </SmallButton>
            <SmallButton
              disabled={i === spaces.length - 1}
              onClick={() => act(space, 'down')}
              label="Move down"
              testId="space-down"
            >
              <ArrowDown size={14} />
            </SmallButton>
            <SmallButton
              disabled={spaces.length <= 1}
              onClick={() => act(space, 'delete')}
              label="Delete space"
              danger
              testId="space-delete"
            >
              <Trash2 size={14} />
            </SmallButton>
          </li>
        ))}
      </ul>
      <p className="mt-3 px-1 text-xs text-neutral-400">
        Right-click a space’s icon at the bottom of the sidebar to change its theme or profile.
      </p>
    </>
  );
}

function BoostsSection() {
  const [data, reload] = useLoad(() => invoke('library:boosts', {}));
  const boosts = data?.boosts ?? null;
  const act = (boost: BoostEntry, action: 'on' | 'off' | 'edit' | 'delete') =>
    void invoke('library:boostAct', { id: boost.id, action }).then(reload);

  return (
    <>
      <Heading icon={<Wand2 size={22} />} title="Boosts" />
      {boosts && boosts.length === 0 && (
        <Empty>
          No Boosts yet. On any site, open site controls and click the wand to make one.
        </Empty>
      )}
      <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 empty:hidden">
        {boosts?.map((boost) => (
          <li
            key={boost.id}
            className="flex items-center gap-3 px-4 py-2.5"
            data-testid="boost-entry"
          >
            <span className="grid size-8 place-items-center rounded-lg bg-[#5b5bd6] text-white">
              <Wand2 size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{boost.name}</div>
              <div className="truncate text-xs text-neutral-400">
                {boost.domain || 'No website'}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={boost.enabled}
              aria-label={boost.enabled ? 'Turn off' : 'Turn on'}
              onClick={() => act(boost, boost.enabled ? 'off' : 'on')}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${boost.enabled ? 'bg-[#5b5bd6]' : 'bg-neutral-300'}`}
              data-testid="boost-entry-toggle"
            >
              <span
                className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left] ${boost.enabled ? 'left-[18px]' : 'left-0.5'}`}
              />
            </button>
            <SmallButton onClick={() => act(boost, 'edit')} label="Edit" testId="boost-entry-edit">
              <Pencil size={14} />
            </SmallButton>
            <SmallButton
              onClick={() => act(boost, 'delete')}
              label="Delete"
              danger
              testId="boost-entry-delete"
            >
              <Trash2 size={14} />
            </SmallButton>
          </li>
        ))}
      </ul>
    </>
  );
}

export function SmallButton(props: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
  danger?: boolean;
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
      className={`flex h-7 min-w-7 items-center justify-center rounded-lg border border-neutral-200 px-2 text-xs font-medium disabled:opacity-35 ${
        props.danger ? 'text-red-600 hover:bg-red-50' : 'hover:bg-neutral-50'
      }`}
      data-testid={props.testId}
    >
      {props.children}
    </button>
  );
}
