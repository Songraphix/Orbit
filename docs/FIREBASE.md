# Orbit and Firebase

Orbit is local-first: everything lives in its SQLite database on the Mac and works offline.
An **Orbit account** (optional) syncs some of it across Macs through Firebase. Without an
account nothing leaves the Mac.

## What Orbit uses

| Service                 | Used for                                                                                                                                                              | Plan                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| **Authentication**      | Email + password (with verification and reset), Google                                                                                                                | Spark (free)                     |
| **Cloud Firestore**     | Synced records: one small document per record                                                                                                                         | Spark, then Blaze as usage grows |
| Cloud Storage           | Not used. Big records (an Easel with pictures) are split across Firestore documents instead; `firebase/storage.rules` denies everything in case a bucket is ever made | —                                |
| Cloud Functions         | Not used yet. Needed later for paid plans (a verified payment webhook) and server-side cleanup; both need Blaze                                                       | —                                |
| App Check               | Not used: its attestation providers are for websites and mobile apps, not Electron. Rules + verified-email sign-in protect the data instead                           | —                                |
| Analytics / Crashlytics | Not used (no Electron SDK). Orbit sends no browsing data anywhere                                                                                                     | —                                |

### What syncs, and what never does

Syncs: **projects, tasks, notes, Easels, Spaces, profiles' names and looks, pinned tabs and
favourites** (their home address, folder, order and app options).

Stays on the Mac: history, Today tabs, page contents, live page titles and favicons, captures
and screenshots, settings and appearance, the Homepage, Boosts, focus logs, and every key
(Anthropic, GitHub, Unsplash).

## How it works

- **Main process only.** Orbit talks to Firebase's documented REST APIs (Identity Toolkit,
  Secure Token, Firestore) from Electron's main process. Pages never see a token. The
  JavaScript SDK isn't used: it can't keep a session in Electron's main process (Node), and
  its offline cache is browser-only — Orbit's offline store is already SQLite.
- **Session.** Only the refresh token is kept, encrypted with the macOS Keychain
  (`safeStorage`) in `account.bin`. Passwords are never stored.
- **Change queue.** Database triggers (`migrations/021-sync.sql`) record every change to a
  synced table in `sync_outbox`, in the same transaction — nothing is lost if Orbit quits.
- **Sending.** After 3 s of quiet (at most 30 s while you keep typing), queued records go up
  in batched commits. A record whose content hash matches what the cloud has is never sent
  again. Each write carries a precondition (the cloud copy's update time), so two Macs can't
  overwrite each other blindly; retries are safe (same document ids).
- **Receiving.** On start, when Orbit comes to the front (at most every 2 minutes), on wake,
  and on **Sync Now**: one query for records changed since the last look (server time
  cursor), 300 at a time. No real-time listeners, no polling of whole collections.
- **Conflicts.** Small records (projects, tasks, Spaces, tabs) merge field by field against the
  last agreed version; a field changed on both Macs goes to the later edit. **Notes and Easels
  are never merged or dropped:** if both Macs changed one, both versions are kept (the
  other Mac's as a copy) and Settings says so.
- **Deletions** sync as tombstones, so they don't come back.
- **Retries** back off exponentially with jitter (2 s → 15 min). Offline, changes wait on disk.
- **Accounts on a Mac.** The first account that signs in owns that Mac's synced data. Another
  account can't sign in there (its data would mix). Signing out keeps everything locally.
  Deleting the account deletes its cloud data, then the account; the Mac keeps its copy.
- **Email verification** is required before anything syncs (the rules enforce it).
- **Paid plans (not offered yet).** `users/{uid}/entitlements/*` is readable by its owner and
  writable by no client — only a future server (Cloud Function on Blaze, after a verified
  payment) may grant anything. No price, plan or provider is decided.

### Data model

```
users/{uid}                        { schema, createdAt }
users/{uid}/records/{kind}_{id}    { kind, body, parts, deleted, v, clientUpdatedAt, deviceId, updatedAt }
users/{uid}/parts/{kind}_{id}~{n}  { record, n, body }       ← only for records over ~300k characters
users/{uid}/entitlements/{product} (server-written only)
```

`body` is the record's JSON (its synced columns). `body` is excluded from indexing
(`firebase/firestore.indexes.json`); the only query (`updatedAt`, then name) uses Firestore's
automatic single-field index.

## Firebase Console — what's done and what's left

Project: **orbit-f4f0c** (`.firebaserc`). Done by the owner: project created, web app
registered (values in `.env.local`), Email/Password and Google sign-in enabled, Firestore
created in production mode.

Still to do:

1. **Deploy the security rules** — done 2026-11-04. After changing `firebase/firestore.rules`, deploy again:
   ```sh
   export PATH="$HOME/.local/node/bin:$PATH"
   npx firebase login                 # once, opens your browser
   npm run firebase:deploy-rules
   ```
2. **Google sign-in from Orbit** needs a _Desktop app_ OAuth client:
   Google Cloud Console → (project orbit-f4f0c) → APIs & Services → Credentials → Create
   credentials → OAuth client ID → **Desktop app** → copy the Client ID and secret into
   `.env.local` (`MAIN_VITE_GOOGLE_DESKTOP_CLIENT_ID`, `…_SECRET`), then in Firebase →
   Authentication → Sign-in method → Google → _Safelist client IDs from external projects_,
   add the Client ID. While the consent screen is in **Testing**, add your Google account as
   a test user; publish it before others can sign in.
3. **Email templates** (optional): Authentication → Templates — the verification and reset
   emails' sender name and wording.
4. **Authorized domains**: nothing to add (Orbit doesn't use redirects to a web page).
5. **Budget alerts** (when on Blaze): Google Cloud Console → Billing → Budgets & alerts.

## Configuration

`.env.local` (git-ignored; see `.env.example`) — read at build time by electron-vite:

| Key                                                                       | From                                          |
| ------------------------------------------------------------------------- | --------------------------------------------- |
| `MAIN_VITE_FIREBASE_API_KEY`, `…_AUTH_DOMAIN`, `…_PROJECT_ID`, `…_APP_ID` | Project settings → Your apps → Web app config |
| `MAIN_VITE_GOOGLE_DESKTOP_CLIENT_ID`, `…_SECRET`                          | The Desktop OAuth client (step 2 above)       |

These identify the project; they are **not** secrets — Security Rules and sign-in protect the
data. Never commit a service-account key (`.gitignore` blocks the usual names). A build
without these values simply has no Account section features ("not set up").

For a separate production project later: a second web app/project, its own `.env.production.local`,
and `firebase use --add` for a `prod` alias.

## Local development and tests

The Firebase Emulator (Auth + Firestore, with Orbit's rules) needs Java 21+. Without admin
rights, a JDK unpacked into `~/.local/jdk/` is found automatically:

```sh
mkdir -p ~/.local/jdk && cd ~/.local/jdk
curl -sSL -o jdk.tar.gz "https://api.adoptium.net/v3/binary/latest/21/ga/mac/aarch64/jdk/hotspot/normal/eclipse"
tar -xzf jdk.tar.gz && rm jdk.tar.gz
```

```sh
npm run test:cloud        # rules, accounts, sync — Vitest against the emulator (project demo-orbit)
npm run test:e2e:cloud    # Settings → Account in the app, against the emulator
```

Run Orbit itself against the emulator (development builds only; packaged Orbit ignores it):

```sh
npx firebase emulators:start --only auth,firestore --project demo-orbit
ORBIT_FIREBASE_EMULATOR=127.0.0.1 env -u ELECTRON_RUN_AS_NODE npm run dev
```

The emulator shows the emails it would send at
`http://127.0.0.1:9099/emulator/v1/projects/demo-orbit/oobCodes`.

## Costs

Firebase bills Firestore per document read, write and delete, plus storage; Authentication
for email and Google is free at Orbit's scale (check the current pricing page — phone sign-in
and some upgraded features are not). The Spark plan has a fixed daily Firestore allowance;
past it, writes fail until the next day, so plan the move to Blaze (pay as you go) before
real users depend on it.

Rough model per **active user per day** (assumptions, not promises):

- Sending: one write per changed record after the quiet period. A day of normal use (a few
  notes typed for a while, tasks ticked, tabs pinned) ≈ 30–150 writes. An Easel with pictures
  costs one write per 300k characters of it each time it changes.
- Receiving: one read per pull when nothing changed (Firestore's minimum), plus one per
  changed record. Pulls happen at most every 2 minutes when Orbit comes to the front ≈ 20–60
  reads, plus whatever other Macs changed.
- First sign-in on a Mac: one write per record on it (or one read per record when a second
  Mac downloads the account).
- Storage: roughly the size of the synced data (notes, Easels).

Biggest cost drivers to watch: Easels with large pictures edited often; many Macs per account
(each one reads the others' changes); very long typing sessions in notes. Levers if needed:
longer quiet period, pull less often, move Easel images to Cloud Storage (Blaze).

## Known limits

- One account per Mac (per Orbit profile directory); switching accounts on the same Mac isn't
  offered yet — it would need separate local data per account.
- Google sign-in waits for the Desktop OAuth client (above).
- A Space or profile with the same name made separately on two Macs before signing in shows
  twice (they're different records); the built-in default Space and profile are shared.
- Open note editors pick up another Mac's change when they next check the note's version;
  an Easel open on two Macs at once keeps both versions if both are edited.
- Paid plans, Cloud Functions, Cloud Storage and App Check are not in use (see the table).
