import { randomUUID } from 'node:crypto';
import { boostSettingsSchema, EMPTY_BOOST_SETTINGS } from '@shared/types/boosts';
import type { Boost, BoostPatch } from '@shared/types/boosts';
import type { Database } from '../db';

const PROFILE = 'default'; // Boosts apply in every profile for now

type Row = {
  id: string;
  name: string;
  domain: string;
  enabled: number;
  css: string;
  js: string;
  settings_json: string;
  updated_at: number;
};

const toBoost = (row: Row): Boost => {
  let settings = EMPTY_BOOST_SETTINGS;
  try {
    const parsed = boostSettingsSchema.safeParse(JSON.parse(row.settings_json));
    if (parsed.success) settings = parsed.data;
  } catch {
    // a damaged row keeps its CSS and JS; only the tools reset
  }
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    enabled: row.enabled === 1,
    css: row.css,
    js: row.js,
    settings,
    updatedAt: row.updated_at,
  };
};

/** Boosts (F-18), stored in SQLite (PLAN.md section 5.2). */
export class BoostRepository {
  constructor(private readonly db: Database) {}

  list(): Boost[] {
    const rows = this.db
      .prepare('SELECT * FROM boosts WHERE profile_id = ? ORDER BY created_at, id')
      .all(PROFILE) as Row[];
    return rows.map(toBoost);
  }

  get(id: string): Boost | null {
    const row = this.db
      .prepare('SELECT * FROM boosts WHERE profile_id = ? AND id = ?')
      .get(PROFILE, id) as Row | undefined;
    return row ? toBoost(row) : null;
  }

  create(fields: { name: string; domain: string }, now = Date.now()): Boost {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO boosts (id, profile_id, name, domain, settings_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, PROFILE, fields.name, fields.domain, JSON.stringify(EMPTY_BOOST_SETTINGS), now, now);
    return this.get(id)!;
  }

  update(id: string, patch: BoostPatch, now = Date.now()): Boost | null {
    const current = this.get(id);
    if (!current) return null;
    const next = { ...current, ...patch };
    this.db
      .prepare(
        `UPDATE boosts SET name = ?, domain = ?, enabled = ?, css = ?, js = ?, settings_json = ?,
         updated_at = ? WHERE profile_id = ? AND id = ?`,
      )
      .run(
        next.name,
        next.domain,
        next.enabled ? 1 : 0,
        next.css,
        next.js,
        JSON.stringify(next.settings),
        now,
        PROFILE,
        id,
      );
    return this.get(id);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM boosts WHERE profile_id = ? AND id = ?').run(PROFILE, id);
  }
}
