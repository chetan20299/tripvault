# TripVault — Your Business Travel Knowledge

An offline-first travel journal for business travellers. Save leads, contacts, restaurants, shops, places and market insights city by city, so they're there the next time you visit, even without internet. One React codebase runs as a website/PWA and as Android and iOS apps.

* **Demo Mode** works immediately: no Firebase and no account needed.
* **Production Mode** uses Firebase Authentication + Cloud Firestore. It's enabled by adding env vars.

See [docs/PLAN.md](docs/PLAN.md) for the architecture, data model, sync strategy and design decisions.

---

## Quick start (Demo Mode)

Requirements: Node.js 20+ (tested on 22).

```bash
npm install
npm run dev          # http://localhost:5173 → "Explore Demo"
```

Demo Mode gives you sample cities, leads, restaurants, contacts, visits and photos. Everything works: CRUD, categories, search and filters, PDF export, sharing with demo colleagues, and an offline/sync **simulator** (Settings → Demo simulator), which can:

* **Simulate offline**: make changes, then turn it off and watch them sync.
* **Failure rate**: inject server errors to see retries and the "Sync failed" state.
* **Simulate edit from another device**: edit the same entry locally while offline to produce a conflict, then resolve it.
* **Reset demo data**.

Demo data lives in two separate IndexedDB databases in your browser (`tripvault-demo` and `tripvault-demo-remote`). The Firebase SDK is never initialised in Demo Mode, so demo actions cannot touch real data.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Typecheck + production build to `dist/` (includes the PWA service worker) |
| `npm run preview` | Serve `dist/` locally |
| `npm test` | Sync-engine integration tests (two simulated devices against the demo server) |
| `npm run e2e` | Browser smoke test of the main user journeys (start `npx vite preview --port 4173` first) |
| `npm run icons` | Regenerate PWA + Android/iOS icons and splash screens from `public/logo.svg` |
| `npm run android` / `npm run ios` | Build, sync to the native project, and open Android Studio / Xcode |

---

## Production setup (Firebase)

### Pricing notes (checked November 2026)

| Service | Plan needed | Notes |
|---|---|---|
| Authentication (email/password) | Spark (free) | |
| Cloud Firestore | Spark (free) | 1 GiB stored, 50k reads / 20k writes / 20k deletes per day |
| Hosting | Spark (free) | 10 GB storage, 360 MB/day transfer |
| Cloud Storage | **Blaze required** since 3 Feb 2026 | Blaze still includes a no-cost quota, but needs a billing account |

TripVault therefore supports two image backends:

* `VITE_IMAGE_BACKEND=firestore` (**default**): compressed images (~150–400 KB) are stored as chunked Firestore documents. The whole app runs on the free Spark plan.
* `VITE_IMAGE_BACKEND=storage`: uses Cloud Storage. Requires Blaze; set a budget alert.

### 1. Create the project

1. Go to the [Firebase console](https://console.firebase.google.com) → **Add project**.
2. **Build → Authentication → Get started → Email/Password → Enable.**
3. **Build → Firestore Database → Create database** (production mode, nearest region).
4. *(Only for `storage` backend)* upgrade to Blaze, then **Build → Storage → Get started**.
5. **Project settings → Your apps → Web app (</>)** and register it. Copy the config values.

### 2. Environment variables

```bash
cp .env.example .env
```

Fill in the `VITE_FIREBASE_*` values from step 5. Never commit `.env`; it's in `.gitignore`. (Firebase web config values are identifiers, not secrets. Access is enforced by the security rules.)

### 3. Deploy rules and indexes

```bash
npm i -g firebase-tools
firebase login
firebase use --add            # pick your project
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only storage   # only when using the storage backend
```

* [firestore.rules](firestore.rules): every record is private to its owner. Shared cities are readable or editable only by users with a matching `shares/{owner_city_grantee}` document. Writes must increment `version` by exactly 1, which enforces optimistic concurrency on the server too. No hard deletes are allowed.
* [firestore.indexes.json](firestore.indexes.json): composite indexes used to sync shared cities.
* [storage.rules](storage.rules): owner/share checks for image files (Blaze only).

### 4. Authorised domains

Under **Authentication → Settings → Authorized domains**, add your hosting domain. `localhost` is there by default.

---

## Deploy the website (Firebase Hosting, free)

```bash
npm run build
firebase deploy --only hosting
```

`firebase.json` already serves `dist/` with correct caching for the service worker. The app uses hash routing, so no rewrites are needed. Any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages) works too: upload `dist/`.

Once opened, the site installs as a PWA (Add to Home Screen) and launches offline.

---

> 📱 **New to mobile builds?** Follow the step-by-step guide: [docs/MOBILE-INSTALL.md](docs/MOBILE-INSTALL.md). It covers the web-app install, APK, iPhone, Play Store/App Store and troubleshooting.

## Android build

Requirements: Android Studio (latest), JDK 17, Android SDK 34.

```bash
npm run build
npx cap sync android
npx cap open android        # or: npm run android
```

* **Debug APK:** Android Studio → *Build → Build Bundle(s)/APK(s) → Build APK(s)*.
* **Release AAB for Play Store:** *Build → Generate Signed Bundle / APK → Android App Bundle*, then create or choose a keystore. Keep the keystore safe: you need it for every update.
* App id: `com.tripvault.app`. Change `appId` in [capacitor.config.ts](capacitor.config.ts) **before** your first release if you want a different id.
* Camera and gallery permissions are already declared in `AndroidManifest.xml`.

## iOS build

Requirements: macOS, Xcode 15+, CocoaPods (`sudo gem install cocoapods`), an Apple Developer account for devices and the App Store.

```bash
npm run build
npx cap sync ios            # runs pod install
npx cap open ios
```

In Xcode: select the **App** target → *Signing & Capabilities* → choose your Team, then *Product → Archive* → *Distribute App*. Camera and photo-library usage descriptions are already in `Info.plist`.

After any web code change, rebuild and sync: `npm run build && npx cap sync`.

---

## How offline & sync work (short version)

* **Local database first.** Every read and write goes to the device database: **SQLite** on Android/iOS (`@capacitor-community/sqlite`), **IndexedDB** in browsers. The UI never waits on the network.
* **Outbox.** Each change also records a pending item (one per record, so repeated edits coalesce). The outbox survives app restarts and force-closes.
* **Push** (on reconnect, every 60 s, shortly after edits, or **Sync now**): images upload first, then each record is written in a Firestore transaction that only succeeds if the server copy is still at the version this device last saw.
* **Conflicts are never auto-overwritten.** If another device changed the same record, both copies are kept and the record is flagged *Needs review* (Settings → Sync). You choose **Keep mine** or **Keep theirs**.
* **Retries** use exponential backoff (5 s → 10 min). Failures are shown per item, and data stays on the device.
* **Pull** fetches changes since the last server timestamp, including cities shared with you. If access is revoked, the shared data is removed from the device.
* **Deletes** are soft (`deletedAt`) so they propagate to every device. Deleting a city also deletes its entries, visits and images.
* **Offline login:** a previously signed-in user can open the app offline for up to 30 days (`OFFLINE_SESSION_DAYS` in `src/config.ts`), after which they must sign in online again. Local data is kept.
* **Logout with unsynced changes** warns you and offers *Sync & log out*. Each user has a separate local database, so nothing leaks between accounts.

## Project structure

```
src/
  types.ts               data model
  config.ts              env-driven mode selection
  data/
    store/               LocalStore interface: idb.ts (web) · sqlite.ts (native)
    db.ts                in-memory mirror + React hooks
    repo.ts              all mutations (record + outbox, atomically)
    categories.ts        default categories, per-category form fields
    demoSeed.ts          demo dataset
  sync/
    engine.ts            push / pull / retry / conflicts / image cache
    remote.ts            backend interface + shared version check
    firebase.ts          Firebase auth + Firestore backend
    demoRemote.ts        simulated server for Demo Mode
    sync.test.ts         integration tests
  auth/session.tsx       login/logout, session restore, offline expiry
  lib/                   pdf, image compression, share/download, theme, logo
  components/            UI kit, layout, forms, image gallery/picker
  pages/                 Auth, Dashboard, Cities, CityDetail, EntryForm, EntryDetail, Categories, Export, Settings
firestore.rules · storage.rules · firestore.indexes.json · firebase.json
android/ · ios/          Capacitor native projects
```

## Branding

* **Name:** TripVault, "Your Business Travel Knowledge"
* **Logo:** a map pin whose head is a vault keyhole inside a dial ring ([public/logo.svg](public/logo.svg))
* **Colours:** primary Deep Ocean `#0B4F6C`, secondary Lagoon `#167A9C`, accent Amber `#F59E0B`, dark Navy `#06293A`; neutral slate surfaces with light and dark themes
* **Type:** Plus Jakarta Sans (bundled, so it works offline). **Icons:** Lucide.

## Known limitations

* **PDF text** uses the built-in Latin-1 fonts. Non-Latin scripts (Hindi, Arabic, CJK) print as `?`, and `₹` prints as `Rs.`. To support them, embed a Unicode TTF in `src/lib/pdf.ts`.
* **Sharing** a city needs a connection (the recipient is looked up by email, and they must have registered).
* **Conflict resolution** works per record (keep mine or keep theirs), not with field-by-field merging.
* **Images** are capped at 12 per entry and compressed to ≤1600 px JPEG.
* Not yet verified in this repo: the Firestore/Storage rules against the Firebase emulator, Production Mode against a live Firebase project, and native builds on real Android/iOS devices (including the SQLite store). The web app, Demo Mode, sync engine and PDF export were tested; see *Scripts*.
