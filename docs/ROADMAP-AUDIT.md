# Roadmap audit (orbit_product_roadmap.md §6, §12)

Audited 2026-11-01 against the repository at `858af1b`. The code is the source of truth.
Orbit is Electron 45 (Chromium) + React + TypeScript; all user data lives in one SQLite
database in the main process (`node:sqlite`, migrations in `src/main/persistence/migrations`).

## Existing features

| Feature                                         | Status      | Evidence                                                                                         | Reason / next step                                          | Risk   |
| ----------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------ |
| Split Screen                                    | **Keep**    | `tabs/split.ts`, drag ratio, swap, exit; `split.spec.ts`                                         | Works and is tested. Saved layouts are Phase 2.             | Low    |
| Side Notes                                      | **Keep**    | Panel, quick note, floating, tabs; `notes.spec.ts` passes on prod and dev builds                 | Complete; connect to projects (P1.1).                       | Low    |
| Profiles                                        | **Keep**    | Separate session partition per profile; profile menu; `profiles.spec.ts`, `profile-menu.spec.ts` | Isolation is Chromium-level.                                | Low    |
| Spaces                                          | **Improve** | Per-space tabs, pinned, active tab, theme; persisted in SQLite                                   | Not connected to projects. Link, don't duplicate (P1.1).    | Medium |
| Custom New Tab                                  | **Keep**    | Clock, greeting, search, shortcuts, My Focus, quote; `newtab.spec.ts`                            | Preserve.                                                   | Low    |
| Navigation, tabs, history, downloads, shortcuts | **Keep**    | ~95 e2e tests                                                                                    | Preserve.                                                   | Low    |
| Settings                                        | **Keep**    | Sectioned Settings                                                                               | Small additions only.                                       | Low    |
| Crash handling                                  | **Keep**    | Crashed and frozen tabs are caught and offered a reload (`tab-controller.ts`)                    | Crash _reporting_ (upload) deferred: needs a privacy model. | Low    |

## New or partly missing features

| Feature                      | Status                | Evidence                                                                                                         | Reason / next step                                                   | Priority |
| ---------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------- |
| Projects and Tasks           | **Keep / Improve**    | Built 2026-11-01 (migration 013, `work.spec.ts`)                                                                 | Link to Spaces and Notes (P1.1).                                     | Critical |
| Project-linked workspaces    | **Build** (on Spaces) | Projects have no space today                                                                                     | A project can own a Space; "Open Workspace" resumes its tabs (P1.1). | Critical |
| Session save and restore     | **Improve**           | Tabs, spaces, active tab, window size and floating notes restore; the productivity panel and "where I was" don't | Restore the panel, and offer "Continue where you left off" (P1.2).   | Critical |
| Command palette              | **Improve**           | Command bar (⌘T/⌘L): tabs, history, commands, suggestions                                                        | Add projects, tasks and notes (P1.3), the base for universal search. | High     |
| Orbit Capture                | **Build** (Phase 2)   | Area capture exists for Easels                                                                                   | Capture page, selection or snippet into a project.                   | High     |
| Universal search             | **Build** (Phase 2)   | Command bar groundwork in P1.3                                                                                   | After data models settle.                                            | High     |
| Focus mode                   | **Build** (Phase 2)   | —                                                                                                                | Needs project/task context first (done in P1.1).                     | High     |
| AI page assistant            | **Build** (Phase 3)   | Anthropic key handling (Keychain) and Tidy already exist                                                         | Explicit, permissioned page access.                                  | High     |
| Creative / Developer toolkit | **Build** (Phase 3)   | Boosts, Developer Mode, area capture                                                                             | Small local utilities.                                               | Medium   |
| Project templates            | **Defer** (Phase 4)   | —                                                                                                                | After the basic workflow is validated.                               | Medium   |
| GitHub integration           | **Keep** (partial)    | Live Folders show PRs and issues                                                                                 | Deeper links in Phase 4.                                             | Later    |
| Automation engine, Sync      | **Defer**             | —                                                                                                                | Not validated; local data first.                                     | Later    |

## Phase 1 plan — "Make Orbit dependable"

Acceptance (roadmap §5): _open a project, continue a previous session, capture a note, complete
a task, close Orbit, and return without losing context._

- **P1.1 Projects ↔ Spaces ↔ Notes.** A project can be linked to a Space (an existing one, or a
  new one made for it); **Open Workspace** switches to it, and its tabs are there as they were.
  Notes can belong to a project; the project page lists them and adds new ones. Migration 014
  adds two nullable columns; no existing data changes.
- **P1.2 Resume.** Each project remembers when it was last opened; Projects shows **Continue
  where you left off**. The productivity panel reopens where it was after a restart.
- **P1.3 Command bar.** Projects, tasks and notes are searchable from ⌘T and open in the panel.
- **P1.4 Verify.** An end-to-end test of the acceptance scenario, including a restart.

Data safety: migrations only add nullable columns; the database is backed up daily
(`persistence/backup.ts`); sample data is never re-seeded.

## Status

- 2026-11-01 — **Phase 1 done** (P1.1–P1.4). Acceptance scenario passes end to end, with a
  restart, on production and development builds. Next: Phase 2 (Capture, research collections,
  universal search, Focus mode, saved split layouts, workspace templates), after the owner has
  used Phase 1.
