import { randomUUID } from 'node:crypto';
import { AI_FEATURES, monthKey, monthStart } from '@shared/ai';
import type { AiActivity, AiFeature, AiUsage } from '@shared/ai';
import type { Database } from '../db';

type Row = {
  id: string;
  at: number;
  feature: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost: number;
  sent: string;
};

const toActivity = (r: Row): AiActivity => ({
  id: r.id,
  at: r.at,
  feature: (AI_FEATURES as readonly string[]).includes(r.feature)
    ? (r.feature as AiFeature)
    : 'assistant',
  model: r.model,
  inputTokens: r.input_tokens,
  outputTokens: r.output_tokens,
  cost: r.cost,
  sent: r.sent,
});

/** The AI activity log (roadmap P3.7, migration 017): metadata about each request, newest first. */
export class AiActivityRepository {
  constructor(private readonly db: Database) {}

  add(entry: Omit<AiActivity, 'id' | 'at'>, at = Date.now()): AiActivity {
    const row: AiActivity = { id: randomUUID(), at, ...entry, sent: entry.sent.slice(0, 400) };
    this.db
      .prepare(
        `INSERT INTO ai_activity (id, at, feature, model, input_tokens, output_tokens, cost, sent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.at,
        row.feature,
        row.model,
        row.inputTokens,
        row.outputTokens,
        row.cost,
        row.sent,
      );
    return row;
  }

  list(limit = 50): AiActivity[] {
    return (
      this.db.prepare('SELECT * FROM ai_activity ORDER BY at DESC, id LIMIT ?').all(limit) as Row[]
    ).map(toActivity);
  }

  /** Requests, tokens and estimated spend in the month of `now`. */
  usage(now = Date.now()): AiUsage {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS requests, COALESCE(SUM(input_tokens), 0) AS input,
                COALESCE(SUM(output_tokens), 0) AS output, COALESCE(SUM(cost), 0) AS cost
         FROM ai_activity WHERE at >= ?`,
      )
      .get(monthStart(now)) as { requests: number; input: number; output: number; cost: number };
    return {
      month: monthKey(now),
      requests: row.requests,
      inputTokens: row.input,
      outputTokens: row.output,
      cost: row.cost,
    };
  }

  clear(): void {
    this.db.prepare('DELETE FROM ai_activity').run();
  }
}
