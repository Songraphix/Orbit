/**
 * Which items the web page right-click menu shows (F-31). Pure: built from Electron's
 * `context-menu` params, turned into a native Menu by context-menu.ts.
 */
export type ContextParams = {
  linkURL: string;
  srcURL: string;
  mediaType: string; // 'none' | 'image' | 'video' | 'audio' | …
  selectionText: string;
  isEditable: boolean;
  misspelledWord: string;
  dictionarySuggestions: string[];
  editFlags: {
    canUndo: boolean;
    canRedo: boolean;
    canCut: boolean;
    canCopy: boolean;
    canPaste: boolean;
    canSelectAll: boolean;
  };
};

export type ContextAction =
  | 'back'
  | 'forward'
  | 'reload'
  | 'open-link'
  | 'copy-link'
  | 'open-image'
  | 'copy-image'
  | 'copy-image-url'
  | 'save-image'
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'select-all'
  | 'search-selection'
  | 'add-to-dictionary'
  | 'inspect'
  // Orbit Capture (roadmap P2.1): save what's under the pointer to a project.
  | 'capture-page'
  | 'capture-selection'
  | 'capture-link'
  | 'capture-image'
  // The assistant and notes (roadmap P3.1–P3.3): selected text into answers, tasks or a note.
  | 'ask-selection'
  | 'tasks-selection'
  | 'note-selection'
  | 'ask-page'
  | 'summarize-page'
  | `spell:${string}`;

export type ContextItem =
  { type: 'item'; action: ContextAction; label: string; enabled: boolean } | { type: 'separator' };

export type PageState = { canGoBack: boolean; canGoForward: boolean };

const item = (action: ContextAction, label: string, enabled = true): ContextItem => ({
  type: 'item',
  action,
  label,
  enabled,
});
const SEP: ContextItem = { type: 'separator' };

const isWeb = (url: string) => /^https?:/i.test(url);

/** Shortens a selection for the "Search Google for “…”" label. */
export function searchLabel(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  const short = oneLine.length > 32 ? `${oneLine.slice(0, 31)}…` : oneLine;
  return `Search Google for “${short}”`;
}

export function buildContextMenu(params: ContextParams, page: PageState): ContextItem[] {
  const groups: ContextItem[][] = [];
  const f = params.editFlags;

  if (params.isEditable) {
    const spelling: ContextItem[] = [];
    if (params.misspelledWord) {
      for (const word of params.dictionarySuggestions.slice(0, 5)) {
        spelling.push(item(`spell:${word}`, word));
      }
      if (spelling.length === 0)
        spelling.push(item('add-to-dictionary', 'No Guesses Found', false));
      spelling.push(item('add-to-dictionary', 'Add to Dictionary'));
      groups.push(spelling);
    }
    groups.push([item('undo', 'Undo', f.canUndo), item('redo', 'Redo', f.canRedo)]);
    groups.push([
      item('cut', 'Cut', f.canCut),
      item('copy', 'Copy', f.canCopy),
      item('paste', 'Paste', f.canPaste),
      item('select-all', 'Select All', f.canSelectAll),
    ]);
  }

  if (params.linkURL && isWeb(params.linkURL)) {
    groups.push([
      item('open-link', 'Open Link in New Tab'),
      item('copy-link', 'Copy Link Address'),
      item('capture-link', 'Save Link to Orbit…'),
    ]);
  }

  if (params.mediaType === 'image' && params.srcURL) {
    groups.push([
      item('open-image', 'Open Image in New Tab', isWeb(params.srcURL)),
      item('save-image', 'Save Image As…'),
      item('copy-image', 'Copy Image'),
      item('copy-image-url', 'Copy Image Address'),
      item('capture-image', 'Save Image to Orbit…', isWeb(params.srcURL)),
    ]);
  }

  const selection = params.selectionText.trim();
  if (selection && !params.isEditable) {
    groups.push([item('copy', 'Copy'), item('search-selection', searchLabel(selection))]);
    groups.push([
      item('ask-selection', 'Ask Orbit About Selection'),
      item('tasks-selection', 'Make Tasks from Selection…'),
      item('note-selection', 'New Note from Selection'),
      item('capture-selection', 'Save Selection to Orbit…'),
    ]);
  }

  // Nothing specific under the pointer: page navigation, like Chrome.
  if (groups.length === 0) {
    groups.push([
      item('back', 'Back', page.canGoBack),
      item('forward', 'Forward', page.canGoForward),
      item('reload', 'Reload'),
    ]);
    groups.push([
      item('summarize-page', 'Summarize Page'),
      item('ask-page', 'Ask Orbit About This Page'),
      item('capture-page', 'Save Page to Orbit…'),
    ]);
  }

  groups.push([item('inspect', 'Inspect Element')]);
  return groups.flatMap((group, i) => (i === 0 ? group : [SEP, ...group]));
}
