import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { APP_CATALOG, appUrl, spacesLabel, toggleSpace } from '@shared/apps';
import type { AppList, OpenIn } from '@shared/apps';
import { buttonClass, FIELD } from '../../ui/controls';
import { Group, Section } from './parts';

const invoke = window.orbit.invoke;
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/**
 * Settings → Apps (brief M5, the App Hub): your favourites are your apps. Add one by its
 * address or from the catalogue, rename it, choose where it opens — a tab, the side panel or
 * its own small window — and which Spaces show it.
 */
export function AppsSection() {
  const [list, setList] = useState<AppList | null>(null);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void invoke('apps:list', {}).then(setList);
  }, []);
  if (!list) return null;
  const added = new Set(list.apps.map((a) => hostOf(a.url)));
  const add = (address: string, title?: string) => {
    setError(null);
    invoke('apps:add', { url: address, ...(title ? { title } : {}) }).then(
      (next) => {
        setList(next);
        setUrl('');
        setName('');
      },
      () => setError('That isn’t a web address'),
    );
  };
  return (
    <Section
      id="apps"
      title="Apps"
      description="Your favourites are your apps: keep the sites you use most a click away — in a tab, the side panel or their own window."
    >
      <Group title="Your apps">
        {list.apps.length === 0 && (
          <p className="px-4 py-3 text-label text-neutral-500">
            No apps yet. Add one below, or drag a tab into Favorites at the top of the sidebar.
          </p>
        )}
        {list.apps.map((app) => (
          <AppRow key={app.id} app={app} spaces={list.spaces} onList={setList} />
        ))}
      </Group>

      <Group title="Add an app">
        <form
          className="flex flex-wrap items-center gap-2 px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (appUrl(url)) add(url, name.trim() || undefined);
            else setError('That isn’t a web address');
          }}
        >
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Address, like notion.so"
            className={`${FIELD} min-w-0 flex-[2_1_180px]`}
            data-testid="app-add-url"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional)"
            className={`${FIELD} min-w-0 flex-[1_1_120px]`}
            data-testid="app-add-name"
          />
          <button
            type="submit"
            className={buttonClass('primary')}
            disabled={!url.trim()}
            data-testid="app-add"
          >
            <Plus size={14} /> Add
          </button>
          {error && (
            <span className="w-full text-meta text-red-600" data-testid="app-add-error">
              {error}
            </span>
          )}
        </form>
        <div className="flex flex-col gap-3 px-4 pt-1 pb-4" data-testid="app-catalog">
          {APP_CATALOG.map((group) => (
            <div key={group.group}>
              <h4 className="mb-1.5 text-meta font-semibold text-neutral-500">{group.group}</h4>
              <div className="flex flex-wrap gap-1.5">
                {group.apps.map((a) => {
                  const has = added.has(hostOf(a.url));
                  return (
                    <button
                      key={a.url}
                      type="button"
                      disabled={has}
                      onClick={() => add(a.url, a.name)}
                      className="press flex h-7 items-center gap-1 rounded-full border border-neutral-200 px-2.5 text-[12.5px] hover:bg-neutral-50 disabled:opacity-40"
                      data-testid="catalog-app"
                      data-name={a.name}
                    >
                      {!has && <Plus size={12} />}
                      {a.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Group>
    </Section>
  );
}

function AppRow(props: {
  app: AppList['apps'][number];
  spaces: AppList['spaces'];
  onList: (list: AppList) => void;
}) {
  const { app } = props;
  const [title, setTitle] = useState(app.title);
  const update = (patch: { title?: string; openIn?: OpenIn; spaces?: string[] | null }) =>
    void invoke('apps:update', { itemId: app.id, ...patch }).then(props.onList);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5" data-testid="app-row">
      {app.favicon ? (
        <img src={app.favicon} alt="" className="size-6 shrink-0 rounded-[6px]" />
      ) : (
        <span className="grid size-6 shrink-0 place-items-center rounded-[6px] bg-neutral-100 text-[12px] font-semibold text-neutral-600">
          {app.title[0]?.toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-[1_1_160px]">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() !== app.title && update({ title })}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          aria-label="Name"
          className="w-full rounded-md bg-transparent px-1 text-label outline-none focus:bg-neutral-50"
          data-testid="app-name"
        />
        <div className="truncate px-1 text-meta text-neutral-500">{hostOf(app.url)}</div>
      </div>
      <select
        value={app.openIn}
        onChange={(e) => update({ openIn: e.target.value as OpenIn })}
        aria-label="Opens in"
        className={FIELD}
        data-testid="app-open-in"
      >
        <option value="tab">Opens in a tab</option>
        <option value="panel">Opens in the side panel</option>
        <option value="window">Opens in its own window</option>
      </select>
      <SpacesPicker
        value={app.spaces}
        spaces={props.spaces}
        onChange={(spaces) => update({ spaces })}
      />
      <button
        type="button"
        aria-label={`Remove ${app.title}`}
        title="Remove"
        onClick={() => void invoke('apps:remove', { itemId: app.id }).then(props.onList)}
        className="grid size-8 shrink-0 place-items-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600"
        data-testid="app-remove"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

/**
 * Which Spaces show an app: a button naming them, opening a checklist (every Space, or any of
 * them; at least one stays ticked).
 */
function SpacesPicker(props: {
  value: string[] | null;
  spaces: AppList['spaces'];
  onChange: (spaces: string[] | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault(); // this Esc closes the menu, not Settings
      setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const ids = props.spaces.map((s) => s.id);
  const shown = (id: string) => props.value?.includes(id) ?? false;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Shows in"
        onClick={() => setOpen((o) => !o)}
        className={`${FIELD} flex items-center gap-1.5 text-left`}
        data-testid="app-spaces"
      >
        <span className="truncate">{spacesLabel(props.value, props.spaces)}</span>
        <ChevronDown size={13} className="shrink-0 text-neutral-400" />
      </button>
      {open && (
        <div
          role="listbox"
          aria-multiselectable
          aria-label="Spaces"
          className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-black/[0.06] bg-white p-1 shadow-[0_12px_32px_-8px_rgb(0_0_0/0.25)]"
          data-testid="app-spaces-menu"
        >
          <SpaceOption
            label="Every Space"
            checked={!props.value}
            onToggle={() => props.onChange(null)}
            testId="app-space-all"
          />
          <div className="my-1 h-px bg-neutral-100" />
          {props.spaces.map((s) => (
            <SpaceOption
              key={s.id}
              label={s.name}
              checked={shown(s.id)}
              onToggle={() => props.onChange(toggleSpace(props.value, s.id, ids))}
              testId="app-space-option"
              spaceId={s.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SpaceOption(props: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  testId: string;
  spaceId?: string;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={props.checked}
      onClick={props.onToggle}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-label hover:bg-neutral-50"
      data-testid={props.testId}
      data-space-id={props.spaceId}
      data-checked={props.checked}
    >
      <span
        className={`grid size-4 shrink-0 place-items-center rounded-[5px] border ${props.checked ? 'border-[var(--accent)] bg-[var(--accent)] text-on-accent' : 'border-neutral-300'}`}
      >
        {props.checked && <Check size={11} strokeWidth={3} />}
      </span>
      <span className="truncate">{props.label}</span>
    </button>
  );
}
