# Google Drive (and other cloud storage)

Roadmap: `orbit_voice_ai_workspace_roadmap.md`, milestone 3.

## What it does

- **Settings → Integrations → Google Drive → Connect** opens Google in your browser; you pick
  an account and allow **read-only** access to Drive. Orbit can find and read files; it can't
  change, share or delete anything.
- **Command bar (⌘T):** as you type (three letters or more), up to three matching Drive files
  appear — by name or by text — with their kind and when they were edited. Picking one opens it
  in its Google app (in a tab; Google Docs as a panel app works too).
- **Orbit AI:** with Settings → AI → Google Drive on (the default once connected), it can
  `search_drive` and `read_drive_file`: Google Docs (as text), Sheets (as CSV), Slides (their
  text), PDFs (their text, with PDF.js; up to 30 MB) and plain text files. The answer links the file it read ("Read “Brand guide” · Open").
  Other kinds (Word, images, scanned PDFs without text) say they can't be read yet.
- **Disconnect** revokes Orbit's access at Google and deletes the token here.

## Privacy and security

- Scopes: `openid email https://www.googleapis.com/auth/drive.readonly` — the least that allows
  searching and reading file contents.
- Google's installed-app flow: your browser (never an embedded page), a one-off `127.0.0.1`
  address, PKCE. Only the **refresh token** is kept, encrypted with the macOS Keychain in
  `google-drive.bin`; access tokens live in memory. No token ever reaches a renderer.
- Nothing is indexed or copied ahead of time. Drive is asked when you type in the command bar
  (names and kinds come back) or when Orbit AI reads a file for you — that file's text then goes
  to Anthropic with your question, like an attached page.
- If access is revoked (myaccount.google.com → Security → Third-party access) Orbit notices on
  the next request, forgets the token and says to connect again.
- The Desktop OAuth client's secret is in the build (Google treats installed-app secrets as not
  confidential; owner decision 2026-11-05, see PROGRESS.md).

## Setting it up in Google Cloud (owner)

The Desktop OAuth client lives in Google Cloud project **orbit-f4f0c-513713** (the one used for
Google sign-in to Orbit accounts). Drive needs two things there:

1. **Enable the Google Drive API:** Google Cloud Console → APIs & Services → Library → "Google
   Drive API" → Enable.
2. **Allow the scope on the consent screen:** Google Auth Platform → Data Access → Add or
   remove scopes → tick `…/auth/drive.readonly` → Save. It's a _restricted_ scope: while the app
   is in **Testing**, only the test users listed there can connect (add your Google account);
   publishing it for others needs Google's verification and a security assessment.

Until then, Connect fails at Google with a message about the API or the scope.

## Not built (and why)

- **Google Docs and Keep in the sidebar:** add them as apps (Settings → Apps → catalogue →
  Google) set to open in the side panel. Keep has no public API for personal accounts (its API
  is for Google Workspace administrators), so Orbit can't search or read notes in Keep directly;
  scraping Keep's pages is not an option.
- **Microsoft 365 / OneDrive / Excel:** Excel for the web works as a panel app. Searching and
  reading OneDrive files would use Microsoft Graph, which needs an app registration in Microsoft
  Entra ID (owner), consent for `Files.Read`, and a separate integration like this one — later.

## Tests

`tests/e2e/drive.spec.ts` runs against a stand-in Google in the test server (sign-in redirect,
token and refresh, revoke, a two-file Drive), switched on with `ORBIT_GOOGLE_TEST_BASE` in
development builds only. Unit: the Drive tools and query building.
