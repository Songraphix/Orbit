import { z } from 'zod';

/**
 * Tidy (F-29) without Electron or network: what is sent to the model (titles and domains only,
 * never page content), the answer's shape, and turning that answer into folders safely.
 */

export type TidyTab = { id: string; title: string; url: string };

/** What the model must answer (structured output, validated). Tabs are named by short keys. */
export const tidyAnswerSchema = z.object({
  groups: z.array(
    z.object({
      name: z.string(),
      tabs: z.array(z.string()),
    }),
  ),
});
export type TidyAnswer = z.output<typeof tidyAnswerSchema>;

export type TidyGroup = { name: string; tabIds: string[] };

/** Fewer than this many top-level Today tabs: nothing worth tidying. */
export const TIDY_MIN_TABS = 4;
/** More than this are sent as the most recent ones (keeps the request small and quick). */
export const TIDY_MAX_TABS = 80;

export const TIDY_SYSTEM = [
  'You organise the open tabs of a web browser into folders, like Arc’s Tidy.',
  'Group tabs that clearly belong together (same task, project, topic or trip).',
  'Make 2 to 6 groups; each needs at least 2 tabs. Leave a tab out if it fits no group.',
  'Name each group in 1 to 3 words, Title Case, specific to its tabs (e.g. "Kyoto Trip", ' +
    '"Brand Guidelines", "Job Search"), never generic ("Misc", "Other", "Websites", "Tabs").',
  'Refer to tabs only by the keys given (t1, t2, …); use each key at most once.',
].join('\n');

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** The user message: one line per tab, "t1 | Title | domain". Keys map back to tab ids. */
export function tidyRequest(tabs: readonly TidyTab[]): {
  prompt: string;
  keys: Map<string, string>;
} {
  const keys = new Map<string, string>();
  const lines = tabs.slice(0, TIDY_MAX_TABS).map((tab, i) => {
    const key = `t${i + 1}`;
    keys.set(key, tab.id);
    const title = tab.title.replace(/\s+/g, ' ').trim().slice(0, 140) || 'Untitled';
    return `${key} | ${title} | ${hostOf(tab.url)}`;
  });
  return { prompt: `Tabs:\n${lines.join('\n')}`, keys };
}

/**
 * The model's groups, made safe: unknown keys dropped, each tab in one group only, groups of
 * fewer than two tabs dropped, names cleaned (and made unique), at most six groups.
 */
export function tidyGroups(answer: TidyAnswer, keys: ReadonlyMap<string, string>): TidyGroup[] {
  const used = new Set<string>();
  const names = new Set<string>();
  const groups: TidyGroup[] = [];
  for (const group of answer.groups) {
    const tabIds: string[] = [];
    for (const key of group.tabs) {
      const id = keys.get(key.trim());
      if (id && !used.has(id)) {
        used.add(id);
        tabIds.push(id);
      }
    }
    let name = group.name.replace(/\s+/g, ' ').trim().slice(0, 40) || 'Group';
    if (tabIds.length < 2) {
      for (const id of tabIds) used.delete(id); // free them for a later group
      continue;
    }
    for (let n = 2; names.has(name.toLowerCase()); n++) name = `${group.name.trim()} ${n}`;
    names.add(name.toLowerCase());
    groups.push({ name, tabIds });
    if (groups.length === 6) break;
  }
  return groups;
}
