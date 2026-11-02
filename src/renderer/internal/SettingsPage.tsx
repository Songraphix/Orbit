import {
  Info,
  Keyboard,
  Archive,
  LayoutTemplate,
  Plug,
  Route,
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
import { AI_FEATURE_LABELS, AI_MODELS, formatCost } from '@shared/ai';
import type { AiActivity, AiPrefs } from '@shared/ai';
import { relativeTime } from '@shared/time';
import { describeRule } from '@shared/rules';

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
/** orbit://settings, or orbit://settings/<section> to open on one (the profile menu's links). */
export function SettingsPage({ section = null }: { section?: string | null }) {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    void window.orbit.invoke('settings:get', {}).then(setSettings);
  }, []);
  const loaded = settings !== null;
  useEffect(() => {
    if (loaded && section) document.getElementById(section)?.scrollIntoView();
  }, [loaded, section]);

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
                label="Tab layout"
                hint="Tabs in the sidebar, like Arc, or in a strip across the top."
              >
                <select
                  value={settings.tabLayout}
                  onChange={(e) =>
                    update({ tabLayout: e.target.value as UserSettings['tabLayout'] })
                  }
                  className="rounded-lg border border-neutral-200 px-2 py-1 text-sm"
                  data-testid="setting-tab-layout"
                >
                  <option value="sidebar">Sidebar</option>
                  <option value="top">Top</option>
                </select>
              </Row>
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
                label="Preview links to other sites"
                hint="A link that would open a new tab on another site (an ad, a search result) opens in a floating preview over the page."
              >
                <input
                  type="checkbox"
                  checked={settings.peek}
                  onChange={(e) => update({ peek: e.target.checked })}
                  className="size-4 accent-[var(--accent,#5b5bd6)]"
                  data-testid="setting-peek"
                />
              </Row>
              <Row label="Preview links from" hint="Arc only previews links from pinned tabs.">
                <select
                  value={settings.peekScope}
                  disabled={!settings.peek}
                  onChange={(e) => update({ peekScope: e.target.value as 'all' | 'pinned' })}
                  className="rounded-lg border border-neutral-200 px-2 py-1 text-sm disabled:opacity-40"
                  data-testid="setting-peek-scope"
                >
                  <option value="all">Any tab</option>
                  <option value="pinned">Pinned tabs and favorites</option>
                </select>
              </Row>
            </Group>

            <Group title="Default browser">
              <DefaultBrowserRow />
            </Group>
          </Section>

          <Section id="profiles" title="Profiles">
            <ProfilesSection />
          </Section>

          <Section id="workspaces" title="Workspaces">
            <WorkspacesSection />
          </Section>

          <Section id="rules" title="Rules">
            <RulesSection />
          </Section>

          <Section id="integrations" title="Integrations">
            <IntegrationsSection />
          </Section>

          <Section id="shortcuts" title="Shortcuts">
            <ShortcutsSection />
          </Section>

          <Section id="ai" title="AI">
            <AiSection />
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
      <div className="divide-y divide-neutral-100 rounded-[18px] border border-black/[0.06] bg-white shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
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
 * Settings → AI (F-29, roadmap P3.7): your own Anthropic API key (encrypted in the Keychain,
 * never shown again), which model answers, a monthly spending limit, whether the assistant
 * attaches the page you're on, and a log of what was sent — metadata only, kept on this Mac.
 */
function AiSection() {
  const [status, setStatus] = useState<InvokeOutput<'ai:status'> | null>(null);
  const [activity, setActivity] = useState<AiActivity[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const load = () => {
    void window.orbit.invoke('ai:status', {}).then(setStatus);
    void window.orbit.invoke('ai:activity', {}).then((r) => {
      setActivity(r.entries);
      setNow(Date.now());
    });
  };
  useEffect(load, []);
  if (!status) return null;
  const { prefs, usage } = status;
  // Show the change at once; main's answer follows.
  const set = (patch: Partial<AiPrefs>) => {
    setStatus((current) => current && { ...current, prefs: { ...current.prefs, ...patch } });
    void window.orbit.invoke('ai:setPrefs', patch).then(load);
  };
  const limit = prefs.monthlyBudget;
  const share = limit ? Math.min(1, usage.cost / limit) : 0;
  return (
    <>
      <Group title="Claude">
        <AiKeyRow hasKey={status.hasKey} canStore={status.canStore} onChange={load} />
        <Row
          label="Use AI features"
          hint="When off, nothing is sent to Anthropic: the assistant and Tidy are hidden."
        >
          <input
            type="checkbox"
            checked={prefs.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
            className="size-4 accent-[var(--accent,#5b5bd6)]"
            data-testid="ai-enabled"
          />
        </Row>
        <Row
          label="Model"
          hint={`${AI_MODELS.find((m) => m.id === prefs.model)?.blurb ?? ''}. Tidy always uses Claude Haiku 5.5.`}
        >
          <select
            value={prefs.model}
            onChange={(e) => set({ model: e.target.value as AiPrefs['model'] })}
            className="rounded-lg border border-neutral-200 px-2 py-1 text-sm"
            data-testid="ai-model"
          >
            {AI_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Row>
      </Group>

      <Group title="Privacy">
        <Row
          label="Attach the page you’re on"
          hint="Off: the assistant reads a page only when you attach it or ask for a summary. Pages are read when you send, never before."
        >
          <input
            type="checkbox"
            checked={prefs.attachPage}
            onChange={(e) => set({ attachPage: e.target.checked })}
            className="size-4 accent-[var(--accent,#5b5bd6)]"
            data-testid="ai-attach-page"
          />
        </Row>
        <div
          className="px-4 py-3 text-xs leading-relaxed text-neutral-500"
          data-testid="ai-privacy"
        >
          What you attach (a page’s text, a selection, saved findings) and your question go to
          Anthropic’s API with your key, and nothing else — no history, no other tabs. Anthropic
          doesn’t train on API data. Conversations stay in memory until Orbit quits; answers you
          save become notes. Orbit keeps a log of each request below (when, what kind, tokens and
          cost — not the words).
        </div>
      </Group>

      <Group title="Usage">
        <Row
          label={`This month: ${formatCost(usage.cost)}`}
          hint={`${usage.requests} request${usage.requests === 1 ? '' : 's'} · ${(usage.inputTokens + usage.outputTokens).toLocaleString()} tokens (estimated from Anthropic’s prices)`}
        >
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-neutral-100" aria-hidden>
            <div
              className={`h-full rounded-full ${share >= 1 ? 'bg-red-500' : share > 0.8 ? 'bg-amber-500' : 'bg-[var(--accent,#5b5bd6)]'}`}
              style={{ width: `${Math.max(share * 100, usage.cost > 0 ? 3 : 0)}%` }}
            />
          </div>
        </Row>
        <Row
          label="Monthly limit"
          hint="AI stops sending once this month’s estimated spend reaches the limit."
        >
          <select
            value={limit === null ? 'none' : String(limit)}
            onChange={(e) =>
              set({ monthlyBudget: e.target.value === 'none' ? null : Number(e.target.value) })
            }
            className="rounded-lg border border-neutral-200 px-2 py-1 text-sm"
            data-testid="ai-budget"
          >
            {[1, 5, 10, 25, 50, 100].map((n) => (
              <option key={n} value={String(n)}>
                ${n}
              </option>
            ))}
            {limit !== null && ![1, 5, 10, 25, 50, 100].includes(limit) && (
              <option value={String(limit)}>{formatCost(limit)}</option>
            )}
            <option value="none">No limit</option>
          </select>
        </Row>
      </Group>

      <Group title="Activity">
        {activity.length === 0 ? (
          <div className="px-4 py-3 text-sm text-neutral-400" data-testid="ai-activity-empty">
            Nothing has been sent yet.
          </div>
        ) : (
          <>
            <ul
              className="max-h-72 divide-y divide-neutral-100 overflow-y-auto"
              data-testid="ai-activity"
            >
              {activity.map((entry) => (
                <li key={entry.id} className="px-4 py-2.5" data-testid="ai-activity-entry">
                  <div className="flex items-baseline gap-2 text-sm">
                    <span className="truncate">{AI_FEATURE_LABELS[entry.feature]}</span>
                    <span className="shrink-0 text-xs text-neutral-400">
                      {relativeTime(entry.at, now)}
                    </span>
                    <span className="flex-1" />
                    <span className="shrink-0 text-xs text-neutral-500 tabular-nums">
                      {formatCost(entry.cost)}
                    </span>
                  </div>
                  <div className="truncate text-xs text-neutral-500" title={entry.sent}>
                    Sent: {entry.sent}
                  </div>
                  <div className="text-xs text-neutral-400">
                    {AI_MODELS.find((m) => m.id === entry.model)?.name ?? entry.model} ·{' '}
                    {(entry.inputTokens + entry.outputTokens).toLocaleString()} tokens
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex justify-end px-4 py-2.5">
              <button
                type="button"
                className="rounded-lg border border-neutral-200 px-3 py-1 text-sm hover:bg-neutral-50"
                onClick={() => void window.orbit.invoke('ai:clearActivity', {}).then(load)}
                data-testid="ai-activity-clear"
              >
                Clear Log…
              </button>
            </div>
          </>
        )}
      </Group>
    </>
  );
}

/** Your Anthropic API key: saved encrypted in the Keychain, never shown again. */
function AiKeyRow(props: { hasKey: boolean; canStore: boolean; onChange: () => void }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Row
      label="Anthropic API key"
      hint={
        props.hasKey
          ? 'Saved in your Keychain. Used for the assistant (⌘J) and Tidy.'
          : 'For the assistant (⌘J) and Tidy. Get a key at console.anthropic.com.'
      }
    >
      {props.hasKey ? (
        <button
          type="button"
          className="rounded-lg border border-neutral-200 px-3 py-1 text-sm hover:bg-neutral-50"
          onClick={() => void window.orbit.invoke('ai:clearKey', {}).then(props.onChange)}
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
                props.onChange();
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
              disabled={!props.canStore}
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
          {!props.canStore && (
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
  { id: 'workspaces', label: 'Workspaces', icon: <LayoutTemplate size={16} /> },
  { id: 'rules', label: 'Rules', icon: <Route size={16} /> },
  { id: 'integrations', label: 'Integrations', icon: <Plug size={16} /> },
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

type TemplateEntry = InvokeOutput<'templates:list'>['templates'][number];

/** Workspace templates (roadmap P2.5): rename or delete; they're made from a Space's menu. */
function WorkspacesSection() {
  const [templates, setTemplates] = useState<TemplateEntry[] | null>(null);
  const load = () =>
    void window.orbit.invoke('templates:list', {}).then((r) => setTemplates(r.templates));
  useEffect(load, []);
  return (
    <>
      <Group title="Workspace templates">
        {templates?.length === 0 && (
          <p className="px-4 py-5 text-sm text-neutral-500" data-testid="templates-empty">
            Right-click a Space and choose <b>Save as Workspace Template</b>. New Spaces — and new
            projects’ workspaces — can then start with its tabs, icon and colours.
          </p>
        )}
        {templates?.map((t) => (
          <TemplateRow key={t.id} template={t} onChange={load} />
        ))}
      </Group>
      <ProjectTemplatesGroup />
    </>
  );
}

/** Project templates (roadmap P4.1): the built-in ones, and yours to rename or delete. */
function ProjectTemplatesGroup() {
  const [templates, setTemplates] = useState<InvokeOutput<'templates:projects'>['templates']>([]);
  const load = () =>
    void window.orbit.invoke('templates:projects', {}).then((r) => setTemplates(r.templates));
  useEffect(load, []);
  return (
    <Group title="Project templates">
      {templates.map((t) => (
        <ProjectTemplateRow key={t.id} template={t} onChange={load} />
      ))}
      {!templates.some((t) => !t.builtIn) && (
        <p className="px-4 py-3 text-xs text-neutral-500" data-testid="project-templates-hint">
          On a project’s page, ⋯ → <b>Save as Template…</b> keeps its tasks for new projects.
        </p>
      )}
    </Group>
  );
}

function ProjectTemplateRow(props: {
  template: InvokeOutput<'templates:projects'>['templates'][number];
  onChange: () => void;
}) {
  const { template } = props;
  const [name, setName] = useState(template.name);
  return (
    <div className="flex items-center gap-3 px-4 py-2.5" data-testid="project-template-row">
      <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-neutral-100 text-neutral-600">
        <LayoutTemplate size={15} />
      </span>
      {template.builtIn ? (
        <span className="min-w-0 flex-1 px-2 text-sm">{template.name}</span>
      ) : (
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() =>
            name.trim() &&
            name !== template.name &&
            void window.orbit
              .invoke('templates:renameProject', { id: template.id, name: name.trim() })
              .then(props.onChange)
          }
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          maxLength={60}
          aria-label="Template name"
          className="min-w-0 flex-1 rounded-md px-2 py-1 text-sm hover:bg-neutral-50 focus:bg-white focus:ring-1 focus:ring-neutral-300 focus:outline-none"
          data-testid="project-template-name"
        />
      )}
      <span className="shrink-0 text-xs text-neutral-400">
        {template.builtIn ? 'Built in · ' : ''}
        {template.tasks === 1 ? '1 task' : `${template.tasks} tasks`}
      </span>
      {!template.builtIn && (
        <button
          type="button"
          aria-label={`Delete ${template.name}`}
          onClick={() =>
            void window.orbit
              .invoke('templates:deleteProject', { id: template.id })
              .then(props.onChange)
          }
          className="grid size-8 shrink-0 place-items-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600"
          data-testid="project-template-delete"
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}

/**
 * Settings → Rules (roadmap P4.4): where links from other apps go, and a Space's own archive
 * time — in words, each with a switch.
 */
function RulesSection() {
  const [data, setData] = useState<InvokeOutput<'rules:list'> | null>(null);
  const load = () => void window.orbit.invoke('rules:list', {}).then(setData);
  useEffect(load, []);
  if (!data) return null;
  const spaceName = (id: string | null) =>
    data.spaces.find((s) => s.id === id)?.name ?? 'a deleted Space';
  return (
    <>
      <Group title="Your rules">
        {data.rules.length === 0 && (
          <p className="px-4 py-5 text-sm text-neutral-500" data-testid="rules-empty">
            No rules yet. Links from other apps open in Little Orbit; Today tabs follow the archive
            time in General.
          </p>
        )}
        {data.rules.map((rule) => (
          <div key={rule.id} className="flex items-center gap-3 px-4 py-2.5" data-testid="rule-row">
            <span
              className={`grid size-8 shrink-0 place-items-center rounded-[10px] ${rule.enabled ? 'bg-[var(--accent,#5b5bd6)]/10 text-[var(--accent,#5b5bd6)]' : 'bg-neutral-100 text-neutral-400'}`}
            >
              {rule.kind === 'link' ? <Route size={15} /> : <Archive size={15} />}
            </span>
            <span
              className={`min-w-0 flex-1 text-sm ${rule.enabled ? '' : 'text-neutral-400'}`}
              data-testid="rule-text"
            >
              {describeRule(rule, spaceName)}
            </span>
            <input
              type="checkbox"
              checked={rule.enabled}
              aria-label="On"
              onChange={(e) => {
                const enabled = e.target.checked;
                // Show it at once; main's answer follows.
                setData(
                  (current) =>
                    current && {
                      ...current,
                      rules: current.rules.map((r) => (r.id === rule.id ? { ...r, enabled } : r)),
                    },
                );
                void window.orbit.invoke('rules:toggle', { id: rule.id, enabled }).then(load);
              }}
              className="size-4 accent-[var(--accent,#5b5bd6)]"
              data-testid="rule-toggle"
            />
            <button
              type="button"
              aria-label="Delete rule"
              onClick={() => void window.orbit.invoke('rules:delete', { id: rule.id }).then(load)}
              className="grid size-8 shrink-0 place-items-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600"
              data-testid="rule-delete"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </Group>
      <AddRule spaces={data.spaces} onAdded={load} />
    </>
  );
}

function AddRule(props: { spaces: { id: string; name: string }[]; onAdded: () => void }) {
  const [kind, setKind] = useState<'link' | 'archive'>('link');
  const [pattern, setPattern] = useState('');
  const [target, setTarget] = useState(props.spaces[0]?.id ?? 'little');
  const [after, setAfter] = useState<'12h' | '24h' | '7d' | '30d' | 'never'>('7d');
  const [space, setSpace] = useState(props.spaces[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const add = () => {
    const input =
      kind === 'link'
        ? {
            kind,
            enabled: true,
            pattern,
            target: (target === 'little' || target === 'current' ? target : 'space') as
              'little' | 'current' | 'space',
            spaceId: target === 'little' || target === 'current' ? null : target,
          }
        : { kind, enabled: true, spaceId: space, after };
    void window.orbit.invoke('rules:add', input).then((r) => {
      setError(r.error);
      if (r.ok) {
        setPattern('');
        props.onAdded();
      }
    });
  };
  const SELECT = 'rounded-lg border border-neutral-200 px-2 py-1 text-sm';
  return (
    <Group title="Add a rule">
      <div className="flex flex-col gap-3 px-4 py-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-12 shrink-0 text-neutral-500">When</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as 'link' | 'archive')}
            className={SELECT}
            data-testid="rule-kind"
          >
            <option value="link">a link from another app goes to…</option>
            <option value="archive">Today tabs in a Space sit unopened…</option>
          </select>
        </div>
        {kind === 'link' ? (
          <>
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-neutral-500">Site</span>
              <input
                value={pattern}
                onChange={(e) => {
                  setPattern(e.target.value);
                  setError(null);
                }}
                placeholder="figma.com, *.atlassian.net, github.com/my-org"
                className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-2 py-1 text-sm"
                data-testid="rule-pattern"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-neutral-500">Open</span>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className={SELECT}
                data-testid="rule-target"
              >
                {props.spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    in {s.name}
                  </option>
                ))}
                <option value="little">in Little Orbit</option>
                <option value="current">where I am</option>
              </select>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-neutral-500">In</span>
            <select
              value={space}
              onChange={(e) => setSpace(e.target.value)}
              className={SELECT}
              data-testid="rule-space"
            >
              {props.spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <span className="text-neutral-500">archive after</span>
            <select
              value={after}
              onChange={(e) => setAfter(e.target.value as typeof after)}
              className={SELECT}
              data-testid="rule-after"
            >
              <option value="12h">12 hours</option>
              <option value="24h">24 hours</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
              <option value="never">never</option>
            </select>
          </div>
        )}
        <div className="flex items-center justify-end gap-3">
          {error && (
            <span className="text-xs text-red-600" data-testid="rule-error">
              {error}
            </span>
          )}
          <button
            type="button"
            onClick={add}
            className="rounded-lg border border-neutral-200 px-3 py-1 text-sm hover:bg-neutral-50"
            data-testid="rule-add"
          >
            Add Rule
          </button>
        </div>
      </div>
    </Group>
  );
}

/** Settings → Integrations (roadmap P4.2, P4.3): GitHub, and which services Orbit recognises. */
function IntegrationsSection() {
  const [status, setStatus] = useState<InvokeOutput<'github:status'> | null>(null);
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const load = () => void window.orbit.invoke('github:status', {}).then(setStatus);
  useEffect(load, []);
  if (!status) return null;
  return (
    <Group title="GitHub">
      <Row
        label="Personal access token"
        hint={
          status.hasToken
            ? 'Saved in your Keychain. Used to read private repositories and for higher rate limits.'
            : 'Optional. Public repositories work without one. A fine-grained, read-only token is enough.'
        }
      >
        {status.hasToken ? (
          <button
            type="button"
            className="rounded-lg border border-neutral-200 px-3 py-1 text-sm hover:bg-neutral-50"
            onClick={() => void window.orbit.invoke('github:clearToken', {}).then(load)}
            data-testid="github-token-remove"
          >
            Remove Token
          </button>
        ) : (
          <form
            className="flex flex-col items-end gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              void window.orbit.invoke('github:setToken', { token }).then((r) => {
                setError(r.error);
                if (r.ok) {
                  setToken('');
                  load();
                }
              });
            }}
          >
            <div className="flex gap-2">
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="github_pat_…"
                autoComplete="off"
                disabled={!status.canStore}
                className="w-44 rounded-lg border border-neutral-200 px-2 py-1 text-sm"
                data-testid="github-token"
              />
              <button
                type="submit"
                disabled={!token.trim()}
                className="rounded-lg border border-neutral-200 px-3 py-1 text-sm hover:bg-neutral-50 disabled:opacity-40"
                data-testid="github-token-save"
              >
                Save
              </button>
            </div>
            {error && (
              <span className="text-xs text-red-600" data-testid="github-token-error">
                {error}
              </span>
            )}
          </form>
        )}
      </Row>
      <div className="px-4 py-3 text-xs leading-relaxed text-neutral-500">
        A project can follow a repository (Edit Project → GitHub repository): its open pull requests
        and issues show on its page, and any of them can become a task. Live Folders use the token
        too. Orbit only reads; it never writes to GitHub.
      </div>
    </Group>
  );
}

function TemplateRow({ template, onChange }: { template: TemplateEntry; onChange: () => void }) {
  const [name, setName] = useState(template.name);
  return (
    <div className="flex items-center gap-3 px-4 py-2.5" data-testid="template-row">
      <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-neutral-100 text-neutral-600">
        <SpaceIcon icon={template.icon} size={15} />
      </span>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() =>
          name.trim() &&
          name !== template.name &&
          void window.orbit
            .invoke('templates:rename', { id: template.id, name: name.trim() })
            .then(onChange)
        }
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        maxLength={60}
        aria-label="Template name"
        className="min-w-0 flex-1 rounded-md px-2 py-1 text-sm hover:bg-neutral-50 focus:bg-white focus:ring-1 focus:ring-neutral-300 focus:outline-none"
        data-testid="template-name"
      />
      <span className="shrink-0 text-xs text-neutral-400">
        {template.tabs === 1 ? '1 tab' : `${template.tabs} tabs`}
      </span>
      <button
        type="button"
        aria-label={`Delete ${template.name}`}
        onClick={() =>
          void window.orbit
            .invoke('templates:delete', { id: template.id })
            .then((r) => r.deleted && onChange())
        }
        className="grid size-8 shrink-0 place-items-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600"
        data-testid="template-delete"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
