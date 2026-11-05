import { afterEach, describe, expect, it, vi } from 'vitest';
import { LayoutEngine } from '../../src/main/windows/layout-engine';
import { DEFAULT_UI_PREFS } from '@shared/ui-prefs';
import type { SettingsRepository } from '../../src/main/persistence/repositories/settings';
import type { Layout } from '../../src/shared/types/layout';

const SETTINGS: Record<string, unknown> = {
  'sidebar.visible': true,
  'sidebar.width': 260,
  'tabs.layout': 'sidebar',
  'dock.width': 380,
  ui: DEFAULT_UI_PREFS,
};
const settings = {
  get: (key: string) => SETTINGS[key],
  set: () => undefined,
} as unknown as SettingsRepository;
const win = { getContentSize: () => [1600, 900], setWindowButtonVisibility: () => undefined };

function engine(reduced = false) {
  const layouts: Layout[] = [];
  const e = new LayoutEngine(
    win,
    settings,
    (l) => layouts.push(l),
    () => reduced,
  );
  return { e, layouts, last: () => layouts.at(-1)! };
}

afterEach(() => vi.useRealTimers());

/** Where the page starts: the rail (10 + 60), a gap, the 260 px sidebar, a gap. */
const LEFT = 10 + 60 + 10 + 260 + 10;

describe('the dock slides', () => {
  it('in from the right, then settles; out, then goes', () => {
    vi.useFakeTimers();
    const { e, last } = engine();
    e.setNotes(true);
    const first = last();
    expect(first.notes).not.toBeNull();
    expect(first.card.width).toBe(1600 - LEFT - 10); // hasn't made room yet
    vi.advanceTimersByTime(300);
    expect(last().card.width).toBe(1600 - LEFT - 10 - 380 - 10);
    e.setNotes(false);
    vi.advanceTimersByTime(120);
    expect(last().notes).not.toBeNull(); // still sliding out
    vi.advanceTimersByTime(200);
    expect(last().notes).toBeNull();
  });

  it('reverses if it’s opened again while sliding out', () => {
    vi.useFakeTimers();
    const { e, last } = engine();
    e.setNotes(true);
    vi.advanceTimersByTime(300);
    e.setNotes(false);
    vi.advanceTimersByTime(100);
    e.setNotes(true);
    vi.advanceTimersByTime(400);
    expect(last().notes).not.toBeNull();
    expect(last().card.width).toBe(1600 - LEFT - 10 - 380 - 10);
  });

  it('doesn’t slide with Reduce Motion', () => {
    vi.useFakeTimers();
    const { e, last } = engine(true);
    e.setNotes(true);
    expect(last().card.width).toBe(1600 - LEFT - 10 - 380 - 10);
    e.setNotes(false);
    expect(last().notes).toBeNull();
  });
});
