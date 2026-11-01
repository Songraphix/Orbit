# ADR-008: Chrome extensions via electron-chrome-extensions, installed through Orbit

- Status: accepted
- Date: 2026-11-01

## Context

PLAN.md (section 3) picks `electron-chrome-extensions` + `electron-chrome-web-store` for extension support. Two of their default integrations conflict with Orbit's rules:

- `electron-chrome-extensions` renders toolbar buttons with its own `<browser-action-list>` element, which talks to main over its own IPC. That bypasses the typed contract (CLAUDE.md rule 3).
- `installChromeWebStore()` adds a preload to chromewebstore.google.com that exposes install APIs to the page's own JavaScript (rule 4: never expose APIs to page JavaScript).

The library is dual-licensed: GPL-3.0 or a paid "Patron" licence for proprietary use.

## Decision

- Use `electron-chrome-extensions@4.9.0` and `electron-chrome-web-store@0.13.0`. Both are pinned, and both are the newest releases older than two weeks (4.10.0 came out on 2026-10-25). Each profile session gets one `ElectronChromeExtensions` instance.
- Its session preload stays. Its source (4.9.0) injects APIs only into `chrome-extension://` pages and extension service workers; on web pages it returns before exposing anything.
- Toolbar buttons are drawn by Orbit (in the site controls popover). Main reads and activates them through the library's internal `browserAction` API, wrapped in `src/main/extensions/host.ts` with a runtime shape check.
- Installs never use `installChromeWebStore()`. On a Web Store detail page, Site controls → **Add to Orbit**:
  1. Main takes the extension ID from the tab's URL.
  2. It asks for confirmation in a native dialog.
  3. It calls `installExtension()`, which downloads the extension from Google's update service.
- Installed extensions live in `<userData>/Extensions` and are loaded into every profile. Updates are checked a minute after launch, then every 6 hours.
- Licence: GPL-3.0. Orbit is a personal app in a private repository and is not distributed. **If Orbit is ever shared with anyone, GPL-3.0 obligations apply (or buy the Patron licence).**

## Consequences

- No page JavaScript gains any API. The Web Store's "Add to Chrome" button does nothing; Orbit's popover button replaces it.
- Upgrading `electron-chrome-extensions` needs a check of `host.ts`'s internal-API adapter (the e2e test `extensions.spec.ts` covers it).
- Verified on 2026-11-01: all 11 extensions from the owner's audit install, load and start their service workers in a throwaway profile; their buttons appear in site controls.
- Extensions are shared by all profiles (Chrome keeps them per profile). Revisit if that matters.
