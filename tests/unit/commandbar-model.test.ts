import { describe, expect, it } from 'vitest';
import {
  workResults,
  buildResults,
  matchesAll,
  parseSuggestions,
  sameUrl,
} from '../../src/main/commandbar/model';
import type { ResultInput } from '../../src/main/commandbar/model';
import { classifyInput, searchUrl } from '../../src/main/omnibox/classify';

const base = (query: string, extra: Partial<ResultInput> = {}): ResultInput => ({
  query,
  mode: 'new',
  classified: classifyInput(query),
  tabs: [],
  history: [],
  suggestions: [],
  commands: [
    { id: 'toggle-sidebar', title: 'Toggle Sidebar', keywords: ['hide', 'show'], shortcut: '⌘S' },
    { id: 'copy-url', title: 'Copy URL', keywords: ['link'], shortcut: '⇧⌘C' },
  ],
  searchUrl,
  ...extra,
});
const kinds = (input: ResultInput) => buildResults(input).map((i) => `${i.kind}:${i.title}`);

describe('buildResults', () => {
  it('puts "open address" first for URL-like input', () => {
    expect(kinds(base('github.com'))[0]).toBe('navigate:github.com');
  });

  it('puts "search" first for words, then suggestions', () => {
    expect(
      kinds(base('orbit browser', { suggestions: ['orbit browser', 'orbit browser mac'] })),
    ).toEqual(['search:orbit browser', 'suggestion:orbit browser mac']);
  });

  it('offers to switch to an already-open tab rather than duplicating it', () => {
    const tabs = [
      { id: 't1', title: 'GitHub', url: 'https://github.com/', favicon: null, active: false },
    ];
    const results = kinds(
      base('github', {
        tabs,
        history: [{ url: 'https://github.com/', title: 'GitHub', favicon: null }],
      }),
    );
    expect(results).toContain('tab:GitHub');
    expect(results).not.toContain('history:GitHub'); // de-duplicated against the open tab
  });

  it('matches commands by title and keywords', () => {
    expect(kinds(base('hide'))).toContain('command:Toggle Sidebar');
    expect(kinds(base('copy'))).toContain('command:Copy URL');
  });

  it('lists history after the primary action, de-duplicated', () => {
    const results = kinds(
      base('gmail', {
        history: [
          { url: 'https://mail.google.com/', title: 'Gmail', favicon: null },
          { url: 'https://mail.google.com', title: 'Gmail dup', favicon: null },
        ],
      }),
    );
    expect(results).toEqual(['search:gmail', 'history:Gmail']);
  });

  it('shows other open tabs and commands for an empty query', () => {
    const tabs = [
      { id: 'a', title: 'Active', url: 'https://a.com/', favicon: null, active: true },
      { id: 'b', title: 'Other', url: 'https://b.com/', favicon: null, active: false },
    ];
    expect(kinds(base('', { tabs }))).toEqual([
      'tab:Other',
      'command:Toggle Sidebar',
      'command:Copy URL',
    ]);
  });
});

describe('helpers', () => {
  it('matchesAll needs every word', () => {
    expect(matchesAll('heav wor', 'Heavenly Worship')).toBe(true);
    expect(matchesAll('heav zzz', 'Heavenly Worship')).toBe(false);
    expect(matchesAll('  ', 'x')).toBe(false);
  });
  it('sameUrl ignores scheme, www and trailing slash', () => {
    expect(sameUrl('https://www.github.com/', 'http://github.com')).toBe(true);
    expect(sameUrl('https://github.com/a', 'https://github.com/b')).toBe(false);
  });
  it('parseSuggestions reads Google’s format and ignores junk', () => {
    expect(parseSuggestions(['q', ['a', 'b', 3]])).toEqual(['a', 'b']);
    expect(parseSuggestions({})).toEqual([]);
  });
});

describe('work results (roadmap P1.3)', () => {
  const work = {
    projects: [
      { id: 'p1', name: 'SIRATEQ Brand Guide', description: 'Brand identity' },
      { id: 'p2', name: 'Website', description: 'Portfolio' },
    ],
    tasks: [
      {
        id: 't1',
        title: 'Logo variations',
        projectId: 'p1',
        project: 'SIRATEQ Brand Guide',
        done: true,
      },
      {
        id: 't2',
        title: 'Brand voice',
        projectId: 'p1',
        project: 'SIRATEQ Brand Guide',
        done: false,
      },
      { id: 't3', title: 'Call the bank', projectId: null, project: null, done: false },
    ],
    notes: [{ id: 'n1', title: 'Brand brief', preview: 'tone and colours' }],
  };

  it('finds projects, tasks (open first) and notes, two of each at most', () => {
    const items = workResults('brand', work);
    expect(items.map((i) => [i.kind, i.title])).toEqual([
      ['project', 'SIRATEQ Brand Guide'],
      ['task', 'Brand voice'],
      ['task', 'Logo variations'],
      ['note', 'Brand brief'],
    ]);
    expect(items[1]).toMatchObject({
      targetId: 't2',
      projectId: 'p1',
      subtitle: 'Task · SIRATEQ Brand Guide',
    });
    expect(workResults('bank', work)[0]).toMatchObject({ kind: 'task', subtitle: 'Task' });
    expect(workResults('bank', work)[0]).not.toHaveProperty('projectId');
  });

  it('puts them after open tabs and before history in the bar', () => {
    const items = buildResults({
      query: 'brand',
      mode: 'new',
      classified: null,
      tabs: [
        {
          id: 'tab',
          title: 'Brand site',
          url: 'https://brand.example/',
          favicon: null,
          active: false,
        },
      ],
      history: [
        {
          url: 'https://brand.example/old',
          title: 'Old brand',
          favicon: null,
        },
      ],
      suggestions: [],
      commands: [],
      searchUrl: (q) => `https://s.example/?q=${q}`,
      work,
    });
    const kinds = items.map((i) => i.kind);
    expect(kinds.indexOf('tab')).toBeLessThan(kinds.indexOf('project'));
    expect(kinds.indexOf('note')).toBeLessThan(kinds.indexOf('history'));
  });
});
