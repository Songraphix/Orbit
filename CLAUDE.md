# Orbit — instructions for AI agents

Orbit is a personal Arc-style browser for macOS built with Electron, React and TypeScript.
The full plan is in docs/PLAN.md. Progress is logged in docs/PROGRESS.md.

## Commands

- npm run dev — start the app with hot reload
- npm run typecheck — TypeScript, must pass
- npm run lint — ESLint + Prettier, must pass
- npm test — Vitest unit tests, must pass
- npm run test:e2e — Playwright end-to-end tests
- npm run build — production build

## Architecture rules (do not break these)

1. The main process is the single source of truth. Renderers send intents and render state.
2. Renderers never import from 'electron'. They use window.orbit only.
3. Every IPC channel is defined in src/shared/ipc/contract.ts with zod schemas, and handlers check the sender.
4. Web content is always sandboxed: sandbox true, contextIsolation true, nodeIntegration false. Never attach a privileged preload to web content or expose APIs to page JavaScript.
5. Floating UI (command bar, popovers, prompts) goes in the overlay renderer, never in the shell.
6. Pure logic lives in model.ts / policy.ts files with no Electron imports, and has unit tests.
7. Persistent state goes through the main-process persistence layer (SQLite), never renderer storage.

## Workflow

- Read the relevant docs/PLAN.md sections before starting. Propose a plan and wait for approval.
- Work in small slices; each slice leaves the app runnable and ends in a commit.
- Before saying a task is done: run typecheck, lint and tests, and show the output.
- Update docs/PROGRESS.md after each slice.
- Commit messages: Conventional Commits with the feature ID, e.g. "feat(sidebar): folders [F-05]".

## Don'ts

- Don't add dependencies without saying why; pin exact versions.
- Don't touch files unrelated to the current task.
- Don't work on features outside the current phase; add ideas to the backlog in PROGRESS.md.
- Don't use the deprecated BrowserView API; use WebContentsView.

## Environment notes (this machine)

- No admin rights: Node lives in ~/.local/node/bin and gh in ~/.local/bin (on PATH via ~/.zshrc). Never use sudo or Homebrew.
- Shells launched from VS Code may export ELECTRON_RUN_AS_NODE=1, which starts Electron as plain Node with no window. Run dev with `env -u ELECTRON_RUN_AS_NODE npm run dev`; the e2e tests strip it themselves.
- `ORBIT_USER_DATA_DIR=<dir>` gives the app a separate profile (the single-instance lock is per profile). E2E tests always use a temp dir — never point tests at the real profile.
- TypeScript is pinned to 6.0.x because typescript-eslint does not support 7.x yet. Revisit at each milestone.
- Preloads build as CommonJS (`out/preload/*.cjs`) because sandboxed renderers can't load ESM preloads.
- The user's Arc backup is at ~/ArcBackup/2026-11-01/ — outside the repo. Never copy personal data into the repo; importer fixtures must be trimmed and anonymised.
