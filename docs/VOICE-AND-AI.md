# Voice and browser-aware Orbit AI

Roadmap: `orbit_voice_ai_workspace_roadmap.md`, milestone 2.

## Voice (push-to-talk)

**Use it:** ⇧⌘Space (View → Voice Command), or the microphone in the command bar. Orbit
listens until you stop talking (about 1.3 s of quiet), or until you press ⇧⌘Space again; Esc
cancels. What you said lands in the command bar to check before ⏎; questions and requests
("summarize this page", "open Spotify in the sidebar", "find the article I read yesterday")
put **Ask Orbit AI** first, other words put the web search first. Settings → Voice → _Run what
I say right away_ skips the check.

**How it works**

- Speech becomes text **on the Mac** with OpenAI's Whisper (base, multilingual, 8-bit), run by
  transformers.js 4.3.1 on ONNX Runtime WebAssembly in a hidden page. No audio leaves the Mac.
- The model (80 MB) is downloaded **once, after you agree** in the command bar, from Hugging
  Face (`onnx-community/whisper-base`) at a pinned revision; every file is checked (sha256 for
  the weights, git's blob sha1 for the rest) before it's kept, in
  `<Orbit data>/models/whisper-base/<revision>/`. Settings → Voice → Remove deletes it.
- The hidden page (`src/renderer/voice/`) has its own CSP (`'wasm-unsafe-eval'` for
  WebAssembly, nothing else from outside) and its own session, which allows the microphone —
  audio only, only for that page. Model files come from main over IPC (only the manifest's
  files); ONNX Runtime's WebAssembly ships inside Orbit (no CDN).
- The microphone is on only while listening; audio is held in memory and dropped after it's
  written down. macOS asks for microphone access the first time (Info.plist explains why); if
  it's blocked, the command bar offers System Settings.
- Whisper's guesses from silence ("Thank you.", "bye bye bye…") are discarded as "didn't catch
  that". The language is the Mac's (Whisper would otherwise assume English).
- The page and the model's memory (~300 MB) are let go after 3 minutes unused.

**Spoken answers.** An answer to a spoken question is read aloud with the Mac's own voices
(`speechSynthesis`; nothing is sent) — short answers in full, long ones to their first few
sentences. Esc, Stop Reading or a new question ends it. Every answer has **Read Aloud**.
Settings → Voice: on/off, and which voice.

**Limits**

- Push-to-talk only. "Hey Orbit" (always listening) is milestone 5's investigation, not built.
- Whisper base is good for short commands and questions in quiet rooms; names and rare words
  may come out wrong (you see the text before it runs, unless you chose otherwise).
- Transcription takes ~1 s for a short sentence on Apple Silicon (one WebAssembly thread:
  Orbit's pages aren't cross-origin isolated). The first use after launch loads the model first
  (a second or two, "Getting ready to listen…").

**Tests.** Unit: end of speech, transcript clean-up, question detection, speakable text, the
downloader's checks, the voice service. E2E (`tests/e2e/voice.spec.ts`): a sentence spoken by
macOS's `say` plays through Chromium's fake microphone; the model comes through a local mirror
of Hugging Face (`tests/e2e/test-server.ts`, cached in the system temp folder — the first run
needs the internet once). Verified in the packaged app (2026-11-05): "What is on my list
today?" transcribed from inside `app.asar`.

## Orbit AI with browser context

Orbit AI (⌘J, or Ask Orbit AI in the command bar) can use a small **allowlist of tools**, each
input checked against its schema in main (`src/main/ai/browser-tools.ts`):

| Tool                                               | Needs (Settings → AI)                 |
| -------------------------------------------------- | ------------------------------------- |
| list_tabs, switch_to_tab, open_url, search_web     | Tabs and apps (on)                    |
| list_apps, open_app (where it's set to open)       | Tabs and apps                         |
| search_history (words, or the day: "yesterday")    | Browsing history (**off** by default) |
| search_notes, read_note, open_note, create_note    | Notes (on)                            |
| list/create/update projects and tasks, start_focus | Projects and tasks (on)               |

- Only what Claude looks at is sent — never all your history, tabs or notes. The activity log
  records each request (not the words).
- Nothing closes tabs, deletes, runs code, touches files or sends messages.
- **Links:** a page Claude reads could carry hidden instructions to open an address with your
  data in it. So a link opens by itself only when it goes to a site that comes from you — named
  in your words, one of your tabs or apps, or in your history — and carries no long query
  (`src/main/ai/browser-policy.ts`). Anything else appears in the answer as a link to click.
- Page, selection, compare-tabs and project context (roadmap phase 3) work as before: attached
  explicitly, read when you send.
