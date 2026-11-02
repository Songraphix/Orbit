import { afterEach, describe, expect, it, vi } from 'vitest';
import { blockedSite, focusClock, focusRemaining, normalizeSite } from '@shared/focus';
import type { SoundState } from '@shared/sounds';
import { volumeToGain } from '@shared/sounds';
import { FocusService } from '../../src/main/focus/service';
import { SoundService } from '../../src/main/focus/sounds';
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

/** A SoundService whose player page is a recorder. */
function soundsFor(settings: SettingsRepository) {
  const host = { sent: [] as SoundState[], opened: 0, closed: 0 };
  const sounds = new SoundService({
    settings,
    openHost: (ready) => {
      host.opened++;
      queueMicrotask(ready);
      return { send: (s) => host.sent.push(s), close: () => host.closed++ };
    },
    changed: () => undefined,
  });
  return { sounds, host };
}

describe('focus helpers', () => {
  it('a pause stops the clock', () => {
    const session = { startedAt: 0, minutes: 25, pausedAt: 60_000, pausedMs: 0 };
    expect(focusRemaining(session, 600_000)).toBe(24 * 60_000);
    expect(focusRemaining({ ...session, pausedAt: null, pausedMs: 540_000 }, 600_000)).toBe(
      24 * 60_000,
    );
  });

  it('reads sites the way people type them', () => {
    expect(normalizeSite('YouTube.com')).toBe('youtube.com');
    expect(normalizeSite('https://www.reddit.com/r/x')).toBe('reddit.com');
    expect(normalizeSite('news.ycombinator.com')).toBe('news.ycombinator.com');
    expect(normalizeSite('not a site')).toBeNull();
    expect(normalizeSite('localhost')).toBeNull();
  });

  it('blocks a site and its subdomains, never lookalikes, unless allowed', () => {
    const list = ['youtube.com', 'x.com'];
    expect(blockedSite('https://www.youtube.com/watch?v=1', list)).toBe('youtube.com');
    expect(blockedSite('https://m.youtube.com/', list)).toBe('youtube.com');
    expect(blockedSite('https://notyoutube.com/', list)).toBeNull();
    expect(blockedSite('https://box.com/', list)).toBeNull(); // not x.com
    expect(blockedSite('orbit://newtab', list)).toBeNull();
    expect(blockedSite('https://youtube.com/', list, ['youtube.com'])).toBeNull();
  });

  it('turns the volume slider into an even-sounding gain', () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(0.5)).toBeCloseTo(0.25);
    expect(volumeToGain(2)).toBe(1);
  });
});

describe('SoundService', () => {
  let db: Database | undefined;
  afterEach(() => {
    if (db?.isOpen) db.close();
    vi.useRealTimers();
  });

  it('opens its player only while something plays, and fades out before closing it', async () => {
    vi.useFakeTimers();
    db = openDatabase(':memory:');
    migrate(db, migrations);
    const settings = new SettingsRepository(db);
    const { sounds, host } = soundsFor(settings);
    expect(sounds.state).toEqual({ playing: null, paused: false, volume: 0.5 });
    sounds.play('rain');
    await Promise.resolve();
    expect(host.opened).toBe(1);
    expect(host.sent.at(-1)).toEqual({ playing: 'rain', paused: false, volume: 0.5 });
    sounds.toggle('ocean'); // another sound: same player
    sounds.setVolume(0.8);
    expect(host.opened).toBe(1);
    expect(host.sent.at(-1)).toEqual({ playing: 'ocean', paused: false, volume: 0.8 });
    sounds.setPaused(true); // keeps its place
    expect(host.sent.at(-1)).toEqual({ playing: 'ocean', paused: true, volume: 0.8 });
    sounds.setPaused(false);
    expect(sounds.state.paused).toBe(false);
    expect(settings.get('sounds.volume')).toBe(0.8);

    sounds.toggle('ocean'); // the one playing: stop
    expect(host.sent.at(-1)?.playing).toBeNull();
    expect(host.closed).toBe(0); // still fading out
    vi.advanceTimersByTime(3_000);
    expect(host.closed).toBe(1);
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
    const sounds = soundsFor(settings).sounds;
    const focus = new FocusService({
      settings,
      work,
      sounds,
      pushView: () => undefined,
      broadcast: (s) => broadcasts.push(s),
      notify: (title) => notes.push(title),
      toast: (_c, m) => calls.push(`toast:${m}`),
    });
    return {
      settings,
      work,
      focus,
      sounds,
      controller,
      calls,
      broadcasts,
      notes,
      sidebar: () => sidebar,
    };
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
      sounds: soundsFor(settings).sounds,
      pushView: () => undefined,
      broadcast: () => undefined,
      notify: (t) => notes.push(t),
      toast: () => undefined,
    });
    settings.set('focus.session', { ...focus.session!, startedAt: Date.now(), minutes: 1 });
    again.restore();
    vi.advanceTimersByTime(61_000);
    expect(notes).toHaveLength(2);
  });

  it('plays the chosen sound with a session and stops it after; blocks sites until it ends', () => {
    const { focus, sounds, controller } = setup();
    focus.setPrefs({ sound: 'brown', block: true, blocklist: ['www.YouTube.com', 'nonsense'] });
    expect(focus.prefs.blocklist).toEqual(['youtube.com']);
    focus.start(controller, { taskId: null });
    expect(focus.session).toMatchObject({ title: 'Focus', block: true, sound: 'brown' });
    expect(sounds.state.playing).toBe('brown');
    expect(focus.blockedRedirect('https://m.youtube.com/x')).toBe(
      `orbit://blocked/${encodeURIComponent('https://m.youtube.com/x')}`,
    );
    expect(focus.blockedRedirect('https://docs.example.com/')).toBeNull();
    focus.allow('https://youtube.com/watch'); // "Open Anyway"
    expect(focus.blockedRedirect('https://youtube.com/x')).toBeNull();

    focus.pause(true); // its sound pauses with it
    expect(sounds.state.paused).toBe(true);
    focus.pause(false);
    expect(sounds.state.paused).toBe(false);
    focus.end(controller, false);
    expect(sounds.state.playing).toBeNull();
    expect(focus.blockedRedirect('https://youtube.com/x')).toBeNull();
  });

  it('pauses, keeps going and takes a break (which never blocks)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { focus, controller, notes } = setup();
    focus.start(controller, { taskId: null, minutes: 10, block: true });
    vi.advanceTimersByTime(60_000);
    focus.pause(true);
    vi.advanceTimersByTime(30 * 60_000); // paused: no "time's up"
    expect(notes).toEqual([]);
    focus.pause(false);
    expect(focusRemaining(focus.session!, Date.now())).toBe(9 * 60_000);
    vi.advanceTimersByTime(9 * 60_000 + 1);
    expect(notes).toEqual(['Time for a break']);
    focus.extend(5);
    expect(focusRemaining(focus.session!, Date.now())).toBeGreaterThan(4 * 60_000);

    focus.start(controller, { kind: 'break' });
    expect(focus.session).toMatchObject({
      kind: 'break',
      title: 'Break',
      minutes: 5,
      block: false,
    });
    expect(focus.blockedRedirect('https://youtube.com/')).toBeNull();
    vi.advanceTimersByTime(5 * 60_000 + 1);
    expect(notes.at(-1)).toBe('Break’s over');
  });
});
