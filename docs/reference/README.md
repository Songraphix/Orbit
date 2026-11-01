# Reference material

## Arc screenshots (captured 22 Oct 2026)

| Plan ref | File                          | Shows                                                                            |
| -------- | ----------------------------- | -------------------------------------------------------------------------------- |
| Img 1    | `img1-media-player.png`       | Sidebar mini media player above the bottom bar                                   |
| Img 2    | `img2-plus-create-menu.png`   | "+" create menu (New Space / Folder / Easel / Boost / Split / Tab)               |
| Img 3    | `img3-site-controls.png`      | Site controls popover (quick actions, extensions, Boosts, site settings, Secure) |
| Img 4    | `img4-library.png`            | Library navigation (Media, Downloads, Easels, Spaces, Boosts, Archived Tabs)     |
| Img 5    | `img5-sidebar-space-menu.png` | Full sidebar with the space context menu open                                    |
| Img 6    | `img6-split-view-window.png`  | Whole window: Gmail + YouTube split, menu bar, compact toolbars                  |
| Img 7    | `img7-sidebar-downloads.png`  | Sidebar with the downloads shelf                                                 |

## Arc data backup

Taken 31 Oct 2026 (Arc quit first) to `~/ArcBackup/2026-11-01/` — **outside this repo, never commit it**. 57 MB, essentials only:

- Top-level `Storable*.json` (current versions only — sidebar, archive, windows, captures, etc.)
- `Captures/`, `SidebarItemsFaviconCache/`
- `User Data/Local State`
- `User Data/Default/`: `History`, `Favicons`, `Preferences`, `Secure Preferences`, `Top Sites`, `Shortcuts`, extension `manifest.json` files

Deliberately skipped (~3.3 GB): browser caches, extension code, site storage, Chromium component data. The original folder at `~/Library/Application Support/Arc/` is untouched.

Still to do manually in Arc: export passwords, copy Boost CSS/JS, export Easels, screenshot every Space, read the sunset FAQ.
