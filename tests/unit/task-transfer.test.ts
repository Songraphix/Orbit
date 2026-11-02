import { describe, expect, it } from 'vitest';
import {
  knownService,
  parseCsv,
  parseTaskImport,
  readDate,
  tasksToCsv,
  tasksToMarkdown,
} from '@shared/task-transfer';
import type { TransferTask } from '@shared/task-transfer';

const tasks: TransferTask[] = [
  {
    title: 'Write brief',
    description: 'Goals, "audience"',
    status: 'done',
    priority: 'high',
    dueDate: '2026-11-05',
  },
  { title: 'Moodboard, refs', description: '', status: 'todo', priority: 'medium', dueDate: null },
];

describe('export', () => {
  it('writes CSV any importer can map', () => {
    expect(tasksToCsv(tasks, 'Brand')).toBe(
      'Title,Description,Status,Priority,Due Date,Project\r\n' +
        'Write brief,"Goals, ""audience""",Done,High,2026-11-05,Brand\r\n' +
        '"Moodboard, refs",,To Do,Medium,,Brand\r\n',
    );
  });

  it('writes a Markdown checklist', () => {
    expect(tasksToMarkdown(tasks, 'Brand')).toBe(
      '# Brand\n\n- [x] Write brief (due 2026-11-05, high)\n  Goals, "audience"\n- [ ] Moodboard, refs\n',
    );
  });
});

describe('import', () => {
  it('round-trips both formats', () => {
    const fromCsv = parseTaskImport(tasksToCsv(tasks, 'Brand'), 'tasks.csv');
    expect(fromCsv).toEqual(tasks);
    const fromMd = parseTaskImport(tasksToMarkdown(tasks, 'Brand'), 'tasks.md');
    expect(fromMd).toEqual(tasks);
  });

  it('finds columns by name in other services’ CSV', () => {
    const asana = 'Task ID,Name,Notes,Due Date,Section/Column\n1,Ship it,Soon,11/30/2026,Done\n';
    expect(parseTaskImport(asana, 'asana.csv')).toEqual([
      {
        title: 'Ship it',
        description: 'Soon',
        status: 'done',
        priority: 'medium',
        dueDate: '2026-11-30',
      },
    ]);
    const todoist = 'TYPE,CONTENT,PRIORITY,DATE\ntask,Call Sam,4,2026-12-01T09:00\n';
    expect(parseTaskImport(todoist, 'todoist.csv')[0]).toMatchObject({
      title: 'Call Sam',
      priority: 'high',
      dueDate: '2026-12-01',
    });
  });

  it('reads plain lists and numbered lists; skips blanks and headings', () => {
    expect(
      parseTaskImport('# Today\n\nBuy milk\n1. Send invoice\n* [x] Pay rent\n').map((t) => [
        t.title,
        t.status,
      ]),
    ).toEqual([
      ['Buy milk', 'todo'],
      ['Send invoice', 'todo'],
      ['Pay rent', 'done'],
    ]);
  });

  it('parses CSV quoting and dates', () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n1,"x\ny",3')).toEqual([
      ['a', 'b, c', 'd "e"'],
      ['1', 'x\ny', '3'],
    ]);
    expect(readDate('2026-01-02T10:00:00Z')).toBe('2026-01-02');
    expect(readDate('1/2/2026')).toBe('2026-01-02');
    expect(readDate('soon')).toBeNull();
  });
});

describe('known services', () => {
  it('recognises the services people link to', () => {
    expect(knownService('https://www.figma.com/file/abc')?.name).toBe('Figma');
    expect(knownService('https://docs.google.com/spreadsheets/d/1')?.name).toBe('Google Sheets');
    expect(knownService('https://docs.google.com/document/d/1')?.name).toBe('Google Docs');
    expect(knownService('https://acme.atlassian.net/wiki/x')?.name).toBe('Confluence');
    expect(knownService('https://acme.atlassian.net/browse/X-1')?.name).toBe('Jira');
    expect(knownService('https://xbox.com/')).toBeNull();
    expect(knownService('https://notfigma.com/')).toBeNull();
    expect(knownService('not a url')).toBeNull();
  });
});
