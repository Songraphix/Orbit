import { z } from 'zod';

/** One tab of a workspace template (roadmap P2.5). */
export const templateTabSchema = z.object({
  section: z.enum(['pinned', 'today']),
  title: z.string().max(300),
  url: z.string().max(4096),
});
export type TemplateTab = z.output<typeof templateTabSchema>;

export const TEMPLATE_MAX_TABS = 40;

type RowLike = {
  item: { kind: string; title: string; titleOverride: string | null; url: string | null };
};

/**
 * A Space's tabs as a template: pinned, then Today, in order; web pages only (no new tab pages,
 * folders or Live Folders); no page twice; at most 40. Pure.
 */
export function templateTabs(pinned: readonly RowLike[], today: readonly RowLike[]): TemplateTab[] {
  const seen = new Set<string>();
  const out: TemplateTab[] = [];
  const take = (rows: readonly RowLike[], section: TemplateTab['section']) => {
    for (const { item } of rows) {
      if (item.kind !== 'tab' || !item.url || !/^https?:\/\//i.test(item.url)) continue;
      if (seen.has(item.url) || out.length >= TEMPLATE_MAX_TABS) continue;
      seen.add(item.url);
      out.push({ section, title: item.titleOverride || item.title || item.url, url: item.url });
    }
  };
  take(pinned, 'pinned');
  take(today, 'today');
  return out;
}
