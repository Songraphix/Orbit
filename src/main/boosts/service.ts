import type { WebContents } from 'electron';
import { zapSelectorSchema } from '@shared/types/boosts';
import type { Boost, BoostPatch, BoostSummary } from '@shared/types/boosts';
import type { BoostRepository } from '../persistence/repositories/boosts';
import {
  boostsFor,
  composeCss,
  defaultBoostName,
  matchesDomain,
  normalizeDomain,
  withZapped,
} from './model';
import { ZAP_PICKER } from './zap-picker';

/** Boost JS and the zap picker run in this isolated world, never in the page's own. */
const BOOST_WORLD = 1001;

type Applied = { css: string; key: Promise<string | null> };

/**
 * Applies Boosts to web pages (F-18, PLAN.md section 4.6): CSS on every matching navigation
 * (removed and re-inserted live as Boosts change), JS once per matching page load.
 */
export class BoostService {
  private boosts: Boost[];
  /** CSS currently inserted into each page's document, per Boost. */
  private readonly pages = new Map<WebContents, Map<string, Applied>>();

  constructor(
    private readonly repo: BoostRepository,
    /** Orbit's own pages (shell, overlay, internal) are never boosted. */
    private readonly isOrbitPage: (contents: WebContents) => boolean,
  ) {
    this.boosts = repo.list();
  }

  /** Called for every webContents Electron creates (tabs, Peek, Little Orbit, popups). */
  attach(contents: WebContents): void {
    if (this.pages.has(contents)) return;
    this.pages.set(contents, new Map());
    contents.on('did-navigate', () => {
      this.pages.set(contents, new Map()); // a new document: nothing is inserted yet
      this.sync(contents);
    });
    contents.on('dom-ready', () => this.runScripts(contents));
    contents.once('destroyed', () => this.pages.delete(contents));
  }

  list(): Boost[] {
    return this.boosts;
  }

  get(id: string): Boost | null {
    return this.boosts.find((b) => b.id === id) ?? null;
  }

  /** Every Boost for a page's site, on or off (the site controls popover). */
  forSite(url: string): BoostSummary[] {
    return this.boosts
      .filter((b) => matchesDomain(b.domain, url))
      .map(({ id, name, enabled }) => ({ id, name, enabled }));
  }

  create(domain: string): Boost {
    const boost = this.repo.create({ name: defaultBoostName(domain), domain });
    this.reload();
    return boost;
  }

  /** Saves an edit and re-applies CSS everywhere. Throws on an invalid domain. */
  update(id: string, patch: BoostPatch): Boost | null {
    const next = { ...patch };
    if (patch.domain !== undefined) {
      const domain = normalizeDomain(patch.domain);
      if (domain === null) throw new Error(`“${patch.domain}” isn’t a website address`);
      next.domain = domain;
    }
    const boost = this.repo.update(id, next);
    this.reload();
    return boost;
  }

  delete(id: string): void {
    this.repo.delete(id);
    this.reload();
  }

  /** The Boost a zap on this page goes into: the first one for its site, or a new one. */
  boostForZapping(url: string, domain: string): Boost {
    return (
      this.boosts.find((b) => b.enabled && matchesDomain(b.domain, url)) ?? this.create(domain)
    );
  }

  addZapped(id: string, selector: string): Boost | null {
    const boost = this.get(id);
    if (!boost || !zapSelectorSchema.safeParse(selector).success) return null;
    return this.update(id, { settings: withZapped(boost.settings, selector) });
  }

  /**
   * Lets the user click elements on `contents` to hide them, until Esc (or the page leaves).
   * Resolves to the number of elements zapped.
   */
  async zap(contents: WebContents, boostId: string): Promise<number> {
    let count = 0;
    for (;;) {
      const selector = await this.pick(contents);
      if (selector === null || !this.addZapped(boostId, selector)) return count;
      count++;
    }
  }

  /** Reloads the pages a Boost applies to (its JS only runs on load). */
  reloadPages(id: string): void {
    const boost = this.get(id);
    if (!boost) return;
    for (const contents of this.pages.keys()) {
      if (!contents.isDestroyed() && matchesDomain(boost.domain, contents.getURL()))
        contents.reload();
    }
  }

  private reload(): void {
    this.boosts = this.repo.list();
    for (const contents of this.pages.keys()) this.sync(contents);
  }

  /** Makes a page's inserted CSS match its Boosts: changed or disabled ones out, new ones in. */
  private sync(contents: WebContents): void {
    const applied = this.pages.get(contents);
    if (!applied || contents.isDestroyed() || this.isOrbitPage(contents)) return;
    const wanted = new Map(
      boostsFor(this.boosts, contents.getURL())
        .map((b) => [b.id, composeCss(b)] as const)
        .filter(([, css]) => css !== ''),
    );
    for (const [id, entry] of applied) {
      if (wanted.get(id) === entry.css) continue;
      applied.delete(id);
      void entry.key.then((key) => {
        if (key && !contents.isDestroyed()) contents.removeInsertedCSS(key).catch(() => {});
      });
    }
    for (const [id, css] of wanted) {
      if (applied.has(id)) continue;
      applied.set(id, { css, key: contents.insertCSS(css).catch(() => null) });
    }
  }

  private runScripts(contents: WebContents): void {
    if (contents.isDestroyed() || this.isOrbitPage(contents)) return;
    for (const boost of boostsFor(this.boosts, contents.getURL())) {
      if (!boost.js.trim()) continue;
      contents
        .executeJavaScriptInIsolatedWorld(BOOST_WORLD, [{ code: boost.js }])
        .catch((error: unknown) => console.warn(`[orbit] Boost “${boost.name}” failed`, error));
    }
  }

  /** One zap: the picker's selector, or null on Esc, navigation or a closed page. */
  private pick(contents: WebContents): Promise<string | null> {
    if (contents.isDestroyed()) return Promise.resolve(null);
    return new Promise((resolve) => {
      const done = (value: string | null) => {
        contents.off('did-start-navigation', onNavigate);
        contents.off('destroyed', onLeave);
        resolve(value);
      };
      const onLeave = () => done(null);
      // Only a new main document ends zapping (not iframes or same-page URL changes).
      const onNavigate = (
        details: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>,
      ) => {
        if (details.isMainFrame && !details.isSameDocument) done(null);
      };
      contents.on('did-start-navigation', onNavigate);
      contents.once('destroyed', onLeave);
      contents
        .executeJavaScriptInIsolatedWorld(BOOST_WORLD, [{ code: ZAP_PICKER }], true)
        .then((value: unknown) => done(typeof value === 'string' ? value : null))
        .catch(() => done(null));
    });
  }
}
