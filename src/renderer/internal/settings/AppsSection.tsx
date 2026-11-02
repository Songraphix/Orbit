import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { APP_CATALOG, appUrl } from '@shared/apps';
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
      <select
        value={app.spaces?.[0] ?? ''}
        onChange={(e) => update({ spaces: e.target.value ? [e.target.value] : null })}
        aria-label="Shows in"
        className={FIELD}
        data-testid="app-spaces"
      >
        <option value="">In every Space</option>
        {props.spaces.map((s) => (
          <option key={s.id} value={s.id}>
            Only in {s.name}
          </option>
        ))}
      </select>
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
