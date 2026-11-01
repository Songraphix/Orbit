# Progress log

## Current phase: Phase 1 — Window, sidebar shell and tabs

Target end: 2026-11-16 · Branch: `phase-1/foundations`

## Done

- 2026-10-31 — Arc data backup (essentials, 57 MB) to `~/ArcBackup/2026-11-01/`; see `docs/reference/README.md`
- 2026-10-31 — Toolchain without admin rights: Node 26.13.0 LTS + npm 11.20 in `~/.local/node`, gh 2.103.3 in `~/.local/bin`
- 2026-10-31 — Extension audit: 14 extensions, none use native messaging (`docs/reference/extensions.md`)
- 2026-10-31 — Repo initialised; plan + screenshots (Img 1–7) committed (0e4acd4)
- 2026-11-01 — Scaffold: electron-vite with shell / overlay / internal renderers, shell + internal preloads, ESLint, Prettier, Vitest, Playwright, husky pre-commit, CLAUDE.md, ADR-001…006
- 2026-11-01 — Phase 1 step 1: typed IPC router (zod input + output validation, trusted-sender checks), main→renderer Broadcaster, typed `window.orbit.invoke/on`, first channel `app:getInfo`; e2e runs in a throwaway profile via `ORBIT_USER_DATA_DIR`

## In progress

- Phase 1 step 2: persistence (SQLite + migrations + settings) — awaiting decision on node:sqlite vs better-sqlite3

## Decisions made

- Pinned versions: Electron 45.2.1 (Chromium 156, Node 24.22), electron-vite 6.0.0, Vite 8.3.5, React 19.3.1, TypeScript 6.0.3, Tailwind 4.3.3, Vitest 5.0.5, Playwright 1.64.1, electron-builder 26.18.0
- TypeScript 6.0.x rather than 7.x: typescript-eslint 8.72 supports `<6.1.0`
- Preloads output as CommonJS (`.cjs`) so the shell can stay `sandbox: true`
- Phase-specific libraries (better-sqlite3, dnd-kit, cmdk, Motion, Zustand, …) are installed in the phase that first needs them, not up front

## Known issues

- `npm audit`: moderate `minimatch` advisory inside electron-builder's dependency tree (build-time only, not shipped in the app). The suggested fix downgrades electron-builder to 20.x, so it is deferred; re-check at each milestone.
- VS Code-launched shells may set `ELECTRON_RUN_AS_NODE=1` (see CLAUDE.md)

## Annoyances (from dogfooding)

- (none yet)

## Backlog (ideas outside the current phase)

- (none yet)
