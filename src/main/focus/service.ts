import { blockedSite, focusedMs, focusRemaining, normalizeSite } from '@shared/focus';
import type { FocusPrefs, FocusSession, FocusView } from '@shared/focus';
import type { SoundId } from '@shared/sounds';
import { continueWith } from '@shared/work';
import type { SettingsRepository } from '../persistence/repositories/settings';
import type { WorkRepository } from '../persistence/repositories/work';
import type { WindowController } from '../windows/window-manager';
import type { SoundService } from './sounds';
import type { FocusLogRepository } from '../persistence/repositories/focus-log';

export type FocusDeps = {
  settings: SettingsRepository;
  work: WorkRepository;
  sounds: SoundService;
  /** Every window's shell is told (the toolbar's focus pill). */
  broadcast: (session: FocusSession | null) => void;
  /** Every productivity panel's Focus view is told. */
  pushView: (view: FocusView) => void;
  /** Time's up (a macOS notification; quiet in test runs). */
  notify: (title: string, body: string) => void;
  toast: (controller: WindowController, message: string) => void;
  /** Finished focus sessions (brief M7: today's total, the week). */
  log?: FocusLogRepository;
  /** A soft chime when time's up (the sounds' player). */
  chime?: () => void;
  now?: () => number;
};

export type StartInput = {
  taskId?: string | null;
  minutes?: number;
  kind?: 'focus' | 'break';
  block?: boolean;
  sound?: SoundId | null;
};

/**
 * Focus mode (roadmap P2.3): focus on a task, a project or just time — its workspace comes up,
 * the sidebar steps aside, the toolbar shows the task and a countdown; a sound can play and
 * distracting sites can be blocked until it ends. Then a short break, if you like. Pausing stops
 * the clock. The session survives a restart.
 */
export class FocusService {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: FocusDeps) {}

  get session(): FocusSession | null {
    return this.deps.settings.get('focus.session');
  }

  get prefs(): FocusPrefs {
    return this.deps.settings.get('focus.prefs');
  }

  view(): FocusView {
    return {
      session: this.session,
      prefs: this.prefs,
      sounds: this.deps.sounds.state,
      history: this.deps.log?.summary(this.now) ?? {
        todayMs: 0,
        todaySessions: 0,
        week: [0, 0, 0, 0, 0, 0, 0],
      },
    };
  }

  private get now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  /** A focus session that's finishing goes into the log (a minute or more of focus). */
  private record(session: FocusSession, completed: boolean): void {
    if (session.kind !== 'focus' || !this.deps.log) return;
    const ms = focusedMs(session, this.now);
    if (ms < 60_000) return;
    this.deps.log.add({
      taskId: session.taskId,
      projectId: session.projectId,
      title: session.title,
      startedAt: session.startedAt,
      endedAt: this.now,
      focusedMs: ms,
      completed,
    });
  }

  /** The same session from the start (same task and length; the clock starts over). */
  restart(): void {
    const session = this.session;
    if (!session) return;
    this.deps.settings.set('focus.session', {
      ...session,
      startedAt: this.now,
      pausedAt: null,
      pausedMs: 0,
    });
    this.arm();
    this.changed();
  }

  setPrefs(patch: Partial<FocusPrefs>): FocusView {
    const next: FocusPrefs = { ...this.prefs, ...patch };
    if (patch.blocklist) {
      const sites = patch.blocklist.map(normalizeSite).filter((s): s is string => s !== null);
      next.blocklist = [...new Set(sites)];
    }
    this.deps.settings.set('focus.prefs', next);
    this.changed();
    return this.view();
  }

  start(controller: WindowController, input: StartInput): void {
    const prefs = this.prefs;
    const kind = input.kind ?? 'focus';
    const { projects, tasks } = this.deps.work.all();
    let task = input.taskId ? tasks.find((t) => t.id === input.taskId) : undefined;
    let project = task?.projectId ? projects.find((p) => p.id === task!.projectId) : undefined;
    if (input.taskId === undefined && kind === 'focus') {
      const resume = continueWith(projects, tasks);
      project = resume?.project;
      task = resume?.next ?? undefined;
    }
    const previous = this.session;
    if (previous) this.record(previous, false); // replaced by a new one (or a break)
    const sound = input.sound === undefined ? prefs.sound : input.sound;
    const session: FocusSession = {
      taskId: task?.id ?? null,
      projectId: project?.id ?? null,
      title: kind === 'break' ? 'Break' : (task?.title ?? project?.name ?? 'Focus'),
      startedAt: Date.now(),
      minutes: input.minutes ?? (kind === 'break' ? prefs.breakMinutes : prefs.minutes),
      sidebarWasVisible: previous?.sidebarWasVisible ?? controller.layout.current().sidebar.visible,
      kind,
      pausedAt: null,
      pausedMs: 0,
      // A break never blocks; that's the point of it.
      block: kind === 'focus' && (input.block ?? prefs.block),
      allowed: [],
      sound: kind === 'focus' ? sound : (previous?.sound ?? null),
    };
    this.deps.settings.set('focus.session', session);
    if (kind === 'focus') {
      // Its workspace, the sidebar out of the way, and the task under way.
      if (project?.spaceId && controller.store.space(project.spaceId)) {
        controller.tabs.switchSpace(project.spaceId);
      }
      controller.layout.setSidebarVisible(false);
      if (task && task.status === 'todo') this.deps.work.setTaskStatus(task.id, 'doing');
      if (project) this.deps.work.markOpened(project.id);
      if (session.sound && this.deps.sounds.state.playing !== session.sound) {
        this.deps.sounds.play(session.sound);
      }
    } else if (session.sidebarWasVisible) {
      controller.layout.setSidebarVisible(true); // a break gives you the sidebar back
    }
    controller.notes.refresh();
    this.arm();
    this.changed();
  }

  /** End it; `complete` also ticks the task off. */
  end(controller: WindowController, complete: boolean): void {
    const session = this.session;
    if (!session) return;
    if (complete && session.taskId) this.deps.work.setTaskStatus(session.taskId, 'done');
    this.record(session, complete);
    this.deps.settings.set('focus.session', null);
    if (session.sidebarWasVisible) controller.layout.setSidebarVisible(true);
    // The sound it started stops with it (one you started yourself keeps playing).
    if (session.sound && this.deps.sounds.state.playing === session.sound) this.deps.sounds.stop();
    this.disarm();
    controller.notes.refresh();
    this.changed();
    this.deps.toast(
      controller,
      session.kind === 'break'
        ? 'Break over'
        : complete && session.taskId
          ? 'Done — nice work'
          : 'Focus ended',
    );
  }

  pause(paused: boolean): void {
    const session = this.session;
    if (!session || paused === (session.pausedAt !== null)) return;
    const now = Date.now();
    const next: FocusSession = paused
      ? { ...session, pausedAt: now }
      : { ...session, pausedAt: null, pausedMs: session.pausedMs + (now - session.pausedAt!) };
    this.deps.settings.set('focus.session', next);
    // Its sound pauses and resumes with it.
    if (session.sound && this.deps.sounds.state.playing === session.sound) {
      this.deps.sounds.setPaused(paused);
    }
    this.arm();
    this.changed();
  }

  /** A few more minutes (from now, if time was already up). */
  extend(minutes: number): void {
    const session = this.session;
    if (!session) return;
    const left = focusRemaining(session, Date.now());
    const over = left < 0 ? Math.ceil(-left / 60_000) : 0;
    this.deps.settings.set('focus.session', {
      ...session,
      minutes: Math.min(240, session.minutes + over + minutes),
    });
    this.arm();
    this.changed();
  }

  /**
   * Where a navigation to `url` should go instead, while distracting sites are blocked: Orbit's
   * "blocked" page (which offers to open it anyway). Null: let it through.
   */
  blockedRedirect(url: string): string | null {
    const session = this.session;
    if (!session?.block || session.kind !== 'focus') return null;
    const site = blockedSite(url, this.prefs.blocklist, session.allowed);
    return site ? `orbit://blocked/${encodeURIComponent(url)}` : null;
  }

  /** "Open Anyway": that site is allowed until the session ends. */
  allow(url: string): void {
    const session = this.session;
    const site = session ? blockedSite(url, this.prefs.blocklist, session.allowed) : null;
    if (!session || !site) return;
    this.deps.settings.set('focus.session', { ...session, allowed: [...session.allowed, site] });
    this.changed();
  }

  /** At launch: a session left running keeps its timer. */
  restore(): void {
    this.arm();
  }

  private changed(): void {
    this.deps.broadcast(this.session);
    this.deps.pushView(this.view());
  }

  private arm(): void {
    this.disarm();
    const session = this.session;
    if (!session || session.pausedAt !== null) return;
    const left = focusRemaining(session, Date.now());
    if (left <= 0) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const now = this.session;
      if (!now || now.startedAt !== session.startedAt) return;
      const prefs = this.prefs;
      if (prefs.chime) this.deps.chime?.();
      if (prefs.notify) {
        if (now.kind === 'break') this.deps.notify('Break’s over', 'Ready for the next one?');
        else this.deps.notify('Time for a break', `${now.minutes} minutes on “${now.title}”.`);
      }
      this.changed(); // the Focus view offers a break (or the next session)
    }, left);
  }

  private disarm(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
