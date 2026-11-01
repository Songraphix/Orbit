import { FOCUS_MINUTES, focusRemaining } from '@shared/focus';
import type { FocusSession } from '@shared/focus';
import { continueWith } from '@shared/work';
import type { SettingsRepository } from '../persistence/repositories/settings';
import type { WorkRepository } from '../persistence/repositories/work';
import type { WindowController } from '../windows/window-manager';

export type FocusDeps = {
  settings: SettingsRepository;
  work: WorkRepository;
  /** Every window's shell is told (the toolbar's focus pill). */
  broadcast: (session: FocusSession | null) => void;
  /** Time's up (a macOS notification; quiet in test runs). */
  notify: (title: string, body: string) => void;
  toast: (controller: WindowController, message: string) => void;
};

/**
 * Focus mode (roadmap P2.3, minimal): focus on a task — its project's workspace comes up, the
 * sidebar steps aside, the toolbar shows the task and a countdown; when time's up, a
 * notification. Done completes the task. The session survives a restart.
 */
export class FocusService {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: FocusDeps) {}

  get session(): FocusSession | null {
    return this.deps.settings.get('focus.session');
  }

  /** `taskId`: that task; none: the next task of the project you were last on (or just focus). */
  start(controller: WindowController, input: { taskId?: string; minutes?: number }): void {
    const { projects, tasks } = this.deps.work.all();
    let task = input.taskId ? tasks.find((t) => t.id === input.taskId) : undefined;
    let project = task?.projectId ? projects.find((p) => p.id === task!.projectId) : undefined;
    if (!input.taskId) {
      const resume = continueWith(projects, tasks);
      project = resume?.project;
      task = resume?.next ?? undefined;
    }
    const session: FocusSession = {
      taskId: task?.id ?? null,
      projectId: project?.id ?? null,
      title: task?.title ?? project?.name ?? 'Focus',
      startedAt: Date.now(),
      minutes: input.minutes ?? FOCUS_MINUTES,
      sidebarWasVisible:
        this.session?.sidebarWasVisible ?? controller.layout.current().sidebar.visible,
    };
    this.deps.settings.set('focus.session', session);
    // Its workspace, the sidebar out of the way, and the task under way.
    if (project?.spaceId && controller.store.space(project.spaceId)) {
      controller.tabs.switchSpace(project.spaceId);
    }
    controller.layout.setSidebarVisible(false);
    if (task && task.status === 'todo') this.deps.work.setTaskStatus(task.id, 'doing');
    if (project) this.deps.work.markOpened(project.id);
    controller.notes.refresh();
    this.arm();
    this.deps.broadcast(session);
  }

  /** End it; `complete` also ticks the task off. */
  end(controller: WindowController, complete: boolean): void {
    const session = this.session;
    if (!session) return;
    if (complete && session.taskId) this.deps.work.setTaskStatus(session.taskId, 'done');
    this.deps.settings.set('focus.session', null);
    if (session.sidebarWasVisible) controller.layout.setSidebarVisible(true);
    this.disarm();
    controller.notes.refresh();
    this.deps.broadcast(null);
    this.deps.toast(controller, complete && session.taskId ? 'Done — nice work' : 'Focus ended');
  }

  /** At launch: a session left running keeps its timer. */
  restore(): void {
    this.arm();
  }

  private arm(): void {
    this.disarm();
    const session = this.session;
    if (!session) return;
    const left = focusRemaining(session, Date.now());
    if (left <= 0) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const now = this.session;
      if (!now || now.startedAt !== session.startedAt) return;
      this.deps.notify('Time for a break', `${now.minutes} minutes on “${now.title}”.`);
    }, left);
  }

  private disarm(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
