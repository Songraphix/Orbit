# Orbit

A personal, sidebar-first, keyboard-driven Chromium browser for macOS — a rebuild of the parts of Arc that matter, built with Electron, React and TypeScript.

- Plan: [docs/PLAN.md](docs/PLAN.md)
- Progress: [docs/PROGRESS.md](docs/PROGRESS.md)
- Decisions: [docs/decisions/](docs/decisions/)
- Agent instructions: [CLAUDE.md](CLAUDE.md)

## Requirements

macOS on Apple Silicon, Node 24+ (Node 26 LTS is used), Xcode Command Line Tools.

## Commands

```sh
npm install
npm run dev        # app with hot reload
npm run typecheck
npm run lint
npm test           # unit tests (Vitest)
npm run test:e2e   # builds, then launches the real app (Playwright)
npm run dist       # unsigned arm64 DMG in release/
```
