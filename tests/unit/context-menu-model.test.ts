import { describe, expect, it } from 'vitest';
import { buildContextMenu, searchLabel } from '../../src/main/tabs/context-menu-model';
import type { ContextParams } from '../../src/main/tabs/context-menu-model';

const noFlags = {
  canUndo: false,
  canRedo: false,
  canCut: false,
  canCopy: false,
  canPaste: false,
  canSelectAll: false,
};
const params = (p: Partial<ContextParams> = {}): ContextParams => ({
  linkURL: '',
  srcURL: '',
  mediaType: 'none',
  selectionText: '',
  isEditable: false,
  misspelledWord: '',
  dictionarySuggestions: [],
  editFlags: noFlags,
  ...p,
});
const page = { canGoBack: true, canGoForward: false };
const labels = (items: ReturnType<typeof buildContextMenu>) =>
  items.map((i) => (i.type === 'separator' ? '---' : i.enabled ? i.label : `(${i.label})`));

describe('buildContextMenu', () => {
  it('shows page navigation on empty space', () => {
    expect(labels(buildContextMenu(params(), page))).toEqual([
      'Back',
      '(Forward)',
      'Reload',
      '---',
      'Inspect Element',
    ]);
  });

  it('shows link actions on a link', () => {
    expect(labels(buildContextMenu(params({ linkURL: 'https://a.com' }), page))).toEqual([
      'Open Link in New Tab',
      'Copy Link Address',
      '---',
      'Inspect Element',
    ]);
  });

  it('ignores non-web links (javascript:, mailto:)', () => {
    const items = labels(buildContextMenu(params({ linkURL: 'javascript:void(0)' }), page));
    expect(items).not.toContain('Open Link in New Tab');
  });

  it('shows image actions, plus link actions for linked images', () => {
    const items = labels(
      buildContextMenu(
        params({ linkURL: 'https://a.com', mediaType: 'image', srcURL: 'https://a.com/i.png' }),
        page,
      ),
    );
    expect(items).toEqual([
      'Open Link in New Tab',
      'Copy Link Address',
      '---',
      'Open Image in New Tab',
      'Save Image As…',
      'Copy Image',
      'Copy Image Address',
      '---',
      'Inspect Element',
    ]);
  });

  it('offers copy and search for selected text', () => {
    expect(labels(buildContextMenu(params({ selectionText: '  hello  world ' }), page))).toEqual([
      'Copy',
      'Search Google for “hello world”',
      '---',
      'Inspect Element',
    ]);
  });

  it('shows spelling suggestions and edit commands in text fields', () => {
    const items = labels(
      buildContextMenu(
        params({
          isEditable: true,
          misspelledWord: 'helo',
          dictionarySuggestions: ['hello', 'help', 'hero'],
          editFlags: { ...noFlags, canPaste: true, canSelectAll: true },
        }),
        page,
      ),
    );
    expect(items).toEqual([
      'hello',
      'help',
      'hero',
      'Add to Dictionary',
      '---',
      '(Undo)',
      '(Redo)',
      '---',
      '(Cut)',
      '(Copy)',
      'Paste',
      'Select All',
      '---',
      'Inspect Element',
    ]);
  });

  it('says so when there are no spelling guesses', () => {
    const items = labels(
      buildContextMenu(params({ isEditable: true, misspelledWord: 'qzxv' }), page),
    );
    expect(items.slice(0, 2)).toEqual(['(No Guesses Found)', 'Add to Dictionary']);
  });
});

describe('searchLabel', () => {
  it('truncates long selections', () => {
    expect(searchLabel('a'.repeat(50))).toBe(`Search Google for “${'a'.repeat(31)}…”`);
  });
});
