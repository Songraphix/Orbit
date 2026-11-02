import { z } from 'zod';
import { withUtm } from '@shared/backgrounds';
import type { UnsplashPhoto } from '@shared/backgrounds';

/**
 * Unsplash for Homepage backgrounds (owner's choice; brief M4), with the owner's own access
 * key (Settings → Integrations, kept in the Keychain). Follows Unsplash's API guidelines:
 * photos are hot-linked from images.unsplash.com, credited to the photographer with links back,
 * and Unsplash is told when one is used (its download endpoint). Only your search words and
 * the key go to Unsplash.
 */
export type UnsplashDeps = {
  key: () => string | null;
  fetch: (
    url: string,
    init: { headers: Record<string, string> },
  ) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
  /** Development and tests only: a stand-in for api.unsplash.com. */
  apiUrl?: string;
};

const photoAnswer = z.object({
  id: z.string(),
  color: z.string().nullable().optional(),
  urls: z.object({ raw: z.string().url(), small: z.string().url() }),
  links: z.object({ html: z.string().url(), download_location: z.string().url() }),
  user: z.object({ name: z.string(), links: z.object({ html: z.string().url() }) }),
});

export class UnsplashError extends Error {}

export class UnsplashService {
  constructor(private readonly deps: UnsplashDeps) {}

  get available(): boolean {
    return this.deps.key() !== null;
  }

  /** Landscape photos for what you typed (12 a page). */
  async search(query: string, page = 1): Promise<UnsplashPhoto[]> {
    const params = new URLSearchParams({
      query: query.trim().slice(0, 80),
      page: String(page),
      per_page: '12',
      orientation: 'landscape',
      content_filter: 'high',
    });
    const answer = z
      .object({ results: z.array(z.unknown()) })
      .parse(await this.get(`/search/photos?${params}`));
    return answer.results.flatMap((r) => {
      const photo = photoAnswer.safeParse(r);
      return photo.success ? [toPhoto(photo.data)] : [];
    });
  }

  /** Unsplash asks to be told when a photo is used as a background. Never fails loudly. */
  async used(photo: UnsplashPhoto): Promise<void> {
    try {
      const url = new URL(photo.downloadLocation);
      const base = new URL(this.base());
      if (url.host !== base.host) return; // only Unsplash's own endpoint
      await this.get(url.href);
    } catch {
      // Best effort.
    }
  }

  private base(): string {
    return this.deps.apiUrl ?? 'https://api.unsplash.com';
  }

  private async get(path: string): Promise<unknown> {
    const key = this.deps.key();
    if (!key) throw new UnsplashError('Add an Unsplash access key in Settings → Integrations');
    let response;
    try {
      const url = /^https?:/.test(path) ? path : `${this.base()}${path}`;
      response = await this.deps.fetch(url, {
        headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' },
      });
    } catch {
      throw new UnsplashError('Couldn’t reach Unsplash — are you online?');
    }
    if (response.status === 401) throw new UnsplashError('Unsplash didn’t accept that access key');
    if (response.status === 403)
      throw new UnsplashError('Unsplash’s hourly limit was reached — try again later');
    if (!response.ok)
      throw new UnsplashError(`Unsplash answered with an error (${response.status})`);
    return response.json();
  }
}

function toPhoto(p: z.output<typeof photoAnswer>): UnsplashPhoto {
  const sized = (raw: string, w: number) =>
    `${raw}${raw.includes('?') ? '&' : '?'}w=${w}&q=80&fm=jpg&fit=max`;
  return {
    id: p.id.slice(0, 40),
    url: sized(p.urls.raw, 2560),
    thumb: p.urls.small,
    color: p.color && /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : null,
    author: p.user.name.slice(0, 120),
    authorUrl: withUtm(p.user.links.html),
    pageUrl: withUtm(p.links.html),
    downloadLocation: p.links.download_location,
  };
}
