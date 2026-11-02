import type { WebContents } from 'electron';
import { limitPassages, PAGE_CHAR_LIMIT } from './assistant-model';
import type { ExtractedPage, PagePassage } from './assistant-model';

/**
 * Reads a page for the assistant (roadmap P3.1) in a world of its own: the page can't see or
 * change the script, and the script only reads. It keeps the elements it read (in that world,
 * invisible to the page) so a citation can scroll back to its passage.
 */
const READER_WORLD = 1003;

const READ_PAGE = `(() => {
  const LIMIT = ${PAGE_CHAR_LIMIT + 20_000};
  const meta = (name) => {
    const el = document.querySelector('meta[name="' + name + '"], meta[property="' + name + '"]');
    return el && el.content ? String(el.content).slice(0, 500) : '';
  };
  const SKIP = 'nav, aside, footer, script, style, noscript, template, svg, canvas, iframe, ' +
    'form, button, select, [aria-hidden="true"], [hidden], [role="navigation"], ' +
    '[role="banner"], [role="contentinfo"], [role="complementary"], dialog:not([open])';
  const BLOCK = 'h1, h2, h3, h4, h5, h6, p, li, blockquote, pre, figcaption, dt, dd, td, th, summary';
  const textOf = (el) => (el.innerText || '').replace(/[ \\t]+\\n/g, '\\n').replace(/\\n{3,}/g, '\\n\\n').trim();
  const visible = (el) => !el.checkVisibility || el.checkVisibility({ visibilityProperty: true });

  // The main content: the largest article/main region, else the body.
  const body = document.body;
  if (!body) return null;
  const bodyLength = textOf(body).length;
  let root = body;
  let best = 0;
  for (const el of document.querySelectorAll('article, main, [role="main"], #content, #main')) {
    const length = textOf(el).length;
    if (length > best && length > 200 && visible(el)) { best = length; root = el; }
  }
  // A small "main" on a page with lots more to read (a feed, a forum): read the whole page.
  if (root !== body && best < bodyLength * 0.25) root = body;

  const passages = [];
  const elements = [];
  let total = 0;
  for (const el of root.querySelectorAll(BLOCK)) {
    if (total > LIMIT) break;
    if (el.closest(SKIP)) continue;
    // Read the innermost blocks (a list item's paragraphs, not the item and its paragraphs).
    if (el.tagName !== 'PRE' && el.querySelector(BLOCK)) continue;
    if (el.tagName !== 'PRE' && el.closest('pre')) continue;
    if (!visible(el)) continue;
    const text = textOf(el);
    if (text.length < 2) continue;
    const tag = el.tagName;
    const kind = /^H[1-6]$/.test(tag) ? 'heading' : tag === 'LI' || tag === 'DT' || tag === 'DD'
      ? 'item' : tag === 'BLOCKQUOTE' ? 'quote' : tag === 'PRE' ? 'code' : 'text';
    passages.push({ kind, text: text.slice(0, 8000) });
    elements.push(el);
    total += text.length;
  }

  // Pages built from plain <div>s: if the blocks found miss most of the words, read the text
  // in paragraphs instead (citations then find their words rather than an element).
  let anchored = true;
  const rootLength = root === body ? bodyLength : textOf(root).length;
  if (total < rootLength * 0.4) {
    anchored = false;
    passages.length = 0;
    elements.length = 0;
    total = 0;
    let chunk = '';
    const flush = () => {
      const text = chunk.trim();
      if (text) { passages.push({ kind: 'text', text }); total += text.length; }
      chunk = '';
    };
    for (const line of textOf(root).split('\\n')) {
      if (total > LIMIT) break;
      const clean = line.trim();
      if (!clean) { if (chunk.length > 200) flush(); continue; }
      chunk += (chunk ? '\\n' : '') + clean;
      if (chunk.length > 700) flush();
    }
    flush();
  }
  window.__orbitPassages = anchored ? elements : [];
  return {
    title: document.title || '',
    url: location.href,
    description: meta('description') || meta('og:description'),
    site: meta('og:site_name'),
    passages,
    anchored,
  };
})()`;

const jumpScript = (index: number) => `((i) => {
  const list = window.__orbitPassages;
  const el = list && list[i];
  if (!el || !el.isConnected) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const selection = window.getSelection();
  if (selection) {
    selection.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.addRange(range);
  }
  return true;
})(${Math.trunc(index)})`;

const KINDS = new Set(['heading', 'text', 'item', 'quote', 'code']);

/** Reads the page in `contents`: its title, address and readable passages (null if it can't). */
export async function readPage(contents: WebContents): Promise<ExtractedPage | null> {
  let raw: unknown;
  try {
    raw = await contents.executeJavaScriptInIsolatedWorld(READER_WORLD, [{ code: READ_PAGE }]);
  } catch {
    return null; // still loading, crashed, or gone
  }
  if (!raw || typeof raw !== 'object') return null;
  const page = raw as Record<string, unknown>;
  const list = Array.isArray(page['passages']) ? (page['passages'] as unknown[]) : [];
  const passages: PagePassage[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const { kind, text } = item as { kind?: unknown; text?: unknown };
    if (typeof text !== 'string' || typeof kind !== 'string' || !KINDS.has(kind)) continue;
    passages.push({ kind: kind as PagePassage['kind'], text });
  }
  const limited = limitPassages(passages);
  const str = (key: string, max: number) =>
    typeof page[key] === 'string' ? (page[key] as string).slice(0, max) : '';
  return {
    title: str('title', 500),
    url: str('url', 4096),
    description: str('description', 500),
    site: str('site', 200),
    passages: limited.passages,
    truncated: limited.truncated,
    anchored: page['anchored'] === true,
  };
}

/**
 * Shows a cited passage: scrolls to its element and selects it — or, when the page was read as
 * plain text (or has changed since), finds the cited words.
 */
export async function showPassage(
  contents: WebContents,
  index: number | null,
  quote: string,
): Promise<void> {
  if (index !== null) {
    try {
      const done: unknown = await contents.executeJavaScriptInIsolatedWorld(READER_WORLD, [
        { code: jumpScript(index) },
      ]);
      if (done === true) return;
    } catch {
      // fall through to finding the words
    }
  }
  const words = quote.replace(/\s+/g, ' ').trim().split(' ').slice(0, 12).join(' ');
  if (words.length < 3) return;
  contents.findInPage(words, { findNext: true });
  // Leave the words selected, without find's highlights (or the find bar) staying behind.
  setTimeout(() => {
    if (!contents.isDestroyed()) contents.stopFindInPage('keepSelection');
  }, 700);
}
