import { afterEach, describe, expect, it } from 'vitest';
import { captureLabel, captureMatches, hostOf, taskFromCapture } from '@shared/capture';
import { openDatabase } from '../../src/main/persistence/db';
import type { Database } from '../../src/main/persistence/db';
import { migrate } from '../../src/main/persistence/migrate';
import { migrations } from '../../src/main/persistence/migrations';
import { CaptureRepository } from '../../src/main/persistence/repositories/captures';

const base = {
  kind: 'text' as const,
  comment: '',
  text: 'Grids give rhythm.\nUse an 8 pt baseline.',
  title: 'Layout Basics',
  url: 'https://www.example.com/layout',
  language: '',
};

describe('capture model', () => {
  it('reads hosts', () => {
    expect(hostOf('https://www.figma.com/file/x')).toBe('figma.com');
    expect(hostOf('not a url')).toBe('');
  });

  it('labels a finding by comment, then quote, then page', () => {
    expect(captureLabel({ ...base, comment: 'Use for the hero' })).toBe('Use for the hero');
    expect(captureLabel(base)).toBe('Grids give rhythm.');
    expect(captureLabel({ ...base, kind: 'link', text: '' })).toBe('Layout Basics');
    expect(captureLabel({ ...base, kind: 'image', text: '', title: '' })).toBe('example.com');
  });

  it('turns a finding into a task with the quote and the source', () => {
    expect(taskFromCapture(base)).toEqual({
      title: 'Grids give rhythm.',
      description:
        '“Grids give rhythm.\nUse an 8 pt baseline.”\n\nSource: Layout Basics — https://www.example.com/layout',
    });
    expect(taskFromCapture({ ...base, comment: 'Try the 8 pt grid' }).title).toBe(
      'Try the 8 pt grid',
    );
    expect(taskFromCapture({ ...base, kind: 'link', text: '' })).toEqual({
      title: 'Follow up: Layout Basics',
      description: 'Source: Layout Basics — https://www.example.com/layout',
    });
    const code = taskFromCapture({ ...base, kind: 'code', text: 'const x = 1;', language: 'ts' });
    expect(code.title).toBe('Follow up: Layout Basics');
    expect(code.description.startsWith('const x = 1;')).toBe(true);
  });

  it('matches every word of a query anywhere in it', () => {
    expect(captureMatches('baseline layout', base)).toBe(true);
    expect(captureMatches('example.com', base)).toBe(true);
    expect(captureMatches('baseline colour', base)).toBe(false);
    expect(captureMatches('  ', base)).toBe(false);
  });
});

describe('CaptureRepository', () => {
  let db: Database | undefined;
  afterEach(() => {
    if (db?.isOpen) db.close();
  });
  const repo = () => {
    db = openDatabase(':memory:');
    migrate(db, migrations);
    return new CaptureRepository(db);
  };
  const add = (
    r: CaptureRepository,
    over: Partial<Parameters<CaptureRepository['add']>[0]>,
    at: number,
  ) => r.add({ ...base, projectId: 'p1', image: null, thumb: null, ...over }, at);

  it('saves, lists newest first, and keeps images out of lists', () => {
    const r = repo();
    const a = add(r, {}, 1);
    const b = add(
      r,
      {
        kind: 'image',
        text: '',
        image: 'data:image/jpeg;base64,FULL',
        thumb: 'data:image/jpeg;base64,T',
      },
      2,
    );
    expect(r.list().map((c) => c.id)).toEqual([b, a]);
    expect(r.get(b)).toMatchObject({
      kind: 'image',
      hasImage: true,
      projectId: 'p1',
      taskId: null,
    });
    expect(r.get(a)?.hasImage).toBe(false);
    expect(r.image(b, 'thumb')).toBe('data:image/jpeg;base64,T');
    expect(r.image(b, 'full')).toBe('data:image/jpeg;base64,FULL');
    expect(r.image(a, 'full')).toBeNull();
  });

  it('moves between projects, links tasks, and lets go when they are deleted', () => {
    const r = repo();
    const a = add(r, {}, 1);
    r.setProject(a, 'p2');
    r.linkTask(a, 't1');
    expect(r.get(a)).toMatchObject({ projectId: 'p2', taskId: 't1' });
    r.unlinkTask('t1');
    r.unlinkProject('p2');
    expect(r.get(a)).toMatchObject({ projectId: null, taskId: null });
    r.delete(a);
    expect(r.get(a)).toBeNull();
  });

  it('trims what it is given', () => {
    const r = repo();
    const id = add(r, { comment: `  ${'x'.repeat(600)}  `, text: 'y'.repeat(30_000) }, 1);
    expect(r.get(id)?.comment).toHaveLength(500);
    expect(r.get(id)?.text).toHaveLength(20_000);
  });
});
