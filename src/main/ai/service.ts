import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { TIDY_SYSTEM, tidyAnswerSchema, tidyGroups, tidyRequest } from './tidy-model';
import type { TidyGroup, TidyTab } from './tidy-model';

/** PLAN.md F-29: "a small, fast model" — Tidy should answer in a couple of seconds. */
export const TIDY_MODEL = 'claude-haiku-5-5';

/**
 * Orbit's AI features (F-29) with the user's own Anthropic API key. Only tab titles and domains
 * are sent — never page content, URLs' paths, or history.
 */
export class AIService {
  constructor(
    private readonly deps: {
      /** The stored key, decrypted on demand (null when none is set). */
      apiKey: () => string | null;
      /** Development and tests only: a stand-in for api.anthropic.com. */
      baseURL?: string;
    },
  ) {}

  get available(): boolean {
    return this.deps.apiKey() !== null;
  }

  /** Groups tabs into named folders. Throws a message fit to show the user. */
  async tidy(tabs: readonly TidyTab[]): Promise<TidyGroup[]> {
    const apiKey = this.deps.apiKey();
    if (!apiKey) throw new Error('Add your Anthropic API key in Settings to use Tidy');
    const client = new Anthropic({
      apiKey,
      ...(this.deps.baseURL ? { baseURL: this.deps.baseURL } : {}),
      timeout: 20_000,
      maxRetries: 1,
    });
    const { prompt, keys } = tidyRequest(tabs);
    try {
      const response = await client.messages.parse({
        model: TIDY_MODEL,
        max_tokens: 4000,
        system: TIDY_SYSTEM,
        // Grouping a list is quick work: low effort keeps it to a second or two.
        output_config: { effort: 'low', format: zodOutputFormat(tidyAnswerSchema) },
        messages: [{ role: 'user', content: prompt }],
      });
      // Check why it stopped before trusting the content.
      if (response.stop_reason === 'refusal')
        throw new Error('Claude declined to group these tabs');
      if (response.stop_reason === 'max_tokens' || !response.parsed_output) {
        throw new Error('Claude’s answer was incomplete — try again');
      }
      return tidyGroups(response.parsed_output, keys);
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError)
        throw new Error('Your Anthropic API key was rejected — check it in Settings', {
          cause: error,
        });
      if (error instanceof Anthropic.RateLimitError)
        throw new Error('Anthropic is rate limiting this key — try again shortly', {
          cause: error,
        });
      if (error instanceof Anthropic.APIConnectionError)
        throw new Error('Couldn’t reach Anthropic — are you online?', { cause: error });
      if (error instanceof Anthropic.APIError)
        throw new Error(`Anthropic answered with an error (${error.status})`, { cause: error });
      throw error;
    }
  }
}
