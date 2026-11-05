# Tab grouping and PDFs

Roadmap: `orbit_voice_ai_workspace_roadmap.md`, milestone 4.

## Group Tabs (no AI)

- **What it proposes:** folders for Today's loose tabs — first one per **site** with two or
  more tabs (known sites by their own names: GitHub, Google Docs, Gmail…; local development
  servers together as "Local Development"; a site holding most of the tabs is skipped, since a
  folder of everything doesn't help), then by the **word** most remaining titles share
  ("Kyoto", "Budget"). Each tab goes in one folder at most; at most eight folders; the rest stay
  loose. Pure: `src/main/sidebar/grouping-model.ts`.
- **Preview first:** a card shows the folders; leave any out, rename them, merge one into
  another, or take tabs out (expand a folder). **Nothing moves until Group Tabs.** Undo in the
  Space header puts every tab back where it was (shared with Tidy, for a minute).
- **When:** a crowded Today (8+ loose tabs with at least two folders to suggest) shows a
  **Group** button in the Space header. Not Now quiets it for six hours in that Space. Settings →
  General → Tabs → _Suggest grouping tabs_ turns the suggestion off; Group Tabs… stays in the
  command bar and the sidebar's right-click menu. Orbit never rearranges tabs by itself.
- **Tidy** (with Claude) still exists for groupings by meaning rather than words.
- Not built: grouping by semantic similarity (embeddings) — the roadmap asks to measure the
  plain approach first.

## PDFs

- **Reading:** Chromium's own PDF viewer (built into Electron) shows PDFs in tabs — pages,
  zoom, find, text selection, rotate, print, download, and its pen. PDF links from the web open
  in Orbit.
- **PDFs from this Mac:** File → Open PDF… (⌘O), Finder's Open With → Orbit, or a PDF dropped
  on Orbit's Dock icon. Each file gets a random `orbit-pdf://file/<token>/<name>` address,
  served only for files you opened (tabs never load `file://`; web pages can't navigate there
  and can't guess a token). The list is remembered, so tabs come back after a restart; a file
  that moved shows Orbit's "can't load" card. Orbit is an _alternate_ PDF app (it doesn't take
  over from Preview).
- **Split Screen:** a PDF is a tab — Open in Split View works as for any page.
- **PDF Notes (Orbit's annotations):** right-click a PDF → **PDF Notes**, or select text →
  **Add to PDF Notes**: one Orbit note per PDF (titled "Notes · <file>"), opened beside it in
  the Notes panel, with each selection added as a quote. These are Orbit notes — **the PDF file
  is never changed**. Chromium's pen (in the viewer's toolbar) is different: its ink lives in
  the viewer and is only kept if you download or print the PDF, which writes a new file.
- **Orbit AI:** right-click → Summarize PDF / Ask Orbit About This PDF, or attach the page in
  the assistant: Orbit reads the PDF's **text** with PDF.js 6.4.299 in the main process (no
  rendering, scripts or fonts; up to 30 MB, 300 pages, 200,000 characters). Only when you ask.
  Google Drive PDFs are read the same way. Scanned PDFs (pictures of text) have no text to read.
- **Not built:** highlights drawn on the page, bookmarks inside a PDF, editing the PDF's text,
  rearranging pages, or exporting a changed PDF — those are separate capabilities (the roadmap
  says so too). Page numbers aren't attached to PDF Notes quotes (the viewer doesn't report
  them).

## Tests

E2E: `tests/e2e/grouping.spec.ts` (suggest, preview, rename, take out, merge, apply, undo, Not
Now, setting, command bar), `tests/e2e/pdf.spec.ts` (Finder open, scoped address, PDF Notes,
AI reads the text, restart, a web PDF). Unit: grouping model, PDF text, local PDF registry,
menu items, Drive PDFs.
