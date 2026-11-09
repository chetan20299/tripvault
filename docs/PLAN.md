# TripVault — Development Plan & Architecture

*Your Business Travel Knowledge* — offline-first travel journal for web, Android and iOS from one codebase.

## 1. Stack decisions

| Area | Choice | Why |
|---|---|---|
| UI | React 18 + TypeScript + Vite + Tailwind 3 | Requested; fast, typed, small bundle |
| Routing | `react-router` HashRouter | Works identically on Firebase Hosting, file:// and Capacitor WebView without rewrites |
| Mobile shell | Capacitor 6 | One web build → Android + iOS |
| Local DB (web) | IndexedDB (`idb`) | Persistent, large quota, works offline |
| Local DB (mobile) | SQLite (`@capacitor-community/sqlite`) | Durable native storage, not subject to WebView eviction |
| Cloud DB | Cloud Firestore | Free Spark quota: 1 GiB stored, 50k reads / 20k writes per day |
| Images | `VITE_IMAGE_BACKEND=firestore` (default) or `storage` | Firebase Storage needs Blaze since 3 Feb 2026 (free quota still applies on Blaze). The `firestore` backend stores compressed images as ≤700 KB chunk docs, so the whole app runs on Spark |
| Auth | Firebase Authentication (email/password) | Free, persists session offline |
| PDF | jsPDF + jspdf-autotable | Pure client-side, works offline |
| Offline app shell | `vite-plugin-pwa` service worker | Web app opens with no network |
| Sharing files | Web Share API / `@capacitor/share` + `@capacitor/filesystem` | Native share sheet on device |
| Camera/gallery | `<input type="file" accept="image/*" capture>` | Capacitor's WebView handles camera + gallery chooser natively; no plugin needed |

No paid services are required.

## 2. Architecture

```
UI (pages, components)
   │  useTable()/useRecord() hooks (useSyncExternalStore)
   ▼
Repository (src/data/repo.ts)  ← every mutation: stamp metadata, write locally, enqueue outbox
   ▼
LocalStore interface (src/data/store/)
   ├── IdbStore      (web, IndexedDB)
   └── SqliteStore   (native, SQLite)
   ▲
SyncEngine (src/sync/engine.ts)  ← push outbox, pull changes, detect conflicts, retry w/ backoff
   ▼
RemoteBackend interface
   ├── FirebaseRemote (production: Firestore + Storage/Firestore-chunks)
   └── DemoRemote     (demo: separate IndexedDB "server", simulated latency/offline/failures)
```

* **Local DB is the single source of truth for the UI.** The UI never waits on the network.
* Each signed-in user gets their **own local database** (`tripvault-<uid>`); demo uses `tripvault-demo` and `tripvault-demo-remote`. Demo can never touch Firebase — the Firebase SDK isn't even initialised in demo mode.
* Mode selection: `VITE_FIREBASE_*` env vars present → Production available; the login screen always offers "Explore Demo".

## 3. Data model

All synced records share:

```ts
interface SyncMeta {
  id: string;            // crypto.randomUUID(), generated on device → idempotent retries, no duplicates
  ownerId: string;       // uid of owner
  createdAt: number;     // ms epoch (device clock)
  updatedAt: number;
  deletedAt: number|null;// soft delete, propagated through sync
  version: number;       // server version this record is based on (incremented by server on each accepted write)
  syncStatus: 'synced'|'pending'|'syncing'|'failed'|'conflict';
  lastSyncedAt: number|null;
}
```

| Entity | Key fields |
|---|---|
| **City** | name, state, country, description, notes, coverImageId, lastVisitedAt |
| **Category** | name, icon, color, isDefault, sortOrder (10 predefined seeded per user, plus custom) |
| **Entry** | cityId, categoryId, title, description, address, contactName, phone, email, website, visitDate, rating (1–5), priority (low/med/high), tags[], customFields[{label,value}], imageIds[] |
| **Visit** | cityId, startDate, endDate, purpose, notes |
| **Image** | parentId (entry/city), mime, width, height, size, remoteRef, uploadStatus — blob kept locally in `blobs` store |
| **Share** | ownerId, cityId, granteeEmail, granteeUid, role (viewer/editor) |
| **Outbox** (local only) | key = `table:id` (coalesced — one pending op per record), attempts, lastError, nextAttemptAt |
| **Conflict** (local only) | table, id, local copy, remote copy |

"Contacts" are entries in the *Important Contacts* category (plus any entry with a phone/email shows on the Contacts tab) — no duplicated contact table.

### Firestore layout

```
users/{uid}                         profile
userDirectory/{emailLower}          { uid }  – lets owners share by email without Cloud Functions
users/{uid}/cities/{id}
users/{uid}/categories/{id}
users/{uid}/entries/{id}            (cityId field)
users/{uid}/visits/{id}             (cityId field)
users/{uid}/images/{id}             metadata (+ chunks/{n} when IMAGE_BACKEND=firestore)
shares/{ownerUid_cityId_granteeUid} { ownerId, cityId, granteeUid, granteeEmail, role }
```

Every doc also carries `serverUpdatedAt` (serverTimestamp) used as the pull cursor.

## 4. Offline & sync strategy

**Write path (always local, always instant):** repo writes the record with `syncStatus:'pending'`, then upserts the outbox entry `table:id`. Rapid successive edits coalesce into one push. Store writes are transactional per record, so a crash mid-save leaves either the old or new state.

**Push** (when online, on: app start, reconnect, every 60 s, after each change (debounced 2 s), manual "Sync now"):
1. Images first: upload blob → set `remoteRef`. A failed upload keeps the blob locally and retries; the entry still syncs and shows the image as "uploading".
2. For each outbox item, in a Firestore **transaction**: read remote doc.
   * remote missing or `remote.version === local.version` → write with `version+1`, `serverUpdatedAt`. Mark local `synced`.
   * `remote.version > local.version` → **conflict**: someone else wrote since our base. Nothing is overwritten. Local record marked `conflict`, both copies stored in `conflicts`; user picks **Keep mine** (re-push on top of the remote version) or **Keep theirs**.
   * Retrying an already-applied write is safe: the doc ID is the client UUID and the version check makes it a no-op/conflict-free replay.
3. Failures → `attempts++`, exponential backoff (5 s → 10 min cap), `syncStatus:'failed'` with error shown; the data stays local.

**Pull:** per collection, query `serverUpdatedAt > cursor`. For each remote doc: if local copy has no pending changes → overwrite; if local is pending and remote.version > local.version → conflict; else ignore (our push will win the version race). Cursor saved only after the batch is applied. Shared cities: pull city + its entries/visits for each share where I'm the grantee.

**Deletes:** soft (`deletedAt`), synced like any update, hidden in UI. Deleting a city soft-deletes its entries/visits/images in the same transaction.

**Auth offline:** Firebase persists the session in IndexedDB; we also cache the last profile with a 30-day offline limit. Offline launch within that limit opens the user's local DB; past it, re-login is required (data is kept).

**Logout with pending changes:** warn with count; options "Sync & log out", "Log out anyway (changes stay on this device and sync next login)". Local DB is per-user so nothing leaks to the next user. Settings has "Clear local data" (blocked while pending unless confirmed).

**Storage:** `navigator.storage.persist()` requested on web; `storage.estimate()` shown in Settings; image compression (max 1600 px, JPEG q0.8, ~150–300 KB) and quota errors surface as a toast instead of silent failure.

## 5. Screens

Splash → Login / Register / Forgot password (+ "Explore Demo") → App shell (sidebar on desktop, bottom nav on mobile, sync badge in header):

1. Dashboard — stats, recent entries, recently visited, pending sync count, quick actions
2. Cities — grid, search, state/country filter, sort A–Z / recent, add
3. City detail — tabs: Overview · Leads · Food · Shops · Must Visit · Contacts · Notes · Images · Visits; share, export, edit, delete
4. Entry form — dynamic fields per category, image picker with preview/remove, custom fields
5. Categories — CRUD with icon & color picker
6. Export — pick city → categories/entries → preview → PDF → download/share
7. Settings — profile, theme, sync settings & conflicts, storage, offline data, demo reset/simulator, logout

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Device clocks skewed | Conflict detection uses server-side `version`, not timestamps; `serverUpdatedAt` is the pull cursor |
| Storage needs Blaze | `firestore` image backend default |
| Firestore free quota (20k writes/day) | Coalesced outbox, debounced pushes |
| WebView storage eviction (iOS) | SQLite on native; `persist()` on web |
| Large images | Canvas compression before save |
| Shared-record access | Firestore rules check the `shares/{owner_city_grantee}` doc |

## 7. Phases (implementation order)

1. Planning (this doc) · 2. Branding + design system + shell · 3. Repo/store/hooks + CRUD screens · 4. Sync engine + outbox + conflicts · 5. Demo data + DemoRemote + simulator · 6. Firebase services + rules · 7. Tests (vitest: store, repo, sync, conflicts) + build · 8. Docs + Capacitor projects.
