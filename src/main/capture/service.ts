import { randomUUID } from 'node:crypto';
import { nativeImage } from 'electron';
import type { NativeImage, WebContents } from 'electron';
import { CAPTURE_LIMITS, taskFromCapture } from '@shared/capture';
import type { CaptureDraft, CaptureKind } from '@shared/capture';
import type { CaptureRequests } from '../easels/capture-requests';
import type { CaptureRepository } from '../persistence/repositories/captures';
import type { SettingsRepository } from '../persistence/repositories/settings';
import type { WorkRepository } from '../persistence/repositories/work';
import type { PageCaptureRequest } from '../tabs/context-menu';
import type { TabController } from '../tabs/tab-controller';
import type { WindowController } from '../windows/window-manager';

/** Orbit Capture reads the page's selection in a world of its own: the page can't see or
 *  change the script, and the script only reads. */
const CAPTURE_WORLD = 1002;
const READ_SELECTION = `(() => {
  const s = window.getSelection();
  const text = s ? String(s) : '';
  let code = false;
  let language = '';
  if (s && s.rangeCount > 0 && text.trim()) {
    let node = s.getRangeAt(0).commonAncestorContainer;
    if (node && node.nodeType !== 1) node = node.parentElement;
    const block = node && node.closest ? node.closest('pre, code') : null;
    if (block) {
      code = true;
      const inner = block.matches('pre') ? block.querySelector('code') || block : block;
      const names = String(inner.className) + ' ' + String(block.className);
      const match = /(?:^|\\s)(?:language|lang)-([\\w+#-]+)/.exec(names);
      language = match ? match[1] : '';
    }
  }
  return { text: text.slice(0, ${CAPTURE_LIMITS.text}), code, language };
})()`;

type Selection = { text: string; code: boolean; language: string };

type Draft = {
  id: string;
  tabId: string;
  /** The page, or the link that was right-clicked. */
  link: { title: string; url: string };
  /** The page itself (screenshots and selections are "from" it). */
  page: { title: string; url: string };
  kind: CaptureKind;
  selection: Selection | null;
  image: string | null;
  preview: string | null;
};

/** A JPEG data: URL no wider than `maxWidth`. */
function jpeg(image: NativeImage, maxWidth: number, quality: number): string {
  const { width } = image.getSize();
  const scaled = width > maxWidth ? image.resize({ width: maxWidth, quality: 'good' }) : image;
  return `data:image/jpeg;base64,${scaled.toJPEG(quality).toString('base64')}`;
}

async function readSelection(
  contents: WebContents,
  request: PageCaptureRequest | null,
): Promise<Selection | null> {
  let read: Partial<Selection> | null = null;
  try {
    const result: unknown = await contents.executeJavaScriptInIsolatedWorld(CAPTURE_WORLD, [
      { code: READ_SELECTION },
    ]);
    if (result && typeof result === 'object') read = result as Partial<Selection>;
  } catch {
    // A page that's still loading (or gone): use what the menu gave, if anything.
  }
  const fromPage = typeof read?.text === 'string' ? read.text : '';
  const fromMenu = request?.kind === 'selection' ? request.text : '';
  const text = (fromPage.trim() ? fromPage : fromMenu).slice(0, CAPTURE_LIMITS.text);
  if (!text.trim()) return null;
  return {
    text,
    code: read?.code === true,
    language: typeof read?.language === 'string' ? read.language.slice(0, 40) : '',
  };
}

/** A right-clicked image, fetched with the page's own session (its cookies), as a JPEG. */
async function fetchImage(contents: WebContents, src: string): Promise<NativeImage | null> {
  try {
    if (!/^https?:/i.test(src)) return null;
    const response = await contents.session.fetch(src, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 15 * 1024 * 1024) return null;
    const image = nativeImage.createFromBuffer(bytes);
    return image.isEmpty() ? null : image;
  } catch {
    return null;
  }
}

export type CaptureServiceDeps = {
  captures: CaptureRepository;
  work: WorkRepository;
  settings: SettingsRepository;
  /** The window's area screenshot (shared with Easels and Site Controls). */
  requests: CaptureRequests;
  toast: (controller: WindowController, message: string) => void;
  /** Saved: the productivity panel shows it straight away. */
  changed: (controller: WindowController) => void;
};

/**
 * Orbit Capture (roadmap P2.1): ⇧⌘S, the page's right-click menu or the command bar open a card
 * that saves the page, the selection (a code snippet if it's code), a right-clicked link or
 * image, or an area screenshot to a project's research — optionally as a task too.
 */
export class CaptureService {
  private readonly drafts = new WeakMap<WindowController, Draft>();

  constructor(private readonly deps: CaptureServiceDeps) {}

  async begin(
    controller: WindowController,
    tab: TabController | null | undefined,
    request: PageCaptureRequest | null,
  ): Promise<void> {
    if (!tab || tab.state.kind !== 'web') {
      this.deps.toast(controller, 'Open a web page to save from it');
      return;
    }
    const contents = tab.view.webContents;
    const page = { title: tab.state.title, url: tab.state.url };
    const selection =
      request && request.kind !== 'selection' ? null : await readSelection(contents, request);
    const draft: Draft = {
      id: randomUUID(),
      tabId: tab.id,
      link: page,
      page,
      kind: 'link',
      selection,
      image: null,
      preview: null,
    };
    if (request?.kind === 'link') {
      draft.link = { title: request.text.trim() || request.url, url: request.url };
    } else if (request?.kind === 'image') {
      const image = await fetchImage(contents, request.src);
      if (image) {
        draft.kind = 'image';
        draft.image = jpeg(image, 1600, 85);
        draft.preview = jpeg(image, 480, 72);
      } else {
        draft.link = { title: page.title, url: request.src };
      }
    } else if (selection) {
      draft.kind = selection.code ? 'code' : 'text';
    }
    this.drafts.set(controller, draft);
    controller.overlay.openCaptureCard();
  }

  /** What the card shows: the finding, the projects, and where it goes unless changed. */
  view(controller: WindowController): CaptureDraft | null {
    const draft = this.drafts.get(controller);
    if (!draft) return null;
    this.deps.work.seedSamples(); // first use ever: the same sample projects the panel shows
    const { projects } = this.deps.work.all();
    const order = { active: 0, 'on-hold': 1, done: 2 } as const;
    const sorted = [...projects].sort(
      (a, b) =>
        order[a.status] - order[b.status] ||
        (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) ||
        a.name.localeCompare(b.name),
    );
    const last = this.deps.settings.get('capture.lastProject');
    const projectId =
      projects.find((p) => p.spaceId === controller.tabs.space.id && p.status !== 'done')?.id ??
      (last && projects.some((p) => p.id === last) ? last : null);
    const source = draft.kind === 'link' ? draft.link : draft.page;
    const text =
      draft.kind === 'text' || draft.kind === 'code' ? (draft.selection?.text ?? '') : '';
    return {
      id: draft.id,
      kind: draft.kind,
      title: source.title,
      url: source.url,
      text,
      language: draft.kind === 'code' ? (draft.selection?.language ?? '') : '',
      preview: draft.kind === 'image' ? draft.preview : null,
      hasSelection: draft.selection !== null,
      projects: sorted.map(({ id, name, color }) => ({ id, name, color })),
      projectId,
    };
  }

  /** The card's chips: the link (page), or the selection. */
  setKind(controller: WindowController, kind: 'link' | 'text'): void {
    const draft = this.drafts.get(controller);
    if (!draft) return;
    if (kind === 'text' && draft.selection) draft.kind = draft.selection.code ? 'code' : 'text';
    else if (kind === 'link') draft.kind = 'link';
  }

  /** Drag an area over the page (or click for all of it); the card comes back with it. */
  async screenshot(controller: WindowController): Promise<void> {
    const draft = this.drafts.get(controller);
    const tab = draft ? controller.tabs.get(draft.tabId) : undefined;
    if (!draft || !tab) return;
    if (controller.tabs.active?.id !== tab.id) controller.tabs.activate(tab.id);
    controller.overlay.closeCaptureCard();
    const result = this.deps.requests.wait(controller);
    controller.overlay.startCapture(tab.view.getBounds());
    const shot = await result;
    if (this.drafts.get(controller) !== draft) return; // something else started meanwhile
    if (shot) {
      const image = nativeImage.createFromDataURL(shot.dataUrl);
      if (!image.isEmpty()) {
        draft.kind = 'image';
        draft.image = jpeg(image, 1600, 85);
        draft.preview = jpeg(image, 480, 72);
      }
    }
    controller.overlay.openCaptureCard();
  }

  save(
    controller: WindowController,
    input: { projectId: string | null; comment: string; makeTask: boolean },
  ): void {
    const draft = this.drafts.get(controller);
    if (!draft) return;
    const project = input.projectId ? this.deps.work.project(input.projectId) : null;
    const projectId = project?.id ?? null;
    const view = this.view(controller)!;
    const id = this.deps.captures.add({
      projectId,
      kind: draft.kind,
      title: view.title,
      url: view.url,
      text: view.text,
      language: view.language,
      image: draft.kind === 'image' ? draft.image : null,
      thumb: draft.kind === 'image' ? draft.preview : null,
      comment: input.comment,
    });
    this.deps.settings.set('capture.lastProject', projectId);
    if (input.makeTask) {
      const { title, description } = taskFromCapture({ ...view, comment: input.comment });
      const taskId = this.deps.work.saveTask({
        projectId,
        title,
        description,
        priority: 'medium',
        status: 'todo',
        dueDate: null,
      });
      this.deps.captures.linkTask(id, taskId);
    }
    this.drafts.delete(controller);
    controller.overlay.closeCaptureCard();
    const where = project?.name ?? 'Unsorted';
    this.deps.toast(controller, `Saved to ${where}${input.makeTask ? ' · task added' : ''}`);
    this.deps.changed(controller);
  }

  close(controller: WindowController): void {
    this.drafts.delete(controller);
    controller.overlay.closeCaptureCard();
  }
}
