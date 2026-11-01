# ADR-001: Engine and shell — Electron (Chromium)

- Status: accepted
- Date: 2026-11-01

## Context

Orbit must replace Arc as a daily browser before Arc's sunset on 22 Dec 2026. Gmail, Figma, YouTube and Canva must behave exactly as in Chrome, Chrome extensions should work, and the UI will mostly be written by AI coding tools.

## Options considered

1. **Electron + React** — real Chromium, good Chrome-extension coverage via `electron-chrome-extensions`, fast UI development in TypeScript; higher memory use.
2. **Chromium fork** (Arc, Brave, Vivaldi) — full extension support and best performance, but months of C++ work and multi-hour builds.
3. **Swift + WKWebView** — native feel, but Safari engine quirks and no Chrome extensions.
4. **Tauri** — uses WebKit on macOS: same problems as option 3.
5. **Fork Zen Browser (Firefox)** — fast start, but Firefox extensions only.

## Decision

Electron with a React + TypeScript UI. It is the only option that reaches a usable, Chrome-compatible browser in weeks.

## Consequences

- Easier: web compatibility, UI iteration speed, extension support.
- Harder: memory (mitigated by sleeping tabs, Phase 4), DRM sites (Widevine needs castLabs ECS, Phase 11), z-order of native views (ADR-006).
- Escape hatch: the renderer talks to the browser only through the typed IPC contract, so the UI and domain logic could move to a Chromium fork later.
