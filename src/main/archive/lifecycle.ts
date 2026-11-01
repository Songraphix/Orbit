import { powerMonitor } from 'electron';
import type { SettingsRepository } from '../persistence/repositories/settings';
import type { TabManager } from '../tabs/tab-manager';
import { tabsToArchive, tabsToSleep } from './policy';

const ARCHIVE_EVERY_MS = 5 * 60_000;
const SLEEP_EVERY_MS = 60_000;

/**
 * Keeps Orbit tidy and light over a long day (F-20, F-25): archives idle Today tabs every five
 * minutes (and on wake from sleep) and puts idle pages to sleep every minute.
 */
export class TabLifecycle {
  private timers: ReturnType<typeof setInterval>[] = [];

  constructor(
    private readonly windows: () => TabManager[],
    private readonly settings: SettingsRepository,
  ) {}

  start(): void {
    this.timers.push(setInterval(() => this.archiveIdle(), ARCHIVE_EVERY_MS));
    this.timers.push(setInterval(() => this.sleepIdle(), SLEEP_EVERY_MS));
    powerMonitor.on('resume', this.onResume);
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    powerMonitor.off('resume', this.onResume);
  }

  /** Runs both passes now (also used by the Debug menu). */
  runNow(now = Date.now()): { archived: number; slept: number } {
    return { archived: this.archiveIdle(now), slept: this.sleepIdle(now) };
  }

  archiveIdle(now = Date.now()): number {
    const after = this.settings.get('archive.after');
    let count = 0;
    for (const tabs of this.windows()) {
      for (const id of tabsToArchive(tabs.facts(), now, after)) {
        tabs.close(id, 'auto');
        count++;
      }
    }
    return count;
  }

  sleepIdle(now = Date.now()): number {
    const minutes = this.settings.get('tabs.sleepAfterMinutes');
    const policy = {
      maxLive: this.settings.get('tabs.maxLive'),
      idleMs: minutes === 0 ? Number.POSITIVE_INFINITY : minutes * 60_000,
    };
    let count = 0;
    for (const tabs of this.windows()) {
      for (const id of tabsToSleep(tabs.facts(), now, policy)) {
        tabs.unload(id);
        count++;
      }
    }
    return count;
  }

  private readonly onResume = () => this.archiveIdle();
}
