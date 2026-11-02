import { parseGithubList } from '@shared/github';
import type { GithubRepoView } from '@shared/github';

export type GithubFetch = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

const CACHE_MS = 60_000;

/**
 * GitHub for projects (roadmap P4.2): a repository's open pull requests and issues, through
 * GitHub's REST API — with the token from Settings when there is one (private repositories,
 * higher rate limits). Answers are kept for a minute so the project page stays quick.
 */
export class GithubService {
  private readonly cache = new Map<string, GithubRepoView>();

  constructor(
    private readonly deps: {
      fetch: GithubFetch;
      token: () => string | null;
      /** Development and tests only: a stand-in for api.github.com. */
      apiUrl?: string;
    },
  ) {}

  /** Forgets cached answers (a token was added or removed). */
  reset(): void {
    this.cache.clear();
  }

  async repo(repo: string, refresh = false): Promise<GithubRepoView> {
    const cached = this.cache.get(repo);
    if (cached && !refresh && Date.now() - cached.fetchedAt < CACHE_MS) return cached;
    const base = this.deps.apiUrl ?? 'https://api.github.com';
    const token = this.deps.token();
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    const get = async (what: 'pulls' | 'issues') => {
      const response = await this.deps.fetch(
        `${base}/repos/${repo}/${what}?state=open&per_page=30&sort=updated`,
        { headers, signal: AbortSignal.timeout(10_000) },
      );
      if (!response.ok) throw new GithubError(response.status, response.headers);
      return response.json();
    };
    let view: GithubRepoView;
    try {
      const [pulls, issues] = await Promise.all([get('pulls'), get('issues')]);
      view = {
        repo,
        pulls: parseGithubList(pulls, 'pull'),
        issues: parseGithubList(issues, 'issue'),
        error: null,
        fetchedAt: Date.now(),
      };
    } catch (error) {
      view = {
        repo,
        pulls: cached?.pulls ?? [],
        issues: cached?.issues ?? [],
        error: explain(error, token !== null),
        fetchedAt: Date.now(),
      };
    }
    this.cache.set(repo, view);
    return view;
  }
}

class GithubError extends Error {
  constructor(
    readonly status: number,
    readonly headers: { get(name: string): string | null },
  ) {
    super(`GitHub answered ${status}`);
  }
}

function explain(error: unknown, hasToken: boolean): string {
  if (error instanceof GithubError) {
    if (error.status === 404) {
      return hasToken
        ? 'Repository not found — check the name, and that your token can read it'
        : 'Repository not found — private repositories need a token in Settings → Integrations';
    }
    if (error.status === 401) return 'Your GitHub token was rejected — check it in Settings';
    if (error.status === 403 || error.status === 429) {
      return error.headers.get('x-ratelimit-remaining') === '0'
        ? hasToken
          ? 'GitHub’s rate limit is reached — try again in a while'
          : 'GitHub’s rate limit is reached — a token in Settings → Integrations raises it'
        : 'GitHub refused the request';
    }
    return `GitHub answered with an error (${error.status})`;
  }
  return 'Couldn’t reach GitHub — are you online?';
}

/** A GitHub token, roughly: classic (ghp_…) or fine-grained (github_pat_…). */
export function cleanGithubToken(input: string): string | null {
  const token = input.trim();
  return /^(gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{20,255})$/.test(token)
    ? token
    : null;
}
