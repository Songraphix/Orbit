import type { Rect } from '@shared/types/layout';
import { TOOLKIT_SECTIONS } from '@shared/toolkit/state';

/**
 * Notes (F-33): titles, previews and search from a note's plain text, and where floating notes
 * go. Pure.
 */

export {
  UNTITLED_NOTE,
  isBlankNote,
  matchesQuery,
  notePreview,
  noteTitle,
} from '@shared/note-text';

export const FLOAT_SIZE = { width: 340, height: 420, min: { width: 260, height: 220 } } as const;

/**
 * A new floating note: near the top-right of the screen, each further one stepped down and left
 * so they don't hide each other. `open` is how many are already showing.
 */
export function floatBounds(workArea: Rect, open: number): Rect {
  const margin = 24;
  const step = 28 * (open % 8);
  const width = Math.min(FLOAT_SIZE.width, workArea.width - margin * 2);
  const height = Math.min(FLOAT_SIZE.height, workArea.height - margin * 2);
  return {
    x: Math.round(workArea.x + workArea.width - width - margin - step),
    y: Math.round(workArea.y + margin + step),
    width,
    height,
  };
}

/** Saved bounds are reused only if they still sit (mostly) on a screen. */
export function onScreen(bounds: Rect, workAreas: readonly Rect[]): boolean {
  return workAreas.some((area) => {
    const x = Math.max(
      0,
      Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x),
    );
    const y = Math.max(
      0,
      Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y),
    );
    return x >= 80 && y >= 40;
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** orbit://notes/<param> → the internal page's hash: the panel (`panel`, `panel/<id>`) or a
 *  floating note (`float/<id>`). Anything else is "not found". Pure. */
export function notesHash(param: string): string {
  const [mode = '', id, ...rest] = param.split('/');
  // The panel's other views: Projects (and one project), Tasks, the Project Board, Research
  // (all, one project's, or Unsorted), the assistant, the toolkit and Focus.
  if (
    mode === 'panel' &&
    ['projects', 'tasks', 'board', 'research', 'assistant', 'tools', 'focus'].includes(id ?? '')
  ) {
    if (rest.length === 0) return `/notes/panel/${id}`;
    const [sub] = rest;
    if (rest.length === 1 && id === 'projects' && UUID.test(sub!)) {
      return `/notes/panel/projects/${sub}`;
    }
    if (rest.length === 1 && id === 'research' && (sub === 'unsorted' || UUID.test(sub!))) {
      return `/notes/panel/research/${sub}`;
    }
    if (
      rest.length === 1 &&
      id === 'tools' &&
      (TOOLKIT_SECTIONS as readonly string[]).includes(sub!)
    ) {
      return `/notes/panel/tools/${sub}`;
    }
    return '/not-found';
  }
  if (rest.length > 0) return '/not-found';
  if (mode === 'panel' && id === undefined) return '/notes/panel';
  if ((mode === 'panel' || mode === 'float') && id && UUID.test(id)) return `/notes/${mode}/${id}`;
  return '/not-found';
}
