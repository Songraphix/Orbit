import {
  Info,
  Keyboard,
  Settings,
  Shield,
  Sparkles,
  Trash2,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { SpaceIcon } from '../shell/sidebar/SpaceIcon';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { UserSettings } from '@shared/settings';
import type { InvokeOutput } from '@shared/ipc/contract';

const ARCHIVE_AFTER: { value: UserSettings['archiveAfter']; label: string }[] = [
  { value: '12h', label: 'After 12 hours' },
  { value: '24h', label: 'After 24 hours' },
  { value: '7d', label: 'After 7 days' },
  { value: '30d', label: 'After 30 days' },
  { value: 'never', label: 'Never' },
];

const ENGINES: { value: UserSettings['searchEngine']; label: string }[] = [
  { value: 'google', label: 'Google' },
  { value: 'duckduckgo', label: 'DuckDuckGo' },
  { value: 'bing', label: 'Bing' },
  { value: 'kagi', label: 'Kagi' },
  { value: 'ecosia', label: 'Ecosia' },
];

/** orbit://settings (Phase 4): archive, sleeping tabs, search engine, history. */
export function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    void window.orbit.invoke('settings:get', {}).then(setSettings);
  }, []);

  const update = (patch: Partial<UserSettings>) =>
    void window.orbit.invoke('settings:set', patch).then(setSettings);

  if (!settings) return null;
  return (
    <div className="flex min-h-screen bg-[#f6f6f8] text-neutral-800" data-testid="settings-page">
      <SettingsNav />
      <main className="min-w-0 flex-1 px-10 pt-9 pb-24">
        <div className="mx-auto max-w-2xl">
          <Section id="general" title="General">
            <Group title="Tabs">
              <Row
                label="Archive Today tabs"
                hint="Tabs you haven’t opened in this long move to Archived Tabs."
              >
                <select
                  value={settings.archiveAfter}
                  onChange={(e) =>
                    update({ archiveAfter: e.target.value as UserSettings['archiveAfter'] })
                  }
                  className="rounded-lg border border-neutral-200 px-2 py-1 text-sm"
                  data-testid="setting-archive-after"
                >
                  {ARCHIVE_AFTER.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Row>
              <Row
                label="Sleep pages after"
                hint="Unopened pages unload to save memory; they reload when clicked."
              >
                <select
                  value={settings.sleepAfterMinutes}
                  onChange={(e) => update({ sleepAfterMinutes: Number(e.target.value) })}
                  className="rounded-lg border border-neutral-200 px-2 py-1 text-sm"
                  data-testid="setting-sleep-after"
                >
                  {[5, 15, 30, 60, 120, 0].map((m) => (
                    <option key={m} value={m}>
                      {m === 0
                        ? 'Only when over the limit'
                        : m < 60
                          ? `${m} minutes`
                          : `${m / 60} hour${m > 60 ? 's' : ''}`}
                    </option>
                  ))}
                </select>
              </Row>
              <Row
                label="Pages kept awake"
                hint="At most this many pages stay loaded; older ones sleep."
              >
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={settings.maxLive}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (n >= 1 && n <= 50) update({ maxLive: n });
                  }}
                  className="w-20 rounded-lg border border-neutral-200 px-2 py-1 text-sm"
                  data-testid="setting-max-live"
                />
              </Row>
            </Group>

            <Group title="Search">
              <Row
                label="Search engine"
                hint="Used by the command bar, the new tab page and “Search for…”."
              >
                <select
                  value={settings.searchEngine}
                  onChange={(e) =>
                    update({ searchEngine: e.target.value as UserSettings['searchEngine'] })
                  }
                  className="rounded-lg border border-neutral-200 px-2 py-1 text-sm"
                  data-testid="setting-search-engine"
                >
                  {ENGINES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Row>
            </Group>

            <Group title="Little Orbit">
              <Row
                label="⌥⌘N from any app"
                hint="Opens a small Orbit window for a quick look-up, even when Orbit isn't in front."
              >
                <input
                  type="checkbox"
                  checked={settings.littleShortcut}
                  onChange={(e) => update({ littleShortcut: e.target.checked })}
                  className="size-4 accent-[var(--accent,#5b5bd6)]"
                  data-testid="setting-little-shortcut"
                />
              </Row>
            </Group>

            <Group title="Peek">
              <Row
                label="Preview links from pinned tabs"
                hint="Links from pinned tabs and favorites to other sites open in a floating preview."
              >
                <input
                  type="checkbox"
                  checked={settings.peek}
                  onChange={(e) => update({ peek: e.target.checked })}
                  className="size-4 accent-[var(--accent,#5b5bd6)]"
                  data-testid="setting-peek"
                />
              </Row>
            </Group>

            <Group title="Default browser">
              <DefaultBrowserRow />
            </Group>
          </Section>

          <Section id="profiles" title="Profiles">
            <ProfilesSection />
          </Section>

          <Section id="shortcuts" title="Shortcuts">
            <ShortcutsSection />
          </Section>

          <Section id="ai" title="AI">
            <Group title="Tidy">
              <AiKeyRow />
            </Group>
          </Section>

          <Section id="privacy" title="Privacy">
            <Group title="History">
              <Row
                label="Browsing history"
                hint="Removes every page from history and command bar results."
              >
                <button
                  type="button"
                  className="rounded-lg border border-neutral-200 px-3 py-1 text-sm hover:bg-neutral-50"
                  onClick={() =>
                    void window.orbit.invoke('history:clear', {}).then(() => setCleared(true))
                  }
                  data-testid="clear-history"
                >
                  {cleared ? 'Cleared' : 'Clear History'}
                </button>
              </Row>
            </Group>
          </Section>

          <Section id="about" title="About">
            <AboutSection />
          </Section>
        </div>
      </main>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-2 px-1 text-[12px] font-semibold text-neutral-500">{title}</h3>
      <div className="divide-y divide-neutral-100 rounded-xl border border-black/[0.07] bg-white shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
        {children}
      </div>
    </section>
  );
}

/** A page of Settings (its heading is what the nav jumps to). */
function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-8 pb-10" data-settings-section={id}>
      <h2 className="text-[22px] font-semibold tracking-[-0.01em]">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm">{label}</div>
        <div className="text-xs text-neutral-400">{hint}</div>
      </div>
      {children}
    </div>
  );
}

function DefaultBrowserRow() {
  const [isDefault, setIsDefault] = useState<boolean | null>(null);
  useEffect(() => {
    void window.orbit.invoke('browser:defaultStatus', {}).then((r) => setIsDefault(r.isDefault));
  }, []);
  return (
    <Row
      label="Open links from other apps in Orbit"
      hint="Links from Mail, Slack and others open in a small Little Orbit window."
    >
      {isDefault ? (
        <span className="text-sm text-neutral-500" data-testid="default-browser-status">
          Orbit is your default browser
        </span>
      ) : (
        <button
          type="button"
          className="rounded-lg border border-neutral-200 px-3 py-1 text-sm hover:bg-neutral-50"
          onClick={() =>
            void window.orbit
              .invoke('browser:makeDefault', {})
              .then((r) => setIsDefault(r.isDefault))
          }
          data-testid="make-default"
        >
          Make Default
        </button>
      )}
    </Row>
  );
}

/**
 * Tidy (F-29) uses your own Anthropic API key. It's stored encrypted in the macOS Keychain and
 * never shown again; only tab titles and sites are sent when you press Tidy.
 */
function AiKeyRow() {
  const [status, setStatus] = useState<InvokeOutput<'ai:status'> | null>(null);
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const load = () => void window.orbit.invoke('ai:status', {}).then(setStatus);
  useEffect(load, []);
  if (!status) return null;
  return (
    <Row
      label="Anthropic API key"
      hint={
        status.hasKey
          ? `Saved in your Keychain. Tidy in the space header groups Today’s tabs with ${status.model} (titles and sites only).`
          : 'For Tidy: groups Today’s tabs into folders. Get a key at console.anthropic.com.'
      }
    >
      {status.hasKey ? (
        <button
          type="button"
          className="rounded-lg border border-neutral-200 px-3 py-1 text-sm hover:bg-neutral-50"
          onClick={() => void window.orbit.invoke('ai:clearKey', {}).then(load)}
          data-testid="ai-key-remove"
        >
          Remove Key
        </button>
      ) : (
        <form
          className="flex flex-col items-end gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            void window.orbit.invoke('ai:setKey', { key }).then((r) => {
              setError(r.error);
              if (r.ok) {
                setKey('');
                load();
              }
            });
          }}
        >
          <div className="flex gap-2">
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-ant-…"
              autoComplete="off"
              disabled={!status.canStore}
              className="w-44 rounded-lg border border-neutral-200 px-2 py-1 text-sm"
              data-testid="ai-key"
            />
            <button
              type="submit"
              disabled={!key.trim()}
              className="rounded-lg border border-neutral-200 px-3 py-1 text-sm hover:bg-neutral-50 disabled:opacity-40"
              data-testid="ai-key-save"
            >
              Save
            </button>
          </div>
          {error && (
            <span className="text-xs text-red-600" data-testid="ai-key-error">
              {error}
            </span>
          )}
          {!status.canStore && (
            <span className="text-xs text-neutral-400">Secure storage isn’t available.</span>
          )}
        </form>
      )}
    </Row>
  );
}

const NAV = [
  { id: 'general', label: 'General', icon: <Settings size={16} /> },
  { id: 'profiles', label: 'Profiles', icon: <UsersRound size={16} /> },
  { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard size={16} /> },
  { id: 'ai', label: 'AI', icon: <Sparkles size={16} /> },
  { id: 'privacy', label: 'Privacy', icon: <Shield size={16} /> },
  { id: 'about', label: 'About', icon: <Info size={16} /> },
];

/** The left column: jumps to a section, and follows along as you scroll. */
function SettingsNav() {
  const [active, setActive] = useState('general');
  useEffect(() => {
    const sections = [...document.querySelectorAll<HTMLElement>('[data-settings-section]')];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        const top = visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive((top.target as HTMLElement).dataset['settingsSection'] ?? 'general');
      },
      { rootMargin: '0px 0px -70% 0px' },
    );
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, []);
  return (
    <nav
      className="sticky top-0 flex h-screen w-56 shrink-0 flex-col gap-0.5 border-r border-black/[0.06] bg-white/70 px-3 pt-9 backdrop-blur-xl"
      aria-label="Settings"
    >
      <div className="mb-4 flex items-center gap-2 px-2.5 text-[15px] font-semibold">
        <Settings size={17} /> Settings
      </div>
      {NAV.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-current={active === item.id ? 'page' : undefined}
          onClick={() => {
            setActive(item.id);
            document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' });
          }}
          className={`press flex h-9 items-center gap-2.5 rounded-[9px] px-2.5 text-left text-[13.5px] ${
            active === item.id
              ? 'bg-[#5b5bd6] font-medium text-white shadow-[0_1px_2px_rgb(0_0_0/0.15)]'
              : 'text-neutral-600 hover:bg-black/[0.05]'
          }`}
          data-testid="settings-nav"
          data-section={item.id}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </nav>
  );
}

/** A profile's colour, from its id (stable, varied). */
function profileHue(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/**
 * Profiles (F-17): each has its own cookies, logins, history and favorites. A space uses one
 * profile; moving it reloads its pages signed in as the other.
 */
function ProfilesSection() {
  const [data, setData] = useState<InvokeOutput<'profiles:list'> | null>(null);
  const [name, setName] = useState('');
  const load = () => void window.orbit.invoke('profiles:list', {}).then(setData);
  useEffect(load, []);
  if (!data) return null;
  return (
    <>
      <p className="mt-1 text-[13px] text-neutral-500">
        Each profile keeps its own logins, cookies, history and favorites — like having a separate
        browser for work and for home. Every space uses one profile.
      </p>
      <Group title="Profiles">
        {data.profiles.map((p) => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-2.5" data-testid="profile-row">
            <span
              className="grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-semibold text-white shadow-[inset_0_0.5px_0_rgb(255_255_255/0.4)]"
              style={{ background: `hsl(${profileHue(p.id)} 62% 52%)` }}
              aria-hidden
            >
              {p.name.trim()[0]?.toUpperCase() ?? <UserRound size={14} />}
            </span>
            <div className="min-w-0 flex-1">
              <input
                key={p.name}
                defaultValue={p.name}
                aria-label="Profile name"
                onBlur={(e) => {
                  const next = e.currentTarget.value.trim();
                  if (next && next !== p.name)
                    void window.orbit
                      .invoke('profiles:rename', { id: p.id, name: next })
                      .then(load);
                  else e.currentTarget.value = p.name;
                }}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                className="w-full rounded bg-transparent px-1 text-sm font-medium outline-none hover:bg-neutral-50 focus:bg-neutral-100"
                data-testid="profile-name"
              />
              <div className="px-1 text-xs text-neutral-400">
                {p.isDefault ? 'Default · ' : ''}
                {p.spaces === 0 ? 'No spaces' : `${p.spaces} space${p.spaces === 1 ? '' : 's'}`}
              </div>
            </div>
            <button
              type="button"
              disabled={p.isDefault || p.spaces > 0}
              title={
                p.isDefault
                  ? 'The default profile can’t be deleted'
                  : p.spaces > 0
                    ? 'Move its spaces to another profile first'
                    : 'Delete profile'
              }
              aria-label="Delete profile"
              onClick={() => void window.orbit.invoke('profiles:delete', { id: p.id }).then(load)}
              className="grid size-8 place-items-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
              data-testid="profile-delete"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <form
          className="flex items-center gap-2 px-4 py-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            void window.orbit.invoke('profiles:create', { name: name.trim() }).then(() => {
              setName('');
              load();
            });
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New profile name (e.g. Work)"
            maxLength={40}
            className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm"
            data-testid="profile-new-name"
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="rounded-lg bg-[#5b5bd6] px-3 py-1.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-40"
            data-testid="profile-add"
          >
            Add Profile
          </button>
        </form>
      </Group>
      <Group title="Spaces">
        {data.spaces.map((space) => (
          <div
            key={space.id}
            className="flex items-center gap-3 px-4 py-2.5"
            data-testid="space-profile-row"
          >
            <span className="grid size-8 place-items-center rounded-lg bg-neutral-100 text-neutral-700">
              <SpaceIcon icon={space.icon} size={15} />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{space.name}</span>
            <select
              value={space.profileId}
              onChange={(e) =>
                void window.orbit
                  .invoke('profiles:assign', { spaceId: space.id, profileId: e.target.value })
                  .then(load)
              }
              className="rounded-lg border border-neutral-200 px-2 py-1 text-sm"
              aria-label={`Profile for ${space.name}`}
              data-testid="space-profile"
            >
              {data.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </Group>
    </>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Command bar / new tab', '⌘T'],
  ['Edit the address', '⌘L'],
  ['Show or hide the sidebar', '⌘S'],
  ['Copy link', '⇧⌘C'],
  ['Pin or unpin tab', '⌘D'],
  ['Close tab', '⌘W'],
  ['Reopen closed tab', '⇧⌘T'],
  ['New split', '⌃⇧='],
  ['New Easel', '⌃⇧E'],
  ['New Little Orbit (from any app)', '⌥⌘N'],
  ['Switch to space 1–9', '⌃1 … ⌃9'],
  ['Previous / next space', '⌥⌘← / ⌥⌘→'],
  ['Go to tab 1–9', '⌘1 … ⌘9'],
  ['Find in page', '⌘F'],
  ['Zoom in / out / reset', '⌘+ / ⌘− / ⌘0'],
  ['Reload / hard reload', '⌘R / ⇧⌘R'],
  ['Back / forward', '⌘[ / ⌘]'],
  ['Developer tools', '⌥⌘I'],
  ['Settings', '⌘,'],
];

function ShortcutsSection() {
  return (
    <Group title="Keyboard">
      {SHORTCUTS.map(([label, keys]) => (
        <div key={label} className="flex items-center gap-4 px-4 py-2">
          <span className="flex-1 text-sm">{label}</span>
          <kbd className="rounded-md border border-black/10 bg-neutral-50 px-2 py-0.5 font-sans text-[12px] text-neutral-600 shadow-[0_1px_0_rgb(0_0_0/0.06)]">
            {keys}
          </kbd>
        </div>
      ))}
    </Group>
  );
}

function AboutSection() {
  const [info, setInfo] = useState<InvokeOutput<'app:getInfo'> | null>(null);
  useEffect(() => {
    void window.orbit.invoke('app:getInfo', {}).then(setInfo);
  }, []);
  return (
    <Group title="Orbit">
      <div className="flex items-center gap-4 px-4 py-4">
        <div className="grid size-12 place-items-center rounded-[13px] bg-gradient-to-br from-[#22164f] via-[#5b3be8] to-[#ff7aa8] text-white shadow-[0_4px_12px_-2px_rgb(91_59_232/0.5)]">
          <Sparkles size={20} />
        </div>
        <div className="flex-1">
          <div className="text-[15px] font-semibold">Orbit {info?.version}</div>
          <div className="text-xs text-neutral-400" data-testid="about-versions">
            {info ? `Chromium ${info.chrome} · Electron ${info.electron}` : ''}
          </div>
        </div>
      </div>
      <Row
        label="Profile folder"
        hint="Your spaces, tabs, history, Boosts, Easels and backups live here."
      >
        <button
          type="button"
          className="rounded-lg border border-neutral-200 px-3 py-1 text-sm hover:bg-neutral-50"
          onClick={() => void window.orbit.invoke('app:revealData', {})}
          data-testid="reveal-data"
        >
          Show in Finder
        </button>
      </Row>
    </Group>
  );
}
