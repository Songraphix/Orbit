import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type {
  BetaMessage,
  BetaMessageParam,
  BetaRawMessageStreamEvent,
  BetaToolUnion,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { z } from 'zod';
import { estimateCost, formatCost, inputTokens, withinBudget } from '@shared/ai';
import type { AiFeature, AiPrefs, TokenUsage } from '@shared/ai';
import type { AiActivityRepository } from '../persistence/repositories/ai-activity';
import { TIDY_SYSTEM, tidyAnswerSchema, tidyGroups, tidyRequest } from './tidy-model';
import type { TidyGroup, TidyTab } from './tidy-model';

/** PLAN.md F-29: "a small, fast model" — Tidy should answer in a couple of seconds. */
export const TIDY_MODEL = 'claude-haiku-5-5';

/** Models with Anthropic's server-side fallback: a declined request is finished by another model
 *  in the same call, instead of just stopping. (Haiku has none.) */
const WITH_FALLBACK = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);
const fallback = (model: string) =>
  WITH_FALLBACK.has(model)
    ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
    : {};

/** How hard Claude thinks: quick for chat-like answers, more for questions across research. */
export type Effort = 'low' | 'medium' | 'high';

export type AiDeps = {
  /** The stored key, decrypted on demand (null when none is set). */
  apiKey: () => string | null;
  /** Development and tests only: a stand-in for api.anthropic.com. */
  baseURL?: string;
  prefs: () => AiPrefs;
  activity: AiActivityRepository;
};

/** A request that never left: no key, AI turned off, or the monthly limit reached. */
export class AiBlocked extends Error {}

/** A tool call's input arrived unreadable (inputs stream as written); asking again is right. */
export class ToolInputError extends Error {}

/**
 * Orbit's AI features (F-29, roadmap Phase 3) with the user's own Anthropic API key. Every
 * request goes through here: it is refused when AI is off or over the month's limit, and logged
 * (metadata only) once answered. What each feature sends is decided — and shown — by its caller.
 */
export class AIService {
  constructor(private readonly deps: AiDeps) {}

  /** A key is saved and AI is turned on (the toolbar shows Tidy and the assistant works). */
  get available(): boolean {
    return this.deps.apiKey() !== null && this.deps.prefs().enabled;
  }

  get prefs(): AiPrefs {
    return this.deps.prefs();
  }

  /** Why nothing may be sent right now, in words for the user — or null. */
  blocked(): string | null {
    if (!this.deps.apiKey()) return 'Add your Anthropic API key in Settings → AI to use Claude';
    const prefs = this.deps.prefs();
    if (!prefs.enabled) return 'AI is turned off in Settings → AI';
    if (!withinBudget(prefs, this.deps.activity.usage().cost)) {
      return `You’ve reached this month’s AI limit (${formatCost(prefs.monthlyBudget ?? 0)}) — raise it in Settings → AI`;
    }
    return null;
  }

  private client(timeout: number): Anthropic {
    const reason = this.blocked();
    if (reason) throw new AiBlocked(reason);
    return new Anthropic({
      apiKey: this.deps.apiKey()!,
      ...(this.deps.baseURL ? { baseURL: this.deps.baseURL } : {}),
      timeout,
      maxRetries: 1,
    });
  }

  private record(feature: AiFeature, model: string, usage: TokenUsage, sent: string): void {
    this.deps.activity.add({
      feature,
      model,
      inputTokens: inputTokens(usage),
      outputTokens: usage.output_tokens,
      cost: estimateCost(model, usage),
      sent,
    });
  }

  /** Groups tabs into named folders. Throws a message fit to show the user. */
  async tidy(tabs: readonly TidyTab[]): Promise<TidyGroup[]> {
    const client = this.client(20_000);
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
      this.record('tidy', response.model, response.usage, `${tabs.length} tab titles and sites`);
      // Check why it stopped before trusting the content.
      if (response.stop_reason === 'refusal')
        throw new Error('Claude declined to group these tabs');
      if (response.stop_reason === 'max_tokens' || !response.parsed_output) {
        throw new Error('Claude’s answer was incomplete — try again');
      }
      return tidyGroups(response.parsed_output, keys);
    } catch (error) {
      throw friendlyError(error);
    }
  }

  /**
   * Streams an answer with the chosen model. `onEvent` sees every stream event as it arrives;
   * the finished message comes back (also when stopped through `signal`, with what arrived).
   */
  async stream(request: {
    feature: AiFeature;
    system: string;
    messages: BetaMessageParam[];
    effort: Effort;
    /** What was sent, for the activity log ("Page “…” (example.com) and your question"). */
    sent: string;
    signal: AbortSignal;
    onEvent: (event: BetaRawMessageStreamEvent) => void;
    /** Tools Claude may call (the caller runs them and continues the conversation). */
    tools?: BetaToolUnion[];
  }): Promise<BetaMessage> {
    const client = this.client(120_000);
    const { model } = this.deps.prefs();
    const stream = client.beta.messages.stream(
      {
        model,
        max_tokens: 64_000,
        system: request.system,
        messages: request.messages,
        ...(request.tools?.length ? { tools: request.tools } : {}),
        output_config: { effort: request.effort },
        // The conversation so far (a page, research) is resent each turn: cache it.
        cache_control: { type: 'ephemeral' },
        ...fallback(model),
      },
      { signal: request.signal },
    );
    stream.on('streamEvent', (event) => request.onEvent(event));
    try {
      const message = await stream.finalMessage();
      this.record(request.feature, message.model, message.usage, request.sent);
      return message;
    } catch (error) {
      // Stopped by the user: what arrived still cost tokens, if the stream got that far.
      const partial = stream.currentMessage;
      if (partial) this.record(request.feature, partial.model, partial.usage, request.sent);
      // The SDK's own (non-API) error here is a tool input it couldn't parse.
      if (
        request.tools?.length &&
        error instanceof Anthropic.AnthropicError &&
        !(error instanceof Anthropic.APIError) &&
        !(error instanceof Anthropic.APIUserAbortError)
      ) {
        throw new ToolInputError('A tool call arrived incomplete', { cause: error });
      }
      throw friendlyError(error);
    }
  }

  /** One structured answer (validated against `schema`) from the chosen model. */
  async parse<T>(request: {
    feature: AiFeature;
    system: string;
    content: BetaMessageParam['content'];
    schema: z.ZodType<T>;
    sent: string;
  }): Promise<T> {
    const client = this.client(90_000);
    const { model } = this.deps.prefs();
    try {
      const response = await client.beta.messages.parse({
        model,
        max_tokens: 16_000,
        system: request.system,
        output_config: { effort: 'low', format: betaZodOutputFormat(request.schema) },
        messages: [{ role: 'user', content: request.content }],
        ...fallback(model),
      });
      this.record(request.feature, response.model, response.usage, request.sent);
      if (response.stop_reason === 'refusal') throw new Error('Claude declined this request');
      if (response.stop_reason === 'max_tokens' || response.parsed_output == null) {
        throw new Error('Claude’s answer was incomplete — try again');
      }
      return response.parsed_output as T;
    } catch (error) {
      throw friendlyError(error);
    }
  }
}

/** An error worded for the user (the SDK's typed errors, most specific first). */
export function friendlyError(error: unknown): Error {
  if (error instanceof AiBlocked) return error;
  if (error instanceof Anthropic.APIUserAbortError) return new Error('Stopped');
  if (error instanceof Anthropic.AuthenticationError)
    return new Error('Your Anthropic API key was rejected — check it in Settings → AI', {
      cause: error,
    });
  if (error instanceof Anthropic.PermissionDeniedError)
    return new Error('This API key can’t use that model — pick another in Settings → AI', {
      cause: error,
    });
  if (error instanceof Anthropic.RateLimitError)
    return new Error('Anthropic is rate limiting this key — try again shortly', { cause: error });
  if (error instanceof Anthropic.BadRequestError)
    return new Error('Anthropic couldn’t take this request (it may be too long)', {
      cause: error,
    });
  if (error instanceof Anthropic.APIConnectionError)
    return new Error('Couldn’t reach Anthropic — are you online?', { cause: error });
  if (error instanceof Anthropic.APIError)
    return new Error(`Anthropic answered with an error (${error.status ?? 'unknown'})`, {
      cause: error,
    });
  return error instanceof Error ? error : new Error(String(error));
}
