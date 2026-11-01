/**
 * The zap picker (F-18), run in the page's isolated Boost world: highlights the element under
 * the pointer, and resolves to a selector for the one clicked, or null on Esc. Nothing is
 * exposed to the page's own JavaScript; the page only sees two inert overlay elements.
 */
export const ZAP_PICKER = String.raw`new Promise((resolve) => {
  const ACCENT = '#e5484d';
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid ' +
    ACCENT + ';background:rgba(229,72,77,.15);border-radius:4px;display:none;' +
    'transition:all 60ms ease-out';
  const hint = document.createElement('div');
  hint.textContent = 'Click an element to zap it · Esc when done';
  hint.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);' +
    'z-index:2147483647;pointer-events:none;padding:6px 12px;border-radius:999px;' +
    'background:rgba(20,20,20,.88);color:#fff;font:600 12px/1.4 system-ui,sans-serif';
  document.documentElement.append(box, hint);
  let current = null;

  // Names that change between builds or states: hashes (CSS modules, styled-components,
  // emotion), long numbers, Tailwind variants, and is-/has- state classes.
  const generated = (s) =>
    /\d{4,}|__[A-Za-z0-9_-]{5,}$|^(css|sc|jsx|emotion|svelte)-|^[a-z]{1,3}-[A-Za-z0-9]{5,}$|:|^(is|has)-/
      .test(s);
  const unique = (s) => { try { return document.querySelectorAll(s).length === 1; } catch { return false; } };
  const selectorFor = (el) => {
    const parts = [];
    for (let node = el; node && node.nodeType === 1 && node !== document.documentElement; node = node.parentElement) {
      if (node.id && !generated(node.id)) {
        parts.unshift('#' + CSS.escape(node.id));
        if (unique(parts.join(' > '))) return parts.join(' > ');
        continue;
      }
      let part = node.localName;
      const classes = [...node.classList].filter((c) => c.length < 40 && !generated(c)).slice(0, 2);
      part += classes.map((c) => '.' + CSS.escape(c)).join('');
      const parent = node.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter((c) => c.localName === node.localName);
        const matches = [...parent.children].filter((c) => c.matches(part));
        if (siblings.length > 1 && matches.length > 1) {
          part += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
        }
      }
      parts.unshift(part);
      if (unique(parts.join(' > '))) return parts.join(' > ');
    }
    return parts.join(' > ');
  };

  const target = (event) => {
    const el = document.elementFromPoint(event.clientX, event.clientY);
    return el && el !== document.documentElement && el !== document.body ? el : null;
  };
  const onMove = (event) => {
    current = target(event);
    if (!current) { box.style.display = 'none'; return; }
    const r = current.getBoundingClientRect();
    Object.assign(box.style, { display: 'block', left: r.left + 'px', top: r.top + 'px',
      width: r.width + 'px', height: r.height + 'px' });
  };
  const swallow = (event) => { event.preventDefault(); event.stopImmediatePropagation(); };
  const finish = (value) => {
    removeEventListener('mousemove', onMove, true);
    removeEventListener('mousedown', swallow, true);
    removeEventListener('mouseup', swallow, true);
    removeEventListener('click', onClick, true);
    removeEventListener('keydown', onKey, true);
    box.remove();
    hint.remove();
    resolve(value);
  };
  const onClick = (event) => {
    swallow(event);
    const el = target(event) || current;
    finish(el ? selectorFor(el) : null);
  };
  const onKey = (event) => {
    if (event.key === 'Escape') { swallow(event); finish(null); }
  };
  addEventListener('mousemove', onMove, true);
  addEventListener('mousedown', swallow, true);
  addEventListener('mouseup', swallow, true);
  addEventListener('click', onClick, true);
  addEventListener('keydown', onKey, true);
})`;
