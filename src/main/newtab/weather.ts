import { z } from 'zod';
import { placeSchema } from '@shared/home-widgets';
import type { Place, Weather } from '@shared/home-widgets';

/**
 * The Homepage's weather widget (owner's choice: Open-Meteo, a city you type). Only the city
 * you search for and its coordinates go to Open-Meteo — never your location. Free, no key;
 * answers are cached for 20 minutes per place.
 */
export type WeatherDeps = {
  fetch: (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
  /** Development and tests only: stand-ins for Open-Meteo. */
  geocodeUrl?: string;
  forecastUrl?: string;
  now?: () => number;
};

const CACHE_MS = 20 * 60_000;

const geocodeAnswer = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        country: z.string().optional(),
        admin1: z.string().optional(),
        latitude: z.number(),
        longitude: z.number(),
        timezone: z.string().optional(),
      }),
    )
    .optional(),
});

const forecastAnswer = z.object({
  current: z.object({ temperature_2m: z.number(), weather_code: z.number() }),
  hourly: z.object({
    time: z.array(z.string()),
    temperature_2m: z.array(z.number()),
    weather_code: z.array(z.number()),
  }),
  daily: z.object({
    temperature_2m_max: z.array(z.number()),
    temperature_2m_min: z.array(z.number()),
  }),
});

export class WeatherService {
  private readonly cache = new Map<string, { at: number; weather: Weather }>();

  constructor(private readonly deps: WeatherDeps) {}

  private get now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  /** Cities matching what you typed (up to 6). */
  async findPlaces(query: string): Promise<Place[]> {
    const name = query.trim();
    if (name.length < 2) return [];
    const base = this.deps.geocodeUrl ?? 'https://geocoding-api.open-meteo.com/v1/search';
    const url = `${base}?name=${encodeURIComponent(name)}&count=6&language=en&format=json`;
    const answer = geocodeAnswer.parse(await this.json(url));
    return (answer.results ?? [])
      .map((r) =>
        placeSchema.safeParse({
          name: r.name.slice(0, 80),
          country: [r.admin1, r.country].filter(Boolean).join(', ').slice(0, 80),
          latitude: r.latitude,
          longitude: r.longitude,
          timezone: r.timezone ?? 'auto',
        }),
      )
      .flatMap((p) => (p.success ? [p.data] : []));
  }

  /** Now, today's high and low, and the next few hours, for a place. */
  async weather(place: Place, units: 'c' | 'f'): Promise<Weather> {
    const key = `${place.latitude.toFixed(2)},${place.longitude.toFixed(2)},${units}`;
    const cached = this.cache.get(key);
    if (cached && this.now - cached.at < CACHE_MS) return cached.weather;
    const base = this.deps.forecastUrl ?? 'https://api.open-meteo.com/v1/forecast';
    const params = new URLSearchParams({
      latitude: String(place.latitude),
      longitude: String(place.longitude),
      current: 'temperature_2m,weather_code',
      hourly: 'temperature_2m,weather_code',
      daily: 'temperature_2m_max,temperature_2m_min',
      timezone: place.timezone || 'auto',
      forecast_days: '2',
      temperature_unit: units === 'f' ? 'fahrenheit' : 'celsius',
    });
    const answer = forecastAnswer.parse(await this.json(`${base}?${params}`));
    const weather = summarize(answer, this.now, place.timezone);
    this.cache.set(key, { at: this.now, weather });
    return weather;
  }

  private async json(url: string): Promise<unknown> {
    let response;
    try {
      response = await this.deps.fetch(url);
    } catch {
      throw new Error('Couldn’t reach Open-Meteo — are you online?');
    }
    if (!response.ok) throw new Error(`Open-Meteo answered with an error (${response.status})`);
    return response.json();
  }
}

/** The place's local hour now, "YYYY-MM-DDTHH". */
function localHour(now: number, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone === 'auto' ? undefined : timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(now));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}`;
  } catch {
    return new Date(now).toISOString().slice(0, 13);
  }
}

/** Open-Meteo's answer → what the widget shows (pure but for the clock). */
export function summarize(
  answer: z.output<typeof forecastAnswer>,
  now: number,
  timezone: string,
): Weather {
  const hour = localHour(now, timezone);
  const start = Math.max(
    0,
    answer.hourly.time.findIndex((t) => t.slice(0, 13) >= hour),
  );
  const hours = answer.hourly.time.slice(start + 1, start + 6).map((time, i) => ({
    time: time.slice(11, 16),
    temperature: Math.round(answer.hourly.temperature_2m[start + 1 + i] ?? 0),
    code: answer.hourly.weather_code[start + 1 + i] ?? 0,
  }));
  return {
    temperature: Math.round(answer.current.temperature_2m),
    code: answer.current.weather_code,
    high: Math.round(answer.daily.temperature_2m_max[0] ?? answer.current.temperature_2m),
    low: Math.round(answer.daily.temperature_2m_min[0] ?? answer.current.temperature_2m),
    hours,
  };
}
