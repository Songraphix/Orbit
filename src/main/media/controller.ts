import type { MediaState } from '@shared/types/media';
import type { TabManager } from '../tabs/tab-manager';

/** Runs in the page's own world (with a user gesture) to control its media element. */
const SCRIPTS = {
  toggle: `(() => {
    const all = [...document.querySelectorAll('video, audio')];
    const m = all.find((x) => !x.paused) ?? all[0];
    if (!m) return false;
    if (m.paused) m.play(); else m.pause();
    return true;
  })()`,
  pause: `document.querySelectorAll('video, audio').forEach((m) => m.pause())`,
  pip: `(() => {
    const v = [...document.querySelectorAll('video')].find((x) => !x.paused) ?? document.querySelector('video');
    if (!v) return false;
    if (document.pictureInPictureElement) { document.exitPictureInPicture(); return true; }
    v.requestPictureInPicture();
    return true;
  })()`,
  info: `(() => ({
    title: navigator.mediaSession?.metadata?.title || '',
    artist: navigator.mediaSession?.metadata?.artist || '',
    hasVideo: !!document.querySelector('video'),
  }))()`,
} as const;

export type MediaAction = 'toggle' | 'mute' | 'pip' | 'focus' | 'close';

/**
 * The mini player for one window (F-09). Follows the most recent tab that played media; the
 * sidebar shows it only while that tab isn't the one on screen.
 */
export class MediaController {
  private tabId: string | null = null;
  private playing = false;
  private hasVideo = false;
  private sessionTitle = '';

  constructor(
    private readonly tabs: TabManager,
    private readonly onChange: (state: MediaState) => void,
  ) {}

  /** Media events from a tab's page. */
  onMedia(tabId: string, event: 'playing' | 'paused'): void {
    if (event === 'playing') {
      this.tabId = tabId;
      this.playing = true;
      void this.readInfo(tabId);
    } else if (tabId === this.tabId) {
      this.playing = false;
    }
    this.emit();
  }

  /** The active tab changed, or the media tab closed. */
  refresh(): void {
    if (this.tabId && !this.tabs.get(this.tabId)) {
      this.tabId = null;
      this.playing = false;
    }
    this.emit();
  }

  current(): MediaState {
    const tab = this.tabId ? this.tabs.get(this.tabId) : undefined;
    if (!tab || this.tabs.isOnScreen(tab.id)) return null;
    const contents = tab.view.webContents;
    return {
      tabId: tab.id,
      title: this.sessionTitle || tab.state.title,
      favicon: tab.state.favicon,
      playing: this.playing,
      muted: !contents.isDestroyed() && contents.isAudioMuted(),
      hasVideo: this.hasVideo,
    };
  }

  async control(action: MediaAction): Promise<void> {
    const tab = this.tabId ? this.tabs.get(this.tabId) : undefined;
    if (!tab) return;
    const contents = tab.view.webContents;
    switch (action) {
      case 'toggle':
        await contents.executeJavaScript(SCRIPTS.toggle, true).catch(() => undefined);
        return;
      case 'mute':
        contents.setAudioMuted(!contents.isAudioMuted());
        this.emit();
        return;
      case 'pip':
        // The second argument marks it as a user gesture, which Picture-in-Picture requires.
        await contents.executeJavaScript(SCRIPTS.pip, true).catch(() => undefined);
        return;
      case 'focus':
        this.tabs.activate(tab.id);
        this.emit();
        return;
      case 'close':
        await contents.executeJavaScript(SCRIPTS.pause, true).catch(() => undefined);
        this.tabId = null;
        this.playing = false;
        this.emit();
        return;
    }
  }

  private async readInfo(tabId: string): Promise<void> {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    try {
      const info = (await tab.view.webContents.executeJavaScript(SCRIPTS.info)) as {
        title: string;
        artist: string;
        hasVideo: boolean;
      };
      if (this.tabId !== tabId) return;
      this.sessionTitle = info.artist ? `${info.title} — ${info.artist}` : info.title;
      this.hasVideo = info.hasVideo;
      this.emit();
    } catch {
      // Pages that refuse scripts just show the tab title.
    }
  }

  private emit(): void {
    this.onChange(this.current());
  }
}
