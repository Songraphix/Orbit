import { afterEach, describe, expect, it } from 'vitest';
import { easelCaptureSchema } from '@shared/types/easels';
import { CaptureRequests } from '../../src/main/easels/capture-requests';
import { openDatabase } from '../../src/main/persistence/db';
import type { Database } from '../../src/main/persistence/db';
import { migrate } from '../../src/main/persistence/migrate';
import { migrations } from '../../src/main/persistence/migrations';
import { EaselRepository } from '../../src/main/persistence/repositories/easels';

describe('EaselRepository', () => {
  let db: Database | undefined;
  afterEach(() => {
    if (db?.isOpen) db.close();
  });
  const repo = () => {
    db = openDatabase(':memory:');
    migrate(db, migrations);
    return new EaselRepository(db);
  };

  it('creates, saves, lists newest first and deletes', () => {
    const r = repo();
    const a = r.create({ title: 'Untitled Easel', spaceId: 's1' }, 1);
    const b = r.create({ title: 'Plans', spaceId: null }, 2);
    expect(a).toMatchObject({ title: 'Untitled Easel', scene: '', preview: null, spaceId: 's1' });
    expect(r.list().map((e) => e.id)).toEqual([b.id, a.id]);

    expect(
      r.update(a.id, { scene: '{"elements":[]}', preview: 'data:image/jpeg;base64,x' }, 5),
    ).toBe(true);
    expect(r.update(a.id, { title: 'Ideas' }, 6)).toBe(true);
    expect(r.get(a.id)).toMatchObject({
      title: 'Ideas',
      scene: '{"elements":[]}',
      preview: 'data:image/jpeg;base64,x',
      updatedAt: 6,
    });
    expect(r.list()[0]).toEqual({
      id: a.id,
      spaceId: 's1',
      title: 'Ideas',
      preview: 'data:image/jpeg;base64,x',
      updatedAt: 6,
    });
    expect(r.update('missing', { title: 'x' })).toBe(false);

    r.delete(a.id);
    expect(r.get(a.id)).toBeNull();
    expect(r.list().map((e) => e.id)).toEqual([b.id]);
  });
});

describe('CaptureRequests', () => {
  const capture = easelCaptureSchema.parse({
    dataUrl: 'data:image/png;base64,x',
    width: 10,
    height: 10,
    sourceUrl: 'https://example.com/',
    sourceTitle: 'Example',
  });

  it('hands a capture to the Easel waiting in that window, once', async () => {
    const requests = new CaptureRequests();
    const win = {};
    expect(requests.settle(win, capture)).toBe(false); // nobody waiting: the clipboard gets it
    const waiting = requests.wait(win);
    expect(requests.settle({}, capture)).toBe(false); // another window
    expect(requests.settle(win, capture)).toBe(true);
    await expect(waiting).resolves.toEqual(capture);
    expect(requests.settle(win, capture)).toBe(false);
  });

  it('a new request cancels the previous one', async () => {
    const requests = new CaptureRequests();
    const win = {};
    const first = requests.wait(win);
    const second = requests.wait(win);
    await expect(first).resolves.toBeNull();
    requests.settle(win, null);
    await expect(second).resolves.toBeNull();
  });
});
