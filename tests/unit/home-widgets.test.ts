import { describe, expect, it } from 'vitest';
import {
  daysUntil,
  homeLayoutSchema,
  layoutFromPreset,
  layoutFromShow,
  moveWidget,
  newWidget,
  nextSize,
  PRESETS,
  weatherLabel,
  WIDGETS,
  WIDGET_TYPES,
} from '@shared/home-widgets';

describe('Homepage widgets', () => {
  it('starts from what the Homepage already showed', () => {
    expect(layoutFromShow({ today: true, quote: true }).widgets.map((w) => w.type)).toEqual([
      'today',
      'quote',
    ]);
    expect(layoutFromShow({ today: false, quote: true }).widgets.map((w) => w.type)).toEqual([
      'quote',
    ]);
  });

  it('every widget has a default size among its allowed sizes; sizes cycle', () => {
    for (const type of WIDGET_TYPES) {
      expect(WIDGETS[type].sizes).toContain(WIDGETS[type].size);
    }
    const today = newWidget('today'); // two tiles wide to start (the redesign's calmer Homepage)
    expect(today.size).toBe('m');
    expect(nextSize(today)).toBe('l');
    expect(nextSize({ ...today, size: 'l' })).toBe('m');
    expect(nextSize(newWidget('stopwatch'))).toBe('s'); // only one size
  });

  it('presets are valid, editable layouts with unique ids', () => {
    for (const key of Object.keys(PRESETS)) {
      const layout = homeLayoutSchema.parse(layoutFromPreset(key, 1000));
      expect(new Set(layout.widgets.map((w) => w.id)).size).toBe(layout.widgets.length);
    }
    expect(layoutFromPreset('minimal').widgets).toEqual([]);
  });

  it('moves widgets by drag', () => {
    const layout = layoutFromPreset('productivity', 1);
    const types = (l: typeof layout) => l.widgets.map((w) => w.type);
    expect(types(moveWidget(layout, 0, 2))).toEqual(['focus', 'projects', 'today', 'countdown']);
    expect(types(moveWidget(layout, 3, 0))).toEqual(['countdown', 'today', 'focus', 'projects']);
    expect(moveWidget(layout, 9, 0)).toBe(layout);
  });

  it('counts days to a date across months and years', () => {
    expect(daysUntil('2026-11-22', '2026-11-02')).toBe(20);
    expect(daysUntil('2027-01-01', '2026-12-31')).toBe(1);
    expect(daysUntil('2026-11-01', '2026-11-02')).toBe(-1);
  });

  it('names the weather', () => {
    expect(weatherLabel(0).text).toBe('Clear');
    expect(weatherLabel(63).text).toBe('Rain');
    expect(weatherLabel(95).text).toBe('Thunderstorm');
  });

  it('rejects unknown widget options (stored layouts are checked)', () => {
    expect(() =>
      homeLayoutSchema.parse({
        widgets: [{ id: 'a', type: 'today', size: 'l', options: { x: 1 } }],
      }),
    ).toThrow();
  });
});
