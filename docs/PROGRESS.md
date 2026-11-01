# Progress log

## Current phase: Phase 4 — Archive and tab lifecycle

Target end: 2026-12-17 · Branch: `phase-4/lifecycle` (Phase 3 merged to `main`)

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
- 2026-11-01 — Phase 1 step 8: web page right-click menu [F-31] — pure `buildContextMenu()` (links, images, selection + Google search, editable fields with spelling suggestions / Add to Dictionary / undo-redo-cut-copy-paste, page Back/Forward/Reload, Inspect Element); native menu wiring in `context-menu.ts`
- 2026-11-01 — Phase 1 step 9: HTML fullscreen [F-31] — page fullscreen (e.g. YouTube) puts the window in macOS fullscreen and gives the view the whole window with no chrome or corners; leaving (Esc, or the green button) restores the layout; window fullscreen is only undone if Orbit entered it
- 2026-11-01 — Phase 1 steps 10–11: menu — Tabs menu (⌃Tab / ⌃⇧Tab, ⌘1…⌘8, ⌘9 = last); session restore — migration 002 `tabs`, `TabsRepository`, tabs saved 500 ms after changes and on close; restored tabs keep title/favicon and only the active one loads (others load on first click); fixes: sidebar drag ignores Chromium's synthetic no-button hover move; exiting HTML fullscreen during the macOS enter animation is deferred until it finishes
- 2026-11-01 — Phase 2: history [F-21] — migration 003 (history + FTS5 + triggers, favicons by host, site_settings), `HistoryRepository` (visits, titles, frecency-ranked prefix search, top sites, bulk import for the Arc importer); tabs record visits/titles/favicons
- 2026-11-01 — Phase 2: overlay layer + command bar [F-21, F-22] — `OverlayController` (transparent top-most view, hidden when idle, focus returns to the page); command bar with results ranked in main (`buildResults`, pure): address / search first, switch-to-open-tab instead of duplicating, commands, history, Google suggestions (disabled in tests); ⌘T opens it (owner's choice), ⌘L / clicking the address edits the current URL; ⇧⌘C / ⇧⌥⌘C copy URL / Markdown link; ⇧⌘T reopens closed tabs (in memory, 25)
- 2026-11-01 — Phase 2: find, zoom, print, toasts [F-31] — find bar in the toolbar strip (⌘F, Enter/⌘G next, ⇧Enter/⇧⌘G previous, match count, Esc), `FindController` (unit-tested); zoom ⌘+/⌘−/⌘0 remembered per site in `site_settings` and re-applied on navigation; ⌘P print; toolbar toasts ("Copied link", "Zoom 120%") — **Phase 2 task list complete**
- 2026-11-01 — Phase 3: sidebar tree + Arc parsers — `sidebar/model.ts` (pure: favorites per profile, pinned/Today per space, nested folders, fractional keys, pin home-URL rules); Arc `StorableSidebar.json` and Chromium History parsers (verified locally against the owner's backup: 3 spaces, 12 favorites, 7 pinned, 6 Today)
- 2026-11-01 — Phase 3: spaces [F-02…F-08, F-16] — migration 004 (profiles, spaces, sidebar_items; Phase 1 tabs migrated in), `SidebarStore` (structure written at once, live details debounced), `TabManager` now store-driven (a tab gets a live page only when opened; Today closes remove, pinned/favorite closes unload and go home), sidebar UI (favorites grid, pinned + folders, space header with Clear, New Tab, Today, bottom bar with space switcher and +), native item/space/create menus (Img 5), inline rename, ⌘D pin, ⌃1…⌃9 / ⌘⌥←→ spaces, ThemeEngine (CSS variables, WCAG AA text) with preset themes and grain; fixes: closing the active tab activates the next; quitting no longer hangs on late page events (store closed before the DB; main-process errors logged, never a blocking dialog)
- 2026-11-01 — Phase 3: Arc importer [F-27] — File → Import from Arc… (and the command bar): finds the newest `~/ArcBackup/*` (then Arc's own folder, then asks), previews counts in a dialog, imports spaces (names, icons, themes, profiles), pinned folders, Today tabs, favorites and history; idempotent (spaces keyed by Arc id, favorites by URL, history merged). Verified locally against the owner's backup in a throwaway profile: 3 spaces, 12 favorites, 13 tabs
- 2026-11-01 — Phase 3: permissions + HTTP auth [F-31] — Electron grants every permission by default; now `PermissionService` on every profile session: harmless ones allowed, sensitive ones (camera/mic, location, notifications, clipboard read, screen share…) asked in an overlay prompt and remembered per site, insecure origins and unknown permissions refused (`decide()`, pure); HTTP Basic/Digest sign-in prompt; certificate errors keep Chromium's default (refuse)
- 2026-11-01 — Phase 3: drag and drop + profiles [F-04, F-05, F-17] — native HTML drag and drop in the sidebar (reorder, into/out of folders, Pinned ↔ Today, onto Favorites) with drop indicators; pure `moveFor()`; Set Profile › New Profile; `spaces:setProfile`; e2e proves a cookie set in one profile is invisible in another — **Phase 3 task list complete** (theme picker is presets via the space menu for now; swipe between spaces below the cut line)

## In progress

- Phase 4: archive + auto-archive, sleeping tabs, crash/unresponsive UI, daily DB backup, settings page

## Decisions made

- 2026-11-01 — Sidebar drag and drop uses native HTML drag events instead of dnd-kit: no dependency, and main validates every move anyway
- 2026-11-01 — Command bar list built in-house rather than with cmdk: results are ranked in main, so cmdk's own fuzzy filter would fight it, and it pulls in several Radix packages
- 2026-11-01 — New tabs open at the top of Today (Arc behaviour)
- 2026-11-01 — Default profile keeps Electron's default session so existing logins carry over; other profiles get `persist:profile-<id>`
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
- Full theme colour picker (colour wheel, intensity/grain sliders) — presets via the space menu for now (F-16)
- Swipe between spaces with two fingers (F-26, below the cut line)
- Open new tab pages don't update live when the wallpaper changes elsewhere (they pick it up next time they open)
