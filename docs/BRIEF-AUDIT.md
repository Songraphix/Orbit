# Product Evolution Brief — audit and plan (2026-11-02)

The audit the brief (`orbit_product_evolution_brief.md`, §16) asks for before any work: what
Orbit already has, a Keep / Improve / Build / Defer call for every area, the files involved,
constraints, a milestone plan and the decisions only the owner can make. No code was changed
for it.

## 1. Architecture in brief

- **Electron 45 + React 19 + TypeScript + Tailwind 4**, three renderers: the **shell** (each
  window's chrome: sidebar, toolbar, card), the **overlay** (floating UI: command bar, menus,
  prompts, Peek, tooltips) and **internal pages** (`orbit://…`: Homepage, Settings, Library,
  Easels, the productivity panel). Web pages are sandboxed `WebContentsView`s with no preload.
- **Main is the source of truth.** Renderers send typed intents (`src/shared/ipc/contract.ts`,
  zod-validated, sender-checked) and render pushed state (`state:*` events).
- **Persistence:** one SQLite database (`node:sqlite`, 19 additive migrations) plus a typed
  key/value `settings` table (`src/shared/settings.ts` — every preference, with schema and
  default). This is already the central preferences store the brief asks for.
- **Profiles** are Electron session partitions (cookies, storage, permissions isolated); each
  Space belongs to a profile.
- **Design tokens:** `src/renderer/styles/tokens.css` (theme variables per Space, motion curves
  and durations, glass material, light/dark palette scopes `.ui-light` / `.ui-dark`, reduced
  motion), `src/renderer/notes/notes.css` (panel palette `--note-*`, `--work-*`). Spacing and
  type use Tailwind's default scales; there are no named type roles.
- **Tests:** 382 unit (Vitest), 123 end-to-end (Playwright driving the real app, temp profiles).

## 2. Feature inventory (what exists today)

| Area               | What's there                                                                                                                                                                                                                      | Where                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Split Screen       | Two panes, drag divider, swap, Close Split View (×), saved per Space, sidebar "Open in Split View"                                                                                                                                | `src/main/tabs/split.ts`, `tab-manager.ts`, `shell/ShellApp.tsx`                             |
| Side Notes         | Notes panel (docked right), floating notes, note tabs, notes linked to projects                                                                                                                                                   | `src/main/notes/*`, `internal/notes/*`, `renderer/notes/*`                                   |
| Profiles           | Partitions per profile, Space → profile, name/avatar, Settings → Profiles                                                                                                                                                         | `src/shared/profile.ts`, `main/sidebar/*`                                                    |
| Spaces             | Arc-style Spaces with theme colours, icons, templates, share/export, Live Folders                                                                                                                                                 | `main/sidebar/*`, `shell/sidebar/*`                                                          |
| Homepage           | Greeting + name, clock, search, shortcuts row (seeded from top sites), **Today** (real tasks), quote, 8 gradient wallpapers or your image, dark/light glass, show/hide 3 widgets                                                  | `internal/newtab/NewTabPage.tsx` (815 lines), `main/newtab/*`, `main/ipc/handlers/newtab.ts` |
| Sidebar "services" | **Favorites** grid (app icons, per profile), pinned tabs, folders, Library, Projects/Notes/Tasks rows, Peek, Little Orbit windows                                                                                                 | `shell/sidebar/FavoritesGrid.tsx`, `WorkspaceNav.tsx`                                        |
| Settings           | General (Appearance, Tabs…), Profiles, Workspaces, Rules, Integrations, Backup, Shortcuts, AI, Privacy, About; light/dark                                                                                                         | `internal/SettingsPage.tsx` (1,580 lines)                                                    |
| Toolkit            | Colors (pick, page palette, palette generator, gradient, image palette), Contrast, Type, Image, CSS, Code, Dev (JSON tree, responsive mode, local servers)                                                                        | `internal/toolkit/*`, `main/toolkit/*`                                                       |
| Focus Timer        | Timestamp-based session (survives restart), task/project link, 15/25/50/90 min, pause, +5, breaks, site blocking, toolbar pill, panel Focus view                                                                                  | `main/focus/service.ts`, `internal/focus/*`, `shell/FocusPill.tsx`                           |
| Focus Music        | 12 generated sounds (nature, noise, binaural, drone, bowls), volume, pause, one hidden player                                                                                                                                     | `main/focus/sounds.ts`, `internal/sounds/*`                                                  |
| Projects & tasks   | Projects (status, dates, colour, Space, GitHub), tasks, board, research captures, templates, CSV/Markdown import/export                                                                                                           | `main/persistence/repositories/work.ts`, `internal/work/*`                                   |
| Context menus      | Page: back/forward/reload, summarize, ask, save to Orbit, annotate, inspect. Selection: copy, search, ask, make tasks, new note, save. Link, image (open, save, copy, address, save to Orbit, info). Sidebar item and Space menus | `main/tabs/context-menu-model.ts`, `main/sidebar/actions.ts`                                 |
| AI                 | Page/selection/research Q&A with citations, summarize, tasks from text, coworker tools (projects/tasks/focus), Tidy, usage log and monthly limit; Anthropic only                                                                  | `main/ai/*`, `internal/assistant/*`                                                          |

## 3. Keep / Improve / Build / Defer

| Brief area                   | Call                                       | Why / what                                                                                                                                                        |
| ---------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Split Screen                 | **Keep**                                   | Reliable, tested, now has a clear close button.                                                                                                                   |
| Side Notes                   | **Keep**                                   | Linked to projects already. Small: "link to this page" later.                                                                                                     |
| Profiles                     | **Keep**                                   | Partitions isolate sessions; verified by e2e.                                                                                                                     |
| Spaces                       | **Improve** (later)                        | Per-Space Homepage layout and app collection (M9).                                                                                                                |
| Homepage                     | **Improve**                                | Make it modular: widget registry, order, size, add/remove, edit mode; new widgets (M3).                                                                           |
| Backgrounds                  | **Improve**                                | Has 8 gradients + own image. Add solid, gradient builder, image adjustments, favourites, shuffle/daily rotation, more built-ins (M4). Unsplash needs a decision.  |
| App Hub                      | **Improve**                                | Extend Favorites into groups of apps added by URL, with icon, rename, opening mode and Space visibility (M5). No second launcher.                                 |
| Focus Timer / Music          | **Keep** + small **Improve**               | Homepage widget, sidebar indicator, daily totals, notification/sound switches (M7). No new timer.                                                                 |
| Customization engine         | **Build** (on the existing settings table) | One `ui` preference group: feature visibility, density/UI scale, accent override, transparency/blur with a solid option, motion (M2).                             |
| Glass & visual               | **Improve**                                | Adjustable via M2; keep reading/Settings surfaces solid.                                                                                                          |
| Context menus                | **Improve**                                | Gaps only: tab (Duplicate, Mute, Close Others, Reload, Move to New Window), selection (Explain, Translate), page (Split With…, Save Page As), Homepage menu (M6). |
| Design system                | **Improve**                                | Named type roles, radius/surface/focus tokens, shared Button/IconButton/Toggle/Segmented/Row primitives; Settings first (M1).                                     |
| Settings & Toolkit hierarchy | **Improve**                                | Settings: section descriptions, toggles instead of checkboxes, an Appearance section. Toolkit: group into Colour, Type, Images, CSS & Code, Dev (M1/M2).          |
| Projects connections         | **Keep** + small **Improve**               | Project ↔ Space, tasks, notes, research, focus exist. Add a project's pinned apps with App Hub (M5).                                                              |
| Page-aware AI                | **Keep** + **Improve**                     | Exists with citations. Add Explain/Translate selection and Compare two tabs (M8).                                                                                 |
| Project-aware AI             | **Improve**                                | Tools exist; add an explicit "Share project" chip (brief, tasks, notes) (M8).                                                                                     |
| Workflow intelligence        | **Defer**                                  | Needs usage signals and consent design; after M1–M8.                                                                                                              |
| AI memory, provider choice   | **Defer**                                  | Speculative now; Anthropic only.                                                                                                                                  |
| Weather widget               | **Defer** (needs a decision)               | Needs a provider and a location.                                                                                                                                  |
| Calendar widget              | **Defer**                                  | No calendar source in Orbit yet.                                                                                                                                  |

## 4. Reference images (UI REFERENCE/) — what to borrow

| Image                  | Qualities to borrow                                                                                                        | Not to copy                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| S1 (task app panels)   | Calm dark surfaces, roomy rows with count badges, strong title type, layout choice as picture cards                        | Its branding and the "@dash" chat                                         |
| S2 (pomodoro)          | One large ring timer, segmented focus / short break / long break, generous space                                           | Exact colours                                                             |
| S3 (new-tab dashboard) | Widget grid on a wallpaper, Edit and + Widget buttons, small/medium tiles, countdown, focus tile                           | Stocks, FX, battery, news (no reliable local source; not Orbit's purpose) |
| S4 (new tab)           | World clocks row, Today's tasks card, quiet glass over a photo, round shortcuts                                            | Google Tasks source                                                       |
| S6 (Raycast settings)  | Label column on the left, controls on the right, icon tab bar, Appearance as three icon buttons, picture choices for modes | Pro upsell                                                                |
| S7 (macOS settings)    | Native rows: toggles, steppers, popups, hairline separators, section headers                                               | —                                                                         |

## 5. Constraints and risks

- **Sidebar web panels** (an app docked beside the page, like Vivaldi/Opera) are a new kind of
  view. The Notes panel dock can host one `WebContentsView`, but sites that block framing don't
  matter here (it's a real view, not an iframe); sign-in pop-ups and profiles do. Decision below.
- **Image providers:** Unsplash requires a registered app key, attribution, hot-linking their
  URLs and pinging a download endpoint. It can't ship without the owner's key.
- **Weather:** needs a provider (Open-Meteo is keyless) and a location (typed city — no IP
  geolocation without consent).
- **UI scale:** Electron zoom factors apply per `webContents`; Orbit's renderers can be scaled
  together, web pages keep their own zoom.
- **Transparency:** the sidebar sits on macOS vibrancy; "solid" means an opaque fill per theme.
- **Data:** all additions are new settings keys or additive migrations; nothing existing is
  rewritten.

## 6. Plan (small milestones, each tested and committed)

1. **M1 Design-system foundations.** Type roles, radius/surface/focus tokens; shared primitives
   (Button, IconButton, Toggle switch, Segmented, Setting row); apply to Settings (S6/S7 look:
   label left, control right, toggles, section descriptions, icon Appearance picker).
2. **M2 Customization engine.** `ui.prefs`: feature visibility (Projects, Tasks, Notes, Focus,
   Assistant, Toolkit, Library), density + UI scale, accent override, transparency (glass/solid),
   motion. Settings → new **Appearance** section. Hiding never deletes data.
3. **M3 Homepage widgets.** Registry + persisted layout (order, size, per-widget settings),
   Edit mode with drag reorder and + Widget; widgets: existing ones plus Focus (timer + sounds),
   Projects/progress, Recent notes, Recently visited, Countdown, World clocks, Stopwatch,
   Colour palette. Reset layout; presets (Minimal, Developer, Designer, Researcher).
4. **M4 Backgrounds.** Solid, gradient builder, image adjustments (brightness, blur, saturation,
   contrast, overlay, position, fit), favourites, shuffle, daily rotation, more built-ins,
   readable overlay; preview before apply.
5. **M5 App Hub.** Favorites grow into app groups: add by URL, icon, rename, reorder, group,
   opening mode (tab / Little Orbit window / Peek / docked panel if approved), per-Space
   visibility, right-click menu.
6. **M6 Context menus.** Tab, selection, page and Homepage gaps (§3).
7. **M7 Focus integration.** Sidebar indicator, daily totals (local only), notification and
   sound switches, reliability tests (minimised window, Space switch, idle).
8. **M8 AI.** Explain/Translate selection, Compare two tabs, explicit project context chip.
9. **M9 Per-Space customization.** Homepage layout, app collection and accent per Space with
   clear "global vs this Space".

## 7. Owner decisions (2026-11-02)

1. App Hub: **build docked web panels** (beside the page, the Space's profile), as well as tab /
   Little Orbit window / Peek.
2. Backgrounds: **built-ins, your images and colours, and Unsplash** (with the owner's API key,
   attribution and Unsplash's API rules).
3. Weather: **yes — Open-Meteo, for a city you type** (only the city name goes out).
4. Homepage: **one layout first**; per-Space layouts in M9.

## 8. Progress

- M1 design-system foundations — done (5cf14cc)
- M2 customization engine — done (1689165)
- M3 Homepage widgets — done (8a8cfed)
- M4 Backgrounds — done (e0ef9b2)
- M5 App Hub — done (521aa62)
- M6 Context menus — done
