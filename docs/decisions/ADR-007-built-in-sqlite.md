# ADR-007: Use Electron's built-in `node:sqlite` instead of better-sqlite3

- Status: accepted (supersedes the library choice in ADR-005)
- Date: 2026-11-01

## Context

ADR-005 chose SQLite via better-sqlite3. better-sqlite3 is a native module: it must be compiled against Electron's Node ABI for the app, and against plain Node's ABI for unit tests. That adds a rebuild step to installs, packaging and every Electron upgrade.

Electron 45 bundles Node 24.22, which includes `node:sqlite` (`DatabaseSync`) with SQLite 3.53.4. Tested on 2026-11-01: it opens databases and supports FTS5 virtual tables both inside Electron and under the project's Node 26 used by Vitest.

## Options considered

1. **better-sqlite3** — mature and widely used, with a convenient `transaction()` helper; native module with ABI juggling.
2. **Built-in `node:sqlite`** — nothing to install or compile; identical in app and tests; newer API (release-candidate stability), fewer conveniences.

## Decision

Use `node:sqlite`. Everything else in ADR-005 stands: WAL mode, FTS5, numbered migrations tracked with `PRAGMA user_version`.

## Consequences

- No native modules in the project, so no rebuild step for packaging or upgrades.
- Small helpers fill the gaps (e.g. our own `transaction()` wrapper in `src/main/persistence/db.ts`).
- The API could still change between Node versions. All database access goes through `src/main/persistence/`, so a change (or a switch back to better-sqlite3) is contained there. Re-check at each Electron upgrade.
