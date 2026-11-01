# Progress log

## Current phase: M1 buffer — owner dogfooding, then v0.1.0

Target: 2026-12-21 · Phases 0–4 merged to `main` · Unsigned DMG: `release/0.0.1/Orbit-0.0.1-arm64.dmg` (built 2026-11-01, smoke-tested)

## Needs the owner (can't be automated)

- [ ] Run Orbit for real: `npm run dev`, or open the DMG (right-click → Open the first time; it's unsigned)
- [ ] File → Import from Arc… (uses `~/ArcBackup/2026-11-01`)
- [ ] Sign in to Gmail / Google (verifies the Chrome user agent + popup sign-in, R2)
- [ ] YouTube fullscreen, Google Meet camera/mic prompt
- [ ] Two Google accounts in two spaces via space menu → Set Profile → New Profile
- [ ] Look at the translucent sidebar / theme colours (can't be screenshotted from here)
- [ ] Remaining Arc exports from PLAN.md "Do this first": passwords, Easels (no Boosts to move: the owner had none)
- [ ] Add your extensions: open each Web Store page in Orbit → site controls (sliders button) → Add to Orbit; then fill "Usage" / "Blocker?" in docs/reference/extensions.md

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
- 2026-11-01 — Phase 4: archive and tab lifecycle [F-03, F-20, F-25, F-31] — migration 005 `archive` + FTS; closing/clearing Today tabs archives them (reason recorded); ⇧⌘T and Archive → Archived Tabs (orbit://archive: search, grouped by day, restore) read from it; `TabLifecycle` auto-archives idle Today tabs (default 12 h; every 5 min and on wake) and sleeps pages (idle 30 min / max 8 awake; never the active or an audible tab) via pure `tabsToArchive` / `tabsToSleep`; crashed pages show a Reload card, frozen pages offer Wait / Reload; daily `VACUUM INTO` backup keeping 7; Settings page (⌘,) — **Phase 4 complete → M1 feature-complete**; unsigned arm64 DMG builds and the packaged app passes a smoke test
- 2026-11-01 — Phase 5: downloads and media [F-09, F-10] — `DownloadService` on every profile session (straight to ~/Downloads, never overwrites, progress, thumbnails/file icons, migration 006); shelf above the bottom bar (Img 7: open, ⌘-click reveal, drag out, dismiss/cancel); `MediaController` + sidebar mini player (Img 1) for the background tab that's playing: play/pause, mute, Picture-in-Picture, jump to tab, stop — **Phase 5 complete** except previous/next track and automatic PiP (backlog)

- 2026-11-01 — Phase 6: Little Orbit + default browser [F-24, F-31] — links from other apps (`open-url`, queued until ready) open in a small floating window (520×720, vibrancy) with an "Open in Orbit" bar that moves the page into the main window; only http(s) accepted; Settings → "Make Orbit the default browser" (the packaged app registers http/https)
- 2026-11-01 — Phase 6: split view [F-13] — two tabs side by side, each with its own toolbar (Img 6); `computeLayout` returns panes + divider (8 px gap, ratio clamped 0.2–0.8); pure `split.ts`; Tabs → New Split View ⌃⇧= (with a new tab page), sidebar right-click → Open in Split View, swap and "show this page alone" buttons; clicking a pane (toolbar or page) focuses it and outlines it; dragging the divider resizes (pages hidden meanwhile), double-click evens it out; activating any other tab, closing a pane or switching space leaves the split; HTML fullscreen gives the focused pane the window. Not persisted across relaunches yet (backlog)

- 2026-11-01 — Phase 6: Peek [F-23] — links from pinned tabs and favorites that open a new tab on another site (registrable domain, pure `shouldPeek`) open in a floating preview: page above the overlay, frame/header/backdrop drawn by the overlay (`computePeek`); Open as Tab adopts the same webContents into Today (no reload, verified by e2e), Esc / backdrop / × close; Settings → Peek toggle, per-site `peek = off` in site_settings (UI with site controls, Phase 7)

- 2026-11-01 — Phase 6: ⌥⌘N Little Orbit [F-24] — File → New Little Orbit Window and a global ⌥⌘N (Settings toggle, on by default; quietly skipped if another app owns it) open an empty Little Orbit whose bar takes an address or search; clicking the address of any Little Orbit edits it — **Phase 6 complete** (split restore, drag-to-edge split and the sidebar split item are in the backlog)

- 2026-11-01 — Phase 7: site controls popover + Developer Mode [F-12, F-30] — toolbar sliders button opens the Img 3 popover in the overlay: Share (macOS share sheet), Screenshot (visible page → clipboard), Copy Link, Boost placeholder; settings for this site (Notifications, Preview/Peek, Developer Mode, plus camera/mic/location once asked) as native radio menus over `site_settings` (pure `siteSettingRows` / `storedValueFor`); Secure / Not Secure footer and "…" (copy, reset zoom, clear site data with confirmation). Developer Mode per site: full URL in the toolbar, DevTools button with console-error badge, no Peek and no auto-archive; suggested for localhost / 127.0.0.1. Extensions grid is a placeholder until the extensions slice

- 2026-11-01 — Phase 7: Chrome extensions (ADR-008) — `electron-chrome-extensions@4.9.0` per profile session (chrome.tabs/windows/action…, tabs announced as they become web pages, extension context-menu items in the page menu) and `electron-chrome-web-store@0.13.0` for downloads only: on a Web Store page, Site controls → **Add to Orbit** (native confirmation; ID taken from the tab's URL, the store page gets no API); extension buttons with icons and badges in the site controls grid open their popups, right-click → Options / Remove; updates checked every 6 h. All 11 audited extensions install, load and run their service workers (docs/reference/extensions.md); packaged app includes the new modules and launches clean

- 2026-11-01 — Phase 7: area screenshot [F-12] — the camera action dims the page in the overlay; drag an area (or click for the whole page, Esc cancels) and it's copied to the clipboard at device resolution (pure `cropToPage`) — **Phase 7 complete** (saving captures to the Library comes with Phase 9; Boosts in the popover with Phase 8)

- 2026-11-01 — Phase 8: Boosts [F-18] — `boosts` table (migration 007) and `BoostService`: every webContents Electron creates (tabs, Peek, Little Orbit, popups) gets matching Boosts' CSS on each navigation via `insertCSS`, removed and re-inserted live as Boosts change; Boost JS runs at dom-ready in an isolated world (never the page's own). Orbit's own surfaces are never boosted. Editor at `orbit://boost/<id>` (CodeMirror 6) opens in split view beside the site: name, website (normalised; matches subdomains), on/off, colours (hue swatches + hue / saturation / brightness sliders, Dark = invert with media re-inverted), font (list or any font name), zapped elements, CSS and JS with Reload Pages; the editor page may only read and change its own Boost. Zap: click elements to hide them until Esc (picker in the isolated world; selectors validated so they can't break out of a CSS rule). Site controls: Boost button creates one, Boosts for the site listed with on/off switches, "Zap Elements…". + menu → New Boost (and New Split) enabled; "New Boost" command. Pure `model.ts` (matching, CSS for colour / font / zap). **Phase 8 complete in code**; re-creating your own Boosts needs their CSS/JS from Arc (owner checklist). Library → Boosts comes with Phase 9

- 2026-11-01 — Phase 9: Library [F-11] — the sidebar's Library button switches it to the six sections as tiles (Img 4) with a back arrow; the content area shows `orbit://library/<section>` in a per-window view (`LibraryController`) while the pages stay loaded but hidden, and opening any tab leaves the Library. Media: images/videos from downloads plus screenshots, which are now also saved to `<userData>/Captures` (Quick Look thumbnails as JPEG data URLs; open / Show in Finder). Downloads: every download from SQLite, searchable, with open / reveal and "moved or deleted" detection. Spaces: open, move up/down, rename, delete (confirmed). Boosts: on/off, edit, delete. Archived Tabs: the existing page. Library pages may only be the window's own Library view (checked in main); sections switch by hash, without reloading. "Library" command. Fixed: leaving a new space's rename field without typing saved the previous space's name onto it

## In progress

- Phase 9: Easels [F-19]

## Decisions made

- 2026-11-01 — Sidebar drag and drop uses native HTML drag events instead of dnd-kit: no dependency, and main validates every move anyway
- 2026-11-01 — Command bar list built in-house rather than with cmdk: results are ranked in main, so cmdk's own fuzzy filter would fight it, and it pulls in several Radix packages
- 2026-11-01 — New tabs open at the top of Today (Arc behaviour)
- 2026-11-01 — Default profile keeps Electron's default session so existing logins carry over; other profiles get `persist:profile-<id>`
- 2026-11-01 — Extensions: pinned to the newest releases older than two weeks; the store page's install preload is not used, so no page JavaScript gains an API (ADR-008). GPL-3.0 licence: fine while Orbit stays personal
- 2026-11-01 — Peek v1 catches links that would open a new tab (target=_blank, window.open), not same-tab navigations: those include OAuth/SSO redirects that must stay in the pinned tab. Covers Gmail, Slack, etc.
- 2026-11-01 — Boost JS runs in an isolated world (like Arc's Boosts, which are content scripts), so it shares the DOM but not the page's globals; CSS changes apply live, JS changes need Reload Pages
- 2026-11-01 — CodeMirror 6 (`codemirror@6.0.2` + lang-css / lang-javascript); four transitive packages pinned via `overrides` to releases older than two weeks
- 2026-11-01 — Split view v1 is two panes and not persisted; a split tree and restore come later (backlog)
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

- Site controls: Automatic Picture-in-Picture setting (with auto-PiP itself), certificate details on the Secure badge, full-page screenshots and saving captures to the Library (Phase 9)
- Remember split views across relaunches; split more than two panes; drag a sidebar tab onto a page edge to split; show the split as one item in the sidebar (F-13)
- Hover the left edge to reveal the hidden sidebar as a floating panel (F-01) — needs the overlay view, so it lands in Phase 2
- New tab page shortcut tiles (F-32): most-visited once history exists (Phase 2), favorites after the Arc import (Phase 3)
- Full theme colour picker (colour wheel, intensity/grain sliders) — presets via the space menu for now (F-16)
- Swipe between spaces with two fingers (F-26, below the cut line)
- Mini player: previous/next track (needs a page-world mediaSession bridge) and automatic Picture-in-Picture when switching away (needs the per-site setting from Phase 7)
- Speaker icon on tab rows that are playing audio
- Open new tab pages don't update live when the wallpaper changes elsewhere (they pick it up next time they open)
