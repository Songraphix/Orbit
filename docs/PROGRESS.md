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
- 2026-11-01 — Phase 1 step 2: persistence — `<userData>/orbit.db` (WAL), migration runner on `PRAGMA user_version` (per-migration transactions, refuses newer schemas), typed `SettingsRepository` (zod-validated, falls back to defaults on bad data)
- 2026-11-01 — Phase 1 step 3: WindowManager [F-01] — hidden inset title bar, traffic lights at (16, 18), `sidebar` vibrancy with a translucent theme tint, 44 px drag strip; window bounds + maximised state saved (debounced 500 ms, flushed on close) and restored safely across display changes
- 2026-11-01 — Phase 1 step 4: LayoutEngine v1 [F-01] — pure `computeLayout()` (sidebar, card, toolbar, web-view rects; 8 px inset, 10 px radius), per-window `LayoutEngine` in main pushing `state:layout`; sidebar ⌘S toggle (menu item, hides traffic lights with it) and drag-to-resize 200–400 px, both persisted; minimal app menu

- 2026-11-01 — Phase 1 step 5a: tabs [F-04, F-31] — `TabController` (one WebContentsView per tab; web tabs have no preload and may only navigate to http(s); `target=_blank` → new tab; favicons as data: URLs), `TabManager` per window, `state:tabs`; IPC surface roles (shell / overlay / internal); `classifyInput()` (tldts) for URL vs search; sidebar tab list with "+ New Tab", close, middle-click; File → New Tab ⌘T / Close Tab ⌘W; sidebar resize swaps the live page for a snapshot so the drag isn't swallowed by the web view
- 2026-11-01 — Phase 1 step 5b: new tab page [F-32] — `orbit://newtab` with 8 built-in gradient wallpapers, your own image (validated, downscaled, stored in the profile), clock + greeting, focused search box; `newtab:*` channels limited to internal pages
- 2026-11-01 — Phase 1 step 6: toolbar v1 [F-14] — back / forward / reload-or-stop, centred `domain / title` with lock for https, indeterminate loading bar, sidebar button when the sidebar is hidden; menu: Reload ⌘R, Force Reload ⇧⌘R, Back ⌘[, Forward ⌘], page DevTools ⌥⌘I; sidebar drag now uses document listeners (pointer capture was cancelled when the live view hid)
- 2026-11-01 — Phase 1 step 7: web compatibility [F-31] — reduced Chrome user agent (no "Electron"); `decideWindowOpen()` (pure): links → tabs (⌘-click → background), `window.open` with features → real sandboxed popup windows that keep `window.opener` (sign-in flows), non-web schemes refused; shared `guardWebContents()` applies the same rules to tabs and popups

## In progress

- Phase 1 step 8: web page right-click menu

## Decisions made

- 2026-11-01 — New tab page added at the owner's request (F-32): "+ New Tab" always opens it; ⌘T opens it until the Phase 2 command bar, then ⌘T → command bar

- Pinned versions: Electron 45.2.1 (Chromium 156, Node 24.22), electron-vite 6.0.0, Vite 8.3.5, React 19.3.1, TypeScript 6.0.3, Tailwind 4.3.3, Vitest 5.0.5, Playwright 1.64.1, electron-builder 26.18.0
- TypeScript 6.0.x rather than 7.x: typescript-eslint 8.72 supports `<6.1.0`
- Preloads output as CommonJS (`.cjs`) so the shell can stay `sandbox: true`
- 2026-11-01 — Built-in `node:sqlite` instead of better-sqlite3 (ADR-007): no native modules
- Phase-specific libraries (dnd-kit, cmdk, Motion, Zustand, …) are installed in the phase that first needs them, not up front

## Known issues

- Vibrancy can't be verified by automated tests (it's composited by macOS behind the page) — check by eye in `npm run dev`

- `npm audit`: moderate `minimatch` advisory inside electron-builder's dependency tree (build-time only, not shipped in the app). The suggested fix downgrades electron-builder to 20.x, so it is deferred; re-check at each milestone.
- VS Code-launched shells may set `ELECTRON_RUN_AS_NODE=1` (see CLAUDE.md)

## Annoyances (from dogfooding)

- (none yet)

## Backlog (ideas outside the current phase)

- Hover the left edge to reveal the hidden sidebar as a floating panel (F-01) — needs the overlay view, so it lands in Phase 2
- New tab page shortcut tiles (F-32): most-visited once history exists (Phase 2), favorites after the Arc import (Phase 3)
- Open new tab pages don't update live when the wallpaper changes elsewhere (they pick it up next time they open)
