# UI redesign — audit and plan ("Quietly Alive")

Brief: `orbit_ui_motion_redesign_brief.md` (owner, 2026-11-05). Milestone 0: what exists, what
changes, risks, tests. Owner asked to run every milestone without pausing.

## What's there

| Area      | Today                                                                                                                                                                                                                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stack     | React 19 + Tailwind 4 (`@theme` tokens in `src/renderer/styles/tokens.css`), lucide icons (one family, 2px stroke), Comfortaa by default (owner's choice; Settings → Appearance offers SF Pro and others)                                                                                                                                                    |
| Theme     | Per-Space ThemeEngine (`src/shared/theme.ts`) writes CSS variables for the sidebar; `ui-prefs` (accent, font, density, text size, glass/solid surfaces, motion full/reduced) applies everywhere; light/dark/system appearance                                                                                                                                |
| Materials | Main window: **native macOS vibrancy** (`vibrancy: 'sidebar'`, `titleBarStyle: 'hiddenInset'`) — the real system material behind the sidebar. Overlay: `Glass` (a blurred snapshot of the page behind it, since CSS can't blur native web views), `.glass` / `.glass-solid` classes; the Homepage has its own `glass(light)` helper (blur 2xl on every card) |
| Motion    | No animation library. CSS keyframes + tokens (`--ease-out`, `--ease-spring`, `--dur-fast/240/380`); `prefers-reduced-motion` and an in-app `.motion-reduced`; `.surfaces-solid` for reduced transparency                                                                                                                                                     |
| Homepage  | `src/renderer/internal/newtab/`: wallpaper (built-in meshes, Unsplash, own images, look sliders), clock, greeting, tagline, search box, widget grid (15 types, edit mode, per-Space layouts), Mac-style Dock with magnification, Customize panel, context menu                                                                                               |
| Chrome    | Shell (`src/renderer/shell/`): sidebar (rows, favourites tiles, Spaces bar), content card with toolbar, docked panel header, split divider; overlay: command bar, Peek, menus, cards                                                                                                                                                                         |
| Window    | Hidden-inset title bar, traffic lights at (16,16), drag regions in the sidebar/toolbar — keep as is                                                                                                                                                                                                                                                          |

## Gaps against the brief

1. No shared **surface vocabulary**: glass values are scattered (Homepage helper, `.glass`,
   inline classes); every Homepage card is heavy glass (the brief wants solid content surfaces
   for information, glass for controls).
2. Palette leans **saturated purple/teal** (default "Aurora" wallpaper, violet accent); the brief
   asks for atmospheric blue, sea-glass, mist, pearl, sand with one restrained accent.
3. Homepage hierarchy: very large clock and greeting; a search box only for the web; corner
   buttons 48 px; the AI entry point is buried (⌘J / a widget).
4. Motion tokens cover curves but not the brief's timing scale (hover/press/popover/panel/modal/
   layout/stagger); no **ambient background** motion with an off switch.
5. Reduced transparency follows Orbit's own setting only, not macOS's.

## Decisions

- **No animation library** for now: CSS transitions/keyframes and grid-row expansion cover the
  slice; Chromium's View Transitions are available if a shared-element transition needs them.
  Revisit only if layout animations get hard (then Motion for React, one library).
- **Native first:** keep the window's real vibrancy; CSS `backdrop-filter` only on small floating
  controls over the Homepage atmosphere (where it's cheap and the content is Orbit's own).
- **Keep Comfortaa** (the owner chose it; SF Pro is one click away in Appearance).
- New **atmosphere wallpapers** drawn in CSS (no copied assets), the new default for new
  profiles; existing choices stay.

## Plan (each step tested and committed)

1. **Foundation:** palette, surface classes (content, frost, clear glass, popover, selected,
   quiet), radius and motion scales, focus ring, macOS reduced-transparency.
2. **Homepage slice:** atmosphere wallpapers with slow, optional drift; compact floating
   controls; restrained clock/greeting; **"Ask Orbit or search the web…"** command input with
   mic and a route row (search / ask / open), expanding smoothly; widgets on content surfaces;
   a quieter Dock. Check it in the running app (screenshots), light and dark.
3. **Chrome, App Hub, panels:** toolbar and tab states, an **App Library** (search, grid,
   pinned / available / open), side panels that slide in from the right with the page
   resizing smoothly.
4. **Motion polish:** consistent hover/press/focus, voice and AI states (only real audio drives
   the meter), reduced-motion fallbacks.
5. **Whole app:** Settings, Notes panel, Toolkit, Focus, menus and cards on the same surfaces.

## Risks and tests

- Visual changes can break e2e selectors: keep test ids; run the full suite at each step.
- Performance: animate transform/opacity only; ambient drift paused for reduced motion and when
  the page is hidden; check in the packaged app.
- Legibility over bright wallpapers: a scrim behind the clock/controls; light/dark Homepage
  glass already adapts.

## What was done (2026-11-05)

| Step       | Done                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Foundation | Palette tokens (`--orbit-*`), six surfaces (`.surface-content/-frost/-clear/-popover/-selected/-quiet`, light variants, solid fallbacks for Orbit's Solid surfaces and macOS Reduce Transparency), timing scale (`--dur-hover/press/popover/panel/modal/layout`, `--stagger`, `--dur-ambient`), `--radius-sheet/-capsule`, `.lift` and `.expand` helpers, `.ambient` stilled by Reduce Motion                                              |
| Homepage   | Atmospheres in CSS (Tidal Dusk — new default —, Sea Glass Morning, Pearl Fog) with slow drift on their own layers (Customize → Background → Gentle motion), restrained clock and greeting, one clear-glass capsule of controls, the **command input** ("Ask Orbit or search the web…", mic, routes opening beneath: Ask Orbit / Search / Open address, ⏎ ⌘⏎ ↑↓), widgets on content surfaces, the Dock on frost with gentler magnification |
| Chrome     | Sea-glass default Space theme and accent (4.6:1 under white text), a "Quietly Alive" template; one accent everywhere (old hard-coded violet removed; the productivity panel follows Orbit's accent)                                                                                                                                                                                                                                        |
| Panels     | The dock slides in from the right while the page makes room (240 ms, eased; reverses mid-slide; none with Reduce Motion)                                                                                                                                                                                                                                                                                                                   |
| App Hub    | The **App Library** (⇧⌘A, the panel's +, the command bar): search, your apps (where each opens, open now), catalogue (Add / added), typed addresses, full keyboard use, short stagger on opening                                                                                                                                                                                                                                           |
| Motion     | Calm reading-aloud breath in the assistant (doesn't fake a waveform; the microphone meter is the real level)                                                                                                                                                                                                                                                                                                                               |

**Not done / later:** a native Liquid Glass material (needs macOS 26 APIs Electron doesn't expose —
the window keeps its native vibrancy); shared-element expansion from the Homepage input into the
assistant (the panel slides in from the right instead); re-skinning every Settings row (Settings
already reads the tokens: accent, switches, focus ring). The owner should look at the running
app — light and dark — and say what feels off.
