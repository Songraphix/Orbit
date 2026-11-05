import { useCanvas } from '../ui/canvas-store';
import { Wallpaper } from '../ui/Wallpaper';
import type { CanvasState } from '@shared/types/canvas';
import {
  CircleUserRound,
  Info,
  Keyboard,
  Palette,
  AppWindow,
  Archive,
  DatabaseBackup,
  LayoutTemplate,
  Mic,
  Plug,
  Route,
  Settings,
  Shield,
  Sparkles,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import { SpaceIcon } from '../shell/sidebar/SpaceIcon';
import { Group, Row, Section } from './settings/parts';
import { AccountSection } from './settings/AccountSection';
import { AppearanceSection } from './settings/AppearanceSection';
import { AppsSection } from './settings/AppsSection';
import { VoiceSection } from './settings/VoiceSection';
import { DriveGroup } from './settings/DriveGroup';
import { buttonClass, FIELD } from '../ui/controls';
import { useEffect, useState } from 'react';
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
  const canvas = useCanvas();
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
    <div
      className={`ui-light relative flex min-h-screen text-neutral-800 ${
        canvas
          ? canvas.tone === 'dark'
            ? 'ui-glass-dark'
            : 'ui-glass-light'
          : 'bg-[var(--surface-page)]'
      }`}
      data-testid="settings-page"
    >
      {canvas && <SettingsCanvas canvas={canvas} />}
      <CloseSettings />
      <SettingsNav />
      <main className="relative min-w-0 flex-1 px-5 pt-9 pb-24 md:px-10">
        <div className="mx-auto max-w-2xl">
          <AccountSection />
          <Section
            id="general"
            title="General"
            description="How Orbit looks and behaves day to day."
          >
            <Group title="Tabs">
              <Row
                label="Tab layout"
                hint="Tabs in the sidebar, like Arc, or as pills across the top (also in Appearance)."
              >
                <select
                  value={settings.tabLayout}
                  onChange={(e) =>
                    update({ tabLayout: e.target.value as UserSettings['tabLayout'] })
                  }
                  className={`${FIELD}`}
                  data-testid="setting-tab-layout"
                >
                  <option value="sidebar">Sidebar</option>
                  <option value="top">Horizontal</option>
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
                  className={`${FIELD}`}
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
                  className={`${FIELD}`}
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
                  className={`${FIELD} w-20`}
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
                  className={`${FIELD}`}
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
                  role="switch"
                  checked={settings.littleShortcut}
                  onChange={(e) => update({ littleShortcut: e.target.checked })}
                  className="orbit-switch"
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
                  role="switch"
                  checked={settings.peek}
                  onChange={(e) => update({ peek: e.target.checked })}
                  className="orbit-switch"
                  data-testid="setting-peek"
                />
              </Row>
              <Row label="Preview links from" hint="Arc only previews links from pinned tabs.">
                <select
                  value={settings.peekScope}
                  disabled={!settings.peek}
                  onChange={(e) => update({ peekScope: e.target.value as 'all' | 'pinned' })}
                  className={`${FIELD}`}
                  data-testid="setting-peek-scope"
                >
                  <option value="all">Any tab</option>
                  <option value="pinned">Pinned tabs and favorites</option>
                </select>
              </Row>
            </Group>

            <Group title="Tabs">
              <Row
                label="Suggest grouping tabs"
                hint="When Today gets crowded, a Group button suggests folders by site and topic. Nothing moves until you accept; Undo puts it back."
              >
                <input
                  type="checkbox"
                  role="switch"
                  checked={settings.groupSuggestions}
                  onChange={(e) => update({ groupSuggestions: e.target.checked })}
                  className="orbit-switch"
                  data-testid="setting-group-suggestions"
                />
              </Row>
            </Group>

            <Group title="Video">
              <Row
                label="Pop out playing videos"
                hint="Switch away from a tab playing a video and it keeps playing in a small floating window, with buttons to minimize it, go back to it or close it."
              >
                <input
                  type="checkbox"
                  role="switch"
                  checked={settings.autoPopout}
                  onChange={(e) => update({ autoPopout: e.target.checked })}
                  className="orbit-switch"
                  data-testid="setting-auto-popout"
                />
              </Row>
            </Group>

            <Group title="Default browser">
              <DefaultBrowserRow />
            </Group>
          </Section>

          <AppearanceSection
            appearance={settings.appearance}
            onAppearance={(appearance) => {
              setSettings({ ...settings, appearance }); // at once; main's answer follows
              update({ appearance });
            }}
            tabLayout={settings.tabLayout}
            onTabLayout={(tabLayout) => {
              setSettings({ ...settings, tabLayout });
              update({ tabLayout });
            }}
          />

          <AppsSection />

          <Section
            id="profiles"
            title="Profiles"
            description="Separate logins and site data. Each Space uses one profile."
          >
            <ProfilesSection />
          </Section>

          <Section
            id="workspaces"
            title="Workspaces"
            description="Saved sets of tabs to start a new Space from."
          >
            <WorkspacesSection />
          </Section>

          <Section
            id="rules"
            title="Rules"
            description="Where links from other apps open, and how long each Space keeps tabs."
          >
            <RulesSection />
          </Section>

          <Section
            id="integrations"
            title="Integrations"
            description="Services Orbit connects to for your projects."
          >
            <IntegrationsSection />
          </Section>

          <Section
            id="backup"
            title="Backup"
            description="Copies of your Orbit data, kept where you choose."
          >
            <BackupSection />
          </Section>

          <Section id="shortcuts" title="Shortcuts" description="Every keyboard shortcut in Orbit.">
            <ShortcutsSection />
          </Section>

          <Section
            id="ai"
            title="AI"
            description="Claude in Orbit: your key, the model, a monthly limit and what’s shared."
          >
            <AiSection />
          </Section>

          <VoiceSection />

          <Section
            id="privacy"
            title="Privacy"
            description="Your browsing data, and what leaves your Mac."
          >
            <Group title="History">
              <Row
                label="Browsing history"
                hint="Removes every page from history and command bar results."
              >
                <button
                  type="button"
                  className={buttonClass()}
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
          className={buttonClass()}
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
            role="switch"
            checked={prefs.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
            className="orbit-switch"
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
            className={`${FIELD}`}
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
            role="switch"
            checked={prefs.attachPage}
            onChange={(e) => set({ attachPage: e.target.checked })}
            className="orbit-switch"
            data-testid="ai-attach-page"
          />
        </Row>
        <Row
          label="Projects and tasks"
          hint="Orbit AI can look at your projects and tasks when a question needs them, and add, update or tick them off when you ask. Each thing it does shows in its reply. It never deletes anything."
        >
          <input
            type="checkbox"
            role="switch"
            checked={prefs.workAccess}
            onChange={(e) => set({ workAccess: e.target.checked })}
            className="orbit-switch"
            data-testid="ai-work-access"
          />
        </Row>
        <Row
          label="Tabs and apps"
          hint="Orbit AI can see your open tabs’ titles and addresses and your apps, switch tabs, search, and open sites or apps when you ask. Sites you haven’t named or visited are offered as a link to click, never opened by themselves."
        >
          <input
            type="checkbox"
            role="switch"
            checked={prefs.browserAccess}
            onChange={(e) => set({ browserAccess: e.target.checked })}
            className="orbit-switch"
            data-testid="ai-browser-access"
          />
        </Row>
        <Row
          label="Notes"
          hint="Orbit AI can find and read your notes when a question needs them, open one beside the page, and save new notes when you ask. It never changes or deletes a note."
        >
          <input
            type="checkbox"
            role="switch"
            checked={prefs.notesAccess}
            onChange={(e) => set({ notesAccess: e.target.checked })}
            className="orbit-switch"
            data-testid="ai-notes-access"
          />
        </Row>
        <Row
          label="Browsing history"
          hint="Off by default. On: Orbit AI can search the pages you visited (titles, addresses, when) to answer things like “the article I read yesterday” — only the matches it finds are sent."
        >
          <input
            type="checkbox"
            role="switch"
            checked={prefs.historyAccess}
            onChange={(e) => set({ historyAccess: e.target.checked })}
            className="orbit-switch"
            data-testid="ai-history-access"
          />
        </Row>
        <Row
          label="Google Drive"
          hint="When Drive is connected (Settings → Integrations): Orbit AI can search your Drive and read a file when a question needs it, and links the file it used. Only the files it reads are sent."
        >
          <input
            type="checkbox"
            role="switch"
            checked={prefs.driveAccess}
            onChange={(e) => set({ driveAccess: e.target.checked })}
            className="orbit-switch"
            data-testid="ai-drive-access"
          />
        </Row>
        <div className="px-4 py-3 text-meta text-neutral-500" data-testid="ai-privacy">
          What you attach (a page’s text, a selection, saved findings) and your question go to
          Anthropic’s API with your key — plus, for what you’ve allowed above, only what Claude
          looks at to answer: projects and tasks, tab titles and addresses, notes, or history
          matches. Never all of your history or other tabs’ contents. Anthropic doesn’t train on API
          data. Conversations stay in memory until Orbit quits; answers you save become notes. Orbit
          keeps a log of each request below (when, what kind, tokens and cost — not the words).
        </div>
      </Group>

      <Group title="Usage">
        <Row
          label={`This month: ${formatCost(usage.cost)}`}
          hint={`${usage.requests} request${usage.requests === 1 ? '' : 's'} · ${(usage.inputTokens + usage.outputTokens).toLocaleString()} tokens (estimated from Anthropic’s prices)`}
        >
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-neutral-100" aria-hidden>
            <div
              className={`h-full rounded-full ${share >= 1 ? 'bg-red-500' : share > 0.8 ? 'bg-amber-500' : 'bg-[var(--accent,#2f7d75)]'}`}
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
            className={`${FIELD}`}
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
                    <span className="shrink-0 text-xs text-neutral-500">
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
                  <div className="text-xs text-neutral-500">
                    {AI_MODELS.find((m) => m.id === entry.model)?.name ?? entry.model} ·{' '}
                    {(entry.inputTokens + entry.outputTokens).toLocaleString()} tokens
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex justify-end px-4 py-2.5">
              <button
                type="button"
                className={buttonClass()}
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
          className={buttonClass()}
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
              className={`${FIELD} w-44`}
              data-testid="ai-key"
            />
            <button
              type="submit"
              disabled={!key.trim()}
              className={buttonClass()}
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
            <span className="text-xs text-neutral-500">Secure storage isn’t available.</span>
          )}
        </form>
      )}
    </Row>
  );
}

/** Settings opens over the window (owner request): × or Esc puts it away (a click outside it
 *  too). Esc inside a menu or a field's own popup closes that first. */
function CloseSettings() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('[role="menu"], [role="listbox"], [data-menu-open]')) return;
      void window.orbit.invoke('settings:close', {});
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <button
      type="button"
      aria-label="Close Settings"
      title="Close (Esc)"
      onClick={() => void window.orbit.invoke('settings:close', {})}
      className="mat-light fixed top-4 right-4 z-30 grid size-9 place-items-center rounded-full text-[var(--fg)] hover:bg-[var(--glass-hover)]"
      data-testid="settings-close"
    >
      <X size={16} />
    </button>
  );
}

/**
 * Settings on the canvas: the window's wallpaper behind it, under a soft veil so headings
 * read (the groups are glass cards on top). Your own image is fetched for this page.
 */
function SettingsCanvas({ canvas }: { canvas: CanvasState }) {
  const [image, setImage] = useState<string | null>(null);
  const custom = canvas.wallpaper.kind === 'custom';
  useEffect(() => {
    if (!custom) return;
    void window.orbit.invoke('canvas:get', {}).then((c) => setImage(c.customImage));
  }, [custom, canvas.wallpaper]);
  return (
    <div className="pointer-events-none fixed inset-0" aria-hidden>
      <Wallpaper
        choice={canvas.wallpaper}
        customImage={custom ? image : null}
        look={canvas.look}
        light={canvas.tone === 'light'}
        testId="settings-wallpaper"
      />
      <div className={`fixed inset-0 ${canvas.tone === 'dark' ? 'bg-black/30' : 'bg-white/35'}`} />
    </div>
  );
}

const NAV = [
  { id: 'account', label: 'Account', icon: <CircleUserRound size={16} /> },
  { id: 'general', label: 'General', icon: <Settings size={16} /> },
  { id: 'appearance', label: 'Appearance', icon: <Palette size={16} /> },
  { id: 'apps', label: 'Apps', icon: <AppWindow size={16} /> },
  { id: 'profiles', label: 'Profiles', icon: <UsersRound size={16} /> },
  { id: 'workspaces', label: 'Workspaces', icon: <LayoutTemplate size={16} /> },
  { id: 'rules', label: 'Rules', icon: <Route size={16} /> },
  { id: 'integrations', label: 'Integrations', icon: <Plug size={16} /> },
  { id: 'backup', label: 'Backup', icon: <DatabaseBackup size={16} /> },
  { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard size={16} /> },
  { id: 'ai', label: 'AI', icon: <Sparkles size={16} /> },
  { id: 'voice', label: 'Voice', icon: <Mic size={16} /> },
  { id: 'privacy', label: 'Privacy', icon: <Shield size={16} /> },
  { id: 'about', label: 'About', icon: <Info size={16} /> },
];

/** The left column: jumps to a section, and follows along as you scroll. */
function SettingsNav() {
  const [active, setActive] = useState(NAV[0]!.id); // the top section, until you scroll
  useEffect(() => {
    const sections = [...document.querySelectorAll<HTMLElement>('[data-settings-section]')];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        const top = visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive((top.target as HTMLElement).dataset['settingsSection'] ?? NAV[0]!.id);
      },
      { rootMargin: '0px 0px -70% 0px' },
    );
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, []);
  return (
    <nav
      className="mat-deep sticky top-2.5 z-10 m-2.5 mr-0 flex h-[calc(100vh-20px)] w-[60px] shrink-0 flex-col gap-0.5 overflow-y-auto rounded-[22px] px-2 pt-9 md:w-56 md:px-3"
      aria-label="Settings"
    >
      <div className="mb-4 flex items-center gap-2 px-2.5 text-[15px] font-semibold text-[var(--fg)]">
        <Settings size={17} /> <span className="hidden md:inline">Settings</span>
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
          aria-label={item.label}
          title={item.label}
          className={`press flex h-9 items-center gap-2.5 rounded-[9px] px-2.5 text-left text-[13.5px] ${
            active === item.id
              ? 'mat-sel font-medium text-[var(--fg)]'
              : 'text-[var(--fg-muted)] hover:bg-[var(--glass-hover)] hover:text-[var(--fg)]'
          }`}
          data-testid="settings-nav"
          data-section={item.id}
        >
          {item.icon}
          {/* Narrow pages (Settings beside the panel) show the icons only. */}
          <span className="hidden md:inline">{item.label}</span>
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
              className="grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-semibold text-on-accent shadow-[inset_0_0.5px_0_rgb(255_255_255/0.4)]"
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
              <div className="px-1 text-xs text-neutral-500">
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
            className={`${FIELD} min-w-0 flex-1`}
            data-testid="profile-new-name"
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className={buttonClass('primary')}
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
              className={`${FIELD}`}
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
  ['Back / forward', '⌘[ / ⌘]  ·  ⇧← / ⇧→ (outside text boxes)'],
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
        <div className="grid size-12 place-items-center rounded-[13px] bg-gradient-to-br from-[#22164f] via-[#5b3be8] to-[#ff7aa8] text-on-accent shadow-[0_4px_12px_-2px_rgb(91_59_232/0.5)]">
          <Sparkles size={20} />
        </div>
        <div className="flex-1">
          <div className="text-[15px] font-semibold">Orbit {info?.version}</div>
          <div className="text-xs text-neutral-500" data-testid="about-versions">
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
          className={buttonClass()}
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
            projects’ workspaces — can then start with its tabs, icon and colors.
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
      <span className="shrink-0 text-xs text-neutral-500">
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
              className={`grid size-8 shrink-0 place-items-center rounded-[10px] ${rule.enabled ? 'bg-[var(--accent,#2f7d75)]/10 text-[var(--accent,#2f7d75)]' : 'bg-neutral-100 text-neutral-400'}`}
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
              role="switch"
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
              className="orbit-switch"
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
  const SELECT = `${FIELD} max-w-full min-w-0`;
  return (
    <Group title="Add a rule">
      <div className="flex flex-col gap-3 px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
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
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-12 shrink-0 text-neutral-500">Site</span>
              <input
                value={pattern}
                onChange={(e) => {
                  setPattern(e.target.value);
                  setError(null);
                }}
                placeholder="figma.com, *.atlassian.net, github.com/my-org"
                className={`${FIELD} min-w-0 flex-1`}
                data-testid="rule-pattern"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
          <div className="flex flex-wrap items-center gap-2">
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
          <button type="button" onClick={add} className={buttonClass()} data-testid="rule-add">
            Add Rule
          </button>
        </div>
      </div>
    </Group>
  );
}

/**
 * Settings → Backup (roadmap P4.7): one-file backups to a folder you choose (by hand or daily),
 * optionally encrypted, and restoring one — with what that means for your privacy, in words.
 */
function BackupSection() {
  const [status, setStatus] = useState<InvokeOutput<'backup:status'> | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [passError, setPassError] = useState<string | null>(null);
  const [restorePass, setRestorePass] = useState<string | null>(null);
  const load = () =>
    void window.orbit.invoke('backup:status', {}).then((next) => {
      setStatus(next);
      setNow(Date.now());
    });
  useEffect(load, []);
  if (!status) return null;
  const BUTTON = buttonClass();
  const restore = (pass?: string) => {
    setBusy(true);
    void window.orbit
      .invoke('backup:restore', pass === undefined ? {} : { passphrase: pass })
      .then((r) => {
        setBusy(false);
        setMessage(r.message);
        setRestorePass(r.status === 'passphrase' ? '' : null);
        load();
      });
  };
  return (
    <>
      <Group title="Back up">
        <Row
          label="Back Up Now"
          hint={
            status.last
              ? `Last backup ${relativeTime(status.last, now)}.`
              : 'Your projects, tasks, notes, research, Spaces, tabs and settings, in one file.'
          }
        >
          <button
            type="button"
            disabled={busy}
            className={BUTTON}
            onClick={() => {
              setBusy(true);
              void window.orbit.invoke('backup:now', {}).then((r) => {
                setBusy(false);
                if (r.file) setMessage(`Backed up to ${r.file}`);
                load();
              });
            }}
            data-testid="backup-now"
          >
            Back Up…
          </button>
        </Row>
        <Row
          label="Back up every day"
          hint={
            status.auto
              ? `To ${status.auto.folder}, keeping the newest ${status.auto.keep}.`
              : 'Choose a folder — one that syncs (iCloud Drive, Dropbox) keeps a copy off this Mac.'
          }
        >
          <div className="flex items-center gap-2">
            {status.auto && (
              <select
                value={status.auto.keep}
                onChange={(e) =>
                  void window.orbit
                    .invoke('backup:auto', { action: 'keep', keep: Number(e.target.value) })
                    .then(load)
                }
                className={`${FIELD}`}
                aria-label="Backups to keep"
                data-testid="backup-keep"
              >
                {[5, 10, 30].map((n) => (
                  <option key={n} value={n}>
                    Keep {n}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              className={BUTTON}
              onClick={() =>
                void window.orbit.invoke('backup:auto', { action: 'choose' }).then(load)
              }
              data-testid="backup-choose-folder"
            >
              {status.auto ? 'Change…' : 'Choose Folder…'}
            </button>
            {status.auto && (
              <button
                type="button"
                className={BUTTON}
                onClick={() =>
                  void window.orbit.invoke('backup:auto', { action: 'off' }).then(load)
                }
                data-testid="backup-auto-off"
              >
                Turn Off
              </button>
            )}
          </div>
        </Row>
        {status.error && (
          <p className="px-4 py-2 text-xs text-red-600" data-testid="backup-error">
            The last automatic backup failed: {status.error}
          </p>
        )}
        <Row
          label="Encrypt backups"
          hint={
            status.encrypted
              ? 'On. Backups need the passphrase to restore — Orbit can’t recover a forgotten one.'
              : 'Off. Anyone with a backup file can read it. Set a passphrase to encrypt (AES-256).'
          }
        >
          {status.encrypted ? (
            <button
              type="button"
              className={BUTTON}
              onClick={() =>
                void window.orbit.invoke('backup:passphrase', { passphrase: null }).then(load)
              }
              data-testid="backup-passphrase-remove"
            >
              Turn Off
            </button>
          ) : (
            <form
              className="flex flex-col items-end gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                void window.orbit.invoke('backup:passphrase', { passphrase }).then((r) => {
                  setPassError(r.error);
                  if (r.ok) {
                    setPassphrase('');
                    load();
                  }
                });
              }}
            >
              <div className="flex gap-2">
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Passphrase"
                  autoComplete="new-password"
                  disabled={!status.canStore}
                  className={`${FIELD} w-40`}
                  data-testid="backup-passphrase"
                />
                <button type="submit" disabled={!passphrase} className={BUTTON}>
                  Set
                </button>
              </div>
              {passError && <span className="text-xs text-red-600">{passError}</span>}
            </form>
          )}
        </Row>
      </Group>

      <Group title="Restore">
        <Row
          label="Restore from Backup"
          hint={
            status.restorePending
              ? 'A backup is ready: Orbit restores it the next time it starts.'
              : 'Replaces what’s in Orbit now with a backup. What you have now is kept aside.'
          }
        >
          {status.restorePending ? (
            <button
              type="button"
              className={BUTTON}
              onClick={() => void window.orbit.invoke('backup:cancelRestore', {}).then(load)}
              data-testid="backup-cancel-restore"
            >
              Don’t Restore
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              className={BUTTON}
              onClick={() => restore()}
              data-testid="backup-restore"
            >
              Restore…
            </button>
          )}
        </Row>
        {restorePass !== null && (
          <form
            className="flex items-center gap-2 px-4 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              restore(restorePass);
            }}
          >
            <input
              type="password"
              value={restorePass}
              onChange={(e) => setRestorePass(e.target.value)}
              placeholder="The backup’s passphrase"
              className={`${FIELD} min-w-0 flex-1`}
              data-testid="backup-restore-passphrase"
            />
            <button type="submit" disabled={!restorePass} className={BUTTON}>
              Open Backup
            </button>
          </form>
        )}
        {message && (
          <p className="px-4 py-2 text-xs text-neutral-600" data-testid="backup-message">
            {message}
          </p>
        )}
      </Group>

      <Group title="Privacy and sync">
        <div
          className="px-4 py-3 text-xs leading-relaxed text-neutral-500"
          data-testid="backup-privacy"
        >
          Backups go only to the folder you choose — Orbit never uploads them anywhere. If that
          folder syncs (iCloud Drive, Dropbox), that service stores a copy; encrypt your backups to
          keep it private. Your Anthropic and GitHub keys are never in a backup. To move to another
          Mac, restore a backup there: Orbit doesn’t merge changes made on two Macs.
        </div>
      </Group>
    </>
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
    <>
      <DriveGroup />
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
              className={buttonClass()}
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
                  className={`${FIELD} w-44`}
                  data-testid="github-token"
                />
                <button
                  type="submit"
                  disabled={!token.trim()}
                  className={buttonClass()}
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
          A project can follow a repository (Edit Project → GitHub repository): its open pull
          requests and issues show on its page, and any of them can become a task. Live Folders use
          the token too. Orbit only reads; it never writes to GitHub.
        </div>
      </Group>
      <UnsplashGroup />
    </>
  );
}

/** Settings → Integrations → Unsplash: the owner's access key for Homepage photos (brief M4). */
function UnsplashGroup() {
  const [status, setStatus] = useState<InvokeOutput<'unsplash:status'> | null>(null);
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const load = () => void window.orbit.invoke('unsplash:status', {}).then(setStatus);
  useEffect(load, []);
  if (!status) return null;
  return (
    <Group title="Unsplash">
      <Row
        label="Access key"
        hint={
          status.hasKey
            ? 'Saved in your Keychain. Search Unsplash in the Homepage’s Customize → Background.'
            : 'For Homepage backgrounds from Unsplash. Create a free app at unsplash.com/developers and paste its Access Key.'
        }
      >
        {status.hasKey ? (
          <button
            type="button"
            className={buttonClass()}
            onClick={() => void window.orbit.invoke('unsplash:clearKey', {}).then(load)}
            data-testid="unsplash-key-remove"
          >
            Remove Key
          </button>
        ) : (
          <form
            className="flex flex-col items-end gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              void window.orbit.invoke('unsplash:setKey', { key }).then((r) => {
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
                placeholder="Access Key"
                autoComplete="off"
                disabled={!status.canStore}
                className={`${FIELD} w-44`}
                data-testid="unsplash-key"
              />
              <button
                type="submit"
                disabled={!key.trim()}
                className={buttonClass()}
                data-testid="unsplash-key-save"
              >
                Save
              </button>
            </div>
            {error && (
              <span className="text-xs text-red-600" data-testid="unsplash-key-error">
                {error}
              </span>
            )}
          </form>
        )}
      </Row>
      <div className="px-4 py-3 text-xs leading-relaxed text-neutral-500">
        Only your search words and this key go to Unsplash. Photos load from Unsplash and are
        credited on the page, as Unsplash asks.
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
      <span className="shrink-0 text-xs text-neutral-500">
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
