import { z } from 'zod';

/**
 * The Homepage's widgets (brief §5, milestone M3): you choose which appear, in what order and
 * how big. The greeting, clock, search and shortcuts stay at the top; widgets fill the grid
 * below. One layout for every Space for now (owner's decision); stored as `home.layout`.
 */

export const WIDGET_TYPES = [
  'today',
  'focus',
  'projects',
  'notes',
  'recent',
  'weather',
  'countdown',
  'clocks',
  'stopwatch',
  'palette',
  'quote',
  'apps',
  'spaces',
  'ask',
  'drive',
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

/** s: one tile · m: two tiles wide · l: two wide and two tall. */
export const WIDGET_SIZES = ['s', 'm', 'l'] as const;
export type WidgetSize = (typeof WIDGET_SIZES)[number];

export const WIDGETS: Record<
  WidgetType,
  { name: string; description: string; sizes: readonly WidgetSize[]; size: WidgetSize }
> = {
  today: { name: 'Today', description: 'Your tasks due today', sizes: ['m', 'l'], size: 'm' },
  focus: {
    name: 'Focus',
    description: 'The focus timer and sounds',
    sizes: ['s', 'm'],
    size: 'm',
  },
  projects: {
    name: 'Projects',
    description: 'Active projects and their progress',
    sizes: ['m', 'l'],
    size: 'm',
  },
  notes: { name: 'Notes', description: 'Your latest notes', sizes: ['m', 'l'], size: 'm' },
  recent: {
    name: 'Recently Visited',
    description: 'Pages you opened lately',
    sizes: ['m', 'l'],
    size: 'm',
  },
  weather: {
    name: 'Weather',
    description: 'Today’s weather for your city',
    sizes: ['s', 'm'],
    size: 's',
  },
  countdown: {
    name: 'Countdown',
    description: 'Days until a date that matters',
    sizes: ['s', 'm'],
    size: 's',
  },
  clocks: {
    name: 'World Clocks',
    description: 'The time in other cities',
    sizes: ['m', 'l'],
    size: 'm',
  },
  stopwatch: { name: 'Stopwatch', description: 'Time something', sizes: ['s'], size: 's' },
  palette: {
    name: 'Colour Palette',
    description: 'A fresh palette every day',
    sizes: ['s', 'm'],
    size: 'm',
  },
  quote: { name: 'Quote', description: 'A thought for the day', sizes: ['m', 'l'], size: 'm' },
  apps: {
    name: 'Apps',
    description: 'Your favourites — open where each is set to',
    sizes: ['m', 'l'],
    size: 'm',
  },
  spaces: { name: 'Spaces', description: 'Jump to a Space', sizes: ['s', 'm'], size: 'm' },
  ask: {
    name: 'Ask Orbit',
    description: 'Ask Orbit AI — type or speak',
    sizes: ['m', 'l'],
    size: 'm',
  },
  drive: {
    name: 'Google Drive',
    description: 'Files you edited lately (when Drive is connected)',
    sizes: ['m', 'l'],
    size: 'm',
  },
};

const cityName = z.string().min(1).max(80);

/** Per-widget settings (only the widgets that have any). */
export const widgetOptionsSchema = z
  .object({
    /** Countdown. */
    title: z.string().max(60).optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    /** World clocks: IANA time zones. */
    zones: z.array(z.string().min(1).max(60)).max(8).optional(),
    /** Weather: a city you chose (found through Open-Meteo's geocoding). */
    place: z
      .object({
        name: cityName,
        country: z.string().max(80),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        timezone: z.string().max(60),
      })
      .optional(),
    units: z.enum(['c', 'f']).optional(),
  })
  .strict();
export type WidgetOptions = z.output<typeof widgetOptionsSchema>;

export const widgetSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(WIDGET_TYPES),
  size: z.enum(WIDGET_SIZES),
  options: widgetOptionsSchema.default({}),
});
export type Widget = z.output<typeof widgetSchema>;

export const homeLayoutSchema = z.object({
  widgets: z.array(widgetSchema).max(24),
});
export type HomeLayout = z.output<typeof homeLayoutSchema>;

let counter = 0;
/** A short id for a new widget. */
export function widgetId(type: WidgetType, now = Date.now()): string {
  counter = (counter + 1) % 1000;
  return `${type}-${now.toString(36)}${counter.toString(36)}`;
}

export function newWidget(type: WidgetType, now = Date.now()): Widget {
  return { id: widgetId(type, now), type, size: WIDGETS[type].size, options: {} };
}

/** The layout before you'd changed anything: what the Homepage showed already. */
export function layoutFromShow(show: { today: boolean; quote: boolean }): HomeLayout {
  return {
    widgets: [
      ...(show.today
        ? [{ id: 'today', type: 'today' as const, size: 'm' as const, options: {} }]
        : []),
      ...(show.quote
        ? [{ id: 'quote', type: 'quote' as const, size: 'm' as const, options: {} }]
        : []),
    ],
  };
}

/**
 * The Homepage a new profile starts with (UI spec §9): Focus, Projects and Quick Access, then
 * Recent, a quote and Today — every one of them real data (or a clear empty state). Editable.
 */
export const DEFAULT_LAYOUT: HomeLayout = {
  widgets: (['focus', 'projects', 'apps', 'recent', 'quote', 'today'] as const).map((type) => ({
    id: type,
    type,
    size: 'm' as const,
    options: {},
  })),
};

/** The layout for the old show/hide switches; both on (as they start) is the default layout. */
export function layoutForShow(show: { today: boolean; quote: boolean }): HomeLayout {
  return show.today && show.quote ? DEFAULT_LAYOUT : layoutFromShow(show);
}

/** Starting layouts (brief §5): editable after you pick one. */
export const PRESETS: Record<string, { name: string; types: WidgetType[] }> = {
  minimal: { name: 'Minimal', types: [] },
  productivity: { name: 'Productivity', types: ['today', 'focus', 'projects', 'countdown'] },
  developer: { name: 'Developer', types: ['today', 'focus', 'recent', 'clocks', 'stopwatch'] },
  designer: { name: 'Designer', types: ['projects', 'palette', 'notes', 'focus'] },
  researcher: { name: 'Researcher', types: ['notes', 'recent', 'today', 'quote'] },
};

export function layoutFromPreset(key: string, now = Date.now()): HomeLayout {
  return { widgets: (PRESETS[key]?.types ?? []).map((t, i) => newWidget(t, now + i)) };
}

/** Moves the widget at `from` to `to` (drag to reorder). Pure. */
export function moveWidget(layout: HomeLayout, from: number, to: number): HomeLayout {
  const widgets = [...layout.widgets];
  const [moved] = widgets.splice(from, 1);
  if (!moved) return layout;
  widgets.splice(Math.max(0, Math.min(widgets.length, to)), 0, moved);
  return { widgets };
}

/** The next size a widget allows (the size button cycles through them). Pure. */
export function nextSize(widget: Widget): WidgetSize {
  const sizes = WIDGETS[widget.type].sizes;
  return sizes[(sizes.indexOf(widget.size) + 1) % sizes.length] ?? widget.size;
}

/** Days from `today` to `date` (both local "YYYY-MM-DD"); negative once it's passed. Pure. */
export function daysUntil(date: string, today: string): number {
  const [y1, m1, d1] = today.split('-').map(Number) as [number, number, number];
  const [y2, m2, d2] = date.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** Open-Meteo's weather codes, in words and as an emoji. Pure. */
export function weatherLabel(code: number): { text: string; icon: string } {
  if (code === 0) return { text: 'Clear', icon: '☀️' };
  if (code <= 2) return { text: 'Partly cloudy', icon: '⛅' };
  if (code === 3) return { text: 'Cloudy', icon: '☁️' };
  if (code === 45 || code === 48) return { text: 'Fog', icon: '🌫️' };
  if (code >= 51 && code <= 57) return { text: 'Drizzle', icon: '🌦️' };
  if (code >= 61 && code <= 67) return { text: 'Rain', icon: '🌧️' };
  if (code >= 71 && code <= 77) return { text: 'Snow', icon: '🌨️' };
  if (code >= 80 && code <= 82) return { text: 'Showers', icon: '🌦️' };
  if (code === 85 || code === 86) return { text: 'Snow showers', icon: '🌨️' };
  if (code >= 95) return { text: 'Thunderstorm', icon: '⛈️' };
  return { text: 'Weather', icon: '🌡️' };
}

/** What the Homepage's work widgets show (read for the new tab page only). */
export const widgetDataSchema = z.object({
  projects: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      color: z.string(),
      done: z.number(),
      total: z.number(),
      dueDate: z.string().nullable(),
    }),
  ),
  notes: z.array(z.object({ id: z.string(), title: z.string(), updatedAt: z.number() })),
  recent: z.array(z.object({ url: z.string(), title: z.string(), favicon: z.string().nullable() })),
  /** This Space's apps (favourites) and where each opens. */
  apps: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        favicon: z.string().nullable(),
        openIn: z.enum(['tab', 'panel', 'window']),
      }),
    )
    .default([]),
  /** The profile's Spaces (the one showing marked). */
  spaces: z
    .array(z.object({ id: z.string(), name: z.string(), icon: z.string(), active: z.boolean() }))
    .default([]),
});
export type WidgetData = z.output<typeof widgetDataSchema>;

export const placeSchema = widgetOptionsSchema.shape.place.unwrap();
export type Place = z.output<typeof placeSchema>;

export const weatherSchema = z.object({
  temperature: z.number(),
  code: z.number(),
  high: z.number(),
  low: z.number(),
  /** The next hours: time "HH:00", temperature, code. */
  hours: z.array(z.object({ time: z.string(), temperature: z.number(), code: z.number() })),
});
export type Weather = z.output<typeof weatherSchema>;
