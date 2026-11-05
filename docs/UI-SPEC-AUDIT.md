# UI redesign and implementation spec — audit and plan

Spec: `orbit_ui_redesign_implementation_spec.md` (owner, 2026-11-05) with the references in
`NEW UI REF IMAGES/`. **UI 1** is the app rail, the Arc-style sidebar, the Orbit menu and the
Assistant panel. **UI 2** puts the pinned-app grid inside the sidebar. **UI 3** has horizontal
tab pills and Spotify open in a side panel beside the rail. The owner asked for the audit and
then all milestones without stopping at a plan.

## What the references show

**Canvas**

- The wallpaper covers the whole window. Every piece of chrome floats on it as a rounded glass
  island: rail, sidebar, toolbar pills, panels, the dock and widgets.
- Web pages sit in a rounded card. The Homepage has no card; the wallpaper simply continues.

**Glass**

- A light frosted tint over a mid-dark wallpaper, with white text, fine bright borders, a soft
  inner top highlight and gentle shadows.
- The selected row is a brighter tinted pill that takes its accent from the wallpaper (violet
  in the references).

**Top row**

- Traffic lights, then the `Orbit ⌄` pill (UI 1 and UI 3; in UI 2 it sits inside the sidebar).
- A back / forward / reload pill and a wide address pill with an AI sparkle.
- Right-hand tools: Focus, Assistant, Notes and a profile avatar. UI 3 puts its tab pills here.

**Orbit menu**

- A compact glass menu: Orbit Home ⌘1, Command Bar ⌘K, Workspaces ›, Profiles, Sync & Backup
  (with a status) and About Orbit.

**Sidebar (UI 1)**

- New Tab (selected), Projects, Notes, Tasks, Easels, a divider, then "Spaces" with a cloud
  icon followed by the Spaces (icon and dot) and Add Space.
- A bottom row with cloud, + and settings.

**App rail**

- Pinned apps, an indicator bar on the app shown in the panel, + at the foot.
- In UI 3 it also has Home and AI at the top and Settings at the bottom.

**Homepage**

- Large time and date, "Good Morning, Name 👋" and a motto.
- A command field: sparkle, "Ask Orbit anything, search the web, or use voice…", ⌘K and an
  accent microphone.
- A 3-column grid of glass widgets: Focus ring, Projects with progress, Quick Access, Recent,
  Quote and Notes checklist.
- A dock capsule: launcher, favourites, +.

**Assistant panel**

- Deep glass with segmented tabs (Assistant / Projects / Tasks / Focus) and close.
- Model picker, an "Ask Orbit" hero, suggestion rows, chips, and a composer with a microphone.

## What exists (reuse, don't replace)

| Area        | Today                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Window      | `BaseWindow` with native vibrancy (`sidebar`) and a hidden-inset title bar. Web pages, the Homepage, the panel and the overlay are `WebContentsView`s placed by main (`LayoutEngine` → `computeLayout`, pure, unit-tested). The shell renderer draws the chrome where the layout says.                                                                                                                     |
| Theme       | `ThemeEngine` (`src/shared/theme.ts`) turns the active Space's colours into CSS variables. UI prefs (`src/shared/ui-prefs.ts`, setting `ui`) cover accent, font, density, text size, glass/solid surfaces and motion; they are broadcast as `state:ui` and `ui:update`. Light, dark or system appearance. Tokens and surfaces live in `src/renderer/styles/tokens.css`.                                    |
| Wallpaper   | `WallpaperService` (`src/main/newtab/wallpaper-service.ts`, setting `newtab.wallpaper`): built-in CSS wallpapers including the atmospheres, your own image, a colour, a gradient or an Unsplash photo. It also stores the look sliders, favourites and rotation. It is drawn only by the Homepage (`Wallpaper` in `backgrounds.tsx`). **No palette extraction.**                                           |
| Tabs        | One model (`TabManager`, sidebar snapshot: favourites, pinned, folders, Today). Setting `tabs.layout` is `sidebar` or `top`; `TabStrip.tsx` already draws the tabs-on-top strip, and ⌘-number and ⌃Tab work in both layouts.                                                                                                                                                                               |
| Toolbar     | `Toolbar.tsx`, inside each content card (white): nav, an address button that opens the command bar to edit, page actions, Focus, ✦ Assistant, Notes, the "Hey Orbit" indicator and the profile avatar (top right already).                                                                                                                                                                                 |
| Sidebar     | `Sidebar.tsx`: title strip and toggle, Arc address pill, favourites grid (pinned apps), workspace nav (Projects / Notes / Tasks / Easels), pinned tabs and folders, Space header (Clear, Tidy), + New Tab, Today, media card, downloads, Focus chip, and a bottom bar (Library, appearance, Settings, Space switcher, +). Drag and drop through `dnd.ts`. When hidden, the overlay floats a copy on hover. |
| Pinned apps | Favourites are the pinned apps. Each has an "opens in panel / tab" choice and a set of Spaces it shows in. Managed in Settings → Apps (`AppsSection`) and the **App Library** overlay (⇧⌘A: search, catalogue, typed addresses).                                                                                                                                                                           |
| Side panel  | The right **dock** (`layout.notes`) holds the Notes panel page (`#/notes/panel/...`: Notes, Projects, Tasks, Assistant, Toolkit, Focus, on a transparent page) or a docked app (`AppPanel`, with the header drawn by the shell: switcher, back, reload, Open as Tab, close, load-error card). It is resizable, slides in over 240 ms and reverses mid-slide.                                               |
| Homepage    | `NewTabPage.tsx`: wallpaper, clock, greeting and motto, the command input (Ask / Search / Open, mic), 15 widget types with real data (Today, Focus, Projects, Notes, Recent, Weather, Countdown, Clocks, Stopwatch, Palette, Quote, Apps, Spaces, Ask, Drive), edit mode, per-Space layouts and a Mac-style Dock.                                                                                          |
| Assistant   | `AssistantView.tsx`: model picker, attachments (only what is actually attached or retrieved is sent), browser tools, voice microphone and read-aloud.                                                                                                                                                                                                                                                      |
| Menus       | Floating UI lives in the overlay renderer: command bar, profile menu, context menus (native), cards.                                                                                                                                                                                                                                                                                                       |
| Motion      | No library: CSS tokens (`--dur-*`, `--ease-*`) and keyframes; `.motion-reduced` and `prefers-reduced-motion`; `.surfaces-solid`; macOS Reduce Transparency.                                                                                                                                                                                                                                                |

## Gaps

1. **No wallpaper canvas.** The chrome sits on native vibrancy and the toolbar is inside a
   white card, so nothing can blend with the wallpaper.
2. **No palette extraction.** The accent and glass don't follow the wallpaper.
3. **Material tiers are incomplete.** There is no light / standard / deep / elevated / solid
   hierarchy with centralised tint, opacity, blur, border, highlight and shadow.
4. **No top toolbar row, Orbit menu or address pill.** Horizontal tabs exist, but as a plain
   strip.
5. **No app rail.** Pinned apps appear only as the sidebar grid, and there is no rail / grid
   choice.
6. **The side panel is only on the right.** Its header is white rather than glass, and the
   Notes panel is opaque.
7. **The sidebar hierarchy differs from §11.** Spaces are icons in the bottom bar rather than a
   list under a cloud heading.
8. **The Homepage default layout is sparse** (Today and Quote only), and its widgets are not on
   a common glass-card system tied to the wallpaper.

## Decisions (least disruptive, matching the references)

**Canvas**

- The shell paints the current wallpaper behind everything, replacing native vibrancy.
- Islands use CSS `backdrop-filter` over the shell's own canvas. It's the same document, so it
  is cheap; the canvas stays still.
- **Homepage seam:** the Homepage draws the same wallpaper aligned to the _window_ (main tells
  it where its view sits), so it looks continuous with no card edge. Its widgets blur their own
  copy, which gives real glass.
- **Panel glass:** the transparent panel page sits on a deep-glass island drawn by the shell.

**Palette**

- Extracted locally in main and cached per wallpaper (setting `canvas.palette`). Nothing is
  uploaded. Sources:
  - Built-ins, colours and gradients: parsed from their CSS.
  - Your image: a 48 px thumbnail.
  - Unsplash: its small thumbnail, which is already public.
- Pure maths lives in `src/shared/canvas-theme.ts`, with unit tests: tone, accent, second
  accent, glass tiers by intensity, and text contrast enforced at ≥ 4.5:1 over the average.

**Theme preferences** (all in the existing `ui` preferences):

- `palette: auto | off` (Off brings back the Space colours).
- `glass: subtle | balanced | strong`.
- The existing `accent` acts as the manual override; Auto clears it.
- `apps: rail | grid` (UI 1 or UI 2).
- `appSide: left | right` (where pinned apps open).

**Toolbar**

- One top row: the Orbit menu, nav pill, address pill, page actions, then Focus, Assistant,
  Notes and profile.
- With horizontal tabs, row 1 holds the tab pills and row 2 the nav and address pills, so
  nothing overlaps.
- Split view: each pane card gets a slim header (title, swap, close split).

**Orbit menu**

- An overlay menu with only working items: Orbit Home, Command Bar, Spaces ›, Profiles, Sync &
  Backup (Settings → Account), Settings, About Orbit and Quit.
- Real shortcuts only. A sync status is shown only if the account is really syncing.

**Sidebar (UI 1)**

- The order follows §11: New Tab, Projects, Notes, Tasks, Easels, divider, Spaces with the
  cloud icon, then the Spaces.
- The **active Space expands to show its tabs** (Clear, + New Tab, pinned, Today) so the Arc
  tab list stays.
- Add Space, then the bottom row: Library, Settings and appearance.
- The profile stays top right.

**Rail**

- Pinned apps from the same favourites data, with an indicator bar on the app open in the
  panel and + opening the App Library.
- The context menu and drag-to-reorder reuse the existing ones.
- With horizontal tabs, Home, Assistant and Settings join the rail (UI 3).

**App panel**

- Opens beside the rail on the left by default (UI 3), with Right as an option. It is a second
  dock in the layout, so Notes or the Assistant can stay on the right at the same time.

**Motion**

- No new library: the CSS tokens and transitions already in place (see REDESIGN-AUDIT).

## Milestones (each tested and committed)

1. **Foundation:** canvas-theme maths and tests, the palette service with caching, material
   tokens and classes, the new prefs, and the shell painting the wallpaper canvas.
2. **Shell and tabs:** the layout geometry (rail, sidebar island, toolbar row, two-row
   horizontal), the new toolbar, the Orbit menu and horizontal tab pills.
3. **Sidebar and apps:** the §11 hierarchy, the rail and the grid, App Hub entry points.
4. **Panels:** the left app dock, glass headers, the deep-glass Notes / Assistant panel and the
   motion.
5. **Homepage:** window-aligned wallpaper, the reference composition, glass widgets, the dock,
   and the default layout for new profiles.
6. **Polish:** Settings → Appearance controls, accessibility (reduced motion and transparency),
   performance in the packaged app, and the full test suites.

## What was done (2026-11-05)

| Milestone          | Done                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Foundation       | **Wallpapers:** the owner's 8 wallpapers ship as built-in photos; Misty Sunrise is the default for new profiles. **Canvas:** the shell paints the wallpaper behind the whole window. **Palette:** read on this Mac (CSS for built-ins, a 48 px thumbnail for photos), cached per wallpaper in `canvas.palettes`, and turned into tone, accent, second accent and four glass tiers. Text contrast is ≥ 4.6:1 over the average, with an opaque fallback for Solid surfaces and Reduce Transparency. **Materials:** `.mat-light`, `.mat`, `.mat-deep`, `.mat-elevated`, `.mat-sel`, `.mat-hover`. |
| 2 Shell and tabs   | **Toolbar row:** Orbit menu, nav pill, address pill (copy link, site controls, screenshot, save, find), then Focus, Orbit AI, Notes and profile. **Orbit menu:** an overlay with real actions and sync's real state. **Horizontal tabs:** floating pills (drag to reorder, sideways scrolling, close, new tab) with an address row over the page; switching keeps every tab. **Split view:** each pane gets a slim header. Narrow windows give the address the room.                                                                                                                           |
| 3 Sidebar and apps | **Sidebar (§11):** New Tab, Projects / Notes / Tasks / Easels, then Spaces under a cloud heading, with the active Space expanded (Clear, Tidy, + New Tab, pinned, Today). Then Add Space and a utility row. **One favourites list, two presentations:** the app rail (UI 1 and UI 3) and the sidebar grid with labels (UI 2). **Rail:** a marker on the app open beside the page, drag to reorder or pin, the context menu, and + for the App Library. New apps open beside the page by default.                                                                                               |
| 4 Panels           | **Apps beside the rail (UI 3):** they slide in while the page makes room; they're resizable; Notes can stay open on the right; Settings can put them on the right instead. **Glass:** the app header is glass and the app's page is an inset card. The Notes / Projects / Tasks / Assistant / Focus panel is see-through deep glass in the wallpaper's tone. The overlay's menus follow the canvas tone.                                                                                                                                                                                       |
| 5 Homepage         | **Wallpaper:** aligned to the window, so it meets the canvas without a seam. **Top of page:** larger time and greeting, and the command field ("Ask Orbit anything, search the web, or use voice…", ⌘K, accent microphone). **Widgets:** on glass, with icon and title headings. New profiles start with Focus, Projects, Quick Access, Recent, Quote and Today. **Dock:** gentle lift and an App Library launcher.                                                                                                                                                                            |
| 6 Polish           | **Settings → Appearance:** wallpaper picks, Match the wallpaper (off: neutral glass that follows Light / Dark), glass level, photo dimming, tab layout, rail or grid, and where new apps open. **Performance:** idle CPU about 1% on the GPU process. **Tests:** the layout preference, both app presentations, wallpaper-driven theme with overrides, and the Orbit menu.                                                                                                                                                                                                                     |

**Decisions for the owner**

- **Native vibrancy is retired:** the wallpaper is the canvas now.
- **The Homepage's "Light / Dark glass" button is gone:** the glass follows the wallpaper.
- **Sample projects on first run:** Orbit seeds the owner's sample projects the first time, an earlier owner request. The Homepage now shows Projects by default, so a new profile sees them; the spec says no demo data. Keep or remove?
- **Wallpaper resolution:** the supplied wallpapers are 1456–1920 px wide, which is soft on a 5K display. Larger originals would help.
- **Not built:** a Recent widget for files on this Mac. Orbit can only show what it really knows: recently visited pages, and Drive's recent files once Drive is connected.
