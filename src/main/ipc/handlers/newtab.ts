import { NEW_TAB_URL } from '@shared/types/tabs';
import type { NewTabState } from '@shared/types/newtab';
import type { IpcRouter } from '../router';
import { classifyInput } from '../../omnibox/classify';
import type { WallpaperService } from '../../newtab/wallpaper-service';
import { seedShortcuts, shortcutTitle } from '../../newtab/home-model';
import { fetchSiteIcon } from '../../newtab/site-icon';
import type { HistoryRepository } from '../../persistence/repositories/history';
import type { HomeRepository } from '../../persistence/repositories/home';
import type { SettingsRepository } from '../../persistence/repositories/settings';
import type { WindowController, WindowManager } from '../../windows/window-manager';
import type { WorkRepository } from '../../persistence/repositories/work';
import { dateKey, todayTasks } from '@shared/work';
import type { TaskInput } from '@shared/work';
import type { Todo } from '@shared/types/home';
import { layoutFromShow } from '@shared/home-widgets';
import { colorHex, projectProgress } from '@shared/work';
import type { NotesRepository } from '../../persistence/repositories/notes';
import type { WeatherService } from '../../newtab/weather';

const NEW_TASK: Omit<TaskInput, 'title' | 'dueDate'> = {
  projectId: null,
  description: '',
  priority: 'medium',
  status: 'todo',
};
import type { TabController } from '../../tabs/tab-controller';

/** Handlers for orbit://newtab. The router only lets internal pages call these. */
export function registerNewTabHandlers(
  router: IpcRouter,
  windows: WindowManager,
  wallpapers: WallpaperService,
  deps: {
    home: HomeRepository;
    settings: SettingsRepository;
    history: HistoryRepository;
    work: WorkRepository;
    workChanged: () => void;
    notes: NotesRepository;
    weather: WeatherService;
    /** Opens a note as a tab, or a project in the panel, in this window. */
    openNote: (window: WindowController, id: string) => void;
  },
): void {
  const { home, settings, history, work } = deps;

  /**
   * The Today list is your real tasks (in step with Tasks → Today). Items written in the new tab
   * page's old list of its own become tasks due today, once.
   */
  const todos = (profileId: string): Todo[] => {
    const today = dateKey(new Date());
    const old = home.todos(profileId);
    for (const t of old) {
      if (!t.done) {
        work.saveTask({ ...NEW_TASK, title: t.text.slice(0, 200), dueDate: today });
      }
      home.removeTodo(profileId, t.id);
    }
    if (old.length > 0) deps.workChanged();
    const { projects, tasks } = work.all();
    return todayTasks(tasks, today).map((t) => ({
      id: t.id,
      text: t.title,
      done: t.status === 'done',
      note:
        t.status !== 'done' && t.dueDate !== null && t.dueDate < today
          ? 'Overdue'
          : (projects.find((p) => p.id === t.projectId)?.name ?? ''),
      overdue: t.status !== 'done' && t.dueDate !== null && t.dueDate < today,
    }));
  };

  const ownerOf = (webContentsId: number) => {
    const owner = windows.tabForContents(webContentsId);
    // Belt and braces: the page must be a tab currently showing the new tab page.
    if (!owner || owner.tab.state.url !== NEW_TAB_URL) {
      throw new Error(`Sender ${webContentsId} is not a new tab page`);
    }
    return owner;
  };

  /** The profile of the space this new tab page is in. */
  const profileOf = ({ window, tab }: { window: WindowController; tab: TabController }) =>
    window.store.item(tab.id)?.profileId ?? window.tabs.space.profileId;

  const state = (owner: { window: WindowController; tab: TabController }): NewTabState => {
    const profileId = profileOf(owner);
    // A profile's first visit fills its shortcuts with its most-visited sites.
    if (home.shortcuts(profileId).length === 0 && home.claimSeed(profileId)) {
      for (const s of seedShortcuts(history.topSites(30))) home.addShortcut(profileId, s);
    }
    return {
      ...wallpapers.state(),
      home: settings.get('newtab.home'),
      name: owner.window.store.profiles.find((p) => p.id === profileId)?.displayName ?? '',
      shortcuts: home.shortcuts(profileId),
      todos: todos(profileId),
      layout: settings.get('home.layout') ?? layoutFromShow(settings.get('newtab.home').show),
    };
  };

  router.handle('newtab:get', (_input, { sender }) => state(ownerOf(sender.webContentsId)));

  router.handle('newtab:setWallpaper', ({ wallpaper }, { sender }) => {
    const owner = ownerOf(sender.webContentsId);
    wallpapers.set(wallpaper);
    return state(owner);
  });

  router.handle('newtab:chooseImage', async (_input, { sender }) => {
    const owner = ownerOf(sender.webContentsId);
    const chosen = await wallpapers.choose(owner.window.win);
    return chosen ? state(owner) : null;
  });

  router.handle('newtab:setHome', (patch, { sender }) => {
    const owner = ownerOf(sender.webContentsId);
    const current = settings.get('newtab.home');
    settings.set('newtab.home', {
      theme: patch.theme ?? current.theme,
      tagline: patch.tagline !== undefined ? patch.tagline.trim() : current.tagline,
      show: { ...current.show, ...patch.show },
    });
    return state(owner);
  });

  router.handle('newtab:setName', ({ name }, { sender }) => {
    const owner = ownerOf(sender.webContentsId);
    owner.window.store.updateProfile(profileOf(owner), { displayName: name });
    return state(owner);
  });

  router.handle('newtab:shortcut', async (input, { sender }) => {
    const owner = ownerOf(sender.webContentsId);
    const profileId = profileOf(owner);
    if (input.action === 'remove') {
      home.removeShortcut(profileId, input.id);
      return state(owner);
    }
    const target = classifyInput(input.url.trim());
    if (!target || target.kind !== 'url' || !/^https?:/.test(target.url)) {
      throw new Error('Enter a web address, like figma.com');
    }
    const icon = history.faviconFor(target.url) ?? (await fetchSiteIcon(target.url));
    const title = input.title.trim() || shortcutTitle('', target.url);
    if (!home.addShortcut(profileId, { title, url: target.url, icon })) {
      throw new Error('The shortcuts row is full — remove one first');
    }
    return state(owner);
  });

  router.handle('newtab:todo', (input, { sender }) => {
    const owner = ownerOf(sender.webContentsId);
    if (input.action === 'add') {
      work.saveTask({ ...NEW_TASK, title: input.text.trim(), dueDate: dateKey(new Date()) });
    } else {
      const task = work.task(input.id);
      if (!task) throw new Error('That task no longer exists');
      if (input.action === 'toggle') {
        work.setTaskStatus(task.id, task.status === 'done' ? 'todo' : 'done');
      } else {
        // "Remove from Today": the task stays, without its date.
        const { id, projectId, title, description, priority, status } = task;
        work.saveTask({ id, projectId, title, description, priority, status, dueDate: null });
      }
    }
    deps.workChanged();
    return state(owner);
  });

  router.handle('newtab:setLayout', ({ layout }, { sender }) => {
    const owner = ownerOf(sender.webContentsId);
    settings.set('home.layout', layout);
    return state(owner);
  });

  router.handle('newtab:widgetData', (_input, { sender }) => {
    ownerOf(sender.webContentsId);
    work.seedSamples(); // the first time ever, into an empty list only (as the panel does)
    const { projects, tasks } = work.all();
    return {
      projects: projects
        .filter((p) => p.status === 'active')
        .slice(0, 6)
        .map((p) => {
          const progress = projectProgress(p.id, tasks);
          return {
            id: p.id,
            name: p.name,
            color: colorHex(p.color),
            done: progress.done,
            total: progress.total,
            dueDate: p.dueDate,
          };
        }),
      notes: deps.notes
        .list()
        .slice(0, 6)
        .map(({ id, title, updatedAt }) => ({ id, title, updatedAt })),
      recent: history
        .recent(30)
        .filter((h) => /^https?:/i.test(h.url))
        .slice(0, 8)
        .map(({ url, title, favicon }) => ({ url, title: title || url, favicon })),
    };
  });

  router.handle('newtab:findPlace', ({ query }, { sender }) => {
    ownerOf(sender.webContentsId);
    return deps.weather.findPlaces(query);
  });

  router.handle('newtab:weather', ({ place, units }, { sender }) => {
    ownerOf(sender.webContentsId);
    return deps.weather.weather(place, units);
  });

  router.handle('newtab:open', ({ kind, id }, { sender }) => {
    const { window } = ownerOf(sender.webContentsId);
    if (kind === 'note') deps.openNote(window, id);
    else window.notes.openAt(`panel/projects/${id}`);
  });

  router.handle('newtab:navigate', ({ input }, { sender }) => {
    const { tab } = ownerOf(sender.webContentsId);
    const target = classifyInput(input);
    // Load in this same tab; TabController swaps in a fresh, unprivileged web view.
    if (target) tab.load(target.url);
  });
}
