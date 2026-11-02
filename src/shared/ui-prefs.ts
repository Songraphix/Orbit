import { z } from 'zod';
import { contrastRatio, hexToRgb } from './theme';

/**
 * The customization engine (brief §7, milestone M2): one set of preferences every part of Orbit
 * reads — which features show, density, text size, accent, glass or solid surfaces, motion.
 * Stored as the `ui` setting. Hiding a feature only hides its buttons and rows; its data stays.
 */

/** Features whose entry points can be hidden (the sidebar rows, toolbar buttons, panel tabs). */
export const FEATURES = [
  'projects',
  'tasks',
  'notes',
  'focus',
  'assistant',
  'toolkit',
  'library',
  'capture',
  'easels',
  'screenshot',
] as const;
export type Feature = (typeof FEATURES)[number];

export const FEATURE_LABEL: Record<Feature, { label: string; hint: string }> = {
  projects: { label: 'Projects', hint: 'The sidebar row and the panel tab' },
  tasks: { label: 'Tasks', hint: 'The sidebar row and the panel tab' },
  notes: { label: 'Notes', hint: 'The sidebar row, the toolbar button and the panel tab' },
  focus: { label: 'Focus & Sounds', hint: 'The toolbar button and the panel tab' },
  assistant: { label: 'Orbit AI', hint: 'The toolbar ✦ and the panel tab' },
  toolkit: { label: 'Toolkit', hint: 'The panel tab' },
  library: { label: 'Library', hint: 'The button at the bottom of the sidebar' },
  capture: { label: 'Save to Orbit', hint: 'The toolbar button' },
  easels: { label: 'Easels', hint: 'The sidebar row' },
  screenshot: { label: 'Screenshot', hint: 'The toolbar button (⇧⌘2 still works)' },
};

export const TEXT_SIZES = ['small', 'default', 'large', 'larger'] as const;
/** Text size → zoom for Orbit's own pages (the Homepage, Settings, the panel, the Library). */
export const TEXT_ZOOM: Record<(typeof TEXT_SIZES)[number], number> = {
  small: 0.92,
  default: 1,
  large: 1.1,
  larger: 1.2,
};

/** Accent choices; null means each Space's own colour. */
export const ACCENTS = [
  { name: 'Orbit', hex: '#5b5bd6' },
  { name: 'Blue', hex: '#0a7cff' },
  { name: 'Teal', hex: '#0f9488' },
  { name: 'Green', hex: '#1f9d55' },
  { name: 'Orange', hex: '#e8590c' },
  { name: 'Pink', hex: '#d6336c' },
  { name: 'Red', hex: '#e03131' },
  { name: 'Graphite', hex: '#5c5f6a' },
] as const;

const fields = {
  hidden: z.array(z.enum(FEATURES)).max(FEATURES.length),
  density: z.enum(['compact', 'comfortable', 'spacious']),
  textSize: z.enum(TEXT_SIZES),
  /** null: each Space's colour. */
  accent: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .nullable(),
  /** Glass (translucent, blurred) or solid surfaces for the sidebar and floating UI. */
  surfaces: z.enum(['glass', 'solid']),
  /** Reduced: no movement beyond fades (as with the Mac's Reduce Motion). */
  motion: z.enum(['full', 'reduced']),
};

export const uiPrefsSchema = z.object({
  hidden: fields.hidden.default([]),
  density: fields.density.default('comfortable'),
  textSize: fields.textSize.default('default'),
  accent: fields.accent.default(null),
  surfaces: fields.surfaces.default('glass'),
  motion: fields.motion.default('full'),
});

/** A change to some of them. (Not uiPrefsSchema.partial(): zod 4 would fill in every default.) */
export const uiPrefsPatchSchema = z.object(fields).partial().strict();

export type UiPrefs = z.output<typeof uiPrefsSchema>;

export const DEFAULT_UI_PREFS: UiPrefs = uiPrefsSchema.parse({});

export const isShown = (prefs: UiPrefs | null, feature: Feature) =>
  !prefs || !prefs.hidden.includes(feature);

/** Sidebar row height per density (px). */
export const ROW_HEIGHT: Record<UiPrefs['density'], number> = {
  compact: 30,
  comfortable: 34,
  spacious: 38,
};

const mixHex = (hex: string, to: [number, number, number], t: number): string => {
  const [r, g, b] = hexToRgb(hex);
  const c = [r, g, b].map((v, i) => Math.round(v + (to[i]! - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

/**
 * An accent as the variables Orbit paints with: a fill under white text, the same colour as
 * text on the page (lighter on dark pages, darker on light ones, until it reads at 4.5:1), and
 * a soft tint for selected backgrounds. Pure.
 */
export function accentVars(hex: string, mode: 'light' | 'dark'): Record<string, string> {
  const page: [number, number, number] = mode === 'dark' ? [31, 31, 35] : [255, 255, 255];
  const toward: [number, number, number] = mode === 'dark' ? [255, 255, 255] : [0, 0, 0];
  let text = hex;
  for (let t = 0.1; contrastRatio(hexToRgb(text), page) < 4.5 && t <= 0.9; t += 0.1) {
    text = mixHex(hex, toward, t);
  }
  // White on the fill must read too (large text 3:1 at least; darken until it does).
  let fill = hex;
  for (let t = 0.1; contrastRatio(hexToRgb(fill), [255, 255, 255]) < 3 && t <= 0.6; t += 0.1) {
    fill = mixHex(hex, [0, 0, 0], t);
  }
  const [r, g, b] = hexToRgb(hex);
  return {
    '--accent-fill': fill,
    '--accent': hex,
    '--work-accent': fill,
    '--work-accent-text': text,
    '--work-accent-soft': `rgb(${r} ${g} ${b} / ${mode === 'dark' ? 0.22 : 0.12})`,
    '--note-accent': text,
  };
}
