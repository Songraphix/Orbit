import { describe, expect, it, vi } from 'vitest';
import { CanvasService } from '../../src/main/theme/canvas-service';
import type { CanvasDeps, Pixels } from '../../src/main/theme/canvas-service';
import { DEFAULT_LOOK } from '@shared/backgrounds';
import { DEFAULT_UI_PREFS } from '@shared/ui-prefs';
import type { UiPrefs } from '@shared/ui-prefs';
import type { WallpaperChoice } from '@shared/types/newtab';
import type { CanvasState } from '@shared/types/canvas';

/** A thumbnail all one colour. */
const solid = (r: number, g: number, b: number): Pixels => {
  const data = new Uint8Array(8 * 8 * 4);
  for (let i = 0; i < 64; i++) data.set([r, g, b, 255], i * 4);
  return { data, width: 8, height: 8, order: 'rgba' };
};

function setup(choice: WallpaperChoice, ui: Partial<UiPrefs> = {}) {
  let cache: { key: string; palette: never }[] = [];
  const published: CanvasState[] = [];
  const state = { choice, ui: { ...DEFAULT_UI_PREFS, ...ui } };
  let resolveRead: (p: Pixels | null) => void = () => undefined;
  const readPixels = vi.fn(
    () =>
      new Promise<Pixels | null>((r) => {
        resolveRead = r;
      }),
  );
  const deps: CanvasDeps = {
    choice: () => state.choice,
    customImage: () => 'data:image/jpeg;base64,AAAA',
    customFile: () => ({ path: '/tmp/custom.jpg', stamp: 42 }),
    look: () => ({ ...DEFAULT_LOOK, overlay: 0 }),
    ui: () => state.ui,
    cache: { get: () => cache, set: (e) => (cache = e as never) },
    readPixels,
    photoFile: (name) => `/app/wallpapers/${name}`,
    publish: (s) => published.push(s),
  };
  const service = new CanvasService(deps);
  return {
    service,
    state,
    published,
    readPixels,
    read: (p: Pixels | null) => resolveRead(p),
    cache: () => cache,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('CanvasService', () => {
  it('reads a built-in’s palette from its CSS at once, and caches it', () => {
    const { service, readPixels, cache } = setup({ kind: 'builtin', id: 'tide' });
    expect(service.state.tone).toBe('dark');
    expect(service.state.auto).toBe(true);
    expect(service.state.vars['--glass-standard']).toMatch(/^rgb\(/);
    expect(readPixels).not.toHaveBeenCalled();
    expect(cache().map((e) => e.key)).toEqual(['builtin:tide']);
  });

  it('reads a built-in photograph in the background, then publishes its palette', async () => {
    const { service, readPixels, read, published } = setup({
      kind: 'builtin',
      id: 'misty-sunrise',
    });
    expect(readPixels).toHaveBeenCalledWith({ file: '/app/wallpapers/misty-sunrise.jpg' });
    expect(service.state.average).toBe('#7563b1'); // its known average meanwhile
    read(solid(240, 236, 228));
    await flush();
    expect(published.at(-1)!.average).toBe('#f0ece4');
    expect(published.at(-1)!.tone).toBe('light');
  });

  it('uses the cache next time (no second read)', async () => {
    const { service, state, readPixels, read } = setup({ kind: 'builtin', id: 'misty-sunrise' });
    read(solid(20, 30, 60));
    await flush();
    state.choice = { kind: 'color', color: '#ffffff' };
    service.refresh();
    state.choice = { kind: 'builtin', id: 'misty-sunrise' };
    service.refresh();
    expect(readPixels).toHaveBeenCalledTimes(1);
    expect(service.state.average).toBe('#141e3c');
  });

  it('drops a late answer for a wallpaper that is no longer shown', async () => {
    const { service, state, read, published } = setup({ kind: 'custom' });
    state.choice = { kind: 'color', color: '#336699' };
    service.refresh();
    const count = published.length;
    read(solid(250, 0, 0));
    await flush();
    expect(published.length).toBe(count);
    expect(service.state.wallpaper).toEqual({ kind: 'color', color: '#336699' });
  });

  it('keeps your accent, and Automatic palette off gives neutral glass', () => {
    const mine = setup({ kind: 'builtin', id: 'dusk' }, { accent: '#0a7cff' });
    expect(mine.service.state.accent).toBe('#0a7cff');
    const off = setup({ kind: 'builtin', id: 'dusk' }, { palette: 'off' });
    expect(off.service.state.auto).toBe(false);
    const glass = off.service.state.vars['--glass-deep']!;
    const [r, g, b] = /rgb\((\d+) (\d+) (\d+)/.exec(glass)!.slice(1).map(Number) as [
      number,
      number,
      number,
    ];
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(2);
  });

  it('sends your own image only with the custom wallpaper', () => {
    expect(setup({ kind: 'custom' }).service.state.customImage).toMatch(/^data:/);
    expect(setup({ kind: 'builtin', id: 'tide' }).service.state.customImage).toBeNull();
  });
});
