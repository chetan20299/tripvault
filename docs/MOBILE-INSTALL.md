# How to get TripVault on Android & iPhone

There are three ways to get TripVault onto a phone. Pick the one that fits.

| Way | Android | iPhone | Needs | Time |
|---|---|---|---|---|
| **A. Install as a web app (PWA)** | ✅ | ✅ | The website hosted online | 10 min |
| **B. Build the real app yourself** | ✅ on Windows | ⚠️ needs a **Mac** | Android Studio / Xcode | 1–2 h first time |
| **C. Publish to Play Store / App Store** | ✅ | ✅ | Developer accounts (paid) | 1–7 days review |

> **Before any option:** decide between Demo Mode and real accounts.
> - **Demo only:** nothing to configure. The app opens with "Explore Demo".
> - **Real accounts (Firebase):** fill in `.env` first (see [README → Production setup](../README.md#production-setup-firebase)). The values are baked in at build time, so **rebuild after changing `.env`**.

---

## Option A: Install as a web app (fastest, both phones)

TripVault is a Progressive Web App. Once installed, it gets its own home-screen icon, opens full-screen and works offline.

### A1. Put the website online (one time)

```bash
npm install
npm run build
npm i -g firebase-tools
firebase login
firebase use --add         # pick your Firebase project (firebase.json is already set up)
firebase deploy --only hosting
```

You get a link like `https://your-project.web.app`. Firebase Hosting is free. Any static host works too (Netlify, Vercel: upload the `dist` folder).

> PWAs need **HTTPS**. A link like `http://192.168.x.x:5173` from your PC can be opened on the phone for testing, but it can't be *installed* or work offline.

### A2. Install on Android (Chrome)

1. Open the link in **Chrome**.
2. Tap **⋮ (menu) → Add to Home screen → Install**.
3. Open **TripVault** from the home screen.

### A3. Install on iPhone (Safari)

1. Open the link in **Safari** (other browsers on iOS can't install web apps).
2. Tap the **Share** button (square with arrow) → **Add to Home Screen** → **Add**.
3. Open **TripVault** from the home screen.

Limits of a PWA: no app-store listing, and on iPhone the data lives in the web-app storage, not SQLite. For a "real" app, use Option B.

---

## Option B1: Build & install the Android app (on your Windows PC)

### Step 1: Install Android Studio (one time)

1. Download it from <https://developer.android.com/studio> and install with the default options.
2. Open Android Studio. The setup wizard downloads the **Android SDK**. Accept the licences and let it finish (a few GB).
3. In Android Studio go to **More Actions → SDK Manager** and make sure **Android 14 (API 34)** is ticked → **Apply**.
4. Fix the environment variable on your PC. Yours currently points to a folder that doesn't exist:
   - Press **Win** → type *environment variables* → **Edit the system environment variables → Environment Variables**.
   - Set `ANDROID_HOME` (and `ANDROID_SDK_ROOT`) to `C:\Users\<you>\AppData\Local\Android\Sdk`.
   - Restart VS Code / the terminal.

> Android Studio ships its own Java (JDK 17), so it builds fine even though you have Java 18 installed.

### Step 2: Build the web part and copy it into the Android project

In the project folder (`D:\Websites\New Lead`):

```bash
npm install
npm run build
npx cap sync android
```

Repeat these three commands **every time you change the code**.

### Step 3: Open the project in Android Studio

```bash
npx cap open android
```

(or in Android Studio: **File → Open →** `D:\Websites\New Lead\android`). The first time, wait for **Gradle sync** to finish (bottom status bar; it can take 5–10 minutes).

### Step 4a: Install directly over USB (recommended for testing)

1. On the phone: **Settings → About phone →** tap **Build number** 7 times. This unlocks *Developer options*.
2. **Settings → System → Developer options → USB debugging → On**.
3. Connect the phone with a USB cable and tap **Allow** on the "Allow USB debugging?" prompt.
4. In Android Studio, pick your phone in the device dropdown at the top, then press **▶ Run**.
5. TripVault installs and opens on the phone. 🎉

### Step 4b: Make an APK file and share it (no cable)

1. Android Studio → **Build → Build App Bundle(s) / APK(s) → Build APK(s)**.
   *(Command-line alternative: `cd android` then `gradlew.bat assembleDebug`)*
2. When it finishes, click **locate**. The file is:
   `android\app\build\outputs\apk\debug\app-debug.apk`
3. Send the APK to the phone (WhatsApp to yourself, Google Drive, email, USB copy).
4. On the phone, tap the APK. Android asks to **allow installs from this source** (Chrome / Files / Drive): allow it → **Install**.
5. Open TripVault.

> A **debug APK** is fine for you and your team. For the Play Store you need a signed release, see Option C.

---

## Option B2: Build & install the iPhone app (needs a Mac)

Apple only allows iOS apps to be built with **Xcode on macOS**. It can't be done on Windows. Your choices:

- your own Mac or a colleague's Mac (any Mac from roughly 2019 or newer), or
- a rented cloud Mac (e.g. MacinCloud, about $1/hour), or
- a cloud build service (Codemagic, Ionic Appflow; free/paid tiers). Those still need an Apple Developer account to install on phones.

### Step 1: Prepare the Mac (one time)

1. Install **Xcode** from the Mac App Store (large download), open it once and accept the licence.
2. Install **Node.js 20+** from <https://nodejs.org>.
3. Install **CocoaPods**: in Terminal run `sudo gem install cocoapods` (or `brew install cocoapods`).

### Step 2: Copy the project and build

Copy the project folder to the Mac (Git, zip or USB; skip `node_modules`). Then in Terminal:

```bash
cd TripVault-folder
npm install
npm run build
npx cap sync ios          # also runs "pod install"
npx cap open ios          # opens Xcode
```

### Step 3: Sign the app

1. In Xcode, click **App** (blue icon, top of the left panel) → target **App** → **Signing & Capabilities**.
2. Tick **Automatically manage signing**.
3. **Team:** choose your Apple ID (**Add an Account…** if needed). A free Apple ID works for testing on your own phone.
4. If Xcode complains that the bundle id is taken, change **Bundle Identifier** to something unique, e.g. `com.yourcompany.tripvault`.

### Step 4: Install on your iPhone

1. Connect the iPhone to the Mac with a cable and tap **Trust This Computer** on the phone.
2. On the iPhone (iOS 16+): **Settings → Privacy & Security → Developer Mode → On**, then restart the phone.
3. In Xcode's top bar, select your iPhone as the device and press **▶ Run**.
4. The first time, the phone says *"Untrusted Developer"*: go to **Settings → General → VPN & Device Management →** your Apple ID → **Trust**.
5. Open TripVault. 🎉

> With a **free Apple ID**, the app stops opening after **7 days**. Press ▶ Run again to refresh it. A paid Apple Developer account ($99/year) removes this limit and lets you use TestFlight (below).

---

## Option C: Publish (Play Store, App Store, TestFlight)

### Google Play Store

1. Create a Google Play Console account: <https://play.google.com/console> (**$25 one-time**).
2. In Android Studio: **Build → Generate Signed App Bundle / APK → Android App Bundle → Create new keystore**.
   ⚠️ Back up the keystore file and passwords. Without them you can **never update** the app.
3. Choose **release** → Finish. The file is `android/app/release/app-release.aab`.
4. In Play Console: **Create app** → fill in the store listing (icon: `assets/icon-only.png`, screenshots, privacy policy URL) → **Testing → Internal testing** → upload the `.aab` → add tester emails.
5. Testers install it from the Play Store link. When ready, promote it to **Production** (Google review usually takes 1–7 days).

### Apple App Store / TestFlight

1. Join the Apple Developer Program: <https://developer.apple.com/programs> (**$99/year**).
2. In **App Store Connect** (<https://appstoreconnect.apple.com>): **My Apps → + → New App**, using the same Bundle ID as in Xcode.
3. In Xcode: choose **Any iOS Device (arm64)** as the target → **Product → Archive**.
4. When the Organizer window opens: **Distribute App → App Store Connect → Upload**.
5. **TestFlight (beta testers):** in App Store Connect → TestFlight → add testers by email. They install the **TestFlight** app and get TripVault through it. No review is needed for internal testers.
6. **App Store:** fill in the listing (screenshots, description, privacy details) → **Submit for Review** (usually 1–3 days).

---

## Updating the app later

Every time you change code:

```bash
npm run build
npx cap sync          # copies the new build into android/ and ios/
```

Then press **▶ Run** again (testing), or for the stores, increase the version and upload a new build:
- Android: `versionCode` (+1) and `versionName` in `android/app/build.gradle`
- iOS: **Version** and **Build** in Xcode → target App → General

The PWA (Option A) updates by itself after `npm run build` + `firebase deploy --only hosting`.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `SDK location not found` | Set `ANDROID_HOME` (Step B1-1.4), or create `android/local.properties` with `sdk.dir=C\:\\Users\\<you>\\AppData\\Local\\Android\\Sdk` |
| Gradle: *requires Java 17* | Android Studio → **Settings → Build Tools → Gradle → Gradle JDK →** choose *jbr-17* |
| Phone not listed in Android Studio | Re-plug the cable, accept the USB-debugging prompt, use a data cable (not charge-only) |
| "App not installed" on Android | Uninstall the older TripVault first (different signature), then install again |
| Blank white screen in the app | You forgot `npm run build` before `npx cap sync` |
| `pod install` fails on Mac | `sudo gem install cocoapods`, then `cd ios/App && pod install --repo-update` |
| iPhone: "Untrusted Developer" | Settings → General → VPN & Device Management → Trust |
| iPhone app stopped opening after 7 days | Free Apple ID limit. Press ▶ Run in Xcode again, or use a paid developer account |
| Login says "not configured" | `.env` was empty when you built. Fill it in, then `npm run build && npx cap sync` |
| Camera option missing when adding photos | Allow the Camera permission: Settings → Apps → TripVault → Permissions |
