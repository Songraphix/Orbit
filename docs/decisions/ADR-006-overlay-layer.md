# ADR-006: A dedicated overlay layer for popovers

- Status: accepted
- Date: 2026-11-01

## Context

Web pages are native `WebContentsView`s composited above the window's own webContents. Any HTML popover in the shell renderer (command bar, site controls, menus) would be hidden behind the page.

## Options considered

1. **Transparent, top-most overlay `WebContentsView`** that hosts all floating UI and is hidden when nothing is open.
2. **Shrink or hide the web view while a popover is open** — visible layout jumps and flicker.
3. **A separate child `BrowserWindow` per popover** — focus and positioning problems; slow.

## Decision

Option 1 for the command bar, popovers, prompts, find bar, Peek, toasts and the floating sidebar. Simple right-click menus and dropdowns use native `Menu.popup()`, which is what Arc does too (Img 5).

## Consequences

- The overlay renderer (`src/renderer/overlay/`) shares the shell's preload API.
- Main must manage overlay visibility, bounds and keyboard focus (focus goes into the overlay on open and back to the page on close).
- When hidden, the overlay must never intercept clicks.
