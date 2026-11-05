# Orbit Product Evolution Roadmap

## Purpose

Evolve Orbit into a productivity-first browser that connects browsing,
creative work, development, AI, and productivity apps in one
customizable workspace.

Orbit already has a working Electron browser built with `electron-vite`.
Existing features include Split Screen, Side Notes, Profiles,
Workspaces, a customizable homepage, a configurable sidebar, Settings, a
Toolkit, Focus Timer, Focus Music, and a Firebase-backed cloud layer.

**Extend and connect the existing product. Do not rewrite it.**

## Non-negotiable rules

1.  Audit the current architecture before coding.
2.  Preserve working features and reuse existing components, state, AI
    infrastructure, persistence, and backend where practical.
3.  Do not perform speculative rewrites or replace working systems just
    because a different design seems cleaner.
4.  Implement one coherent milestone at a time and test it.
5.  Respect the existing design system. Improve consistency without
    redesigning the whole app unnecessarily.
6.  Never bundle private API keys, OAuth client secrets, `.env.local`,
    service-account credentials, or private backend credentials in the
    desktop app.
7.  Do not deploy Firebase rules, alter production data, publish
    releases, or run destructive Git commands without explicit approval.
8.  Do not claim an integration works until it has been tested. Document
    API restrictions, permissions, and unsupported services.
9.  Keep macOS Apple Silicon as the first distribution target unless the
    current project configuration says otherwise.

## Product vision

Orbit should let users browse, work across tabs and split views, pin web
apps beside the main page, use voice to search and control browser
features, ask AI about their current work, search authorized cloud
storage, automatically organize tabs, and read and annotate PDFs.

The differentiator is not the number of features. It is how well
browsing, apps, AI, and Orbit's existing tools work together.

## 1. App Rail and Side Panel

### Goal

Extend Orbit's existing sidebar with an Opera/Edge-style app rail. Users
should be able to open apps beside their current page without losing
their main browsing context.

### Requirements

-   Pin, unpin, reorder, and add custom web apps by URL.
-   Show app names and icons where available.
-   Open supported apps in a side panel while preserving the main tab.
-   Allow the panel to collapse and reopen. Add resizing if it fits the
    current layout cleanly.
-   Persist configuration using Orbit's existing persistence approach.
-   Support workspace-specific app layouts where practical.
-   Provide clear loading, error, and unsupported-embedding states.
-   Reuse the current sidebar rather than creating a competing one.
-   Reuse the existing Focus Music feature. Do not build a replacement.

Potential apps include Google Docs, Google Keep, Google Drive, ChatGPT,
Spotify, and YouTube Music. These are examples, not a guarantee that all
services can be embedded. Some websites block embedding or require
special authentication handling. Offer a fallback to a normal tab or
separate window when needed. Do not weaken Electron security to make
remote content work.

### Acceptance criteria

-   Users can pin, remove, reorder, and open apps.
-   Opening a supported app does not replace the main page unexpectedly.
-   Settings persist after restarting Orbit.
-   Unsupported apps fail gracefully.
-   Existing sidebar and workspace features still work.

## 2. Orbit AI with browser context

### Goal

Make Orbit AI useful for the user's browser and workflow, rather than an
isolated chatbot.

### Context sources

Use only available and authorized sources: - Current page title, URL,
and readable content. - User-selected text. - Open tabs, titles, and
URLs. - Bookmarks and browsing history, subject to settings. - Side
Notes and Workspaces. - Existing task or project data, if present. -
Connected services after explicit authorization.

### Example requests

-   "Summarize this page."
-   "Compare these two tabs."
-   "Find the article I was reading yesterday."
-   "Save these key points to Side Notes."
-   "What was I working on in this workspace?"
-   "Find the brand guide in my connected Drive."
-   "Open my project notes beside this design reference."

### Implementation requirements

-   Audit the existing AI service before adding another one.
-   Create a clear context-collection layer instead of spreading data
    access and prompt construction across the UI.
-   Send only the context needed for the request.
-   Where practical, show links or source references for retrieved
    information.
-   Handle inaccessible pages, missing files, expired tokens, and model
    errors.
-   Never silently send all browsing history or page content to an AI
    provider.
-   Provide controls for which context sources Orbit AI can access.

### Actions

Orbit AI may eventually call a controlled set of validated actions, such
as opening a URL, switching tabs, grouping tabs, saving a note, opening
a sidebar app, or searching an authorized provider.

Use an allowlist of actions and validated arguments. Never allow model
output to execute arbitrary JavaScript, shell commands, or unrestricted
filesystem operations. Ask for confirmation before sending messages,
sharing files, modifying important data, or taking other consequential
actions.

## 3. Voice mode

### Stage A: Push-to-talk

Build this first. It is easier to test and more reliable than
always-listening wake-word activation.

-   Add a microphone control in an appropriate existing location.
-   Request microphone permission only when needed.
-   Show recording, processing, and response states.
-   Convert speech to text using a supported recognition approach.
-   Allow cancellation and, where appropriate, review before sending.
-   Route input to web search, Orbit AI, or a supported browser action.
-   Keep typed input as a fallback.
-   Allow spoken output to be stopped.
-   Handle denied permissions, missing microphones, recognition errors,
    and network failures.

### Stage B: Spoken responses

-   Add text-to-speech for AI answers.
-   Let users enable or disable spoken replies.
-   Allow playback to be interrupted.
-   Do not read very long answers aloud by default without a clear
    preference.
-   Make listening and speaking states visible.

### Stage C: "Hey Orbit"

Investigate only after push-to-talk and spoken responses are reliable.

-   Evaluate local wake-word detection or another suitable approach.
-   Do not assume browser speech-recognition APIs provide reliable
    always-on wake-word detection.
-   Document privacy, battery, CPU, and permission implications.
-   Prefer local wake-word detection where feasible.
-   Make the feature opt-in, clearly indicate microphone activity, and
    provide an immediate off switch.
-   Never record or transmit background audio without clear user action
    and informed consent.

Example commands: "Search the web for brand strategy trends", "Summarize
this page", "Find my project notes", "Open Spotify in the sidebar", and
"Read the summary aloud".

## 4. Google Workspace and cloud storage

### Recommended first step

Start with Google Drive search and retrieval. Do not implement every
Google service at once.

Initial capabilities: - Connect a Google account using an appropriate
OAuth flow. - Search authorized Drive files. - Display file names,
types, modified dates where available, and links. - Open files in the
appropriate Google app. - Retrieve supported document content for AI
summaries and question answering. - Show which source file supports an
answer. - Support disconnecting the account and clearing or revoking
stored tokens where applicable.

### Docs and Keep

-   Google Docs can initially open as a sidebar web app.
-   For direct search or document-content access, use supported Google
    APIs and the minimum required scopes.
-   Google Keep can initially open as a sidebar web app.
-   Before adding direct Keep note access, verify current API
    availability and supported operations. Do not assume every Keep
    operation has a public API.
-   Do not scrape authenticated Google pages as a substitute for
    supported APIs.

### Microsoft 365 and Excel

Treat Microsoft 365 as a separate integration. - Excel for the web can
initially open in the sidebar. - OneDrive search and file access may be
added later through supported APIs such as Microsoft Graph. - Verify API
scopes, consent, account requirements, and distribution requirements
before implementation.

### Security and privacy

-   Request the minimum OAuth scopes needed.
-   Explain permissions before connecting an account.
-   Store tokens using an appropriate platform-protected mechanism.
-   Never embed confidential OAuth client secrets in a desktop app.
-   Do not upload or index all user files by default.
-   Explain when document content will be sent to an AI provider.
-   Handle expired tokens, revoked access, and disconnection.
-   Do not deploy production OAuth or Firebase changes without approval.

### Acceptance criteria

-   Users can connect and disconnect an account.
-   Search results come from the authorized API.
-   Results open the correct files.
-   AI summaries use retrieved document content, not just filenames.
-   Errors and expired credentials are handled safely.
-   Private credentials are not bundled in the app.

## 5. Automatic tab grouping

-   Start with deterministic signals such as domain, title keywords, and
    URL patterns.
-   Add semantic similarity only if needed and after measuring the basic
    approach.
-   Preview proposed groups before automatically moving tabs.
-   Let users accept, reject, rename, merge, or split groups.
-   Preserve manual choices and provide undo.
-   Avoid rearranging tabs while the user is actively working.
-   Include a setting to disable automatic grouping.
-   Never lose or close tabs during grouping.

## 6. Built-in PDF reader and annotations

### Initial scope

-   Open local PDFs and PDF links inside Orbit.
-   Support page navigation, zoom, text selection, and search where
    available.
-   Investigate highlighting, notes, and bookmarks.
-   Persist annotations safely.
-   Allow PDFs to be viewed beside another tab using existing Split
    Screen.
-   Make PDF content available to Orbit AI only when requested or
    enabled.
-   Clearly distinguish Orbit annotations from changes to the original
    file.

Evaluate PDF.js as a rendering foundation and verify licensing and
Electron compatibility. Basic annotation is not full PDF editing.
Editing original PDF text, rearranging pages, and exporting modified
documents are separate capabilities.

## 7. Homepage and workflow connections

Extend the existing homepage with optional widgets for: - Recent tabs
and pages. - Workspace shortcuts. - Side Notes. - Bookmarks. - Existing
task or project data, if available. - Calendar information after
authorized integration. - Orbit AI and voice quick actions. - Focus
Timer, reusing the current implementation. - Focus Music, reusing the
current implementation. - Recently opened cloud documents after a
provider is connected.

Let users show, hide, and reorder widgets. Persist their choices. Keep
the homepage fast and uncluttered. Do not create duplicate timers, music
players, note systems, or workspace managers.

## Implementation sequence

### Milestone 0: Architecture and security audit

Before coding: - Inspect the repository, Electron process boundaries,
current sidebar, homepage, settings, AI, notes, workspaces, cloud
integration, and persistence. - Inspect package scripts and tests. -
Review Electron security settings, preload APIs, permissions, navigation
rules, and remote-content handling. - Review `.gitignore`,
environment-file handling, packaging, and OAuth setup. - Identify
existing components that can be extended. - Produce a short
implementation map with likely files to change, dependencies, risks, and
tests.

Do not make broad code changes during the audit.

### Milestone 1: Sidebar and app pinning

Extend the existing sidebar, implement app pinning and ordering,
side-panel behavior, persistence, and graceful fallbacks.

### Milestone 2: Push-to-talk and browser-aware AI

Add voice input, connect it to the existing search and AI paths, add
page and selected-text context, implement spoken output, and add a small
allowlist of safe browser actions.

### Milestone 3: Drive search

Verify current Google API requirements, implement the appropriate OAuth
flow, add authorized file search and opening, retrieve document content
for grounded summaries, and handle account disconnection and errors.

### Milestone 4: Tab grouping and PDF reader

Implement user-controlled tab grouping, then a PDF reader. Add
annotations after the reader is stable.

### Milestone 5: Homepage connections and wake-word investigation

Connect existing Orbit features to homepage widgets. Investigate
wake-word feasibility, privacy, and performance before deciding whether
to implement it.

## Testing requirements

For each milestone: - Run relevant unit and integration tests. - Run
`npm run typecheck`. - Run `npm test`. - Run `npm run build` when
changes affect building or packaging. - Add tests for persistence, error
handling, permissions, and security boundaries. - Manually test the
packaged macOS app, not just the development build. - Verify existing
tabs, Split Screen, Side Notes, Profiles, Workspaces, Settings, Focus
Timer, Focus Music, and cloud synchronization still work. - Report the
tests actually run and their real results. Never claim an unrun test
passed.

## Definition of done

A milestone is complete only when the feature works in the existing app,
reuses existing systems where practical, has passing relevant tests,
handles unsupported cases, protects user data and credentials, does not
regress existing features, and documents known limitations.

The user must review changes before production deployment or public
release.

## Instructions for the coding agent

1.  Audit the current project.
2.  Report the current architecture and reuse opportunities.
3.  Propose the smallest practical implementation plan for Milestone 1.
4.  Wait for approval before broad architectural changes.
5.  Implement incrementally and run tests.
6.  Summarize changed files, behavior, test results, limitations, and
    next steps.

Do not implement every milestone in one pass. Do not invent files, APIs,
capabilities, or test results. Do not replace working features with
mockups or placeholders and call them complete.

**The final product should feel like one coherent browser, not a
collection of unrelated features.**
