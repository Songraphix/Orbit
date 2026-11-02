import { afterEach, describe, expect, it } from 'vitest';
import { quoteFor, QUOTES } from '@shared/quotes';
import {
  seedShortcuts,
  shortcutTitle,
  startOfDay,
  visibleTodos,
} from '../../src/main/newtab/home-model';
import { openDatabase } from '../../src/main/persistence/db';
import type { Database } from '../../src/main/persistence/db';
import { migrate } from '../../src/main/persistence/migrate';
import { migrations } from '../../src/main/persistence/migrations';
import { HomeRepository } from '../../src/main/persistence/repositories/home';

const noon = new Date(2026, 10, 1, 12, 0).getTime();

describe('home model', () => {
  it('shows to-dos still open and ones done today, oldest first', () => {
    const yesterday = noon - 86_400_000;
    const todos = [
      { id: 'b', doneAt: null, createdAt: 2 },
      { id: 'a', doneAt: null, createdAt: 1 },
      { id: 'old', doneAt: yesterday, createdAt: 0 },
      { id: 'today', doneAt: startOfDay(noon) + 1, createdAt: 3 },
    ];
    expect(visibleTodos(todos, noon).map((t) => t.id)).toEqual(['a', 'b', 'today']);
  });

  it('names a shortcut from its title, else its host', () => {
    expect(shortcutTitle('Inbox (3) - me@example.com - Gmail', 'https://mail.google.com/')).toBe(
      'Gmail',
    );
    expect(shortcutTitle('YouTube', 'https://www.youtube.com/')).toBe('YouTube');
    expect(shortcutTitle('Cats - YouTube', 'https://www.youtube.com/')).toBe('YouTube');
    expect(shortcutTitle('', 'https://www.notion.so/x')).toBe('Notion');
    expect(
      shortcutTitle('A very long page title that says a great deal', 'https://figma.com/'),
    ).toBe('Figma');
  });

  it('seeds one shortcut per site from history, skipping local addresses', () => {
    const seeded = seedShortcuts([
      { url: 'https://www.youtube.com/watch?v=1', title: 'Cats - YouTube', favicon: 'data:a' },
      { url: 'https://www.youtube.com/', title: 'YouTube', favicon: 'data:a' },
      { url: 'http://localhost:3000/', title: 'Dev', favicon: null },
      { url: 'http://127.0.0.1/', title: 'IP', favicon: null },
      { url: 'https://figma.com/files', title: 'Figma', favicon: null },
      { url: 'file:///x', title: 'File', favicon: null },
    ]);
    expect(seeded).toEqual([
      { title: 'YouTube', url: 'https://www.youtube.com/', icon: 'data:a' },
      { title: 'Figma', url: 'https://figma.com/', icon: null },
    ]);
  });

  it('has a quote a day, the same all day, cycling', () => {
    const morning = new Date(2026, 10, 1, 8);
    const night = new Date(2026, 10, 1, 23);
    expect(quoteFor(morning)).toEqual(quoteFor(night));
    expect(quoteFor(morning, 1)).not.toEqual(quoteFor(morning));
    expect(quoteFor(morning, QUOTES.length)).toEqual(quoteFor(morning));
  });
});

describe('HomeRepository', () => {
  let db: Database | undefined;
  afterEach(() => {
    if (db?.isOpen) db.close();
  });
  const repo = () => {
    db = openDatabase(':memory:');
    migrate(db, migrations);
    return new HomeRepository(db);
  };

  it('keeps shortcuts per profile, in order, up to ten', () => {
    const r = repo();
    for (let i = 0; i < 10; i++)
      expect(r.addShortcut('p1', { title: `S${i}`, url: `https://s${i}.com/`, icon: null })).toBe(
        true,
      );
    expect(r.addShortcut('p1', { title: 'S10', url: 'https://s10.com/', icon: null })).toBe(false);
    expect(
      r
        .shortcuts('p1')
        .map((s) => s.title)
        .slice(0, 3),
    ).toEqual(['S0', 'S1', 'S2']);
    expect(r.shortcuts('p2')).toEqual([]);
    r.removeShortcut('p1', r.shortcuts('p1')[0]!.id);
    expect(r.shortcuts('p1')).toHaveLength(9);
  });

  it('seeds a profile only once', () => {
    const r = repo();
    expect(r.claimSeed('p1')).toBe(true);
    expect(r.claimSeed('p1')).toBe(false);
    expect(r.claimSeed('p2')).toBe(true);
  });

  it('adds, ticks, unticks and removes to-dos', () => {
    const r = repo();
    r.addTodo('p1', 'Write', noon);
    r.addTodo('p1', 'Edit', noon + 1);
    const [write] = r.todos('p1', noon);
    r.toggleTodo('p1', write!.id, noon + 2);
    expect(r.todos('p1', noon + 3)).toEqual([
      { id: write!.id, text: 'Write', done: true, note: '', overdue: false },
      { id: expect.any(String), text: 'Edit', done: false, note: '', overdue: false },
    ]);
    // Done today shows today; tomorrow it's gone, a week on it's deleted.
    expect(r.todos('p1', noon + 86_400_000)).toHaveLength(1);
    r.toggleTodo('p1', write!.id);
    expect(r.todos('p1').every((t) => !t.done)).toBe(true);
    r.removeTodo('p1', write!.id);
    expect(r.todos('p1')).toHaveLength(1);
  });
});
