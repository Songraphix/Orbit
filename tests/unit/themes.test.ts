import { describe, expect, it } from 'vitest';
import {
  DEFAULT_UI_PREFS,
  FONT_INFO,
  FONTS,
  matchingTemplate,
  THEME_TEMPLATES,
  uiPrefsPatchSchema,
} from '../../src/shared/ui-prefs';

describe('fonts', () => {
  it('Comfortaa by default; every font falls back to the Mac’s own', () => {
    expect(DEFAULT_UI_PREFS.font).toBe('comfortaa');
    for (const font of FONTS) {
      expect(FONT_INFO[font].stack).toMatch(/(-apple-system|serif)/);
    }
  });
});

describe('theme templates', () => {
  it('each is a valid change with its own id', () => {
    const ids = new Set(THEME_TEMPLATES.map((t) => t.id));
    expect(ids.size).toBe(THEME_TEMPLATES.length);
    for (const t of THEME_TEMPLATES)
      expect(uiPrefsPatchSchema.safeParse(t.look).success).toBe(true);
  });

  it('the default look is the Orbit template; a tweak makes it your own', () => {
    expect(matchingTemplate(DEFAULT_UI_PREFS, 'system')).toBe('orbit');
    expect(matchingTemplate({ ...DEFAULT_UI_PREFS, font: 'inter' }, 'system')).toBeNull();
    expect(matchingTemplate(DEFAULT_UI_PREFS, 'dark')).toBeNull();
    const midnight = THEME_TEMPLATES.find((t) => t.id === 'midnight')!;
    expect(
      matchingTemplate({ ...DEFAULT_UI_PREFS, ...midnight.look, accent: '#5B5BD6' }, 'dark'),
    ).toBe('midnight');
  });
});
