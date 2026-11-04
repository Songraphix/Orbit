import { beforeEach, describe, expect, it } from 'vitest';
import type { Fetch } from '../../src/main/cloud/http';
import { cloudDocs, device, newMac, newUser, project, resetEmulator, start } from './helpers';

beforeEach(async () => {
  await resetEmulator();
});

const projectNames = (mac: ReturnType<typeof newMac>) =>
  mac.work
    .all()
    .projects.map((p) => p.name)
    .sort();

describe('two Macs, one account', () => {
  it('a guest Mac’s data goes up at first sign-in; a second Mac gets it; edits and deletes follow', async () => {
    const user = await newUser();
    const a = newMac();
    // Made before signing in (a guest): it joins the account.
    const launchId = a.work.saveProject(project('Launch'));
    a.work.saveTask({
      projectId: launchId,
      title: 'Write the brief',
      description: '',
      priority: 'high',
      status: 'todo',
      dueDate: null,
    });
    const noteId = a.notes.create();
    a.notes.save(noteId, '{"type":"doc"}', 'Ideas for the launch');

    const devA = device(a, user);
    await start(devA);
    expect(devA.engine.current.state).toBe('synced');
    expect(devA.engine.current.pending).toBe(0);
    const docs = await cloudDocs(user);
    expect(docs).toContain(`records/project_${launchId}`);
    expect(docs).toContain(`records/note_${noteId}`);
    expect(docs).toContain('records/space_default-space'); // the Space and profile too

    const b = newMac();
    const devB = device(b, user);
    await start(devB);
    expect(projectNames(b)).toEqual(['Launch']);
    expect(b.work.all().tasks.map((t) => t.title)).toEqual(['Write the brief']);
    expect(b.notes.get(noteId)?.text).toBe('Ideas for the launch');

    // An edit on B reaches A; nothing that didn't change is sent again.
    const before = (await cloudDocs(user)).length;
    b.work.setProjectStatus(launchId, 'done');
    await devB.engine.syncNow();
    await devA.engine.syncNow();
    expect(a.work.project(launchId)?.status).toBe('done');
    expect((await cloudDocs(user)).length).toBe(before);

    // A deletion on A reaches B and doesn't come back.
    a.notes.delete(noteId);
    await devA.engine.syncNow();
    await devB.engine.syncNow();
    expect(b.notes.get(noteId)).toBeNull();
    await devA.engine.syncNow();
    expect(a.notes.get(noteId)).toBeNull();
  });

  it('pinned tabs and favourites sync; Today tabs stay on this Mac', async () => {
    const user = await newUser();
    const a = newMac();
    const insert = (id: string, section: string, url: string) =>
      a.db
        .prepare(
          `INSERT INTO sidebar_items (id, profile_id, space_id, section, kind, sort_key, title, url, home_url, created_at)
           VALUES (?, 'default', 'default-space', ?, 'tab', ?, 'Live title', ?, ?, 1)`,
        )
        .run(id, section, `a${id}`, url, section === 'today' ? null : url);
    insert('pin1', 'pinned', 'https://mail.example.com/');
    insert('fav1', 'favorite', 'https://figma.com/');
    insert('today1', 'today', 'https://news.example.com/');
    await start(device(a, user));

    const b = newMac();
    await start(device(b, user));
    const items = b.db
      .prepare('SELECT id, section, url, home_url, title FROM sidebar_items ORDER BY id')
      .all();
    expect(items).toEqual([
      {
        id: 'fav1',
        section: 'favorite',
        url: 'https://figma.com/',
        home_url: 'https://figma.com/',
        title: '',
      },
      {
        id: 'pin1',
        section: 'pinned',
        url: 'https://mail.example.com/',
        home_url: 'https://mail.example.com/',
        title: '',
      },
    ]);
    // Browsing inside a pinned tab changes nothing that syncs.
    const devA = device(a, user);
    a.db
      .prepare(
        "UPDATE sidebar_items SET url = 'https://mail.example.com/inbox/42', title = 'Inbox (3)' WHERE id = 'pin1'",
      )
      .run();
    const docs = (await cloudDocs(user)).length;
    await devA.engine.syncNow();
    expect((await cloudDocs(user)).length).toBe(docs);
  });

  it('offline changes wait on disk, then go when the network is back (no duplicates)', async () => {
    const user = await newUser();
    const a = newMac();
    let online = false;
    const flaky: Fetch = (url, init) =>
      online ? fetch(url, init) : Promise.reject(new TypeError('fetch failed'));
    const dev = device(a, user, { fetchImpl: flaky });
    await start(dev);
    expect(dev.engine.current.state).toBe('offline');
    const id = a.work.saveProject(project('Offline idea'));
    await dev.engine.syncNow();
    expect(dev.engine.current.state).toBe('offline');
    expect(dev.engine.current.pending).toBeGreaterThan(0);

    online = true;
    await dev.engine.syncNow();
    expect(dev.engine.current.state).toBe('synced');
    expect(dev.engine.current.pending).toBe(0);
    const docs = await cloudDocs(user);
    expect(docs.filter((d) => d === `records/project_${id}`)).toHaveLength(1);
  });

  it('a write whose answer was lost is retried safely (same document, no copy)', async () => {
    const user = await newUser();
    const a = newMac();
    let drop = false;
    // The commit reaches the cloud, but its answer never comes back.
    const lossy: Fetch = async (url, init) => {
      const response = await fetch(url, init);
      if (drop && url.includes(':commit')) {
        drop = false;
        throw new TypeError('connection reset');
      }
      return response;
    };
    const dev = device(a, user, { fetchImpl: lossy });
    await start(dev);
    drop = true;
    const id = a.work.saveProject(project('Sent twice'));
    await dev.engine.syncNow(); // lost answer
    await dev.engine.syncNow(); // retry: the cloud already has it
    expect(dev.engine.current.state).toBe('synced');
    expect(projectNames(a)).toEqual(['Sent twice']);
    expect((await cloudDocs(user)).filter((d) => d.includes(id))).toHaveLength(1);
  });
});

describe('conflicts', () => {
  it('a project edited on two Macs merges field by field', async () => {
    const user = await newUser();
    const a = newMac();
    const id = a.work.saveProject(project('Plan'));
    const devA = device(a, user);
    await start(devA);
    const b = newMac();
    const devB = device(b, user);
    await start(devB);

    // A renames it; B (not yet seeing that) marks it done.
    a.db
      .prepare("UPDATE projects SET name = 'Plan v2', updated_at = updated_at + 1 WHERE id = ?")
      .run(id);
    await devA.engine.syncNow();
    b.db
      .prepare("UPDATE projects SET status = 'done', updated_at = updated_at + 2 WHERE id = ?")
      .run(id);
    await devB.engine.syncNow();
    await devA.engine.syncNow();
    for (const mac of [a, b]) {
      const p = mac.work.project(id)!;
      expect([p.name, p.status]).toEqual(['Plan v2', 'done']);
    }
  });

  it('a note edited on two Macs keeps both versions — nothing is lost', async () => {
    const user = await newUser();
    const a = newMac();
    const id = a.notes.create();
    a.notes.save(id, '{"v":0}', 'first');
    const devA = device(a, user);
    await start(devA);
    const b = newMac();
    const devB = device(b, user);
    await start(devB);

    a.notes.save(id, '{"v":"a"}', 'written on A');
    await devA.engine.syncNow();
    b.notes.save(id, '{"v":"b"}', 'written on B');
    await devB.engine.syncNow();
    expect(devB.engine.current.conflicts).toBe(1);
    await devA.engine.syncNow();

    const texts = (mac: ReturnType<typeof newMac>) =>
      (mac.db.prepare('SELECT text FROM notes ORDER BY text').all() as { text: string }[]).map(
        (n) => n.text,
      );
    expect(texts(b)).toEqual(['written on A', 'written on B']);
    expect(texts(a)).toEqual(['written on A', 'written on B']);
  });
});

describe('big records', () => {
  it('an Easel with pictures spills into pieces and arrives whole', async () => {
    const user = await newUser();
    const a = newMac();
    const easel = a.easels.create({ title: 'Moodboard', spaceId: null });
    const scene = JSON.stringify({
      elements: [],
      files: { img: 'data:image/png;base64,' + 'A'.repeat(700_000) },
    });
    a.easels.update(easel.id, { scene });
    await start(device(a, user));
    const docs = await cloudDocs(user);
    expect(docs).toEqual(
      expect.arrayContaining([`parts/easel_${easel.id}~1`, `parts/easel_${easel.id}~2`]),
    );

    const b = newMac();
    await start(device(b, user));
    expect(b.easels.get(easel.id)?.scene).toBe(scene);

    // Smaller again: the spare pieces go.
    a.easels.update(easel.id, { scene: '{"elements":[]}' });
    const devA = device(a, user);
    await devA.engine.syncNow();
    expect((await cloudDocs(user)).filter((d) => d.startsWith('parts/'))).toEqual([]);
  });
});
