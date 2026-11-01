import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AiKeyStore, cleanApiKey } from '../../src/main/ai/key-store';
import type { AIService } from '../../src/main/ai/service';
import { TidyService } from '../../src/main/ai/tidy';
import { tidyGroups, tidyRequest } from '../../src/main/ai/tidy-model';
import type { TidyTab } from '../../src/main/ai/tidy-model';
import { openDatabase } from '../../src/main/persistence/db';
import type { Database } from '../../src/main/persistence/db';
import { migrate } from '../../src/main/persistence/migrate';
import { migrations } from '../../src/main/persistence/migrations';
import { SidebarRepository } from '../../src/main/persistence/repositories/sidebar';
import { SidebarStore } from '../../src/main/sidebar/store';

describe('Tidy request and answer', () => {
  it('sends titles and sites only, under short keys', () => {
    const { prompt, keys } = tidyRequest([
      {
        id: 'uuid-1',
        title: '  Kyoto   hotels ',
        url: 'https://www.booking.com/search?city=kyoto&token=secret',
      },
      { id: 'uuid-2', title: '', url: 'not a url' },
    ]);
    expect(prompt).toBe('Tabs:\nt1 | Kyoto hotels | booking.com\nt2 | Untitled | ');
    expect(prompt).not.toContain('secret');
    expect([...keys]).toEqual([
      ['t1', 'uuid-1'],
      ['t2', 'uuid-2'],
    ]);
  });

  it('cleans the answer: unknown keys, repeats, tiny groups, duplicate names, at most six', () => {
    const keys = new Map(Array.from({ length: 20 }, (_, i) => [`t${i + 1}`, `id${i + 1}`]));
    const groups = tidyGroups(
      {
        groups: [
          { name: '  Kyoto   Trip ', tabs: ['t1', 't2', 't99', 't1'] },
          { name: 'Solo', tabs: ['t3'] },
          { name: 'Kyoto Trip', tabs: ['t2', 't4', 't5'] }, // t2 already used
          ...Array.from({ length: 6 }, (_, i) => ({
            name: `G${i}`,
            tabs: [`t${6 + 2 * i}`, `t${7 + 2 * i}`],
          })),
        ],
      },
      keys,
    );
    expect(groups[0]).toEqual({ name: 'Kyoto Trip', tabIds: ['id1', 'id2'] });
    expect(groups[1]).toEqual({ name: 'Kyoto Trip 2', tabIds: ['id4', 'id5'] });
    expect(groups).toHaveLength(6);
    expect(groups.flatMap((g) => g.tabIds)).not.toContain('id3');
  });
});

describe('API key store', () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const rot13 = {
    isEncryptionAvailable: () => true,
    encryptString: (t: string) => Buffer.from([...t].reverse().join('')),
    decryptString: (b: Buffer) => [...b.toString()].reverse().join(''),
  };

  it('keeps the key encrypted on disk and can forget it', () => {
    dir = mkdtempSync(join(tmpdir(), 'orbit-key-'));
    const path = join(dir, 'key.bin');
    const store = new AiKeyStore(path, rot13);
    expect(store.has()).toBe(false);
    store.set('sk-ant-abc');
    expect(readFileSync(path, 'utf8')).toBe('cba-tna-ks'); // never plain text on disk
    expect(new AiKeyStore(path, rot13).get()).toBe('sk-ant-abc');
    store.clear();
    expect(store.has()).toBe(false);
  });

  it('refuses to store without encryption, and checks the key looks right', () => {
    dir = mkdtempSync(join(tmpdir(), 'orbit-key-'));
    const store = new AiKeyStore(join(dir, 'k'), { ...rot13, isEncryptionAvailable: () => false });
    expect(() => store.set('sk-ant-x')).toThrow('Secure storage');
    expect(cleanApiKey('  sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123 ')).toBe(
      'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123',
    );
    expect(cleanApiKey('sk-proj-123')).toBeNull();
    expect(cleanApiKey('sk-ant-short')).toBeNull();
  });
});

describe('TidyService', () => {
  let db: Database;
  afterEach(() => db?.close());

  function setup(answer: (tabs: readonly TidyTab[]) => { name: string; tabIds: string[] }[]) {
    db = openDatabase(':memory:');
    migrate(db, migrations);
    const store = new SidebarStore(new SidebarRepository(db));
    const space = store.spaces[0]!;
    const today = {
      section: 'today' as const,
      profileId: space.profileId,
      spaceId: space.id,
      parentId: null,
    };
    const ids = ['A1', 'B1', 'A2', 'C', 'B2'].map(
      (title) =>
        store.insert(
          { kind: 'tab', title, url: `https://${title}.com/` },
          { ...today, beforeId: null },
        ).id,
    );
    const ai = {
      available: true,
      tidy: async (tabs: readonly TidyTab[]) => answer(tabs),
    } as unknown as AIService;
    const tidy = new TidyService({ store, ai, onChange: () => undefined });
    const top = () =>
      store.rows('today', space).map((r) => `${'  '.repeat(r.depth)}${r.item.title}`);
    return { store, space, ids, tidy, top };
  }

  it('makes folders in the order given, then Undo restores the exact order', async () => {
    const { tidy, space, top } = setup((tabs) => {
      const by = (p: string) => tabs.filter((t) => t.title.startsWith(p)).map((t) => t.id);
      return [
        { name: 'Alpha', tabIds: by('A') },
        { name: 'Beta', tabIds: by('B') },
      ];
    });
    const before = top();
    expect(await tidy.tidy(space)).toBe(2);
    expect(top()).toEqual(['Alpha', '  A1', '  A2', 'Beta', '  B1', '  B2', 'C']);
    expect(tidy.state(space.id)).toEqual({ available: true, running: false, canUndo: true });

    tidy.untidy(space);
    expect(top()).toEqual(before);
    expect(tidy.state(space.id).canUndo).toBe(false);
  });

  it('marks its folders, and leaves out tabs closed while Claude was answering', async () => {
    const env = setup((tabs) => {
      env.store.remove(env.ids[0]!); // closed while Claude was answering
      return [{ name: 'All', tabIds: tabs.map((t) => t.id) }];
    });
    await env.tidy.tidy(env.space);
    const folder = env.store.all().find((i) => i.kind === 'folder')!;
    expect(folder.data).toEqual({ tidy: true });
    expect(env.store.all().filter((i) => i.parentId === folder.id)).toHaveLength(4);
  });

  it('needs a few tabs', async () => {
    const { tidy, space, store, ids } = setup(() => []);
    for (const id of ids.slice(0, 3)) store.remove(id);
    await expect(tidy.tidy(space)).rejects.toThrow('a few more tabs');
  });
});
