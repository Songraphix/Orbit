import { describe, expect, it } from 'vitest';
import { contract } from '@shared/ipc/contract';
import { accentVars, DEFAULT_UI_PREFS, isShown, uiPrefsSchema } from '@shared/ui-prefs';
import { contrastRatio, hexToRgb } from '@shared/theme';

describe('customization preferences', () => {
  it('a change carries only what changed (zod 4 would fill defaults into a .partial())', () => {
    expect(contract['ui:set'].input.parse({ motion: 'reduced' })).toEqual({ motion: 'reduced' });
    expect(contract['ai:setPrefs'].input.parse({ attachPage: true })).toEqual({
      attachPage: true,
    });
    expect(() => contract['ui:set'].input.parse({ nope: 1 })).toThrow();
  });

  it('reads an older or partial stored value with defaults', () => {
    expect(uiPrefsSchema.parse({ density: 'compact' })).toEqual({
      ...DEFAULT_UI_PREFS,
      density: 'compact',
    });
  });

  it('hides only what was hidden', () => {
    const prefs = { ...DEFAULT_UI_PREFS, hidden: ['tasks' as const] };
    expect(isShown(prefs, 'tasks')).toBe(false);
    expect(isShown(prefs, 'projects')).toBe(true);
    expect(isShown(null, 'tasks')).toBe(true);
  });

  it('makes accent text readable on light and dark pages, and white readable on its fill', () => {
    for (const hex of ['#5b5bd6', '#0f9488', '#e8590c', '#5c5f6a', '#ffd60a']) {
      const light = accentVars(hex, 'light');
      const dark = accentVars(hex, 'dark');
      expect(
        contrastRatio(hexToRgb(light['--work-accent-text']!), [255, 255, 255]),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(hexToRgb(dark['--work-accent-text']!), [31, 31, 35]),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(hexToRgb(light['--accent-fill']!), [255, 255, 255]),
      ).toBeGreaterThanOrEqual(3);
    }
  });
});
