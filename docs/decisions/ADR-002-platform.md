# ADR-002: Platform — macOS on Apple Silicon first

- Status: accepted
- Date: 2026-11-01

## Context

The only user runs macOS on an Apple Silicon Mac mini. Arc's feel depends on macOS features: vibrancy, the native menu bar, the share sheet, trackpad gestures and Keychain-backed encryption.

## Options considered

1. **macOS arm64 only** — use platform features directly; test one target.
2. **Cross-platform from day one** — wider reach, but abstraction layers and a test matrix the project can't afford before M1.

## Decision

Target macOS arm64 only for v1. Keep code cross-platform where it costs nothing, but test nothing on Windows or Linux.

## Consequences

- Native macOS APIs (vibrancy, `ShareMenu`, `safeStorage`, `trafficLightPosition`) can be used without wrappers.
- Builds are arm64 DMGs only (`electron-builder.yml`).
- A Windows or Linux port would need its own ADR and a review of every macOS-specific call.
