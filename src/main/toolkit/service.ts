import { clipboard, nativeImage } from 'electron';
import type { WebContents } from 'electron';
import { hostOf } from '@shared/capture';
import type { EaselCapture } from '@shared/types/easels';
import type {
  ImageReport,
  LocalServer,
  Swatch,
  ToolkitSection,
  ToolkitState,
  Viewport,
} from '@shared/toolkit/state';
import type { SettingsRepository } from '../persistence/repositories/settings';
import type { CaptureRequests } from '../easels/capture-requests';
import type { WindowController } from '../windows/window-manager';
import { formatBytes, imageFacts } from './image-info';
import { scanLocalServers } from './local-servers';
import { aspect } from './model';

/** The page's colors are read in a world of their own (the page can't see the script). */
const PALETTE_WORLD = 1004;
const READ_PALETTE = `(() => {
  const counts = new Map();
  const add = (value, role) => {
    const m = /^rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?\\)$/.exec(value || '');
    if (!m || (m[4] !== undefined && Number(m[4]) < 0.15)) return;
    const hex = '#' + [m[1], m[2], m[3]]
      .map((n) => Math.round(Number(n)).toString(16).padStart(2, '0')).join('');
    const entry = counts.get(hex) || { hex, count: 0, text: false, background: false };
    entry.count++;
    entry[role] = true;
    counts.set(hex, entry);
  };
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  add(getComputedStyle(document.documentElement).backgroundColor, 'background');
  if (document.body) add(getComputedStyle(document.body).backgroundColor, 'background');
  const all = document.querySelectorAll('body *');
  for (let i = 0; i < all.length && i < 5000; i++) {
    const el = all[i];
    if (el.checkVisibility && !el.checkVisibility()) continue;
    const style = getComputedStyle(el);
    if (ownText(el)) add(style.color, 'text');
    add(style.backgroundColor, 'background');
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 18);
})()`;

/** The fonts a page uses: the first family of each text element, with sizes and weights. */
const READ_FONTS = `(() => {
  const families = new Map();
  const all = document.querySelectorAll('body *');
  for (let i = 0; i < all.length && i < 5000; i++) {
    const el = all[i];
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    if (el.checkVisibility && !el.checkVisibility()) continue;
    const style = getComputedStyle(el);
    const family = (style.fontFamily.split(',')[0] || '').trim().replace(/^["']|["']$/g, '');
    if (!family) continue;
    const entry = families.get(family) || { family, count: 0, sizes: new Set(), weights: new Set() };
    entry.count++;
    entry.sizes.add(Math.round(parseFloat(style.fontSize) * 10) / 10);
    entry.weights.add(Number(style.fontWeight) || 400);
    families.set(family, entry);
  }
  return [...families.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((f) => ({
      family: f.family.slice(0, 80),
      count: f.count,
      sizes: [...f.sizes].sort((a, b) => b - a).slice(0, 12),
      weights: [...f.weights].sort((a, b) => a - b).slice(0, 9),
    }));
})()`;

const IMAGE_LIMIT = 25 * 1024 * 1024;

export type ToolkitDeps = {
  settings: SettingsRepository;
  push: (controller: WindowController, state: ToolkitState) => void;
  toast: (controller: WindowController, message: string) => void;
  /** Area captures (shared with Easels): Annotate Screenshot waits on one. */
  captures: CaptureRequests;
  /** Starts a new Easel with this image on it, in a tab. */
  annotate: (controller: WindowController, capture: EaselCapture) => void;
  /** Development and tests: which ports count as local servers. */
  ports?: readonly number[];
};

/**
 * The Toolkit (roadmap P3.5, P3.6): small, local tools for designers and developers in the
 * productivity panel. Nothing here leaves the Mac.
 */
export class ToolkitService {
  private readonly images = new WeakMap<WindowController, ImageReport>();
  private readonly palettes = new WeakMap<WindowController, NonNullable<ToolkitState['palette']>>();
  private readonly pageKeys = new WeakMap<WindowController, string>();
  private readonly fontsByWindow = new WeakMap<
    WindowController,
    NonNullable<ToolkitState['fonts']>
  >();
  private servers: LocalServer[] | null = null;
  private serversAt = 0;

  constructor(private readonly deps: ToolkitDeps) {}

  /** The web page you're on (responsive mode is for sites). */
  private webTab(controller: WindowController) {
    const tab = controller.tabs.active;
    return tab && tab.state.kind === 'web' && /^https?:/i.test(tab.state.url) ? tab : null;
  }

  /** Whatever the tab you're on shows — a site or one of Orbit's pages (New Tab, Library…):
   *  colors and fonts can be picked and read from any of them. */
  private shownTab(controller: WindowController) {
    const tab = controller.tabs.active;
    return tab && !tab.view.webContents.isDestroyed() ? tab : null;
  }

  state(controller: WindowController): ToolkitState {
    const tab = this.shownTab(controller);
    const web = this.webTab(controller);
    return {
      colors: this.deps.settings.get('toolkit.colors'),
      image: this.images.get(controller) ?? null,
      palette: this.palettes.get(controller) ?? null,
      fonts: this.fontsByWindow.get(controller) ?? null,
      servers: this.servers,
      page: tab
        ? {
            title: tab.state.title || hostOf(tab.state.url),
            host: hostOf(tab.state.url),
            web: web !== null,
            viewport: web
              ? (controller.tabs.snapshot().tabs.find((t) => t.id === tab.id)?.viewport ?? null)
              : null,
          }
        : null,
    };
  }

  push(controller: WindowController): void {
    const state = this.state(controller);
    this.pageKeys.set(controller, pageKey(state));
    this.deps.push(controller, state);
  }

  /** The tab or its page changed: the panel's page tools follow (only when it differs). */
  pageChanged(controller: WindowController): void {
    if (!controller.notes.contents) return;
    const state = this.state(controller);
    const key = pageKey(state);
    if (this.pageKeys.get(controller) === key) return;
    this.pageKeys.set(controller, key);
    this.deps.push(controller, state);
  }

  /** Opens the Toolkit in the panel (on a section). */
  open(controller: WindowController, section?: ToolkitSection): void {
    controller.notes.openAt(section ? `panel/tools/${section}` : 'panel/tools');
    this.push(controller);
  }

  /** Pick Color: the page, frozen, under a loupe in the overlay. */
  async pickColor(controller: WindowController): Promise<void> {
    const tab = this.shownTab(controller);
    if (!tab) {
      this.deps.toast(controller, 'Open a page to pick a color from');
      return;
    }
    const image = await tab.view.webContents.capturePage();
    if (image.isEmpty()) return;
    controller.overlay.startColorPick(tab.view.getBounds(), image.toDataURL());
  }

  colorPicked(controller: WindowController, hex: string): void {
    controller.overlay.endColorPick();
    const color = hex.toLowerCase();
    const recent = this.deps.settings.get('toolkit.colors').filter((c) => c !== color);
    this.deps.settings.set('toolkit.colors', [color, ...recent].slice(0, 16));
    clipboard.writeText(color);
    this.deps.toast(controller, `Copied ${color}`);
    this.open(controller, 'colors');
  }

  cancelPick(controller: WindowController): void {
    controller.overlay.endColorPick();
  }

  clearColors(controller: WindowController): void {
    this.deps.settings.set('toolkit.colors', []);
    this.push(controller);
  }

  /** The colors the page uses, most used first. */
  async palette(controller: WindowController): Promise<void> {
    const tab = this.shownTab(controller);
    if (!tab) {
      this.deps.toast(controller, 'Open a page to see its colors');
      return;
    }
    let found: unknown;
    try {
      found = await tab.view.webContents.executeJavaScriptInIsolatedWorld(PALETTE_WORLD, [
        { code: READ_PALETTE },
      ]);
    } catch {
      found = [];
    }
    const swatches: Swatch[] = (Array.isArray(found) ? found : [])
      .filter(
        (s): s is Swatch =>
          !!s &&
          typeof s === 'object' &&
          /^#[0-9a-f]{6}$/.test(String((s as Swatch).hex)) &&
          Number.isInteger((s as Swatch).count),
      )
      .map((s) => ({
        hex: s.hex,
        count: s.count,
        text: s.text === true,
        background: s.background === true,
      }));
    this.palettes.set(controller, { page: tab.state.title || hostOf(tab.state.url), swatches });
    this.push(controller);
  }

  /** The fonts the page uses, most used first (roadmap P4.6). */
  async fonts(controller: WindowController): Promise<void> {
    const tab = this.shownTab(controller);
    if (!tab) {
      this.deps.toast(controller, 'Open a page to see its fonts');
      return;
    }
    let found: unknown;
    try {
      found = await tab.view.webContents.executeJavaScriptInIsolatedWorld(PALETTE_WORLD, [
        { code: READ_FONTS },
      ]);
    } catch {
      found = [];
    }
    const families = (Array.isArray(found) ? found : [])
      .filter(
        (f): f is NonNullable<ToolkitState['fonts']>['families'][number] =>
          !!f &&
          typeof (f as { family?: unknown }).family === 'string' &&
          Number.isInteger((f as { count?: unknown }).count),
      )
      .map((f) => ({
        family: f.family,
        count: f.count,
        sizes: (Array.isArray(f.sizes) ? f.sizes : []).filter((n) => typeof n === 'number'),
        weights: (Array.isArray(f.weights) ? f.weights : []).filter((n) => typeof n === 'number'),
      }));
    this.fontsByWindow.set(controller, {
      page: tab.state.title || hostOf(tab.state.url),
      families,
    });
    this.push(controller);
  }

  /** Image Info (right-click an image): format, size, dimensions and camera details. */
  async inspectImage(
    controller: WindowController,
    contents: WebContents,
    src: string,
    alt: string,
  ): Promise<void> {
    const page = contents.getURL();
    const report: ImageReport = {
      src,
      page,
      alt: alt.slice(0, 300),
      format: 'Unknown',
      type: '',
      width: null,
      height: null,
      bytes: null,
      details: [],
      preview: null,
      error: null,
    };
    try {
      let bytes: Buffer;
      if (src.startsWith('data:')) {
        const comma = src.indexOf(',');
        const meta = src.slice(5, comma);
        report.type = meta.split(';')[0] ?? '';
        bytes = meta.endsWith(';base64')
          ? Buffer.from(src.slice(comma + 1), 'base64')
          : Buffer.from(decodeURIComponent(src.slice(comma + 1)));
      } else if (/^https?:/i.test(src)) {
        // Fetched with the page's own session (its cookies), like the page did.
        const response = await contents.session.fetch(src, { signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error(`The server answered ${response.status}`);
        report.type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim();
        bytes = Buffer.from(await response.arrayBuffer());
      } else {
        throw new Error('Only web and data images can be inspected');
      }
      if (bytes.length > IMAGE_LIMIT) throw new Error('This image is too large to inspect');
      report.bytes = bytes.length;
      const facts = imageFacts(bytes);
      report.format = facts.format;
      report.width = facts.width;
      report.height = facts.height;
      report.details = [...facts.details];
      const decoded = nativeImage.createFromBuffer(bytes);
      if (!decoded.isEmpty()) {
        const size = decoded.getSize();
        report.width ??= size.width;
        report.height ??= size.height;
        const preview = size.width > 360 ? decoded.resize({ width: 360 }) : decoded;
        report.preview = `data:image/jpeg;base64,${preview.toJPEG(82).toString('base64')}`;
      }
      if (report.width && report.height) {
        const ratio = aspect(report.width, report.height);
        if (ratio) report.details.unshift({ label: 'Aspect ratio', value: ratio });
      }
      report.details.unshift({ label: 'File size', value: formatBytes(bytes.length) });
    } catch (error) {
      report.error = error instanceof Error ? error.message : String(error);
    }
    this.images.set(controller, report);
    this.open(controller, 'image');
  }

  /** Local development servers (cached for a few seconds: ⌘T asks as you type). */
  async localServers(force = false): Promise<LocalServer[]> {
    if (!force && this.servers && Date.now() - this.serversAt < 4000) return this.servers;
    this.servers = await scanLocalServers(this.deps.ports);
    this.serversAt = Date.now();
    return this.servers;
  }

  async scanServers(controller: WindowController): Promise<void> {
    await this.localServers(true);
    this.push(controller);
  }

  /** Responsive mode for the page you're on (null: off). */
  setViewport(controller: WindowController, viewport: Viewport | null): void {
    const tab = this.webTab(controller);
    if (!tab) {
      if (viewport) this.deps.toast(controller, 'Open a web page to see it at a device size');
      return;
    }
    controller.tabs.setViewport(tab.id, viewport);
    this.push(controller);
  }

  /** Annotate Screenshot: drag over the page; the picture opens on a new Easel to draw on. */
  async annotate(controller: WindowController): Promise<void> {
    const tab = this.shownTab(controller);
    if (!tab) {
      this.deps.toast(controller, 'Open a page to annotate a screenshot of');
      return;
    }
    const result = this.deps.captures.wait(controller);
    controller.overlay.startCapture(tab.view.getBounds());
    const capture = await result;
    if (capture) this.deps.annotate(controller, capture);
  }
}

const pageKey = (state: ToolkitState) => JSON.stringify(state.page);
