# Project Orbit — Rebuilding Arc: The Master Plan

> **Codename:** "Orbit" is a placeholder — rename it to whatever you like.
> **Owner:** You (product owner + reviewer) · **Implementers:** Claude Code (primary), Antigravity (parallel work + review)
> **Target platform:** macOS on Apple Silicon first
> **Version:** 1.0 · **Created:** 31 Oct 2026 · **Arc sunset date (from The Browser Company's email):** 22 Dec 2026
>
> Building an Arc look-alike for your own use is fine. If you ever distribute it, don't use the Arc name, logo or icons — those belong to The Browser Company.

---

## ⚠️ Do this first: back up your Arc data (time-sensitive)

Before writing a single line of code, protect your data. The importer in Phase 3 depends on these files, and some Arc data may live on their servers rather than on your Mac.

- [ ] **Quit Arc**, then copy the entire folder `~/Library/Application Support/Arc/` to a safe place, e.g. `~/ArcBackup/2026-11-01/`. It typically contains your sidebar state (look for `StorableSidebar.json` and other `Storable*.json` files) and the Chromium profile under `User Data/` (history, preferences). Exact contents vary by Arc version, so copy everything.
- [ ] **Passwords:** if you used Arc's built-in password manager, export them to CSV from Arc's password settings, import them into Apple Passwords / 1Password / Bitwarden, then delete the CSV.
- [ ] **Boosts:** open each Boost and copy its CSS/JS into `~/ArcBackup/boosts/<name>.css` / `.js`. They may not be stored in plain local files.
- [ ] **Easels:** export or screenshot every Easel. They may live on Arc's servers.
- [ ] **Sidebar reference:** screenshot every Space (pinned tabs, folders, favorites, theme colours). You've already started — keep these in `docs/reference/`.
- [ ] **Extensions:** list every extension you use with its Chrome Web Store link (see the audit in Phase 0).
- [ ] **Read the full FAQ** linked in the email to learn whether the Arc app keeps working locally after 22 Dec or stops entirely. That decides how much buffer you have.

---

## How to use this document

This file is the single source of truth for the project. It lives at `docs/PLAN.md` in the repository, and Claude Code reads it (together with `CLAUDE.md`) at the start of every working session.

- Every feature has an ID (`F-01` … `F-32`). Phases, commits and pull requests reference these IDs.
- When a technical decision changes, update this document **and** add an Architecture Decision Record (ADR) in `docs/decisions/`.
- Progress is tracked in `docs/PROGRESS.md` (template in Appendix D), not in this file, so this plan stays clean.
- Screenshots of the real Arc live in `docs/reference/` and are referenced as "Img 1–7" below.

## Table of contents

1. Vision and product principles
2. Feature inventory (from your screenshots)
3. Key technical decisions
4. Architecture
5. Data model and persistence
6. Repository structure and conventions
7. Feature specifications
8. Execution plan: milestones and phases
9. Working with Claude Code and Antigravity
10. Quality: testing, performance and dogfooding
11. Risk register
12. Packaging, signing and updates
13. Appendices (shortcuts, CLAUDE.md starter, ADR template, PROGRESS template, glossary, references)

---

## 1. Vision and product principles

Orbit is a calm, sidebar-first, keyboard-driven Chromium browser for macOS that recreates the parts of Arc you rely on every day, then goes beyond them where Arc never did. It is personal software: it is built for one demanding user first, which means it can be opinionated, skip edge cases that only matter at the scale of millions of users, and ship features in the order you actually need them.

These principles settle design arguments. When two options are both reasonable, pick the one that honours more of them.

1. **The sidebar is the browser.** Tabs, spaces, media, downloads and the library all live in the sidebar. The page gets the rest of the window with minimal chrome.
2. **Calm by default.** Unpinned tabs archive themselves. Clutter is temporary; anything important gets pinned.
3. **Keyboard-first.** Everything is reachable from the command bar (⌘T). Every frequent action has a shortcut.
4. **Spaces separate lives.** Work, personal and project contexts each get their own tabs, theme and (optionally) their own logins via profiles.
5. **Never slower than Chrome.** Tab switching feels instant, the sidebar never stutters, and idle tabs sleep aggressively to save memory.
6. **Local-first and private.** Your data stays on your Mac. No account, no telemetry, no server dependency.
7. **Fluid and beautiful.** Motion, vibrancy, gradients and rounded content are features, not decoration — they're a big part of why Arc felt good.

**Non-goals for v1:** Windows/Linux builds, a mobile app, cross-device sync, public Space sharing, and a custom rendering engine.

---

## 2. Feature inventory (from your screenshots)

**Priority key:** **P0** = required for the daily-driver milestone · **P1** = Arc parity · **P2** = nice to have / beyond Arc.

### 2.1 Features visible in your screenshots

| ID | Feature | Seen in | What it does | Priority | Phase |
|---|---|---|---|---|---|
| F-01 | Sidebar shell | Img 5, 6, 7 | Traffic lights inside the sidebar, translucent vibrancy background, collapsible (⌘S), resizable | P0 | 1 |
| F-02 | Favorites grid | Img 5, 6 | 3-column grid of rounded app tiles (Gmail, YouTube, Docs, Canva, Drive, ChatGPT, Pinterest, Keep, Figma, Claude, WhatsApp) with notification badges (Gmail red dot) and overlay icons | P0 | 3 |
| F-03 | Space header with Tidy / Clear | Img 5 | Space icon + name ("silence") on a divider line, with **Tidy** (AI grouping) and **Clear** (archive all Today tabs) | P0 (Clear) / P2 (Tidy) | 3, 4, 10 |
| F-04 | Pinned vs Today tabs + "New Tab" row | Img 5 | Pinned tabs persist above the divider; Today tabs below "+ New Tab" are temporary | P0 | 3 |
| F-05 | Folders / grouped sections | Img 5 | Collapsible groups such as "The Wood" and "Other" | P0 | 3 |
| F-06 | Space context menu | Img 5, 6 | Change Space Icon, Rename Space, Edit Theme Color, Set Profile ›, New Folder, Live Folders ›, Share Space, Export "<space>" into Folder ›, Manage Spaces, Delete Space | P0 (core) / P2 (Live Folders, Share) | 3, 10 |
| F-07 | Bottom bar | Img 1, 2, 7 | Library button (left), Space switcher icons (middle), "+" button (right) | P0 | 3 |
| F-08 | "+" create menu | Img 2 | New Space, New Folder, New Easel (⌃⇧E), New Boost, New Split (⌃⇧=), New Tab (⌘T) | P0 (menu) — items enabled as features land | 3+ |
| F-09 | Sidebar mini media player | Img 1 | Now-playing title, previous / play-pause / next, volume, pop-out (Picture-in-Picture), close | P1 | 5 |
| F-10 | Sidebar downloads shelf | Img 7 | Recent downloads with thumbnails and relative times ("27 minutes ago"), draggable into other apps | P1 | 5 |
| F-11 | Library | Img 4 | Media, Downloads, Easels, Spaces, Boosts, Archived Tabs | P1 | 4 (Archive), 9 (rest) |
| F-12 | Site controls popover | Img 3 | Quick-action row (share, boost, screenshot, capture), extensions grid with "+", Boosts for this site, per-site settings (Notifications, Preview, Developer Mode, Automatic Picture-in-Picture), "Secure" badge, "…" menu | P1 | 7 |
| F-13 | Split view | Img 6 | Two (up to four) pages side by side, each with its own compact toolbar | P1 | 6 |
| F-14 | Compact toolbar | Img 6 | Back / forward / reload, "domain / page title" URL display, pinned extension icons, site controls button, sidebar/split button | P0 | 1–2 |
| F-15 | Native macOS menu bar | Img 6 | App, File, Edit, View, Spaces, Tabs, Archive, Extensions, Window, Help | P0 | 1 (grows each phase) |
| F-16 | Per-space theme | Img 5 | Gradient colour theme per space, edited via "Edit Theme Color…" | P0 | 3 |
| F-17 | Profiles per space | Img 5 | Each space can use a different profile (separate cookies and logins) | P0 | 3 |
| F-18 | Boosts | Img 2, 3, 4 | Per-site CSS/JS customisations, colours, fonts and "zap" element removal | P1 | 8 |
| F-19 | Easels | Img 2, 4 | Freeform canvas for notes, drawings and web captures | P2 | 9 |
| F-20 | Archived tabs + auto-archive | Img 4 | Idle Today tabs move to the archive automatically; searchable and restorable | P0 | 4 |

### 2.2 Core Arc features not in the screenshots

| ID | Feature | What it does | Priority | Phase |
|---|---|---|---|---|
| F-21 | Command bar | ⌘T overlay that searches open tabs, pinned tabs, history and the web, and runs commands | P0 | 2 |
| F-22 | Copy URL | ⇧⌘C copies the current URL with a small toast | P0 | 2 |
| F-23 | Peek | Links from pinned tabs to other sites open in a floating preview that can be expanded into a tab | P1 | 6 |
| F-24 | Little Arc ("Little Orbit") | Links opened from other apps open in a small floating window with an "Open in Orbit" button | P1 | 6 |
| F-25 | Sleeping tabs | Idle tabs unload to save memory and reload instantly on click | P0 | 4 |
| F-26 | Swipe between spaces | Two-finger horizontal swipe on the sidebar switches spaces with an animated theme change | P1 | 3 |
| F-27 | Arc importer | Imports your spaces, pinned tabs, folders, favorites and history from the Arc backup | P0 | 3 |
| F-28 | Live Folders | Folders that fill themselves from a source (RSS feed, GitHub pull requests, etc.) | P2 | 10 |
| F-29 | Tidy (AI) | Groups and names Today tabs automatically using an LLM | P2 | 10 |
| F-30 | Developer mode | Per-site full URL display, quick DevTools, localhost-friendly behaviour | P1 | 7 |
| F-31 | Browser plumbing | Right-click menus, find in page, zoom, print, HTML fullscreen, popups/OAuth, HTTP auth, certificate errors, permission prompts, crash recovery, history | P0 | 1–4 |
| F-32 | New tab page | Wallpaper (built-in gradients or your own image), clock and greeting, search box; opened by "+ New Tab" (and ⌘T until Phase 2) — owner request, not in Arc | P0 | 1 |

### 2.3 Out of scope (for now)

Share Space (needs a server), cross-device sync, Windows/Linux, mobile, Arc Search, and an AI chat inside the command bar. Each can be revisited after Milestone 3; write an ADR before starting any of them.

---

## 3. Key technical decisions

Each decision below gets its own ADR in `docs/decisions/` during Phase 0 (template in Appendix C).

### 3.1 ADR-001 — Engine and shell: Electron (Chromium)

| Option | Time to daily driver | Chrome extensions | Web compatibility | UI dev speed with AI tools | Memory | Verdict |
|---|---|---|---|---|---|---|
| **Electron + React** | Weeks | Good (via `electron-chrome-extensions`), not perfect | Excellent (real Chromium) | Excellent | Higher | ✅ **Chosen** |
| Fork Chromium (what Arc, Brave, Vivaldi do) | Many months | Full | Excellent | Slow (C++, 30 GB+ source, multi-hour builds) | Best | Later, only if Orbit outgrows Electron |
| Native Swift + WKWebView | Months | None (Safari extensions only) | Safari quirks | Medium | Good | ❌ |
| Tauri | Weeks | None on macOS (uses WebKit) | Safari quirks | Good | Good | ❌ |
| Fork Zen Browser (Firefox) | Days to start | Firefox extensions, not Chrome | Good | Medium (Firefox internals) | Good | ❌ for this project, but a good bridge browser and design reference |

**Rationale.** Electron gives you real Chromium, so Gmail, Figma, YouTube and Canva behave exactly as they do in Chrome and Arc. The entire UI is written in React and TypeScript, which is where Claude Code is strongest, and Chrome extensions are achievable. A Chromium fork is the "proper" long-term route, but it would delay a usable browser by months, and you need one before 22 Dec.

**Escape hatch.** The renderer UI talks to the browser only through a typed IPC contract (section 4.3). If Orbit ever moves to a Chromium fork, the React UI and most of the domain logic (sidebar tree, archive policy, themes) can be carried over.

### 3.2 ADR-002 — Platform: macOS on Apple Silicon first

Your setup is macOS. Targeting one platform lets the app use vibrancy, the native menu bar, the share sheet, Keychain-backed encryption and trackpad gestures without abstraction layers. Code stays cross-platform where it's free to do so, but nothing is tested on Windows/Linux in v1.

### 3.3 ADR-003 — Technology stack

| Concern | Choice | Notes |
|---|---|---|
| Runtime | Electron (latest stable at project start) | Pin the exact version. Use `WebContentsView`, not the deprecated `BrowserView`. |
| Build tooling | electron-vite | Fast HMR for the UI; multiple renderer entry points (shell, overlay, internal pages). |
| Language | TypeScript, `strict: true` | No `any` without a comment explaining why. |
| UI | React | Function components and hooks only. |
| Styling | Tailwind CSS + CSS custom properties | Theme tokens are CSS variables so spaces can re-theme instantly. |
| Animation | Motion (formerly Framer Motion) | Space switching, sidebar collapse, tab reordering. |
| Drag and drop | dnd-kit | Tree reordering in the sidebar, drag-to-split. |
| Command palette | cmdk | Base for the command bar. |
| Long lists | @tanstack/react-virtual | Archive, history and very long Today lists. |
| UI state | Zustand (renderer) | Mirrors main-process state; holds view-only state (hover, open menus). |
| Validation | zod | Every IPC payload is validated in the main process. |
| Database | SQLite via the built-in `node:sqlite` module (ADR-007) | WAL mode, FTS5 full-text search for history and archive. Ships inside Electron — no native module to rebuild. |
| Ordering | fractional-indexing | Reorder sidebar items without renumbering siblings. |
| URL parsing | tldts | Decides whether omnibox input is a URL or a search. |
| Code editor (Boosts) | CodeMirror 6 | Lighter than Monaco. |
| Canvas (Easels) | Excalidraw | MIT licensed. |
| Extensions | electron-chrome-extensions + electron-chrome-web-store | Adds many `chrome.*` APIs and Chrome Web Store installs on top of Electron's built-in support. |
| Icons | lucide-react | Plus custom SVGs where Arc-like icons are needed. |
| Unit tests | Vitest | Pure logic and services with mocked Electron. |
| End-to-end tests | Playwright (Electron support) | Launches the real app. |
| Packaging | electron-builder (+ electron-updater later) | DMG for arm64. |
| Linting | ESLint + Prettier | Enforced in a pre-commit hook. |

### 3.4 ADR-004 — The main process is the single source of truth

All browser state (windows, spaces, sidebar tree, tabs, downloads, media) lives in the main process. Renderers send **intents** ("activate tab X", "move item Y into folder Z") and receive **state** back. Renderers never own persistent state and never call Electron APIs directly. This prevents the classic Electron bug where the sidebar and the actual web views drift out of sync.

### 3.5 ADR-005 — SQLite for persistence

History search, archive search and the sidebar tree all benefit from a real database with full-text search. JSON files are fine for settings but become fragile for thousands of history entries. SQLite in WAL mode is crash-safe and fast. *(Library choice superseded by ADR-007: built-in `node:sqlite` instead of better-sqlite3.)*

### 3.6 ADR-006 — A dedicated overlay layer for popovers

Web pages are native `WebContentsView`s drawn on top of the shell UI, which means any HTML popover in the shell renderer (command bar, site controls, menus) would be hidden behind the page. Orbit therefore has a transparent, top-most **overlay view** that hosts every floating UI element. Simple right-click menus use native macOS menus instead (your space context menu in Img 5 is a native menu, too). Details in section 4.5.

---

## 4. Architecture

### 4.1 Big picture

```
┌──────────────────────────────── BrowserWindow (macOS, vibrancy, hidden title bar) ───────────────────────────────┐
│                                                                                                                  │
│  ┌──────── Shell renderer (React) — the window's own webContents, fills the window ───────────────────────────┐ │
│  │  SIDEBAR                                    │  TOOLBAR STRIP(S) drawn above each web view                   │ │
│  │  • traffic lights + sidebar toggle          │  ┌───────── WebContentsView (active tab) ─────────────────┐   │ │
│  │  • favorites grid                           │  │                                                       │   │ │
│  │  • space header · Tidy · Clear              │  │   Gmail / YouTube / any web page                      │   │ │
│  │  • pinned tabs · + New Tab · Today tabs     │  │   (sandboxed, rounded corners, inset from edges)      │   │ │
│  │  • media player · downloads shelf           │  │                                                       │   │ │
│  │  • bottom bar: Library · spaces · +         │  └───────────────────────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                                  │
│  ┌──────── Overlay WebContentsView (transparent, top-most, hidden unless something is open) ──────────────────┐  │
│  │  command bar · site-controls popover · permission prompts · find bar · Peek frame · toasts · floating sidebar│  │
│  └──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                          ▲  intents (renderer → main)          │  state snapshots / patches (main → renderers)
                          │                                      ▼
┌──────────────────────────────────────────── Main process: the "kernel" ─────────────────────────────────────────┐
│ WindowManager · LayoutEngine · TabManager / TabController · SpaceManager · ProfileManager (sessions)            │
│ SidebarStore · ArchiveService · HistoryService · DownloadService · MediaService · BoostService                  │
│ PermissionService · ExtensionHost · MenuService / ShortcutService · Persistence (SQLite) · Importer · AIService │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Surfaces (what runs where)

| Surface | What it is | Privileges | Content |
|---|---|---|---|
| **Shell renderer** | The `BrowserWindow`'s own webContents | Preload exposes the typed `orbit` API via `contextBridge` | Sidebar, toolbars, split dividers, bottom bar |
| **Overlay renderer** | A transparent `WebContentsView` added last (top-most) | Same typed API as the shell | Command bar, popovers, prompts, find bar, Peek, toasts |
| **Internal pages** | `orbit://` URLs served by `protocol.handle` | A smaller, page-specific API; origin checked in main | Library, Settings, Boost editor, Easels, Archive, error pages |
| **Web content** | One `WebContentsView` per live tab | None. `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false` | The open web |
| **Little Orbit window** | A small separate `BrowserWindow` | Shell API (reduced) | One tab + "Open in Orbit" button |

**Note on scripts inside web pages.** Some features (media controls, Boost "zap", Peek link detection) need code inside the page. Orbit uses a tiny web preload running in an isolated world that never exposes anything to the page's JavaScript. Where page-world access is needed (e.g. reading `navigator.mediaSession` handlers), main injects code with `webContents.executeJavaScript` and listens for replies through a nonce-tagged `postMessage` bridge.

### 4.3 Main-process services

| Service | Responsibility | Key Electron APIs |
|---|---|---|
| WindowManager | Creates/restores windows, vibrancy, traffic-light position, fullscreen | `BrowserWindow`, `titleBarStyle: 'hiddenInset'`, `trafficLightPosition`, `vibrancy` |
| LayoutEngine | Computes the rectangle of every web view and toolbar from window size, sidebar width, split tree and fullscreen state | `view.setBounds`, `view.setBorderRadius` |
| TabManager / TabController | Creates, activates, sleeps, wakes and destroys tabs; owns each tab's `WebContentsView` | `WebContentsView`, `webContents` events |
| SpaceManager | Spaces CRUD, active space per window, themes | — |
| ProfileManager | One Electron session per profile | `session.fromPartition('persist:profile-<id>')` |
| SidebarStore | The tree of favorites, pinned items, folders, Today tabs and splits; all tree operations | — |
| ArchiveService | Auto-archive policy, Clear, restore, search | timers, SQLite FTS5 |
| HistoryService | Records visits, powers command-bar search | `did-navigate`, `did-navigate-in-page`, `page-title-updated` |
| FaviconService | Fetches and caches favicons, serves them to the UI | `page-favicon-updated`, `net.fetch`, custom protocol |
| DownloadService | Download lifecycle, thumbnails, drag-out | `session.on('will-download')`, `nativeImage.createThumbnailFromPath`, `webContents.startDrag` |
| MediaService | Tracks playing media across tabs, controls, PiP | `media-started-playing`, `media-paused`, `audio-state-changed`, `executeJavaScript(code, true)` |
| PermissionService | Per-origin, per-profile permission decisions and prompts | `setPermissionRequestHandler`, `setPermissionCheckHandler` |
| ExtensionHost | Loads/installs Chrome extensions per profile, toolbar actions | `electron-chrome-extensions`, `electron-chrome-web-store` |
| BoostService | Stores Boosts, injects CSS/JS on matching sites | `insertCSS`, `executeJavaScript` |
| MenuService / ShortcutService | Native menu bar (with accelerators), context menus, global shortcuts | `Menu`, `globalShortcut`, `before-input-event` |
| Persistence | SQLite connection, migrations, repositories, backups | `node:sqlite` (`DatabaseSync`) |
| Importer | Reads the Arc backup and creates spaces/tabs/history | fs, SQLite |
| AIService | Tidy, tab naming (Phase 10) | `safeStorage` for the API key |

### 4.4 State and IPC

**Pattern: intents up, state down.**

- The renderer calls `window.orbit.invoke('tabs:activate', { tabId })`. Main validates the payload with zod, checks the sender is a trusted surface (shell, overlay or a specific internal page), applies the change, persists it, and broadcasts new state.
- Main pushes state to renderers on a few channels (`state:sidebar`, `state:tabs`, `state:media`, `state:downloads`, `state:layout`). **Start with full snapshots** for each slice — a sidebar with a few hundred items serialises in well under a millisecond. Move to patches (e.g. Immer patches) only if profiling shows a need.
- Channel names follow `domain:verb` (`spaces:create`, `sidebar:move`, `archive:restore`).

```ts
// src/shared/ipc/contract.ts — one place defines every channel
import { z } from 'zod';

export const contract = {
  'tabs:activate':   { input: z.object({ tabId: z.string() }),                                output: z.void() },
  'tabs:create':     { input: z.object({ url: z.string().optional(), spaceId: z.string() }),  output: z.object({ tabId: z.string() }) },
  'sidebar:move':    { input: z.object({ itemId: z.string(), parentId: z.string().nullable(),
                                         section: z.enum(['favorite', 'pinned', 'today']),
                                         beforeId: z.string().nullable() }),                    output: z.void() },
  'spaces:activate': { input: z.object({ spaceId: z.string(), windowId: z.number() }),        output: z.void() },
} as const;
// main/ipc/router.ts registers handlers from this map and rejects anything not in it.
// preload/shell.ts exposes a typed invoke() generated from the same map.
```

### 4.5 The z-order problem and the overlay view

`WebContentsView`s are native layers composited **above** the window's own webContents. Consequences and solutions:

| Need | Solution |
|---|---|
| Command bar, site-controls popover, find bar, permission prompts, toasts | Render in the **overlay view**. When opened, main makes the overlay visible and sizes it to the whole window; clicking the transparent area closes it. When nothing is open, the overlay is hidden so it never steals clicks. |
| Right-click menus on tabs/spaces, simple dropdowns | Native `Menu.popup()` — instant, accessible and looks like Arc's (Img 5). |
| Sidebar "peek" when the sidebar is hidden | Leave a thin strip (~6 px) at the left edge uncovered by the web view. Hovering it shows the sidebar as a floating panel rendered in the overlay view, using the same React components. |
| Drag-to-split (dragging a tab over the page) | During a drag, show the overlay with drop zones; the overlay receives the pointer events instead of the page. |

### 4.6 Layout engine

The main process owns layout so the web views and the shell UI can never disagree.

- **Inputs:** window content size, sidebar width and visibility, toolbar visible (yes/no), split tree of the active item, HTML-fullscreen state, Peek state.
- **Output:** a `Layout` object containing rectangles for each web view, each toolbar strip and each split divider. Main applies the web-view rectangles and sends the same object to the shell renderer, which draws toolbars and dividers exactly where the views are.
- **Arc-like defaults:** 8 px inset around the content area, 10 px corner radius on web views, 240–300 px sidebar width.
- **Resizing the sidebar:** the renderer sends width updates (throttled to animation frames); main recomputes and applies.
- **HTML fullscreen** (YouTube's fullscreen button): on `enter-html-full-screen`, make the window fullscreen and give the view the entire window with zero radius; restore on `leave-html-full-screen`. Electron does not do this for you.

### 4.7 Tab lifecycle

```
           create / wake                        becomes active
 [Sleeping] ─────────────▶ [Loading] ───────▶ [Live · visible] ◀──────────┐
     ▲                                             │  another tab active   │ clicked
     │ LRU eviction / idle timeout                 ▼                       │
     └──────────────────────────────────────── [Live · hidden] ────────────┘
                                                   │ renderer crashed
                                                   ▼
                                               [Crashed] → "Reload" UI
```

- A **sleeping** tab keeps its URL, title and favicon but has no `WebContentsView`. Waking it creates a view and loads the URL.
- Keep at most **N live hidden views** (default 8, configurable) using LRU; sleep tabs hidden longer than a timeout (default 30 min).
- Never sleep: audible tabs, tabs in the visible split, tabs with an active download, and the most recently used tab per space.
- Hidden views use `setVisible(false)` (or are removed from the view tree); background throttling stays on.

### 4.8 Security model

- Web content: `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true`. No privileged preload is ever attached to web content.
- Every IPC handler checks `event.senderFrame` against the known shell/overlay/internal-page frames and validates input with zod.
- `setWindowOpenHandler` and `will-navigate` on every web view; web pages can never navigate to `orbit://` or `file://`.
- Internal pages are served from the app bundle via `protocol.handle('orbit', …)` with a strict Content-Security-Policy.
- Permission requests default to "ask"; decisions are stored per origin and per profile.
- Secrets (AI API key) are encrypted with `safeStorage` (macOS Keychain).
- Electron Fuses (`@electron/fuses`) disable `RunAsNode`, enable cookie encryption and only allow loading the app from its ASAR archive.
- Dependencies are pinned and audited (`npm audit`) at every milestone.

### 4.9 Web-compatibility gotchas (budget time for these)

These trip up almost every Electron browser project. Each one has a task in Phases 1–4.

1. **User agent.** Electron's default UA contains `Electron/x.y`, and some sites — notably Google sign-in — may refuse "embedded browsers". Set `app.userAgentFallback` to a clean Chrome UA matching Electron's Chromium version.
2. **No default right-click menu.** Electron shows nothing on right-click in web pages. Build one from the `context-menu` event (links, images, selection, spellcheck suggestions, Inspect).
3. **No find bar.** Build it with `webContents.findInPage` / `stopFindInPage` in the overlay.
4. **HTML fullscreen.** Handle manually (section 4.6).
5. **Popups and OAuth.** "Sign in with Google" popups expect `window.opener`. In `setWindowOpenHandler`, open normal links (`foreground-tab`, `background-tab`) as Orbit tabs, but let real popups (`new-window` with features) open as genuine popup windows. Check the current Electron docs for adopting a new window's webContents into a tab.
6. **HTTP auth and certificate errors.** Handle `login` (show a credentials prompt) and `certificate-error` (show an interstitial page, default deny).
7. **DRM.** Stock Electron has no Widevine, so Netflix, Disney+ and Spotify Web won't play. YouTube is fine. Fixing this requires castLabs' Electron for Content Security (ECS) build plus VMP signing — a Phase 11 task, if you need it.
8. **Extensions with native messaging** (some password managers) don't work in Electron. Audit your extensions in Phase 0.

---

## 5. Data model and persistence

### 5.1 Core concepts

- **Profile** — an isolated browsing identity (cookies, storage, extensions, permissions). Backed by one Electron session. Several spaces can share a profile.
- **Space** — a named context with an icon, a theme, and its own pinned and Today items. Belongs to one profile.
- **Favorites** — the top grid. Shared by every space that uses the same profile (this matches Arc).
- **Sidebar item** — a node in the sidebar tree: `tab`, `folder`, `split` or `easel`. Lives in a section: `favorite`, `pinned` or `today`.
- **Tab** — a sidebar item of kind `tab`. Pinned tabs and favorites also remember a **home URL** they return to.
- **Split** — a sidebar item holding 2–4 tab references and a layout tree.
- **Archive entry** — a closed or auto-archived Today tab.

### 5.2 SQLite schema (initial migration)

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE profiles (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  partition   TEXT NOT NULL UNIQUE,          -- 'persist:profile-<id>'
  created_at  INTEGER NOT NULL
);

CREATE TABLE spaces (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL REFERENCES profiles(id),
  name        TEXT NOT NULL,
  icon        TEXT NOT NULL,                 -- emoji or icon key
  theme_json  TEXT NOT NULL,                 -- see 5.4
  sort_key    TEXT NOT NULL,                 -- fractional index
  created_at  INTEGER NOT NULL
);

CREATE TABLE sidebar_items (
  id             TEXT PRIMARY KEY,
  profile_id     TEXT NOT NULL REFERENCES profiles(id),
  space_id       TEXT REFERENCES spaces(id) ON DELETE CASCADE,  -- NULL for favorites
  parent_id      TEXT REFERENCES sidebar_items(id) ON DELETE CASCADE,
  section        TEXT NOT NULL CHECK (section IN ('favorite','pinned','today')),
  kind           TEXT NOT NULL CHECK (kind IN ('tab','folder','split','easel')),
  sort_key       TEXT NOT NULL,
  title          TEXT,                       -- live page title or folder name
  title_override TEXT,                       -- user rename
  url            TEXT,                       -- current URL (tabs)
  home_url       TEXT,                       -- pinned/favorite "home" URL
  favicon_key    TEXT,
  collapsed      INTEGER NOT NULL DEFAULT 0, -- folders
  data_json      TEXT,                       -- split layout, easel ref, live-folder source
  last_active_at INTEGER,
  created_at     INTEGER NOT NULL
);
CREATE INDEX idx_items_space ON sidebar_items(space_id, section, parent_id, sort_key);

CREATE TABLE history (
  id            INTEGER PRIMARY KEY,
  profile_id    TEXT NOT NULL,
  url           TEXT NOT NULL,
  title         TEXT,
  visit_count   INTEGER NOT NULL DEFAULT 1,
  last_visit_at INTEGER NOT NULL,
  UNIQUE(profile_id, url)
);
CREATE VIRTUAL TABLE history_fts USING fts5(title, url, content='history', content_rowid='id');
-- plus triggers to keep history_fts in sync on insert/update/delete

CREATE TABLE archive (
  id           TEXT PRIMARY KEY,
  space_id     TEXT,
  profile_id   TEXT NOT NULL,
  url          TEXT NOT NULL,
  title        TEXT,
  favicon_key  TEXT,
  reason       TEXT NOT NULL CHECK (reason IN ('auto','closed','cleared')),
  archived_at  INTEGER NOT NULL
);
CREATE VIRTUAL TABLE archive_fts USING fts5(title, url, content='archive', content_rowid='rowid');

CREATE TABLE downloads (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL,
  url         TEXT NOT NULL,
  path        TEXT,
  filename    TEXT NOT NULL,
  mime        TEXT,
  total_bytes INTEGER,
  state       TEXT NOT NULL,                 -- progressing | completed | cancelled | interrupted
  started_at  INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE TABLE boosts (
  id            TEXT PRIMARY KEY,
  profile_id    TEXT NOT NULL,
  name          TEXT NOT NULL,
  domain        TEXT NOT NULL,               -- e.g. 'youtube.com'
  enabled       INTEGER NOT NULL DEFAULT 1,
  css           TEXT NOT NULL DEFAULT '',
  js            TEXT NOT NULL DEFAULT '',
  settings_json TEXT NOT NULL DEFAULT '{}',  -- colour, font, zapped selectors
  updated_at    INTEGER NOT NULL
);

CREATE TABLE site_settings (
  profile_id  TEXT NOT NULL,
  origin      TEXT NOT NULL,                 -- 'https://mail.google.com'
  key         TEXT NOT NULL,                 -- 'notifications' | 'camera' | 'peek' | 'devMode' | 'autoPip' | 'zoom'
  value       TEXT NOT NULL,
  PRIMARY KEY (profile_id, origin, key)
);

CREATE TABLE easels (
  id          TEXT PRIMARY KEY,
  space_id    TEXT,
  title       TEXT NOT NULL,
  scene_json  TEXT NOT NULL,                 -- Excalidraw scene
  updated_at  INTEGER NOT NULL
);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
```

### 5.3 Persistence rules

- **Migrations:** numbered SQL files in `src/main/persistence/migrations/`, tracked with `PRAGMA user_version`. Never edit a shipped migration; add a new one.
- **Write timing:** state changes are written immediately inside transactions (SQLite is fast enough). High-frequency fields (`url`, `title`, `last_active_at`) are debounced ~500 ms.
- **Session restore:** on launch, rebuild windows, active spaces and the sidebar from the database. Restore tabs as **sleeping**, except the active tab in each window.
- **Backups:** on launch, copy the database to `~/Library/Application Support/Orbit/backups/` if the last copy is over 24 h old; keep 7.
- **Favicons:** cached as files under `…/Orbit/favicons/<hash>.png` and served to the UI via an `orbit-favicon://` protocol, so the shell never loads arbitrary remote images.
- **Data location:** `~/Library/Application Support/Orbit/` (`app.getPath('userData')`).

### 5.4 Theme model

```ts
type SpaceTheme = {
  mode: 'light' | 'dark' | 'system';
  colors: string[];        // 1–3 colours for the gradient, e.g. ['#2B1B4A', '#14102A']
  intensity: number;       // 0–1, how saturated the sidebar tint is
  noise: number;           // 0–1, grain overlay like Arc
};
```

The ThemeEngine turns a `SpaceTheme` into CSS variables (`--sidebar-bg`, `--sidebar-fg`, `--accent`, `--tile-bg`, `--hover`, …), checks text contrast (WCAG AA at least), and animates between themes when you switch spaces.

---

## 6. Repository structure and conventions

```
orbit/
├── CLAUDE.md                      # instructions for AI agents (starter in Appendix B)
├── README.md
├── docs/
│   ├── PLAN.md                    # this file
│   ├── PROGRESS.md                # running log of what's done (template in Appendix D)
│   ├── decisions/                 # ADR-001-engine.md, ADR-002-platform.md, …
│   └── reference/                 # Arc screenshots, extension audit, backup notes
├── resources/                     # app icon, entitlements, Info.plist additions
├── src/
│   ├── main/
│   │   ├── index.ts               # app bootstrap, single-instance lock
│   │   ├── app/                   # lifecycle, default-browser handling, protocols, fuses, user agent
│   │   ├── windows/               # WindowManager, LayoutEngine, LittleWindow
│   │   ├── tabs/                  # TabManager, TabController, lifecycle (sleep/wake), web-contents event wiring
│   │   ├── spaces/                # SpaceManager, ThemeEngine
│   │   ├── profiles/              # ProfileManager (sessions)
│   │   ├── sidebar/               # SidebarStore + pure tree operations (model.ts)
│   │   ├── archive/               # ArchiveService + policy (policy.ts is pure)
│   │   ├── history/               # HistoryService, search
│   │   ├── omnibox/               # input classification, suggestions (pure where possible)
│   │   ├── favicons/
│   │   ├── downloads/
│   │   ├── media/
│   │   ├── permissions/
│   │   ├── extensions/
│   │   ├── boosts/
│   │   ├── menus/                 # app menu, context menus, shortcuts
│   │   ├── importer/arc/          # Arc backup parsers
│   │   ├── ai/                    # Tidy (Phase 10)
│   │   ├── persistence/           # db.ts, migrations/, repositories/
│   │   └── ipc/                   # router, sender validation, handlers per domain
│   ├── preload/
│   │   ├── shell.ts               # typed orbit API for shell + overlay
│   │   ├── internal.ts            # reduced API for orbit:// pages
│   │   └── web/                   # isolated-world helpers for web pages (media bridge, zap picker, link hover)
│   ├── renderer/
│   │   ├── shell/                 # sidebar, toolbar, bottom bar, split dividers
│   │   ├── overlay/               # command bar, popovers, prompts, find bar, peek, toasts
│   │   ├── internal/              # library, settings, boost editor, easels, archive, error pages
│   │   ├── components/            # shared UI primitives (Button, Tile, Popover, Menu…)
│   │   ├── stores/                # Zustand stores mirroring main state
│   │   ├── hooks/
│   │   └── styles/                # tokens.css, themes, Tailwind config
│   └── shared/
│       ├── ipc/contract.ts        # every IPC channel + zod schemas
│       ├── types/                 # Space, SidebarItem, Tab, Layout, …
│       └── constants.ts
├── tests/
│   ├── unit/                      # Vitest
│   └── e2e/                       # Playwright (Electron)
├── electron.vite.config.ts
├── electron-builder.yml
├── tsconfig*.json
└── package.json
```

**Conventions**

- **Pure logic lives apart from Electron.** Tree operations, archive policy, omnibox classification, theme generation and layout maths are pure functions in `model.ts` / `policy.ts` files, so they are easy to unit test.
- **Services are classes with explicit dependencies** passed into the constructor (no hidden singletons), which keeps them testable with fakes.
- **Renderers never import from `electron`.** They use only `window.orbit`.
- **Files:** kebab-case (`tab-controller.ts`); React components in PascalCase (`FavoritesGrid.tsx`).
- **Commits:** Conventional Commits with feature IDs, e.g. `feat(sidebar): drag tabs into folders [F-05]`.
- **Branches:** `phase-3/favorites-grid`, merged to `main` only when typecheck, lint and tests pass.

---

## 7. Feature specifications

Each spec lists **Behaviour** (what you see), **Implementation** (how to build it), **Edge cases**, and **Done when** (acceptance criteria). Phases in section 8 reference these.

### F-01 — Sidebar shell

**Behaviour.** The sidebar runs the full window height on the left with a translucent, theme-tinted background. The macOS traffic lights sit inside its top-left corner, followed by a sidebar-toggle icon (Img 5). ⌘S hides the sidebar so the page uses the whole window; hovering the left edge reveals it as a floating panel. The sidebar can be resized by dragging its right edge.

**Implementation.** `BrowserWindow` with `titleBarStyle: 'hiddenInset'`, `trafficLightPosition: { x: 16, y: 18 }`, `vibrancy: 'sidebar'` and a transparent background colour. The top ~44 px of the sidebar is a drag region (`-webkit-app-region: drag`) with interactive controls marked `no-drag`. Width (default 260 px, min 200, max 400) is persisted in settings.

**Edge cases.** Traffic lights must stay aligned when the sidebar is hidden (move them or keep a slim title strip). Fullscreen mode hides the sidebar automatically.

**Done when.** The window looks like Img 6's left side without content; toggle, hover-reveal and resize all work and survive a restart.

### F-02 — Favorites grid

**Behaviour.** A grid of rounded tiles (3 columns at default width; more as the sidebar widens) showing each favorite's favicon. Clicking opens that favorite in the content area. The active favorite has a lighter tile. Badges show unread state (Gmail's red dot in Img 5). Favorites are shared across spaces that use the same profile.

**Implementation.** `sidebar_items` with `section = 'favorite'` and `space_id = NULL`. Each favorite has a `home_url`. Badge detection, in order: a per-site rule (e.g. Gmail and WhatsApp title patterns), a leading `(n)` in the title, then favicon changes. Drag a tab onto the grid to make it a favorite; drag a tile out to unfavorite.

**Edge cases.** Favorites keep their state while you switch spaces. A favorite navigated away from its home URL shows a subtle "return home" affordance.

**Done when.** You can recreate your 11 favorites from Img 5, reorder them by drag, see Gmail's badge, and they persist across restarts and spaces.

### F-03 — Space header, Clear and Tidy

**Behaviour.** The divider between pinned and Today shows the space icon and name ("silence"), with **Tidy** and **Clear** on the right (Img 5). Clear archives every Today tab in this space (with a short undo toast). Tidy groups Today tabs into named sections (F-29).

**Implementation.** Clear calls `ArchiveService.archiveMany(todayIds, 'cleared')`; undo restores them within 10 s. Tidy is hidden until Phase 10 or when no AI key is configured.

**Done when.** Clear works with undo; the header updates instantly on rename or icon change.

### F-04 — Pinned tabs, Today tabs and the "New Tab" row

**Behaviour.** Pinned items sit above the divider and persist forever. "+ New Tab" opens the command bar (same as ⌘T). Today tabs sit below and are subject to auto-archive. Closing a **pinned** tab unloads it (it stays in the sidebar, greyed); closing a **Today** tab archives it. ⌘D toggles pin. A pinned tab that has navigated away from its home URL shows a "back to pinned URL" button.

**Implementation.** Pure tree operations in `sidebar/model.ts`: `insert`, `move`, `pin`, `unpin`, `remove`, `reparent`. Fractional `sort_key` for ordering. dnd-kit sortable tree in the renderer with drop indicators between items and into folders.

**Edge cases.** Dropping a Today tab into a pinned folder pins it. Duplicate URLs are allowed. Middle-click closes. Long titles truncate with an ellipsis (Img 5).

**Done when.** Drag-reordering, pinning by drag or ⌘D, and the close behaviours all work and persist.

### F-05 — Folders and grouped sections

**Behaviour.** Collapsible folders with a name and chevron, nestable at least two levels. Tidy-created groups ("The Wood", "Other" in Img 5) are just folders in the Today section, flagged as auto-generated.

**Implementation.** `kind = 'folder'` items with children via `parent_id`; `collapsed` persisted. "New Folder" from the "+" menu and the space context menu. Rename inline (double-click or Enter).

**Done when.** Create, rename, nest, collapse and drag in/out all work.

### F-06 — Space context menu

**Behaviour.** Right-clicking the space header (or the space icon in the bottom bar) opens a native menu matching Img 5: Change Space Icon…, Rename Space…, Edit Theme Color…, Set Profile ›, New Folder, Live Folders ›, Share Space…, Export "<space>" into Folder ›, Manage Spaces…, Delete Space.

**Implementation.** `Menu.buildFromTemplate()`; items that open UI (icon picker, theme editor, rename) open popovers in the overlay. "Set Profile ›" lists profiles plus "New Profile…". "Export into Folder ›" moves all of the space's pinned items into a new folder inside another chosen space. "Share Space…" and "Live Folders ›" are disabled until their phases (Share is out of scope; it can export a JSON file instead). "Delete Space" asks for confirmation and archives its Today tabs.

**Done when.** Every enabled item works; disabled items are greyed rather than missing, so the menu matches Arc.

### F-07 — Bottom bar

**Behaviour.** Left: Library button. Middle: one icon per space (the active one highlighted — Img 1 shows a cloud for "silence" and a camera for another space). Right: "+" which turns into "×" while its menu is open (Img 2).

**Implementation.** Clicking a space icon switches spaces; right-clicking opens F-06's menu; dragging reorders spaces. ⌃1…⌃9 switch to space N.

**Done when.** Matches Img 1/2/7 visually and functionally.

### F-08 — "+" create menu

**Behaviour.** Popover listing New Space, New Folder, New Easel (⌃⇧E), New Boost, New Split (⌃⇧=), New Tab (⌘T), with separators as in Img 2.

**Implementation.** Overlay popover anchored to the button. Items for unbuilt features are hidden or disabled until their phase lands.

**Done when.** Visual match with Img 2; keyboard navigable with arrow keys and Enter.

### F-09 — Sidebar mini media player

**Behaviour.** When any tab plays audio/video and isn't the visible tab, a compact card appears above the bottom bar (Img 1): title (from media metadata or tab title), previous / play-pause / next, mute toggle, a pop-out button for Picture-in-Picture, and a close button that pauses and hides the card. Clicking the title jumps to the tab.

**Implementation.**
- Detect playback with `media-started-playing`, `media-paused` and `audio-state-changed` per webContents.
- Inject a page-world script that wraps `navigator.mediaSession.setActionHandler` to capture `previoustrack`/`nexttrack` handlers and read `mediaSession.metadata`; fall back to controlling the first playing `<video>`/`<audio>` element.
- PiP: `webContents.executeJavaScript("document.querySelector('video')?.requestPictureInPicture()", true)` — the second argument marks it as a user gesture.
- Mute: `webContents.setAudioMuted()`. Speaker icon on the tab row in the sidebar too.

**Edge cases.** Multiple playing tabs (show the most recent; allow cycling). Sites without media-session handlers (hide prev/next). Tab goes to sleep — never sleep audible tabs.

**Done when.** With YouTube playing in a background tab you can pause, skip, mute, pop out to PiP and jump back, all from the sidebar.

### F-10 — Sidebar downloads shelf

**Behaviour.** Recent downloads appear in the lower sidebar (Img 7) with a thumbnail or file icon, a truncated name, and a relative time ("27 minutes ago"). In-progress items show a progress ring. Click to open, ⌘-click to reveal in Finder, drag into another app to use the file. Items fade from the shelf after a while (e.g. 1 hour or when dismissed) but remain in Library → Downloads.

**Implementation.** `session.on('will-download')` for each profile; save to `~/Downloads` by default with no prompt (configurable). Track `DownloadItem` progress. Thumbnails via `nativeImage.createThumbnailFromPath`, falling back to `app.getFileIcon`. Drag-out: the renderer's `dragstart` sends an IPC; main calls `webContents.startDrag({ file, icon })`. Open with `shell.openPath`, reveal with `shell.showItemInFolder`.

**Done when.** Downloading files shows them as in Img 7 with working open, reveal and drag-out.

### F-11 — Library

**Behaviour.** The Library button swaps the sidebar to a navigation list (Img 4): Media, Downloads, Easels, Spaces, Boosts, Archived Tabs, with a back arrow at the bottom. The content area shows the selected section as a full page.

**Implementation.** The sidebar renders the Library nav; the content area loads `orbit://library/<section>` internal pages. Media = images/videos from downloads and screenshots in a grid; Downloads = full list with search; Easels = grid of easels; Spaces = manage/reorder/delete spaces and profiles; Boosts = all Boosts with enable toggles; Archived Tabs = searchable list grouped by day with restore.

**Done when.** All six sections work and the back arrow restores the normal sidebar.

### F-12 — Site controls popover

**Behaviour.** Clicking the site-controls button in the toolbar opens a popover (Img 3):
1. **Quick actions row:** Share (macOS share sheet), Boost this site, Screenshot (visible area or region), and a fourth capture-style action (full-page capture is a good fit).
2. **Extensions grid:** icons of installed extensions; clicking opens that extension's popup; "+" opens the Chrome Web Store.
3. **Boosts:** Boosts matching this site with enable toggles.
4. **Settings for this site:** Notifications (Allowed/Blocked/Ask), Preview/Peek (Enabled/Disabled), Developer Mode (On/Off), Automatic Picture-in-Picture (Allowed/Blocked), plus camera/microphone/location when the site has requested them.
5. **Footer:** a "Secure" badge (or a warning for insecure connections) that shows certificate info, and a "…" menu (clear site data, site zoom reset, copy URL).

**Implementation.** Overlay popover anchored to the button. Share via `ShareMenu` (macOS). Screenshot via `webContents.capturePage(rect)` → saved to the Library media folder and copied with `clipboard.writeImage`. Region selection is drawn in the overlay on top of the page. Settings read/write `site_settings`. "Clear site data" uses `session.clearStorageData({ origin })`.

**Done when.** Popover matches Img 3 and every control works for the current site.

### F-13 — Split view

**Behaviour.** Two to four tabs side by side (Img 6), each with its own compact toolbar. Create with ⌃⇧=, by dragging a tab onto the edge of the page, or from the tab context menu. The split appears in the sidebar as one item showing its favicons. Drag dividers to resize. The focused pane has a subtle outline. Closing a pane collapses the split.

**Implementation.** `kind = 'split'` item with `data_json = { layout: SplitTree }` where `SplitTree` is a binary tree of `{ direction: 'row' | 'column', ratio, children }` with tab leaves. LayoutEngine turns it into rectangles; the shell draws dividers and toolbars at the returned positions; dragging a divider sends ratio updates.

**Done when.** You can reproduce Img 6 (Gmail left, YouTube right), resize, swap panes, and restore the split after restart.

### F-14 — Compact toolbar

**Behaviour.** Above each web view: back, forward, reload; the URL area showing `domain / page title` (Img 6's "youtube.com / (52) ✨ Heavenly…"); pinned extension icons; the site-controls button; and a split/sidebar button. Clicking the URL area opens the command bar in "edit URL" mode (⌘L). A setting hides the toolbar entirely for a cleaner look.

**Implementation.** Shell renderer component positioned from the `Layout` object. Navigation state comes from `webContents.navigationHistory` (`canGoBack`, `canGoForward`) and `did-start-loading` / `did-stop-loading`.

**Done when.** Matches Img 6 and works per pane in split view.

### F-15 — Native menu bar

**Behaviour.** The macOS menu bar shows Orbit, File, Edit, View, Spaces, Tabs, Archive, Extensions, Window, Help (Img 6). Every shortcut in Appendix A appears in a menu.

**Implementation.** `Menu.setApplicationMenu` built by `MenuService`, rebuilt when spaces change (the Spaces menu lists them with ⌃1…⌃9). Menu accelerators fire even when a web page has focus; use `before-input-event` only for shortcuts you need to intercept before the page sees them.

**Done when.** Every item does something or is disabled with a reason.

### F-16 — Per-space themes

**Behaviour.** Each space has a gradient theme that tints the sidebar and accents. "Edit Theme Color…" opens a picker: up to three colour handles on a colour wheel, light/dark/system mode, intensity and grain sliders. Switching spaces animates between themes.

**Implementation.** `SpaceTheme` → CSS variables via ThemeEngine (section 5.4); grain is an SVG noise overlay; the picker is an overlay popover with live preview.

**Done when.** Each of your spaces can look like it does in Arc, and switching animates smoothly at 60 fps.

### F-17 — Profiles

**Behaviour.** A profile is an isolated login identity. "Set Profile ›" assigns one to a space; tabs in that space then use that profile's cookies, storage and extensions.

**Implementation.** One Electron session per profile via `session.fromPartition('persist:profile-<id>')`. Each session gets the same handlers (permissions, downloads, user agent, extensions). Changing a space's profile reloads its tabs in the new session after a confirmation.

**Done when.** You can be logged into two different Google accounts in two spaces simultaneously.

### F-18 — Boosts

**Behaviour.** Per-site customisations. A Boost can change colours, change the font, "zap" (click elements to hide them), and run custom CSS and JS. Toggle per site from the site-controls popover; manage all in Library → Boosts.

**Implementation.**
- Matching by domain (and optionally path prefix) on `did-navigate` / `dom-ready`.
- CSS via `webContents.insertCSS` (keep the returned key to remove it on toggle-off).
- JS via `executeJavaScript` on each matching load (user-written, user-trusted).
- Colour: CSS `filter` on `html` (hue-rotate / saturate / invert-with-re-invert-for-media).
- Font: `* { font-family: <chosen>, sans-serif !important; }`.
- Zap: inject a picker that highlights elements under the cursor, builds a stable selector on click, and stores it; zapped selectors become `display: none !important` rules.
- Editor at `orbit://boost/<id>` using CodeMirror 6 with a live preview on the current tab.

**Done when.** You can re-create the Boosts you backed up in Phase 0.

### F-19 — Easels

**Behaviour.** A freeform canvas per easel: shapes, text, arrows, drawings, pasted images and captures of web pages. Open from the "+" menu (⌃⇧E) or the Library. Easels appear in the sidebar like tabs.

**Implementation.** Excalidraw inside `orbit://easel/<id>`, scene saved to `easels.scene_json` (debounced). "Capture from tab": select a region in the overlay → `capturePage(rect)` → inserted as an image with its source URL attached. Live-refreshing captures are a stretch goal.

**Done when.** You can create, edit, capture into and reopen easels.

### F-20 — Archive and auto-archive

**Behaviour.** Today tabs not opened for a chosen period (12 h, 24 h, 7 days, 30 days; default 12 h) are archived automatically. Closing a Today tab archives it too. Library → Archived Tabs lists them by day with search and restore. ⇧⌘T reopens the most recently archived/closed tab.

**Implementation.** `archive/policy.ts` (pure): given items and `now`, return the IDs to archive. A main-process timer runs every 5 min and on wake from sleep (`powerMonitor` 'resume'). Archive rows are indexed by FTS5. Pinned items, favorites, playing tabs and tabs in a visible split are never auto-archived.

**Done when.** Leaving a tab idle past the threshold moves it to the archive; restore puts it back where it was.

### F-21 — Command bar

**Behaviour.** ⌘T opens a centered command bar over the page with a search field. Results update as you type, grouped and ranked: switch to an open tab, pinned/favorite items, history, search suggestions, and commands ("New Space", "Toggle Sidebar", "Copy URL", "Clear Today", "Open Library"…). Enter on a URL-like input navigates; otherwise it searches with the default engine. ⌘L opens it pre-filled with the current URL to edit. Esc closes.

**Implementation.** cmdk in the overlay renderer. Sources queried in parallel and merged: open tabs (in memory), sidebar items, history FTS5 (`bm25` ranked, boosted by recency and visit count), suggestions from the configured engine (debounced 120 ms, cancellable), commands registry. URL-vs-search classification uses tldts (scheme present, valid public suffix, localhost, IP address, `orbit://`).

**Edge cases.** Typing a domain that's already open switches to that tab instead of opening a duplicate (Arc does this). Offline: hide suggestions silently.

**Done when.** Opening and filtering feel instant (<50 ms to first results) and every source works.

### F-22 — Copy URL

⇧⌘C copies the active tab's URL and shows a small "Copied" toast in the overlay. ⇧⌥⌘C copies it as a Markdown link `[title](url)`. **Done when** both work from any focus state.

### F-23 — Peek

**Behaviour.** Clicking a link in a pinned tab or favorite that leads to a different domain opens it in a floating, rounded preview over the current page instead of navigating away. The preview has "Open as tab" and "Close" buttons; clicking outside closes it. Can be disabled per site (the "Preview" setting in Img 3).

**Implementation.** In `will-navigate` / `setWindowOpenHandler` for pinned/favorite tabs, if the target origin differs and Peek is enabled for that site, cancel and create a temporary web view in a Peek frame rendered by the overlay; LayoutEngine places the web view inside the frame. "Open as tab" moves the same webContents into a new Today tab (no reload).

**Done when.** Gmail links open in Peek and can be promoted to tabs without reloading.

### F-24 — Little Orbit

**Behaviour.** When Orbit is the default browser and you click a link in another app (Slack, Mail), it opens in a small floating window instead of the main window. The window has a minimal toolbar with "Open in Orbit", which moves the page into the main window's Today tabs. ⌥⌘N opens an empty Little Orbit from anywhere.

**Implementation.** Register for `http`/`https` in `electron-builder.yml` (`protocols`) and call `app.setAsDefaultProtocolClient`. Listen for `open-url` (registered early, in `will-finish-launching`). The Little window is a small `BrowserWindow` with its own WebContentsView; promotion re-parents the view into the main window. Global shortcut via `globalShortcut.register('Alt+Command+N', …)`.

**Done when.** Links from other apps open in Little Orbit and can be promoted.

### F-25 — Sleeping tabs

See section 4.7. **Done when** 100 open tabs keep total memory reasonable (only ~8 live views), and waking a tab shows content within a normal page-load time with its title and favicon visible immediately.

### F-26 — Swipe between spaces

**Behaviour.** A two-finger horizontal swipe on the sidebar slides to the previous/next space, with the sidebar content and theme following your fingers and snapping at a threshold.

**Implementation.** In the shell renderer, accumulate `wheel` `deltaX` over the sidebar element; translate the space strip in real time with Motion; on release (detected by a short pause in wheel events, as macOS doesn't send gesture-end), snap and send `spaces:activate`.

**Done when.** Swiping feels like Arc's — no jitter, no accidental vertical-scroll triggers.

### F-27 — Arc importer

**Behaviour.** First-run (or Settings → Import) offers "Import from Arc". It reads your backup folder and recreates spaces (names, icons, colours where possible), favorites, pinned tabs and folders, and history.

**Implementation.**
- Sidebar: parse `StorableSidebar.json` from the backup. The format is undocumented — have Claude Code inspect your copy first and write a parser with tests against a trimmed sample. Expect containers/spaces and items keyed by IDs with parent/child references.
- History: the Chromium `History` SQLite file under `User Data/<profile>/`. Read the `urls` table (`url`, `title`, `visit_count`, `last_visit_time`, which is microseconds since 1601-01-01 UTC) from a **copy**, never the live file.
- Show a preview ("4 spaces, 11 favorites, 37 pinned tabs, 12,000 history entries") before importing; make it idempotent (re-running doesn't duplicate).
- Cookies and passwords are not imported (they're encrypted with Arc's Keychain key); you sign in again once per profile.

**Done when.** Your Orbit sidebar matches your Arc screenshots after one import.

### F-28 — Live Folders (P2)

Folders whose children are generated from a source: an RSS/Atom feed, GitHub pull requests/issues (via a personal access token), or a JSON URL. Refreshed on a schedule; new items show a dot. Stored as `kind = 'folder'` with `data_json.source`. **Done when** an RSS Live Folder updates on its own.

### F-29 — Tidy (P2)

Sends the space's Today tabs (titles + domains only, never page content) to an LLM via the Anthropic API with the user's own key and asks for JSON groups like `{ "groups": [{ "name": "The Wood", "tabIds": [...] }] }`. Validate with zod and apply as auto-generated folders; Undo restores the previous order. Use a small, fast model (check docs.claude.com for current model names). Optional extra: AI tab renaming. **Done when** Tidy produces sensible groups like Img 5's in under ~3 seconds.

### F-30 — Developer mode

Per-site toggle (Img 3). When on: the toolbar shows the full URL including port and path, a DevTools button appears (opens `webContents.openDevTools`), console error count shows as a badge, and Peek/auto-archive are disabled for that site. Automatically suggested for `localhost` and `127.0.0.1`. **Done when** toggling it on a localhost tab shows all of the above.

### F-31 — Browser plumbing (the boring essentials)

| Item | Implementation | Phase |
|---|---|---|
| Web page right-click menu | `context-menu` event → native menu: back/forward/reload, open link in new tab / split / Peek, copy link, save/copy image, copy/paste, spellcheck suggestions (`params.dictionarySuggestions`), Inspect | 1 |
| Find in page (⌘F) | Overlay find bar + `findInPage` / `found-in-page` / `stopFindInPage` | 2 |
| Zoom (⌘+ / ⌘− / ⌘0) | `setZoomLevel`, persisted per host in `site_settings` | 2 |
| Print (⌘P) | `webContents.print()` | 2 |
| HTML fullscreen | Section 4.6 | 1 |
| Popups / OAuth | Section 4.9 #5 | 1 |
| HTTP auth | `login` event → credentials prompt in overlay | 3 |
| Certificate errors | `certificate-error` → interstitial `orbit://cert-error` | 3 |
| Permission prompts | PermissionService → overlay prompt anchored under the toolbar | 3 |
| Crashed tab | `render-process-gone` → "This page crashed — Reload" view | 4 |
| Unresponsive page | `unresponsive` / `responsive` → offer to wait or reload | 4 |
| Spellcheck | `session.setSpellCheckerLanguages` (macOS uses the system checker) | 3 |
| Notifications | Web Notification API works through Electron; gate with PermissionService | 3 |
| Default browser | Settings button that calls `setAsDefaultProtocolClient` for http/https | 6 |

### F-32 — New tab page (added 1 Nov 2026 at the owner's request; Arc has no equivalent)

**Behaviour.** `orbit://newtab` shows a full-bleed wallpaper, a large clock with a greeting and date, and a frosted search box that is focused on open. Enter loads the address or search in the same tab. A **Customize** button opens a panel with built-in wallpapers (layered gradients with grain) and "Choose your own image…". "+ New Tab" in the sidebar always opens this page; ⌘T opens it until the command bar lands in Phase 2, then ⌘T opens the command bar (a setting may swap them).

**Implementation.** Internal page in the `internal` renderer, loaded into a tab's WebContentsView with the internal preload. Its IPC channels (`newtab:*`) are restricted to the `internal` surface, and main also checks the sender is a tab currently on the new tab page. Navigating away swaps in a fresh, unprivileged web view. The wallpaper choice is the `newtab.wallpaper` setting; a custom image is validated, downscaled to ≤ 3840 px and stored as `<userData>/wallpapers/custom.jpg`.

**Later.** Shortcut tiles (most-visited from history in Phase 2, favorites after the Phase 3 import); live-updating other open new tab pages when the wallpaper changes.

**Done when.** The page appears for every new tab, searching/navigating works, and wallpaper choices (including your own image) persist.

---

## 8. Execution plan: milestones and phases

### 8.1 Milestones

Dates assume roughly **15–20 focused hours per week** with Claude Code doing most of the typing. With fewer hours, stretch the dates proportionally — the order matters more than the dates.

| Milestone | Target | Phases | Outcome |
|---|---|---|---|
| **M1 — Daily Driver** | **Sun 21 Dec 2026** (the day before Arc's sunset) | 0–4 | Orbit replaces Arc for everyday browsing: sidebar, spaces, favorites, pinned tabs, folders, themes, profiles, command bar, archive, sleeping tabs, your data imported |
| **M2 — Arc Parity** | ~mid-March 2027 | 5–8 | Media player, downloads shelf, split view, Peek, Little Orbit, site controls, extensions, Boosts |
| **M3 — Beyond Arc** | ~mid-May 2027 | 9–11 | Library, Easels, Tidy, Live Folders, polish, packaging, auto-update |

**M1 is aggressive.** Seven weeks for a daily-driver browser is achievable with AI assistance and focus, but protect it with a **cut line**: tasks marked *(below cut line)* can slip into January without blocking daily use. If M1 slips anyway, use Zen Browser or Dia as a bridge — your data is safe in the backup, and the importer will still work.

### 8.2 Timeline at a glance

```
Oct 31 ─ Nov 2   Phase 0  Setup, backup, ADRs, extension audit
Nov 3  ─ Nov 16  Phase 1  Window, sidebar shell, tabs, navigation, toolbar, plumbing basics
Nov 17 ─ Nov 23  Phase 2  Overlay layer, command bar, history, find/zoom/print, copy URL
Nov 24 ─ Dec 10  Phase 3  Spaces, favorites, pinned, folders, DnD, themes, profiles, importer
Dec 11 ─ Dec 17  Phase 4  Archive, auto-archive, Clear, sleeping tabs, crash recovery
Dec 18 ─ Dec 21  Buffer   Dogfooding fixes → ★ M1 Daily Driver
Dec 22 ─ Jan 3   Break    (Arc sunsets Dec 22; live in Orbit, keep a bug list)
Jan 4  ─ Jan 17  Phase 5  Media player, PiP, downloads shelf
Jan 18 ─ Feb 7   Phase 6  Split view, Peek, Little Orbit, default browser
Feb 8  ─ Feb 28  Phase 7  Site controls, permissions UI, extensions, dev mode, capture
Mar 1  ─ Mar 14  Phase 8  Boosts → ★ M2 Arc Parity
Mar 15 ─ Apr 4   Phase 9  Library, Easels
Apr 5  ─ Apr 25  Phase 10 Tidy, Live Folders, AI extras
Apr 26 ─ May 16  Phase 11 Polish, performance, packaging, signing, updates → ★ M3
```

> **Extensions note:** if any extension is a daily-driver blocker for you (most likely a password manager), pull the extension-loading tasks from Phase 7 into Phase 3.

### 8.3 Phase 0 — Setup and foundations (Oct 31 – Nov 2)

**Goal:** a clean, buildable repository with all decisions written down, and your Arc data safe.

**Tasks**
- [ ] Complete the backup checklist at the top of this document.
- [ ] **Extension audit:** list every extension in Img 3's grid with name, Web Store link, how often you use it, and whether it's a blocker. Flag password managers and anything that talks to a desktop app (native messaging) — these may not work in Electron. Save as `docs/reference/extensions.md`.
- [ ] Install tooling: Node.js LTS, Git, Xcode Command Line Tools (`xcode-select --install`, needed for native modules).
- [ ] Scaffold with electron-vite (React + TypeScript template). Configure three renderer entries: `shell`, `overlay`, `internal`.
- [ ] Add ESLint, Prettier, Vitest, Playwright, a pre-commit hook (lint + typecheck), and scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `test:e2e`.
- [ ] Create `CLAUDE.md` (Appendix B), `docs/PLAN.md` (this file), `docs/PROGRESS.md` (Appendix D), and ADR-001 to ADR-006.
- [ ] Put your screenshots in `docs/reference/` named after what they show.
- [ ] Initialise Git and push to a private GitHub repository.

**Exit criteria:** `npm run dev` opens an empty window; `npm run typecheck && npm run lint && npm test` pass; docs are committed.

**Kickoff prompt (Claude Code):**
> Read docs/PLAN.md sections 3, 4 and 6 and CLAUDE.md. Scaffold the project as described in section 6 using electron-vite with React and TypeScript, with three renderer entries (shell, overlay, internal) and the preloads listed. Add ESLint, Prettier, Vitest and Playwright with the npm scripts listed in Phase 0. Don't implement any features yet. Show me your plan before writing files.

### 8.4 Phase 1 — Window, sidebar shell and tabs (Nov 3 – Nov 16)

**Goal:** a basic but real browser: a sidebar with a flat list of tabs and a working web view.

**Features:** F-01, F-14 (basic), F-15 (basic), F-31 (context menu, fullscreen, popups).

**Tasks**
- [ ] WindowManager: hidden inset title bar, traffic lights inside the sidebar, vibrancy, window size/position persisted.
- [ ] Typed IPC contract + router with zod validation and sender checks (section 4.4).
- [ ] TabManager / TabController: create, activate, close; one `WebContentsView` per tab; hide inactive views.
- [ ] LayoutEngine v1: sidebar + one content rect with inset and rounded corners; recompute on resize and sidebar toggle.
- [ ] Shell sidebar: flat tab list with favicon, title and close button; "+ New Tab" row (opens a simple URL prompt until Phase 2).
- [ ] Toolbar v1: back/forward/reload, `domain / title` display, loading indicator.
- [ ] Wire web-contents events: title, favicon, URL, loading state, `canGoBack/Forward`.
- [ ] Clean Chrome user agent (`app.userAgentFallback`) — then verify Google sign-in works in Gmail.
- [ ] `setWindowOpenHandler`: links → new tab; real popups → popup window (OAuth).
- [ ] Web page right-click menu (F-31).
- [ ] HTML fullscreen handling (section 4.6).
- [ ] App menu skeleton with ⌘T, ⌘W, ⌘R, ⌘[ / ⌘], ⌘S, ⌘Q.
- [ ] SQLite setup + migration runner; persist open tabs and restore them on launch (simple version).
- [ ] Unit tests for LayoutEngine maths; one Playwright smoke test (launch → open URL → title appears in sidebar).

**Exit criteria:** you can sign in to Gmail, watch YouTube fullscreen, open/close/switch ~20 tabs, toggle the sidebar, and quit/relaunch with tabs restored.

**Kickoff prompt:**
> Read docs/PLAN.md: sections 4.1–4.6, 4.8, 4.9 and the F-01, F-14, F-15 and F-31 specs, plus Phase 1's task list. Propose an implementation order of small, testable steps (each ending in a commit). Start with WindowManager and the IPC contract. After each step run typecheck, lint and tests, update docs/PROGRESS.md, and stop for my review.

### 8.5 Phase 2 — Overlay layer and command bar (Nov 17 – Nov 23)

**Goal:** Orbit feels keyboard-first.

**Features:** F-21, F-22, F-31 (find, zoom, print).

**Tasks**
- [ ] Overlay view infrastructure: transparent top-most view, show/hide, click-outside-to-close, focus management (keyboard focus moves to the overlay and returns to the page on close).
- [ ] HistoryService + FTS5 index; record visits.
- [ ] FaviconService + `orbit-favicon://` protocol.
- [ ] Omnibox classification (pure, unit-tested with many cases: `localhost:3000`, `192.168.1.1`, `github.com/foo`, `what is arc`, `orbit://library`).
- [ ] Command bar UI with cmdk: open tabs, history, suggestions, commands; ⌘T and ⌘L modes; switch-to-existing-tab behaviour.
- [ ] Toast system; ⇧⌘C and ⇧⌥⌘C.
- [ ] Find bar (⌘F, ⌘G, ⇧⌘G, Esc).
- [ ] Zoom per host; print.
- [ ] ⇧⌘T reopen last closed tab (in-memory stack for now; archive-backed in Phase 4).

**Exit criteria:** you can browse for an hour using only the keyboard.

### 8.6 Phase 3 — Spaces, favorites, pinned tabs, folders, themes, profiles, importer (Nov 24 – Dec 10)

**Goal:** the Arc sidebar, with your real data in it.

**Features:** F-02, F-03 (Clear UI), F-04, F-05, F-06, F-07, F-08, F-16, F-17, F-26, F-27, F-31 (auth, certs, permissions, spellcheck, notifications).

**Tasks**
- [ ] Data model migration (section 5.2) and `sidebar/model.ts` pure tree operations with thorough unit tests (insert, move, reparent, pin/unpin, remove, fractional keys).
- [ ] SidebarStore + IPC; renderer sections: favorites grid, space header, pinned, New Tab row, Today.
- [ ] dnd-kit tree: reorder, into/out of folders, Today ↔ pinned, tab → favorites.
- [ ] Pinned semantics: home URL, "back to pinned URL", close = unload.
- [ ] Favorites grid with badges.
- [ ] Folders: create, rename, collapse, nest.
- [ ] SpaceManager: create, rename, icon picker, delete, reorder; per-window active space.
- [ ] Bottom bar (Library button placeholder, space icons, "+" menu with available items).
- [ ] Space context menu (native) matching Img 5.
- [ ] ThemeEngine + theme editor popover; animated space switching.
- [ ] ProfileManager: sessions per profile; "Set Profile ›"; apply handlers to every session.
- [ ] PermissionService v1: default "ask", overlay prompt, stored per origin.
- [ ] HTTP auth prompt, certificate error page, spellcheck, notifications permission.
- [ ] **Arc importer** (F-27): inspect your backup, write parsers with tests, preview screen, idempotent import.
- [ ] Spaces menu in the menu bar; ⌃1…⌃9, ⌘⌥← / ⌘⌥→.
- [ ] *(below cut line)* Swipe between spaces (F-26).
- [ ] *(below cut line)* Grain/noise in themes.

**Exit criteria:** after running the importer, Orbit's sidebar matches your Arc screenshots; you can be logged into different accounts in different spaces.

### 8.7 Phase 4 — Archive and tab lifecycle (Dec 11 – Dec 17)

**Goal:** Orbit can run all day with many tabs without clutter or memory bloat.

**Features:** F-03 (Clear), F-20, F-25, F-31 (crash/unresponsive).

**Tasks**
- [ ] `archive/policy.ts` (pure, unit-tested) + ArchiveService timer + `powerMonitor` resume hook.
- [ ] Close Today tab → archive; Clear with undo; ⇧⌘T backed by the archive.
- [ ] Minimal Archived Tabs page (`orbit://library/archive`) with search and restore (full Library comes in Phase 9).
- [ ] Sleeping tabs: LRU + idle timeout, exemptions (section 4.7), instant title/favicon for sleeping tabs.
- [ ] Crashed and unresponsive tab UI.
- [ ] Daily database backup.
- [ ] Settings page v1 (`orbit://settings`): archive threshold, sleep settings, default search engine, downloads folder.
- [ ] *(below cut line)* Memory indicator in a debug menu.

**Exit criteria:** with 80+ tabs across spaces, memory stays reasonable, idle tabs archive on schedule, and nothing is lost after a force-quit.

### 8.8 Buffer and M1 release (Dec 18 – Dec 21)

- [ ] Use Orbit exclusively for 3 days; log every annoyance in `docs/PROGRESS.md`.
- [ ] Fix blockers only. Everything else goes to the backlog.
- [ ] Tag `v0.1.0`, build a DMG for yourself (unsigned is fine for personal use — right-click → Open the first time).
- [ ] ★ **M1 — Daily Driver.**

### 8.9 Phase 5 — Media and downloads (Jan 4 – Jan 17)

**Features:** F-09, F-10, auto-PiP part of F-12.

- [ ] MediaService: playback detection per tab, now-playing state, multiple-player handling.
- [ ] Page-world media bridge (mediaSession handler capture, element fallback).
- [ ] Sidebar media card (Img 1); speaker/mute icons on tab rows.
- [ ] PiP button and **automatic PiP** when switching away from a playing video (respects the per-site setting).
- [ ] DownloadService for every profile; shelf (Img 7) with thumbnails, progress, open/reveal/drag-out; downloads table.

**Exit criteria:** background music and video are fully controllable from the sidebar; downloads behave like Img 7.

### 8.10 Phase 6 — Split view, Peek, Little Orbit (Jan 18 – Feb 7)

**Features:** F-13, F-23, F-24, default browser (F-31).

- [ ] SplitTree model (pure, unit-tested) + LayoutEngine support + dividers + per-pane toolbars + focus outline.
- [ ] Create split via ⌃⇧=, drag-to-edge (overlay drop zones), and tab context menu; split item in the sidebar.
- [ ] Peek frame in the overlay; promote to tab without reload; per-site toggle.
- [ ] Default browser registration, `open-url` handling, Little Orbit window, promotion, ⌥⌘N global shortcut.

**Exit criteria:** Img 6's split layout works and restores; links from Slack/Mail open in Little Orbit.

### 8.11 Phase 7 — Site controls, extensions, developer mode (Feb 8 – Feb 28)

**Features:** F-12, F-30, extension support.

- [ ] ExtensionHost: integrate `electron-chrome-extensions` per profile session; toolbar action icons and popups; `electron-chrome-web-store` for installing from the Chrome Web Store.
- [ ] Test every extension from your Phase 0 audit; record results in `docs/reference/extensions.md` with workarounds.
- [ ] Site controls popover (Img 3): quick actions, extensions grid, site Boosts list (read-only until Phase 8), site settings, security footer.
- [ ] Share sheet (`ShareMenu`), screenshot (visible + region) to clipboard and Library media.
- [ ] Developer mode (F-30).

**Exit criteria:** your must-have extensions work, and the popover matches Img 3.

### 8.12 Phase 8 — Boosts (Mar 1 – Mar 14)

**Features:** F-18.

- [x] BoostService: matching, CSS insert/remove, JS execution, enable/disable live.
- [x] Boost editor (`orbit://boost/<id>`) with CodeMirror 6 and live preview.
- [x] Colour, font and zap tools.
- [ ] Re-create the Boosts from your backup.
- [ ] ★ **M2 — Arc Parity.**

### 8.13 Phase 9 — Library and Easels (Mar 15 – Apr 4)

**Features:** F-11, F-19.

- [x] Library navigation mode in the sidebar (Img 4) + all six internal pages.
- [x] Easels with Excalidraw, sidebar integration, capture-from-tab; ⌃⇧E.

### 8.14 Phase 10 — Tidy, Live Folders, AI extras (Apr 5 – Apr 25)

**Features:** F-28, F-29.

- [x] AIService with key stored via `safeStorage`; Settings field for the key.
- [x] Tidy with zod-validated JSON output and undo.
- [x] Live Folders: RSS/Atom first, then GitHub.
- [ ] Optional: AI tab renaming; "summarise this page" command in the command bar.

### 8.15 Phase 11 — Polish, performance, packaging (Apr 26 – May 16)

- [ ] Performance pass against the budgets in section 10.2; profile with Chrome DevTools on the shell and `process.getProcessMemoryInfo`.
- [ ] Animation and visual polish pass against your Arc screenshots, side by side.
- [ ] Accessibility pass (keyboard reachability, VoiceOver labels on sidebar items).
- [ ] Packaging, signing, notarisation and auto-update (section 12) — only if you want to share it or want auto-updates.
- [ ] Optional: Widevine via castLabs ECS if you need Netflix/Spotify Web.
- [ ] ★ **M3 — Beyond Arc.**

---

## 9. Working with Claude Code and Antigravity

### 9.1 Roles

| Role | Who | Responsibilities |
|---|---|---|
| Product owner and reviewer | **You** | Decide priorities, review every change, dogfood daily, compare against Arc screenshots |
| Primary implementer | **Claude Code** | Works phase by phase from this plan; writes code, tests and docs; commits small steps |
| Parallel implementer and second reviewer | **Antigravity** | Takes independent tasks on a separate branch (e.g. UI polish while Claude Code does main-process work); reviews diffs before merge |

### 9.2 The working loop (every session)

1. **Orient.** Start the session with: *"Read CLAUDE.md, docs/PLAN.md section X, and the latest entries in docs/PROGRESS.md."*
2. **Plan.** Ask for a short plan of small steps for the next task. Use Claude Code's plan mode. Approve or adjust before any code is written.
3. **Build in slices.** One slice = one behaviour, end to end, ending in a commit. Ask for tests with each slice of pure logic.
4. **Verify.** After each slice: `npm run typecheck && npm run lint && npm test`, then try it yourself in `npm run dev`. Compare with the relevant screenshot.
5. **Record.** Update `docs/PROGRESS.md` (done, decisions, known issues). If a decision changed, update this plan and add an ADR.
6. **Commit and push.** Conventional commit with the feature ID.

### 9.3 Rules that keep AI-built code healthy

- **One phase per branch, one task per session.** Long sessions drift; fresh sessions with good docs don't.
- **Never let two agents edit the same files at the same time.** Use separate branches (or git worktrees) for Claude Code and Antigravity, and split work by directory (e.g. `src/main/archive/` vs `src/renderer/shell/`).
- **Ask for a plan before code, and for tests with logic.** Pure modules (`model.ts`, `policy.ts`, omnibox, layout) must have unit tests.
- **Make agents show evidence.** "Run the tests and paste the output" beats "it should work".
- **Keep the contract sacred.** Any new IPC channel goes into `shared/ipc/contract.ts` first.
- **Watch for scope creep.** If an agent starts building something outside the current phase, stop it and add it to the backlog.
- **Review diffs, not summaries.** Skim every changed file; ask "why?" about anything surprising.
- **When stuck for more than ~30 minutes,** ask the other tool for a second opinion with the error, the relevant files and what was tried.

### 9.4 Useful prompt patterns

- **Kickoff:** "Read [sections]. Propose the smallest sequence of commits to implement [feature ID]. Each commit must leave the app runnable. Wait for my approval."
- **Slice:** "Implement step 2 only. Include unit tests for the pure logic. Run typecheck, lint and tests and show the output."
- **Visual match:** "Here's a screenshot of Arc's [feature] (docs/reference/…). Compare our current UI against it and list differences in spacing, sizes, colours and typography, then fix them."
- **Review (Antigravity):** "Review the diff on branch [x] against docs/PLAN.md and CLAUDE.md. Flag security issues (section 4.8), IPC contract violations, missing tests, and anything that breaks the main-process-as-source-of-truth rule."
- **Debug:** "Here's the error and the steps to reproduce. Form hypotheses, add targeted logging to confirm the cause, then propose the fix. Don't change unrelated code."

---

## 10. Quality: testing, performance and dogfooding

### 10.1 Testing strategy

| Layer | Tool | What to test | Target |
|---|---|---|---|
| Pure logic | Vitest | Sidebar tree ops, fractional ordering, archive policy, sleep LRU, omnibox classification, split layout maths, theme contrast, importer parsers | High coverage (aim for ~90% on these modules) |
| Services | Vitest with fakes | TabManager, SpaceManager, ArchiveService with a fake clock and a temporary SQLite file | Key flows |
| IPC | Vitest | Every channel rejects invalid payloads and untrusted senders | All channels |
| End to end | Playwright (Electron) | Launch → open URL → pin → switch space → restart → state restored; command bar flow; archive flow | ~10 smoke tests, run before each merge to `main` |
| Manual | You | The QA checklist below, plus side-by-side comparison with Arc screenshots | Every phase |

### 10.2 Performance budgets

| Metric | Budget |
|---|---|
| Cold start to interactive sidebar | < 1.5 s |
| Tab switch (live tab) | < 50 ms to visible |
| Command bar open → first results | < 50 ms |
| Sidebar scrolling and drag-reorder | 60 fps with 300 items |
| Space switch animation | 60 fps |
| Live web views | ≤ 8 by default (sleeping handles the rest) |
| Idle CPU with nothing playing | ~0% |

### 10.3 Manual QA checklist (run at the end of every phase)

- [ ] Gmail, Google Docs, YouTube, Figma, Canva, WhatsApp Web, ChatGPT and Claude all load, sign in and work.
- [ ] YouTube fullscreen enters and exits cleanly.
- [ ] "Sign in with Google" popups on third-party sites work.
- [ ] Right-click menu, find, zoom and print work.
- [ ] Quit and relaunch: windows, spaces, sidebar and active tabs restore.
- [ ] Force-quit (Activity Monitor) and relaunch: nothing lost beyond the last second.
- [ ] Toggling the sidebar, resizing the window and switching spaces never leaves a web view misplaced.
- [ ] No errors in the main-process log or the shell DevTools console during a normal session.

### 10.4 Dogfooding

From M1 onwards, Orbit is your only browser. Keep Chrome installed purely for emergencies. Log every friction point in `docs/PROGRESS.md` under "Annoyances", tag it P0/P1/P2, and review the list at the start of each phase. The best feature ideas will come from this list.

---

## 11. Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | A must-have extension doesn't work in Electron (especially password managers using native messaging) | Medium | High | Audit in Phase 0; test early; fall back to the manager's desktop app or a web-vault workflow; pull extension work forward if needed |
| R2 | Google blocks sign-in as an "embedded browser" | Medium | High | Clean Chrome UA from day 1; verify in Phase 1; keep popups as real windows |
| R3 | M1 slips past 22 Dec | Medium | Medium | Cut line; bridge with Zen or Dia; backup protects your data |
| R4 | Memory usage too high with many tabs | Medium | Medium | Sleeping tabs (Phase 4), LRU limit, background throttling |
| R5 | Web views misaligned with shell UI (flicker, overlap) | High early | Medium | Main-owned LayoutEngine; one source of truth for rects; e2e checks after resize/toggle |
| R6 | Popover hidden behind web content | Certain without design | Medium | Overlay view (ADR-006) |
| R7 | DRM sites (Netflix, Spotify Web) don't play | Certain on stock Electron | Low–Medium | Use native apps, or castLabs ECS in Phase 11 |
| R8 | Electron upgrades break APIs | Medium | Medium | Pin versions; upgrade deliberately once per milestone; read release notes; e2e tests catch regressions |
| R9 | Arc's sidebar file format is hard to parse | Medium | Medium | Back up now; parse from your actual file with tests; manual recreation as fallback |
| R10 | Scope creep (building Easels before the sidebar is solid) | High | High | Follow phase order; backlog everything else; review PROGRESS weekly |
| R11 | AI-generated code becomes tangled | Medium | High | Small slices, tests on pure logic, strict layering, regular review by the second tool |
| R12 | Security hole via IPC or injected scripts | Low–Medium | High | Section 4.8 rules; review checklist; never expose APIs to web content |

---

## 12. Packaging, signing and updates

- **Personal use (M1–M2):** `electron-builder --mac --arm64` produces a DMG. Unsigned apps open with right-click → Open the first time. That's enough for you alone.
- **Sharing with others:** join the Apple Developer Program, sign with a Developer ID certificate, and notarise (electron-builder supports both). Unsigned/unnotarised apps show scary Gatekeeper warnings.
- **Auto-updates:** electron-updater with GitHub Releases. On macOS, auto-update requires a signed app.
- **Default browser** registration needs the `http`/`https` URL schemes (and HTML document types) in the app's Info.plist, configured through electron-builder.
- **Fuses:** apply `@electron/fuses` at build time (section 4.8).
- **Versioning:** SemVer tags (`v0.1.0` = M1, `v0.5.0` = M2, `v1.0.0` = M3) with a short CHANGELOG.

---

## 13. Appendices

### Appendix A — Keyboard shortcuts

Based on Arc's defaults as best remembered; verify against Arc's own menu bar before it's gone, and treat everything as rebindable in Settings.

| Action | Shortcut |
|---|---|
| Command bar / new tab | ⌘T |
| Edit current URL | ⌘L |
| Toggle sidebar | ⌘S |
| Copy URL | ⇧⌘C |
| Copy URL as Markdown | ⇧⌥⌘C |
| Pin / unpin tab | ⌘D |
| Close tab (archives Today tabs) | ⌘W |
| Reopen closed tab | ⇧⌘T |
| New split | ⌃⇧= (from Img 2) |
| New easel | ⌃⇧E (from Img 2) |
| Switch to space 1–9 | ⌃1 … ⌃9 |
| Previous / next space | ⌘⌥← / ⌘⌥→ |
| Go to tab/favorite 1–9 | ⌘1 … ⌘9 |
| New Little Orbit (global) | ⌥⌘N |
| New window | ⌘N |
| Find / next / previous | ⌘F / ⌘G / ⇧⌘G |
| Zoom in / out / reset | ⌘+ / ⌘− / ⌘0 |
| Reload / hard reload | ⌘R / ⇧⌘R |
| Back / forward | ⌘[ / ⌘] |
| Developer tools | ⌥⌘I |
| Print | ⌘P |
| Settings | ⌘, |

### Appendix B — `CLAUDE.md` starter

```markdown
# Orbit — instructions for AI agents

Orbit is a personal Arc-style browser for macOS built with Electron, React and TypeScript.
The full plan is in docs/PLAN.md. Progress is logged in docs/PROGRESS.md.

## Commands
- npm run dev        — start the app with hot reload
- npm run typecheck  — TypeScript, must pass
- npm run lint       — ESLint + Prettier, must pass
- npm test           — Vitest unit tests, must pass
- npm run test:e2e   — Playwright end-to-end tests
- npm run build      — production build

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
```

### Appendix C — ADR template (`docs/decisions/ADR-NNN-title.md`)

```markdown
# ADR-NNN: <decision title>
- Status: proposed | accepted | superseded by ADR-XXX
- Date: YYYY-MM-DD

## Context
What problem are we solving? What constraints matter?

## Options considered
1. Option A — pros / cons
2. Option B — pros / cons

## Decision
What we chose and why.

## Consequences
What becomes easier, what becomes harder, what we'll need to revisit.
```

### Appendix D — `docs/PROGRESS.md` template

```markdown
# Progress log

## Current phase: Phase N — <name>
Target end: <date>

## Done
- 2026-11-04 — WindowManager with vibrancy and traffic lights [F-01] (commit abc123)

## In progress
- LayoutEngine v1 [F-01]

## Decisions made
- Using native menus for tab context menus (see ADR-006)

## Known issues
- Sidebar flickers on fast resize (investigate in Phase 1 polish)

## Annoyances (from dogfooding)
- [P1] Command bar doesn't rank Gmail first when typing "gm"

## Backlog (ideas outside the current phase)
- Vertical split in Little Orbit
```

### Appendix E — Glossary

| Term | Meaning |
|---|---|
| Shell | The React UI that draws the sidebar, toolbars and bottom bar (the window's own webContents) |
| Overlay | A transparent web view on top of everything, used for floating UI |
| Web view | A `WebContentsView` showing a web page |
| Space | A context with its own pinned/Today tabs and theme |
| Profile | An isolated browsing identity (cookies, storage, extensions) |
| Favorites | The tile grid at the top of the sidebar, shared per profile |
| Pinned | Persistent sidebar items above the divider |
| Today | Temporary tabs below the divider, subject to auto-archive |
| Sleeping tab | A tab whose web view has been destroyed to save memory; reloads on click |
| Peek | A floating preview of a link that can be promoted to a tab |
| Little Orbit | Small floating window for links opened from other apps |
| Boost | A per-site customisation (CSS, JS, colours, fonts, zapped elements) |
| Easel | A freeform canvas with drawings, notes and web captures |
| ADR | Architecture Decision Record — a short document explaining a decision |
| Intent | A request from a renderer to the main process to change state |

### Appendix F — References

These are written from memory without live web access, so double-check each link and API name against the current docs before relying on it.

- Electron documentation: https://www.electronjs.org/docs/latest — especially `WebContentsView`, `BaseWindow`/`BrowserWindow`, `session`, `protocol`, `webContents`, `Menu`, `ShareMenu`, `safeStorage`, security checklist, and Electron Fuses
- Electron releases (choose and pin a version): https://releases.electronjs.org
- electron-vite: https://electron-vite.org
- electron-chrome-extensions and electron-chrome-web-store (by Samuel Maddock): https://github.com/samuelmaddock/electron-browser-shell
- castLabs Electron for Content Security (Widevine): https://github.com/castlabs/electron-releases
- Node.js `node:sqlite`: https://nodejs.org/api/sqlite.html
- dnd-kit: https://dndkit.com · cmdk: https://cmdk.paco.me · Motion: https://motion.dev
- Excalidraw: https://github.com/excalidraw/excalidraw · CodeMirror 6: https://codemirror.net
- Zen Browser source (design reference for vertical tabs and workspaces): https://github.com/zen-browser/desktop
- Anthropic API docs (for Tidy): https://docs.claude.com

---

*End of plan. Next step: complete the backup checklist, then start Phase 0.*
