# ADR-005: SQLite for persistence

- Status: accepted; library choice superseded by ADR-007
- Date: 2026-11-01

## Context

History, archive search and the sidebar tree need fast queries and full-text search over thousands of rows, and must survive force-quits.

## Options considered

1. **SQLite via better-sqlite3** — WAL mode is crash-safe; FTS5 full-text search; synchronous API that is simple in the main process; native module.
2. **JSON files** — no native build, but fragile at scale, no indexing, risky partial writes.
3. **IndexedDB in a renderer** — breaks ADR-004 (state must live in main).

## Decision

SQLite via better-sqlite3 in WAL mode, with FTS5 for history and archive. Schema migrations are numbered SQL files tracked with `PRAGMA user_version`. Small settings may also live in the `settings` table.

## Consequences

- better-sqlite3 must be rebuilt against Electron's ABI (electron-builder does this; verify in Phase 1).
- High-frequency fields (url, title, last_active_at) are debounced ~500 ms.
- Daily database backups, keeping 7 (Phase 4).
