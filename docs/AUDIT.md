# Audit after roadmap Phases 1–4 (2026-11-02)

The owner asked for an expert audit of the whole app once the roadmap's phases were done —
"from UI/UX to functionality, speed". This records how it was checked, what was found, what was
fixed (with commits), and what is left.

## How it was checked

- **Speed:** a Playwright script measured cold start with a 31-tab profile, memory per process
  (`app.getAppMetrics()`), the size of the tab/sidebar snapshots main sends, and how long the
  command bar and the productivity panel take to show content. The panel's first open was then
  timed stage by stage inside its page (`performance.now()` at each step).
- **Bundles:** what each Orbit page (shell, overlay, internal pages) loads at startup, and the
  size of every chunk.
- **Dependencies:** `npm audit --omit=dev`, then the advisories themselves.
- **Accessibility:** text contrast measured with the Toolkit's own WCAG 2.x checker; keyboard
  focus styles; accessible names on icon-only buttons.
- **UI:** screenshots of the test window (never the owner's screen) of the new tab page,
  command bar, panel views (projects, project form, GitHub, tasks, assistant, Toolkit) and
  every Settings section — including Settings beside the panel, where the page is narrow.
- **Security:** every new IPC channel (surfaces and sender checks), what reaches page contexts,
  what leaves the Mac, and how files from outside are read.
- **Function:** the full end-to-end suite (120 tests) and unit suite (359), plus restart tests.

## Measurements

| Measure (31-tab profile)               | Before  | After         |
| -------------------------------------- | ------- | ------------- |
| Cold start to a usable window          | ~520 ms | ~515 ms       |
| Productivity panel, first content      | ~550 ms | ~250 ms       |
| Command bar open                       | 41 ms   | 37 ms         |
| Memory, all processes                  | 691 MB  | 687 MB        |
| Largest lazy chunk (Boost editor)      | 2.78 MB | 1.44 MB       |
| Note editor chunk                      | 1.24 MB | 0.58 MB       |
| Tab + sidebar snapshot sent per change | ~25 KB  | ~25 KB (fine) |
| Production dependency vulnerabilities  | 2 high  | 0             |

## Findings and fixes

| Area            | Finding                                                                                                                          | Fix                                                                                                            | Commit               |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------- |
| Speed           | Renderers shipped unminified (electron-vite's default), so every Orbit page parsed about twice the JavaScript it needed          | `minify: true` for the renderer build                                                                          | `11b1436`            |
| Speed           | The panel (and note pages) rendered behind a Suspense fallback, which React reveals no sooner than 300 ms                        | Their code loads before the first render; the page draws whole at once                                         | `11b1436`            |
| Speed           | The panel's projects, tasks, assistant and Toolkit waited for the note editor (Tiptap)                                           | The editor loads only when a note is shown                                                                     | `11b1436`            |
| Security        | `adm-zip` (unpacks Chrome extensions) had five advisories — decompression bombs, SUID bits, DoS                                  | Pinned to 0.6.1 via `overrides` (the library's API use is unchanged)                                           | `11b1436`            |
| UI              | Panel buttons used the system's plain tooltips while the shell had Arc-style ones                                                | The same Arc tooltip (label and key caps) for any Orbit page; main moves the anchor into window coordinates    | `11b1436`            |
| UI              | "Colour" and "Color" both appeared                                                                                               | "Color" throughout the interface                                                                               | `11b1436`            |
| UI (regression) | Making the note editor lazy also made the panel's colour variables lazy: sheets became see-through, the open tab lost its accent | The panel imports its stylesheet itself; an e2e check reads the computed colours                               | `02290b2`            |
| UI              | Settings beside the panel: hints wrapped a word per line; the rules form scrolled sideways                                       | Settings' sidebar becomes icons on narrow pages; a setting's control drops below its name when there's no room | `02290b2`            |
| UI              | ⌘T couldn't open the panel's views                                                                                               | Projects, Tasks, Notes, Project Board and Research commands                                                    | `02290b2`            |
| Accessibility   | Panel secondary text 3.0:1 (light), 4.3:1 (dark); Settings hints 2.5:1; accent text on dark 4.3:1                                | Muted text 4.7:1 / 5.3:1, hints 4.7:1; a separate accent for text (5:1) and for fills under white text (4.5:1) | `44e9030`            |
| Function        | A panel route change sent while the panel's page was still loading was lost (seen after a restart restoring the panel)           | While loading, the panel loads the new route instead of setting a hash that the first page would overwrite     | `1fec24c`            |
| Function        | Settings checkboxes (AI on/off, rules) only changed after main answered — slow to feel, and flaky for automation                 | They change at once; main's answer follows                                                                     | `e03928f`, `c64ed2c` |

Things checked and found sound: every new IPC channel names its surfaces and the handler checks
the sender (assistant and Toolkit calls only from the window's own panel, Settings calls only
from orbit://settings); pages are read, palettes and fonts scanned, and JSON shown only from
isolated worlds; answers are drawn from a Markdown tree (never HTML) and only http(s)/mailto
links open; backup paths are validated and files written 0600; the GitHub token, Anthropic key
and backup passphrase are Keychain-encrypted and never sent to a renderer or put in a backup.

## Left as they are (recommendations)

- **Memory (~690 MB with 6 processes)** is typical for Electron with a shell, an always-ready
  overlay (so ⌘T opens in under 40 ms) and pages; pre-warming the panel would make its first
  open instant for ~50 MB more — worth it only if the owner opens the panel in most sessions.
- **The new tab page** scrolls a little at 800 px tall windows (the widgets sit below the fold).
- **Notes list** refreshes by polling every 2 s while visible; an event from main would be
  tidier (it's cheap today).
- **Multi-select in the sidebar** (move/pin/close several tabs) is in the backlog (roadmap P4.5).
- **Sync** is backups in a synced folder plus restore — deliberately no merging between Macs
  until local data and conflict handling have been used for a while (roadmap §5, Phase 4).
- **Large lazy chunks** (Excalidraw, Mermaid, CodeMirror) load only in Easels and the Boost
  editor; splitting them further isn't worth the complexity.
