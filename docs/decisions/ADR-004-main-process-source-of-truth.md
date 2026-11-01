# ADR-004: The main process is the single source of truth

- Status: accepted
- Date: 2026-11-01

## Context

In Electron browsers, the sidebar UI and the real web views drift out of sync when both the renderer and the main process hold state.

## Options considered

1. **Main owns all state; renderers send intents and render snapshots.**
2. **Renderer owns UI state and tells main what to do** — simpler at first, but two sources of truth.

## Decision

Option 1. All browser state (windows, spaces, sidebar tree, tabs, downloads, media) lives in the main process. Renderers call `window.orbit.invoke('<domain>:<verb>', payload)`. Main validates the payload with zod, checks the sender, applies and persists the change, then broadcasts full snapshots on `state:*` channels. Patches come only if profiling shows a need.

## Consequences

- Renderers never import `electron` (enforced by ESLint) and never persist state.
- Every channel is declared in `src/shared/ipc/contract.ts` first.
- Zustand stores in the renderer are mirrors plus view-only state (hover, open menus).
