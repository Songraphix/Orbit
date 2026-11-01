import { Settings } from 'lucide-react';
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
    <main className="mx-auto max-w-2xl px-8 py-10 text-neutral-800" data-testid="settings-page">
      <h1 className="flex items-center gap-2 text-2xl font-semibold">
        <Settings size={22} /> Settings
      </h1>

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
        <Row label="Pages kept awake" hint="At most this many pages stay loaded; older ones sleep.">
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

      <Group title="AI">
        <AiKeyRow />
      </Group>

      <Group title="Privacy">
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
    </main>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-neutral-400 uppercase">
        {title}
      </h2>
      <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
        {children}
      </div>
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
