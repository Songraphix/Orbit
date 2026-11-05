import { describe, expect, it, vi } from 'vitest';
import { browserTools, runBrowserTool, webAddress } from '../../src/main/ai/browser-tools';
import type { BrowserAccess, BrowserToolDeps } from '../../src/main/ai/browser-tools';
import { linkNeedsConfirmation, siteName } from '../../src/main/ai/browser-policy';

const ALL: BrowserAccess = { browser: true, history: true, notes: true };
const NOW = new Date('2026-11-05T15:00:00').getTime();

function fakeDeps(over: Partial<BrowserToolDeps> = {}): BrowserToolDeps & {
  opened: string[];
} {
  const opened: string[] = [];
  return {
    opened,
    userWords: '',
    now: () => NOW,
    tabs: () => [
      {
        id: 't1',
        title: 'Brand guide — Figma',
        url: 'https://www.figma.com/file/1',
        showing: true,
        section: 'pinned',
        space: 'Work',
      },
      {
        id: 't2',
        title: 'Inbox',
        url: 'https://mail.google.com/',
        showing: false,
        section: 'today',
        space: 'Work',
      },
    ],
    switchTo: (id) => id === 't2',
    openUrl: (url) => void opened.push(url),
    search: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
    apps: () => [
      { id: 'a1', name: 'Spotify', url: 'https://open.spotify.com/', opens_in: 'panel' },
    ],
    openApp: (id) => id === 'a1',
    history: {
      search: () => [
        { title: 'Typography', url: 'https://typo.example/', lastVisitAt: NOW - 1000 },
      ],
      between: vi.fn(() => [
        {
          title: 'Long read about Arc',
          url: 'https://news.example/arc',
          lastVisitAt: NOW - 86_400_000,
        },
      ]),
      knows: (host) => host === 'news.example',
    },
    notes: {
      list: () => [{ id: 'n1', title: 'Launch plan', preview: 'Goals…', updatedAt: NOW }],
      read: (id) => (id === 'n1' ? { title: 'Launch plan', text: 'Goals and dates' } : null),
      open: (id) => id === 'n1',
      create: () => 'n2',
    },
    ...over,
  };
}

describe('linkNeedsConfirmation', () => {
  const from = {
    userWords: 'open youtube please',
    knownUrls: ['https://github.com/x'],
    visited: () => false,
  };
  it('opens sites the user named, has open, or has visited', () => {
    expect(linkNeedsConfirmation('https://www.youtube.com/', from)).toBe(false);
    expect(linkNeedsConfirmation('https://github.com/anthropics', from)).toBe(false);
    expect(
      linkNeedsConfirmation('https://news.example/a', {
        ...from,
        visited: (h) => h === 'news.example',
      }),
    ).toBe(false);
  });
  it('asks for anything else, or a link carrying a lot of data', () => {
    expect(linkNeedsConfirmation('https://evil.example/', from)).toBe(true);
    expect(linkNeedsConfirmation('https://evil-youtube.com/', from)).toBe(true);
    expect(linkNeedsConfirmation(`https://github.com/?q=${'x'.repeat(120)}`, from)).toBe(true);
    expect(linkNeedsConfirmation('https://user:pw@github.com/', from)).toBe(true);
    expect(linkNeedsConfirmation('javascript:alert(1)', from)).toBe(true);
    expect(linkNeedsConfirmation('not a url', from)).toBe(true);
  });
  it('names sites by their main label', () => {
    expect(siteName('docs.google.com')).toBe('google');
    expect(siteName('bbc.co.uk')).toBe('bbc');
    expect(siteName('localhost')).toBe('localhost');
  });
});

describe('browserTools', () => {
  it('offers only what Settings → AI allows', () => {
    const names = (a: BrowserAccess) => browserTools(a).map((t) => (t as { name: string }).name);
    expect(names(ALL)).toContain('search_history');
    expect(names({ browser: true, history: false, notes: false })).toEqual([
      'list_tabs',
      'switch_to_tab',
      'open_url',
      'search_web',
      'list_apps',
      'open_app',
    ]);
    expect(names({ browser: false, history: false, notes: true })).toEqual([
      'search_notes',
      'read_note',
      'open_note',
      'create_note',
    ]);
  });
});

describe('runBrowserTool', () => {
  it('refuses what isn’t allowed and inputs that don’t fit', () => {
    const deps = fakeDeps();
    const off = runBrowserTool('search_history', {}, { ...ALL, history: false }, deps);
    expect(off.isError).toBe(true);
    expect(runBrowserTool('switch_to_tab', { tab_id: 5 }, ALL, deps).isError).toBe(true);
    expect(runBrowserTool('open_url', { url: 'file:///etc/passwd' }, ALL, deps).isError).toBe(true);
    expect(deps.opened).toEqual([]);
  });

  it('lists tabs and switches to one that exists', () => {
    const deps = fakeDeps();
    const list = runBrowserTool('list_tabs', {}, ALL, deps);
    expect(JSON.parse(list.content).tabs).toHaveLength(2);
    expect(list.action).toEqual({ kind: 'read', label: 'Looked at your tabs (2)' });
    expect(runBrowserTool('switch_to_tab', { tab_id: 't2' }, ALL, deps).action?.label).toBe(
      'Switched to Inbox',
    );
    expect(runBrowserTool('switch_to_tab', { tab_id: 'nope' }, ALL, deps).isError).toBe(true);
  });

  it('opens a site the user named; offers an unknown one as a link instead', () => {
    const deps = fakeDeps({ userWords: 'open the figma file and wikipedia' });
    const named = runBrowserTool('open_url', { url: 'wikipedia.org' }, ALL, deps);
    expect(deps.opened).toEqual(['https://wikipedia.org/']);
    expect(named.action?.kind).toBe('update');
    const unknown = runBrowserTool('open_url', { url: 'https://attacker.example/?d=x' }, ALL, deps);
    expect(deps.opened).toHaveLength(1);
    expect(unknown.action).toEqual({
      kind: 'link',
      label: 'Open attacker.example',
      url: 'https://attacker.example/?d=x',
    });
    expect(JSON.parse(unknown.content)).toMatchObject({ opened: false, offered_as_link: true });
  });

  it('finds yesterday’s pages by day', () => {
    const deps = fakeDeps();
    const result = runBrowserTool('search_history', { days_ago: 1, query: 'arc' }, ALL, deps);
    const [from, to] = (deps.history.between as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const midnight = new Date(NOW);
    midnight.setHours(0, 0, 0, 0);
    expect(from).toBe(midnight.getTime() - 86_400_000);
    expect(to).toBe(midnight.getTime());
    expect(JSON.parse(result.content).pages[0].title).toBe('Long read about Arc');
  });

  it('opens apps and notes by id, and saves a note', () => {
    const deps = fakeDeps();
    expect(runBrowserTool('open_app', { app_id: 'a1' }, ALL, deps).action?.label).toBe(
      'Opened Spotify',
    );
    expect(runBrowserTool('open_app', { app_id: 'zz' }, ALL, deps).isError).toBe(true);
    expect(JSON.parse(runBrowserTool('read_note', { note_id: 'n1' }, ALL, deps).content).text).toBe(
      'Goals and dates',
    );
    const saved = runBrowserTool('create_note', { title: 'Key points', text: '- one' }, ALL, deps);
    expect(saved.action).toEqual({ kind: 'create', label: 'Saved the note “Key points”' });
  });
});

describe('webAddress', () => {
  it('accepts web addresses only', () => {
    expect(webAddress('example.com/a')).toBe('https://example.com/a');
    expect(webAddress('http://example.com')).toBe('http://example.com/');
    expect(webAddress('ftp://example.com')).toBeNull();
    expect(webAddress('localhost')).toBeNull();
  });
});
