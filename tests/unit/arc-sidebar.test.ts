import { describe, expect, it } from 'vitest';
import { countArc, parseArcSidebar, themeOf } from '../../src/main/importer/arc/sidebar';

/** A small, made-up sidebar in Arc's format (no real user data). */
const fixture = {
  sidebar: {
    containers: [
      { global: {} },
      {
        topAppsContainerIDs: [{ default: true }, 'TOP'],
        spaces: [
          'S1',
          {
            id: 'S1',
            title: 'silence',
            profile: { default: true },
            containerIDs: ['unpinned', 'S1-U', 'pinned', 'S1-P'],
            customInfo: {
              iconType: { emoji_v2: '☁️' },
              windowTheme: {
                background: {
                  single: {
                    _0: {
                      contentOverBackgroundAppearance: 'dark',
                      style: {
                        color: {
                          _0: {
                            blendedSingleColor: {
                              _0: {
                                color: { red: 0.2, green: 0.1, blue: 0.4, alpha: 1 },
                                modifiers: { noiseFactor: 0.7, intensityFactor: 0.8 },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          'S2',
          {
            id: 'S2',
            title: 'Work',
            profile: { custom: { _0: { directoryBasename: 'Profile 1' } } },
            containerIDs: ['unpinned', 'S2-U', 'pinned', 'S2-P'],
            customInfo: { iconType: { icon: 'planet' } },
          },
        ],
        items: [
          'TOP',
          { id: 'TOP', parentID: null, childrenIds: ['F1', 'F2'], data: { itemContainer: {} } },
          'F1',
          {
            id: 'F1',
            parentID: 'TOP',
            childrenIds: [],
            title: null,
            data: { tab: { savedURL: 'https://mail.google.com/', savedTitle: 'Gmail' } },
          },
          'F2',
          {
            id: 'F2',
            parentID: 'TOP',
            childrenIds: [],
            title: 'Tube',
            data: { tab: { savedURL: 'https://youtube.com/', savedTitle: 'YouTube' } },
          },
          'S1-P',
          { id: 'S1-P', parentID: null, childrenIds: ['FOLDER'], data: { itemContainer: {} } },
          'FOLDER',
          {
            id: 'FOLDER',
            parentID: 'S1-P',
            childrenIds: ['T1', 'SPLIT'],
            title: 'The Wood',
            data: { list: {} },
          },
          'T1',
          {
            id: 'T1',
            parentID: 'FOLDER',
            childrenIds: [],
            title: null,
            data: { tab: { savedURL: 'https://a.com/', savedTitle: 'A' } },
          },
          'SPLIT',
          { id: 'SPLIT', parentID: 'FOLDER', childrenIds: ['T2'], data: { splitView: {} } },
          'T2',
          {
            id: 'T2',
            parentID: 'SPLIT',
            childrenIds: [],
            title: null,
            data: { tab: { savedURL: 'https://b.com/', savedTitle: 'B' } },
          },
          'S1-U',
          {
            id: 'S1-U',
            parentID: null,
            childrenIds: ['T3', 'MISSING'],
            data: { itemContainer: {} },
          },
          'T3',
          {
            id: 'T3',
            parentID: 'S1-U',
            childrenIds: [],
            title: null,
            data: { tab: { savedURL: 'https://c.com/', savedTitle: '' } },
          },
          'S2-P',
          { id: 'S2-P', parentID: null, childrenIds: [], data: { itemContainer: {} } },
        ],
      },
    ],
  },
};

describe('parseArcSidebar', () => {
  const parsed = parseArcSidebar(fixture);

  it('reads spaces with title, icon, profile and theme', () => {
    expect(parsed.spaces.map((s) => [s.title, s.icon, s.profile])).toEqual([
      ['silence', '☁️', 'default'],
      ['Work', 'planet', 'Profile 1'],
    ]);
    expect(parsed.spaces[0]!.theme).toEqual({
      mode: 'dark',
      colors: ['#331a66'],
      noise: 0.7,
      intensity: 0.8,
    });
    expect(parsed.spaces[1]!.theme).toBeNull();
  });

  it('builds pinned folders, flattening split views, and Today tabs', () => {
    expect(parsed.spaces[0]!.pinned).toEqual([
      {
        kind: 'folder',
        title: 'The Wood',
        children: [
          { kind: 'tab', title: 'A', url: 'https://a.com/' },
          { kind: 'tab', title: 'B', url: 'https://b.com/' },
        ],
      },
    ]);
    // Missing ids are skipped; an empty saved title falls back to the URL.
    expect(parsed.spaces[0]!.today).toEqual([
      { kind: 'tab', title: 'https://c.com/', url: 'https://c.com/' },
    ]);
  });

  it('reads favorites per profile, preferring the user’s own name', () => {
    expect(parsed.favorites['default']).toEqual([
      { kind: 'tab', title: 'Gmail', url: 'https://mail.google.com/' },
      { kind: 'tab', title: 'Tube', url: 'https://youtube.com/' },
    ]);
  });

  it('counts for the preview', () => {
    expect(countArc(parsed)).toEqual({ spaces: 2, favorites: 2, pinned: 2, today: 1 });
  });

  it('rejects files that are not Arc sidebars', () => {
    expect(() => parseArcSidebar({})).toThrow('Arc sidebar');
    expect(() => parseArcSidebar(null)).toThrow();
  });
});

describe('themeOf', () => {
  it('returns null without a background', () => {
    expect(themeOf({})).toBeNull();
    expect(themeOf(undefined)).toBeNull();
  });
});
