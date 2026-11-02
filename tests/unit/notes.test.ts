import { afterEach, describe, expect, it } from 'vitest';
import {
  floatBounds,
  isBlankNote,
  matchesQuery,
  notePreview,
  notesHash,
  noteTitle,
  onScreen,
  UNTITLED_NOTE,
} from '../../src/main/notes/model';
import { openDatabase } from '../../src/main/persistence/db';
import type { Database } from '../../src/main/persistence/db';
import { migrate } from '../../src/main/persistence/migrate';
import { migrations } from '../../src/main/persistence/migrations';
import { NotesRepository } from '../../src/main/persistence/repositories/notes';

describe('notes model', () => {
  it('titles a note by its first line and previews the rest', () => {
    expect(noteTitle('\n  Groceries  \nmilk\neggs')).toBe('Groceries');
    expect(noteTitle('   \n ')).toBe(UNTITLED_NOTE);
    expect(noteTitle('x'.repeat(100))).toHaveLength(80);
    expect(notePreview('Groceries\nmilk\n\neggs')).toBe('milk eggs');
    expect(notePreview('Title only')).toBe('');
    expect(notePreview(`T\n${'word '.repeat(60)}`, 20)).toHaveLength(20);
  });

  it('knows blank notes and matches every word of a query', () => {
    expect(isBlankNote(' \n\t')).toBe(true);
    expect(isBlankNote('a')).toBe(false);
    expect(matchesQuery('Trip to Lisbon\nflights, hotel', 'lisbon HOTEL')).toBe(true);
    expect(matchesQuery('Trip to Lisbon', 'lisbon porto')).toBe(false);
    expect(matchesQuery('anything', '  ')).toBe(true);
  });

  it('places floating notes top-right, stepping each new one', () => {
    const screen = { x: 0, y: 25, width: 1440, height: 875 };
    expect(floatBounds(screen, 0)).toEqual({ x: 1076, y: 49, width: 340, height: 420 });
    expect(floatBounds(screen, 1)).toEqual({ x: 1048, y: 77, width: 340, height: 420 });
    expect(floatBounds({ x: 0, y: 0, width: 300, height: 300 }, 0).width).toBe(252);
  });

  it('reuses saved bounds only while they are on a screen', () => {
    const screens = [{ x: 0, y: 0, width: 1440, height: 900 }];
    expect(onScreen({ x: 100, y: 100, width: 340, height: 420 }, screens)).toBe(true);
    expect(onScreen({ x: 1420, y: 100, width: 340, height: 420 }, screens)).toBe(false);
    expect(onScreen({ x: 3000, y: 100, width: 340, height: 420 }, screens)).toBe(false);
  });
});

describe('notesHash', () => {
  const id = '3f2a1c9e-8b7d-4e6f-9a1b-2c3d4e5f6a7b';
  it('routes the panel and floating notes, and nothing else', () => {
    expect(notesHash('panel')).toBe('/notes/panel');
    expect(notesHash('panel/assistant')).toBe('/notes/panel/assistant');
    expect(notesHash('panel/tools/json')).toBe('/notes/panel/tools/json');
    expect(notesHash('panel/tools/nope')).toBe('/not-found');
    expect(notesHash(`panel/${id}`)).toBe(`/notes/panel/${id}`);
    expect(notesHash(`float/${id}`)).toBe(`/notes/float/${id}`);
    expect(notesHash('float')).toBe('/not-found');
    expect(notesHash('float/../settings')).toBe('/not-found');
    expect(notesHash(`float/${id}/x`)).toBe('/not-found');
    expect(notesHash('')).toBe('/not-found');
    expect(notesHash('panel/projects')).toBe('/notes/panel/projects');
    expect(notesHash(`panel/projects/${id}`)).toBe(`/notes/panel/projects/${id}`);
    expect(notesHash('panel/tasks')).toBe('/notes/panel/tasks');
    expect(notesHash('panel/board')).toBe('/notes/panel/board');
    expect(notesHash('panel/tasks/x')).toBe('/not-found');
    expect(notesHash('panel/projects/../x')).toBe('/not-found');
    expect(notesHash('panel/research')).toBe('/notes/panel/research');
    expect(notesHash('panel/research/unsorted')).toBe('/notes/panel/research/unsorted');
    expect(notesHash(`panel/research/${id}`)).toBe(`/notes/panel/research/${id}`);
    expect(notesHash('panel/research/x')).toBe('/not-found');
  });
});

describe('NotesRepository', () => {
  let db: Database | undefined;
  afterEach(() => {
    if (db?.isOpen) db.close();
  });
  const repo = () => {
    db = openDatabase(':memory:');
    migrate(db, migrations);
    return new NotesRepository(db);
  };

  it('creates, saves, lists newest first, searches and deletes', () => {
    const r = repo();
    const a = r.create(1);
    const b = r.create(2);
    expect(r.list()).toEqual([]); // blank notes aren't listed
    expect(r.save(a, '{"type":"doc"}', 'Groceries\nmilk', 10)).toBe(10);
    expect(r.save(b, '{"type":"doc"}', 'Ideas\nnotes app', 20)).toBe(20);
    expect(r.list().map((n) => n.title)).toEqual(['Ideas', 'Groceries']);
    expect(r.list('MILK')).toEqual([{ id: a, title: 'Groceries', preview: 'milk', updatedAt: 10 }]);
    expect(r.get(a)).toEqual({
      id: a,
      doc: '{"type":"doc"}',
      text: 'Groceries\nmilk',
      updatedAt: 10,
      projectId: null,
    });
    expect(r.title(b)).toBe('Ideas');
    r.delete(a);
    expect(r.get(a)).toBeNull();
    expect(r.save(a, '', '', 30)).toBeNull();
  });

  it('always moves the version on, even within one millisecond', () => {
    const r = repo();
    const id = r.create(5);
    expect(r.save(id, '', 'a', 5)).toBe(6);
    expect(r.save(id, '', 'ab', 5)).toBe(7);
  });

  it('links notes to projects, and unlinks them when the project goes', () => {
    const r = repo();
    const a = r.create(1, 'p1');
    const b = r.create(2);
    r.save(a, '', 'Brief\nfor p1', 3);
    r.save(b, '', 'Loose', 4);
    expect(r.get(a)?.projectId).toBe('p1');
    expect(r.linked()).toEqual([{ id: a, title: 'Brief', projectId: 'p1', updatedAt: 3 }]);
    r.setProject(b, 'p1');
    expect(r.linked().map((n) => n.id)).toEqual([b, a]);
    r.unlinkProject('p1');
    expect(r.linked()).toEqual([]);
    expect(r.get(a)).not.toBeNull(); // the notes themselves stay
  });

  it('removes blank notes, except ones still shown', () => {
    const r = repo();
    const kept = r.create();
    const blank = r.create();
    const written = r.create();
    r.save(written, '', 'hello');
    expect(r.deleteIfBlank(written)).toBe(false);
    expect(r.pruneBlank(new Set([kept]))).toBe(1);
    expect(r.get(blank)).toBeNull();
    expect(r.get(kept)).not.toBeNull();
    expect(r.deleteIfBlank(kept)).toBe(true);
  });
});
