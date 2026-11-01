import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** A small, made-up Arc data folder (sidebar + History). */
export function createFakeArcFolder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'orbit-arc-'));
  writeFileSync(
    join(dir, 'StorableSidebar.json'),
    JSON.stringify({
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
                containerIDs: ['unpinned', 'U1', 'pinned', 'P1'],
                customInfo: { iconType: { icon: 'cloudOutline' } },
              },
              'S2',
              {
                id: 'S2',
                title: 'Work',
                profile: { custom: { _0: { directoryBasename: 'Profile 1' } } },
                containerIDs: ['unpinned', 'U2', 'pinned', 'P2'],
                customInfo: { iconType: { emoji_v2: '💼' } },
              },
            ],
            items: [
              'TOP',
              { id: 'TOP', childrenIds: ['F1', 'F2'], data: { itemContainer: {} } },
              'F1',
              {
                id: 'F1',
                title: null,
                childrenIds: [],
                data: { tab: { savedURL: 'https://mail.google.com/', savedTitle: 'Gmail' } },
              },
              'F2',
              {
                id: 'F2',
                title: null,
                childrenIds: [],
                data: { tab: { savedURL: 'https://youtube.com/', savedTitle: 'YouTube' } },
              },
              'P1',
              { id: 'P1', childrenIds: ['W'], data: { itemContainer: {} } },
              'W',
              { id: 'W', title: 'The Wood', childrenIds: ['T1'], data: { list: {} } },
              'T1',
              {
                id: 'T1',
                title: null,
                childrenIds: [],
                data: { tab: { savedURL: 'https://a.com/', savedTitle: 'A' } },
              },
              'U1',
              { id: 'U1', childrenIds: ['T2'], data: { itemContainer: {} } },
              'T2',
              {
                id: 'T2',
                title: null,
                childrenIds: [],
                data: { tab: { savedURL: 'https://b.com/', savedTitle: 'B' } },
              },
              'P2',
              { id: 'P2', childrenIds: ['T3'], data: { itemContainer: {} } },
              'T3',
              {
                id: 'T3',
                title: null,
                childrenIds: [],
                data: { tab: { savedURL: 'https://c.com/', savedTitle: 'C' } },
              },
              'U2',
              { id: 'U2', childrenIds: [], data: { itemContainer: {} } },
            ],
          },
        ],
      },
    }),
  );
  mkdirSync(join(dir, 'User Data', 'Default'), { recursive: true });
  const hist = new DatabaseSync(join(dir, 'User Data', 'Default', 'History'));
  hist.exec(
    'CREATE TABLE urls (id INTEGER PRIMARY KEY, url TEXT, title TEXT, visit_count INTEGER, last_visit_time INTEGER, hidden INTEGER DEFAULT 0)',
  );
  hist
    .prepare('INSERT INTO urls (url, title, visit_count, last_visit_time) VALUES (?, ?, ?, ?)')
    .run('https://github.com/', 'GitHub', 5, 13_400_000_000_000_000n);
  hist.close();
  return dir;
}
