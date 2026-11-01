import { afterEach, describe, expect, it, vi } from 'vitest';
import { focusClock, focusRemaining } from '@shared/focus';
import { FocusService } from '../../src/main/focus/service';
import { openDatabase } from '../../src/main/persistence/db';
import type { Database } from '../../src/main/persistence/db';
import { migrate } from '../../src/main/persistence/migrate';
import { migrations } from '../../src/main/persistence/migrations';
import { SettingsRepository } from '../../src/main/persistence/repositories/settings';
import { WorkRepository } from '../../src/main/persistence/repositories/work';
import type { WindowController } from '../../src/main/windows/window-manager';

describe('focus clock', () => {
  it('counts down, then over', () => {
    expect(focusRemaining({ startedAt: 0, minutes: 25 }, 60_000)).toBe(24 * 60_000);
    expect(focusClock(24 * 60_000 + 5_000)).toBe('24:05');
    expect(focusClock(0)).toBe('0:00');
    expect(focusClock(-130_000)).toBe('+2:10');
  });
});

describe('FocusService', () => {
  let db: Database | undefined;
  afterEach(() => {
    if (db?.isOpen) db.close();
    vi.useRealTimers();
  });

  const setup = () => {
    db = openDatabase(':memory:');
    migrate(db, migrations);
    const settings = new SettingsRepository(db);
    const work = new WorkRepository(db);
    const calls: string[] = [];
    let sidebar = true;
    const controller = {
      layout: {
        current: () => ({ sidebar: { visible: sidebar } }),
        setSidebarVisible: (v: boolean) => {
          sidebar = v;
          calls.push(`sidebar:${v}`);
        },
      },
      store: { space: (id: string) => (id === 'space-1' ? { id } : undefined) },
      tabs: { switchSpace: (id: string) => calls.push(`space:${id}`) },
      notes: { refresh: () => undefined },
    } as unknown as WindowController;
    const broadcasts: unknown[] = [];
    const notes: string[] = [];
    const focus = new FocusService({
      settings,
      work,
      broadcast: (s) => broadcasts.push(s),
      notify: (title) => notes.push(title),
      toast: (_c, m) => calls.push(`toast:${m}`),
    });
    return { settings, work, focus, controller, calls, broadcasts, notes, sidebar: () => sidebar };
  };
  const base = { description: '', color: 'blue' as const, startDate: null, dueDate: null };

  it('focuses on a task: its workspace, the sidebar away, the task under way; Done ticks it off', () => {
    const { work, focus, controller, calls, broadcasts, sidebar } = setup();
    const project = work.saveProject({
      ...base,
      name: 'Site',
      status: 'active',
      spaceId: 'space-1',
    });
    const task = work.saveTask({
      projectId: project,
      title: 'Hero',
      description: '',
      priority: 'high',
      status: 'todo',
      dueDate: null,
    });
    focus.start(controller, { taskId: task });
    expect(focus.session).toMatchObject({
      taskId: task,
      projectId: project,
      title: 'Hero',
      minutes: 25,
    });
    expect(calls).toEqual(['space:space-1', 'sidebar:false']);
    expect(sidebar()).toBe(false);
    expect(work.task(task)?.status).toBe('doing');
    expect(broadcasts).toHaveLength(1);

    focus.end(controller, true);
    expect(work.task(task)?.status).toBe('done');
    expect(focus.session).toBeNull();
    expect(sidebar()).toBe(true); // back as it was
    expect(calls.at(-1)).toBe('toast:Done — nice work');
    expect(broadcasts.at(-1)).toBeNull();
  });

  it('with no task given: the next task of the project you were on, else plain focus', () => {
    const { work, focus, controller } = setup();
    focus.start(controller, {});
    expect(focus.session).toMatchObject({ taskId: null, projectId: null, title: 'Focus' });
    focus.end(controller, false);

    const project = work.saveProject({ ...base, name: 'Brand', status: 'active', spaceId: null });
    const later = {
      projectId: project,
      description: '',
      priority: 'low' as const,
      status: 'todo' as const,
    };
    work.saveTask({ ...later, title: 'Later', dueDate: '2030-01-09' });
    const soon = work.saveTask({ ...later, title: 'Soon', dueDate: '2030-01-02' });
    work.markOpened(project);
    focus.start(controller, {});
    expect(focus.session).toMatchObject({ taskId: soon, projectId: project, title: 'Soon' });
  });

  it('says when time is up, once, even after a restart', () => {
    vi.useFakeTimers();
    const { settings, work, focus, controller, notes } = setup();
    focus.start(controller, { minutes: 1 });
    vi.advanceTimersByTime(59_000);
    expect(notes).toEqual([]);
    vi.advanceTimersByTime(2_000);
    expect(notes).toEqual(['Time for a break']);

    // A restarted app keeps a running session's timer.
    const again = new FocusService({
      settings,
      work,
      broadcast: () => undefined,
      notify: (t) => notes.push(t),
      toast: () => undefined,
    });
    settings.set('focus.session', { ...focus.session!, startedAt: Date.now(), minutes: 1 });
    again.restore();
    vi.advanceTimersByTime(61_000);
    expect(notes).toHaveLength(2);
  });
});
