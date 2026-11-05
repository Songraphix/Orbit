import { z } from 'zod';
import { GLASS_LEVELS } from './canvas-theme';
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

/** Orbit's own font (owner request: Comfortaa by default). The Mac's own faces need no files. */
export const FONTS = [
  'comfortaa',
  'system',
  'rounded',
  'inter',
  'nunito',
  'manrope',
  'serif',
] as const;
export type UiFont = (typeof FONTS)[number];

const FALLBACK =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif";

export const FONT_INFO: Record<UiFont, { label: string; stack: string }> = {
  comfortaa: { label: 'Comfortaa', stack: `'Comfortaa Variable', ${FALLBACK}` },
  system: { label: 'SF Pro', stack: FALLBACK },
  rounded: { label: 'SF Pro Rounded', stack: `ui-rounded, ${FALLBACK}` },
  inter: { label: 'Inter', stack: `'Inter Variable', ${FALLBACK}` },
  nunito: { label: 'Nunito', stack: `'Nunito Variable', ${FALLBACK}` },
  manrope: { label: 'Manrope', stack: `'Manrope Variable', ${FALLBACK}` },
  serif: { label: 'New York', stack: `ui-serif, 'New York', Georgia, serif` },
};

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
  font: z.enum(FONTS),
  /** UI spec §4: the accent and glass follow the wallpaper (off: each Space's colour). */
  palette: z.enum(['auto', 'off']),
  /** How much glass: subtle (more solid, most readable), balanced, strong (most see-through). */
  glass: z.enum(GLASS_LEVELS),
  /** Pinned apps in their own rail beside the sidebar (UI 1) or as a grid inside it (UI 2). */
  apps: z.enum(['rail', 'grid']),
  /** Which side a pinned app's panel opens on (UI 3: beside the rail). */
  appSide: z.enum(['left', 'right']),
  /** Where a newly added app opens (each app can still be changed in Settings → Apps). */
  appOpen: z.enum(['tab', 'panel', 'window']),
  /** The app rail tucks away, and slides out when the pointer reaches the window's left edge. */
  railAutoHide: z.boolean(),
};

export const uiPrefsSchema = z.object({
  hidden: fields.hidden.default([]),
  density: fields.density.default('comfortable'),
  textSize: fields.textSize.default('default'),
  accent: fields.accent.default(null),
  surfaces: fields.surfaces.default('glass'),
  motion: fields.motion.default('full'),
  font: fields.font.default('comfortaa'),
  palette: fields.palette.default('auto'),
  glass: fields.glass.default('balanced'),
  apps: fields.apps.default('rail'),
  appSide: fields.appSide.default('left'),
  appOpen: fields.appOpen.default('panel'),
  railAutoHide: fields.railAutoHide.default(false),
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

/** Light, dark or the Mac's choice (the app-wide setting, kept beside these). */
export type AppearanceMode = 'system' | 'light' | 'dark';

/** The parts of the look a theme template sets; everything else stays as you had it. */
export type ThemeLook = Pick<UiPrefs, 'accent' | 'font' | 'surfaces' | 'density'>;

/**
 * Theme templates (owner request): a look in one click — light or dark, accent, font, glass or
 * solid, density. Each part can still be tweaked afterwards.
 */
export const THEME_TEMPLATES: {
  id: string;
  name: string;
  hint: string;
  appearance: AppearanceMode;
  look: ThemeLook;
}[] = [
  {
    id: 'quiet',
    name: 'Quietly Alive',
    hint: 'Sea glass, calm glass, Comfortaa',
    appearance: 'system',
    look: { accent: '#2f7d75', font: 'comfortaa', surfaces: 'glass', density: 'comfortable' },
  },
  {
    id: 'orbit',
    name: 'Orbit',
    hint: 'Comfortaa, glass, each Space’s colour',
    appearance: 'system',
    look: { accent: null, font: 'comfortaa', surfaces: 'glass', density: 'comfortable' },
  },
  {
    id: 'classic',
    name: 'Classic Mac',
    hint: 'SF Pro and blue, like the Mac',
    appearance: 'system',
    look: { accent: '#0a7cff', font: 'system', surfaces: 'glass', density: 'comfortable' },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    hint: 'Dark, violet, Inter',
    appearance: 'dark',
    look: { accent: '#5b5bd6', font: 'inter', surfaces: 'glass', density: 'comfortable' },
  },
  {
    id: 'paper',
    name: 'Paper',
    hint: 'Light, solid, New York serif',
    appearance: 'light',
    look: { accent: '#5c5f6a', font: 'serif', surfaces: 'solid', density: 'spacious' },
  },
  {
    id: 'soft',
    name: 'Soft',
    hint: 'Rounded type, pink, roomy',
    appearance: 'light',
    look: { accent: '#d6336c', font: 'rounded', surfaces: 'glass', density: 'spacious' },
  },
  {
    id: 'forest',
    name: 'Forest',
    hint: 'Dark, green, Nunito',
    appearance: 'dark',
    look: { accent: '#1f9d55', font: 'nunito', surfaces: 'glass', density: 'comfortable' },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    hint: 'Orange, Manrope',
    appearance: 'system',
    look: { accent: '#e8590c', font: 'manrope', surfaces: 'glass', density: 'comfortable' },
  },
  {
    id: 'focus',
    name: 'Focus',
    hint: 'Solid, compact, graphite, Inter',
    appearance: 'system',
    look: { accent: '#5c5f6a', font: 'inter', surfaces: 'solid', density: 'compact' },
  },
];

/** The template your current look matches, if any (tweak one part and it's your own). */
export function matchingTemplate(prefs: UiPrefs, appearance: AppearanceMode): string | null {
  const same = (a: string | null, b: string | null) =>
    (a ?? '').toLowerCase() === (b ?? '').toLowerCase();
  const match = THEME_TEMPLATES.find(
    (t) =>
      t.appearance === appearance &&
      same(t.look.accent, prefs.accent) &&
      t.look.font === prefs.font &&
      t.look.surfaces === prefs.surfaces &&
      t.look.density === prefs.density,
  );
  return match?.id ?? null;
}
