import type { WebContents } from 'electron';

/**
 * JSON pages, readable (roadmap P3.6): an address that answers with JSON shows a collapsible,
 * coloured tree with Raw, Copy and Expand/Collapse — built in a world of its own (the page has
 * no say) and styled with a user stylesheet (no page CSP can block it). Huge documents (over
 * 5 MB) stay as they are.
 */
const JSON_WORLD = 1005;

const CSS = `
#orbit-json { font: 12.5px/1.55 ui-monospace, 'SF Mono', Menlo, monospace; color: #1d1d1f; }
#orbit-json .oj-bar { position: sticky; top: 0; z-index: 1; display: flex; align-items: center;
  gap: 8px; padding: 8px 14px; background: rgb(255 255 255 / 0.92); backdrop-filter: blur(12px);
  border-bottom: 1px solid rgb(0 0 0 / 0.08); font: 500 12px -apple-system, system-ui, sans-serif; }
#orbit-json .oj-title { font-weight: 650; }
#orbit-json .oj-meta { color: rgb(60 60 67 / 0.6); }
#orbit-json .oj-spacer { flex: 1; }
#orbit-json button { font: inherit; border: 1px solid rgb(0 0 0 / 0.1); background: #fff;
  border-radius: 7px; padding: 3px 9px; cursor: pointer; color: inherit; }
#orbit-json button:hover { background: #f2f2f7; }
#orbit-json button[aria-pressed="true"] { background: #6d5dfc; border-color: #6d5dfc; color: #fff; }
#orbit-json .oj-tree { padding: 10px 14px 40px; }
#orbit-json details { margin-left: 1.25em; }
#orbit-json .oj-tree > details, #orbit-json .oj-tree > .oj-row { margin-left: 0; }
#orbit-json summary { cursor: pointer; list-style: none; margin-left: -1.1em; }
#orbit-json summary::-webkit-details-marker { display: none; }
#orbit-json summary::before { content: '▸'; display: inline-block; width: 1.1em; color: #8e8e93;
  transition: transform 120ms ease; }
#orbit-json details[open] > summary::before { transform: rotate(90deg); }
#orbit-json .oj-row { margin-left: 1.25em; white-space: pre-wrap; word-break: break-word; }
#orbit-json .oj-key { color: #8a3ffc; }
#orbit-json .oj-str { color: #1a7f37; }
#orbit-json .oj-num { color: #0550ae; }
#orbit-json .oj-bool, #orbit-json .oj-null { color: #cf222e; }
#orbit-json .oj-note { color: #8e8e93; font-style: italic; }
#orbit-json a { color: inherit; text-decoration: underline; text-decoration-color: rgb(26 127 55 / 0.4); }
#orbit-json .oj-raw { margin: 0; padding: 10px 14px; white-space: pre-wrap; word-break: break-word; }
@media (prefers-color-scheme: dark) {
  html { background: #1c1c1e; }
  #orbit-json { color: #f2f2f7; }
  #orbit-json .oj-bar { background: rgb(28 28 30 / 0.92); border-color: rgb(255 255 255 / 0.1); }
  #orbit-json .oj-meta { color: rgb(235 235 245 / 0.6); }
  #orbit-json button { background: #2c2c2e; border-color: rgb(255 255 255 / 0.12); }
  #orbit-json button:hover { background: #3a3a3c; }
  #orbit-json .oj-key { color: #c4a7ff; }
  #orbit-json .oj-str { color: #7ee787; }
  #orbit-json .oj-num { color: #79c0ff; }
  #orbit-json .oj-bool, #orbit-json .oj-null { color: #ff7b72; }
}
`;

const RENDER = `(() => {
  if (window.__orbitJson) return 'shown';
  const body = document.body;
  // Chromium shows JSON as a <pre> (with an empty formatter box beside it, for Chrome's own).
  const pre = body && body.querySelector(':scope > pre');
  const others = body ? [...body.children].filter((child) => child !== pre &&
    !child.classList.contains('json-formatter-container')) : [];
  if (!pre || others.length || !/json/i.test(document.contentType || '')) return 'not-json';
  const raw = pre.textContent || '';
  if (raw.length > 5000000) return 'too-big';
  let data;
  try { data = JSON.parse(raw); } catch (e) { return 'invalid'; }
  window.__orbitJson = true;
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const LIMIT = 1000;
  const value = (v) => {
    if (v === null) return el('span', 'oj-null', 'null');
    if (typeof v === 'string') {
      if (/^https?:\\/\\/\\S+$/.test(v)) {
        const wrap = el('span', 'oj-str');
        wrap.append('"');
        const a = el('a', '', v);
        a.href = v;
        wrap.append(a, '"');
        return wrap;
      }
      return el('span', 'oj-str', JSON.stringify(v));
    }
    if (typeof v === 'number') return el('span', 'oj-num', String(v));
    if (typeof v === 'boolean') return el('span', 'oj-bool', String(v));
    return el('span', '', String(v));
  };
  const node = (key, v, depth) => {
    const label = key === null ? [] : [el('span', 'oj-key', JSON.stringify(key)), ': '];
    if (v && typeof v === 'object') {
      const isArray = Array.isArray(v);
      const entries = isArray ? v.map((x, i) => [i, x]) : Object.entries(v);
      const details = el('details');
      details.open = depth < 2 || entries.length <= 30;
      const summary = el('summary');
      summary.append(...label, isArray ? '[' : '{');
      summary.append(el('span', 'oj-note', ' ' + entries.length + (isArray ? ' items' : ' keys') + ' '));
      details.append(summary);
      for (const [k, x] of entries.slice(0, LIMIT)) details.append(node(isArray ? null : k, x, depth + 1));
      if (entries.length > LIMIT) details.append(el('div', 'oj-row oj-note', '… ' + (entries.length - LIMIT) + ' more (see Raw)'));
      details.append(el('div', '', isArray ? ']' : '}'));
      return details;
    }
    const row = el('div', 'oj-row');
    row.append(...label, value(v));
    return row;
  };
  const root = el('div');
  root.id = 'orbit-json';
  const bar = el('div', 'oj-bar');
  const kind = Array.isArray(data) ? 'Array · ' + data.length + ' items'
    : data && typeof data === 'object' ? 'Object · ' + Object.keys(data).length + ' keys' : typeof data;
  const size = raw.length > 1048576 ? (raw.length / 1048576).toFixed(1) + ' MB'
    : raw.length > 1024 ? Math.round(raw.length / 1024) + ' KB' : raw.length + ' bytes';
  bar.append(el('span', 'oj-title', 'JSON'), el('span', 'oj-meta', kind + ' · ' + size), el('span', 'oj-spacer'));
  const tree = el('div', 'oj-tree');
  tree.append(node(null, data, 0));
  const rawView = el('pre', 'oj-raw', raw);
  rawView.hidden = true;
  const button = (label, onClick) => {
    const b = el('button', '', label);
    b.type = 'button';
    b.addEventListener('click', () => onClick(b));
    bar.append(b);
    return b;
  };
  button('Expand all', () => tree.querySelectorAll('details').forEach((d) => (d.open = true)));
  button('Collapse all', () => tree.querySelectorAll('details').forEach((d, i) => (d.open = i === 0)));
  button('Raw', (b) => {
    const showRaw = rawView.hidden;
    rawView.hidden = !showRaw;
    tree.hidden = showRaw;
    b.setAttribute('aria-pressed', String(showRaw));
  });
  button('Copy', (b) => {
    const area = document.createElement('textarea');
    area.value = raw;
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    b.textContent = 'Copied';
    setTimeout(() => (b.textContent = 'Copy'), 1200);
  });
  root.append(bar, tree, rawView);
  pre.hidden = true;
  body.querySelectorAll(':scope > .json-formatter-container').forEach((box) => (box.hidden = true));
  body.style.margin = '0';
  body.append(root);
  return 'shown';
})()`;

/** Shows JSON documents in this page's main frame as a tree. */
export function attachJsonViewer(contents: WebContents): void {
  contents.on('did-finish-load', () => {
    void (async () => {
      try {
        // Only plain JSON documents (cheap check first, in the viewer's own world).
        const kind: unknown = await contents.executeJavaScriptInIsolatedWorld(JSON_WORLD, [
          { code: "/json/i.test(document.contentType || '') ? 'json' : 'other'" },
        ]);
        if (kind !== 'json' || contents.isDestroyed()) return;
        await contents.insertCSS(CSS, { cssOrigin: 'user' });
        await contents.executeJavaScriptInIsolatedWorld(JSON_WORLD, [{ code: RENDER }]);
      } catch {
        // The page went away, or isn't one we can read: leave it.
      }
    })();
  });
}
