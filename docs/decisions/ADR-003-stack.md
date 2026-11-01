# ADR-003: Technology stack

- Status: accepted
- Date: 2026-11-01

## Context

The stack must be fast to develop in with AI tools, type-safe across process boundaries, and able to hit the performance budgets in PLAN.md section 10.2.

## Options considered

The stack table in PLAN.md section 3.3; the main alternatives were Monaco (vs CodeMirror 6), Redux (vs Zustand), and plain CSS (vs Tailwind + CSS variables).

## Decision

As in PLAN.md section 3.3, with these exact versions pinned at project start (2026-11-01):

| Package                    | Version                           |
| -------------------------- | --------------------------------- |
| electron                   | 45.2.1 (Chromium 156, Node 24.22) |
| electron-vite / vite       | 6.0.0 / 8.3.5                     |
| react / react-dom          | 19.3.1                            |
| typescript                 | 6.0.3                             |
| tailwindcss                | 4.3.3                             |
| zod                        | 4.6.7                             |
| vitest / @playwright/test  | 5.0.5 / 1.64.1                    |
| eslint / typescript-eslint | 10.14.0 / 8.72.1                  |
| electron-builder           | 26.18.0                           |

Notes:

- **TypeScript 6.0, not 7.x:** typescript-eslint 8.72 supports TypeScript `<6.1.0`. Upgrade once it supports 7.
- **Preloads build as CommonJS** (`.cjs`): sandboxed renderers can't load ESM preloads, and the package is `"type": "module"`.
- **Libraries are installed in the phase that first needs them** (better-sqlite3 in Phase 1; cmdk in Phase 2; dnd-kit, Motion, Zustand, fractional-indexing and tldts by Phase 3), each pinned to an exact version.

## Consequences

- Versions are pinned and upgraded deliberately, once per milestone (risk R8).
- better-sqlite3 is a native module and must be rebuilt for Electron's Node ABI; verify this early in Phase 1.
