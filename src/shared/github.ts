import { z } from 'zod';

/**
 * GitHub for projects (roadmap P4.2): a project can follow a repository — its open pull
 * requests and issues show on the project's page, and any of them can become a task. Read
 * through GitHub's REST API (public repositories without a token; a fine-grained token you add
 * in Settings for private ones). Pure.
 */

/** "owner/repo", "github.com/owner/repo" or a repository URL → "owner/repo", or null. */
export function githubRepo(input: string): string | null {
  const match =
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([a-z\d](?:[a-z\d-]{0,38}))\/([\w.-]+?)(?:\.git)?(?:\/.*)?$/i.exec(
      input.trim(),
    ) ?? /^([a-z\d](?:[a-z\d-]{0,38}))\/([\w.-]+?)(?:\.git)?$/i.exec(input.trim());
  if (!match) return null;
  const [, owner, repo] = match;
  if (!owner || !repo || repo === '.' || repo === '..') return null;
  return `${owner}/${repo}`;
}

export const githubItemSchema = z.object({
  kind: z.enum(['pull', 'issue']),
  number: z.number().int(),
  title: z.string(),
  url: z.string(),
  author: z.string(),
  updatedAt: z.number(),
  labels: z.array(z.string()),
  draft: z.boolean(),
  comments: z.number().int(),
});
export type GithubItem = z.output<typeof githubItemSchema>;

export const githubRepoViewSchema = z.object({
  repo: z.string(),
  pulls: z.array(githubItemSchema),
  issues: z.array(githubItemSchema),
  /** Why it couldn't be read (not found, rate limited, offline…), or null. */
  error: z.string().nullable(),
  fetchedAt: z.number(),
});
export type GithubRepoView = z.output<typeof githubRepoViewSchema>;

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** GitHub's list of pulls or issues → items (the issues list includes pulls: they're left out). */
export function parseGithubList(data: unknown, kind: GithubItem['kind']): GithubItem[] {
  if (!Array.isArray(data)) return [];
  const items: GithubItem[] = [];
  for (const raw of data as Record<string, unknown>[]) {
    if (!raw || typeof raw !== 'object') continue;
    if (kind === 'issue' && raw['pull_request']) continue;
    const url = str(raw['html_url']);
    if (!url.startsWith('https://github.com/')) continue;
    const number = Number(raw['number']);
    if (!Number.isInteger(number)) continue;
    const user = raw['user'] as Record<string, unknown> | null | undefined;
    const labels = Array.isArray(raw['labels'])
      ? (raw['labels'] as unknown[])
          .map((l) => (typeof l === 'string' ? l : str((l as Record<string, unknown>)?.['name'])))
          .filter(Boolean)
          .slice(0, 5)
      : [];
    const updated = Date.parse(str(raw['updated_at']));
    items.push({
      kind,
      number,
      title: str(raw['title']).slice(0, 300),
      url,
      author: str(user?.['login']),
      updatedAt: Number.isFinite(updated) ? updated : 0,
      labels,
      draft: raw['draft'] === true,
      comments: Number.isInteger(raw['comments']) ? Number(raw['comments']) : 0,
    });
  }
  return items;
}

/** A task made from a pull request or issue: its title, and its link in the description. */
export function taskFromGithub(item: GithubItem, repo: string) {
  return {
    title: (item.kind === 'pull'
      ? `Review PR #${item.number}: ${item.title}`
      : `#${item.number} ${item.title}`
    ).slice(0, 200),
    description: `${repo} ${item.kind === 'pull' ? 'pull request' : 'issue'} #${item.number}\n${item.url}`,
  };
}
