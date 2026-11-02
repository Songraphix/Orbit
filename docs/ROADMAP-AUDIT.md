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
| AI page assistant            | **Done** (Phase 3)    | Anthropic key handling (Keychain) and Tidy already exist                                                         | Explicit, permissioned page access.                                  | High     |
| Creative / Developer toolkit | **Done** (Phase 3)    | Boosts, Developer Mode, area capture                                                                             | Small local utilities.                                               | Medium   |
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

## Phase 2 audit and plan — "Connect the workflow"

Acceptance (roadmap §5): _research a subject, save useful findings to a project, turn a finding
into a task, and resume the work from a saved workspace._

| Phase 2 item                                  | Status              | Evidence                                                                                            | Plan                                                                                                                                    |
| --------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Orbit Capture (URLs, text, screenshots, code) | **Build** (reuse)   | Area screenshots exist (Site Controls, Easels) via `CaptureRequests`; the page menu has no "save"   | P2.1: one Capture card in the overlay, fed by ⇧⌘S, the page's right-click menu and the command bar; reuses the area screenshot          |
| Project-linked research collections           | **Build**           | Nothing stores findings                                                                             | P2.1: captures belong to a project (or Unsorted); a Research section on the project page, a Research view; **Make Task** from a finding |
| Universal search                              | **Improve**         | ⌘T finds this Space's tabs, history, projects, tasks, notes (P1.3)                                  | P2.2: tabs in every Space, captures, archived tabs                                                                                      |
| Focus mode                                    | **Build** (minimal) | —                                                                                                   | P2.3: focus on a task: its workspace, sidebar out of the way, a timer pill with Done/End; survives a restart                            |
| Split Screen saved layouts / tab-to-pane      | **Improve**         | "Open in Split View" exists; a split ends when another tab is opened and isn't kept across restarts | P2.4: each Space keeps its split; going back to either tab brings it back; kept across restarts; ⌥⏎ in ⌘T opens a result in split       |
| Pinned web apps and quick launch              | **Keep**            | Favorites, pinned tabs, new tab shortcuts, Little Orbit, ⌘T                                         | Nothing to build                                                                                                                        |
| Reusable workspace templates                  | **Build**           | —                                                                                                   | P2.5: save a Space's tabs as a template; new Spaces (and project workspaces) from it; manage in Settings                                |

- 2026-11-01 — **P2.1 done**: Orbit Capture and project research (`capture.spec.ts`).
- 2026-11-01 — **P2.2 done**: universal search across Spaces, research and the archive (`universal-search.spec.ts`).
- 2026-11-01 — **P2.3 done**: Focus mode (`focus.spec.ts`).
- 2026-11-01 — **P2.4 done**: saved split layouts and ⌥⏎ to split (`split-layouts.spec.ts`).
- 2026-11-01 — **P2.5 done**: workspace templates (`templates.spec.ts`).
- 2026-11-01 — **Phase 2 done.** Acceptance passes end to end with a restart (`roadmap-phase2.spec.ts`).
  Next: Phase 3 (AI page assistant, summaries with sources, selection → notes/tasks, creative and
  developer toolkits), after the owner has used Phase 2.

## Phase 3 — "Make Orbit intelligent"

The owner asked (2026-11-01) to run Phases 3 and 4 without stopping, then audit the whole app.

| Roadmap item                                 | Status    | Built on                                     | What was done                                                                                                                                                                          |
| -------------------------------------------- | --------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI side panel with explicit page access      | **Build** | Productivity panel; Tidy's key store and SDK | P3.1: Assistant tab (⌘J, ✦): the page, a selection or research go only when attached; pages are read in an isolated world when the question is sent                                    |
| Summaries with source references             | **Build** | Anthropic citations                          | P3.2: Summarize Page; answers carry numbered sources that scroll the page to the cited passage (or open a finding at the quoted words)                                                 |
| Selected text → notes and tasks              | **Build** | Notes, Tasks, Capture's right-click menu     | P3.3: Ask About Selection, Make Tasks from Selection (structured output → pick → add), New Note from Selection; Save to Notes for any answer                                           |
| Questions across selected research           | **Build** | Captures (P2.1)                              | P3.4: attach a project's findings; answers cite them                                                                                                                                   |
| Creative Toolkit                             | **Build** | Area capture, Easels                         | P3.5: Pick Color (loupe), page palette, WCAG contrast with the nearest passing color, Image Info (format, size, EXIF, alt), CSS units/shadow/gradient, Annotate Screenshot on an Easel |
| Developer utilities                          | **Build** | Developer Mode                               | P3.6: JSON pages as a tree, a JSON formatter, Responsive Design Mode (device sizes via emulation), local dev servers in ⌘T and the Toolkit                                             |
| AI provider configuration, usage and privacy | **Build** | Settings → AI                                | P3.7: on/off, model, page-attach default, privacy note, monthly limit, activity log of what was sent (metadata only, migration 017)                                                    |

- 2026-11-02 — **P3.1–P3.4, P3.7 done**: the assistant (`assistant.spec.ts`).
- 2026-11-02 — **P3.5, P3.6 done**: the Toolkit (`toolkit.spec.ts`).
- 2026-11-02 — **Phase 3 done.** Acceptance — summary with sources, kept as a note and tasks,
  local tools, then a restart (the conversation is gone, the log and what you kept remain) — passes
  (`roadmap-phase3.spec.ts`).

## Phase 4 — "Build the Orbit ecosystem"

| Roadmap item                                      | Status    | Built on                         | What was done                                                                                                                                                            |
| ------------------------------------------------- | --------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Project templates (design, development, research) | **Build** | Projects, workspace templates    | P4.1: three built-in templates with starter tasks (due relative to the start); Save as Template from any project; Settings lists them                                    |
| Optional GitHub integration                       | **Build** | Live Folders' GitHub fetch       | P4.2: a project follows a repository — open PRs and issues on its page, each a task away; optional token (Keychain) for private repos                                    |
| Cloud storage and task services                   | **Build** | Research (captures), tasks       | P4.3: recognised service links (Figma, Google Docs, Notion, Linear, Jira…) open in split; tasks export to CSV/Markdown and import from other services' CSV or checklists |
| User-defined automation rules                     | **Build** | Little Orbit, archive policy     | P4.4: link routing for links from other apps (Space / Little Orbit / where you are); a Space's own archive time                                                          |
| Advanced tab and workspace management             | **Build** | Sidebar store                    | P4.5: Sort Today, Close Duplicate Tabs, Archive Tabs from Before Today (multi-select deferred to the backlog)                                                            |
| More creative and developer extensions            | **Build** | Toolkit (P3.5, P3.6)             | P4.6: fonts on the page, type scale; encode/decode, JWT, timestamps, UUIDs, regex tester                                                                                 |
| Optional sync and backup, clear privacy model     | **Build** | Daily database backup (PLAN 5.3) | P4.7: one-file backups to a chosen folder, daily option, passphrase encryption, restore at next start; sync = backups in a synced folder (no merging)                    |

- 2026-11-02 — **Phase 4 done.** Acceptance passes with a restart (`roadmap-phase4.spec.ts`). Next: an expert audit of the whole app.
