# Spendly — security audit

Audited 4 October 2026. Spendly is an Android app with no server of its own: data lives in SQLite on
the phone and, for signed-in users, in Firebase (Auth + Firestore). The web pages in `docs/` are static
and served by GitHub Pages. Checklist items written for web servers are mapped below to what plays
that role here.

## Findings and what was done

| Area | Finding | Status |
| --- | --- | --- |
| **Secrets in git** | Full history (all commits) scanned for private keys, OAuth client secrets, GitHub/AWS/Stripe/Slack tokens, service accounts, JWTs, keystore passwords. **None found.** The only keys present are ones that ship inside every copy of the app by design (Firebase web API key, Google OAuth client IDs, AdMob test IDs). | ✅ Clean |
| **API keys** | The Firebase web API key is public by design; it identifies the project, it does not authorise access. Security comes from the Firestore rules. It should still be restricted to the Firebase APIs (console step 3). | ⚠️ Console step |
| **Env variables** | No `.env` files or runtime env vars; config is in `app.json`. `.gitignore` did not cover `.env`, `google-services.json`, keystores or OAuth client-secret files. | ✅ Fixed |
| **Database (Firestore)** | Live probes against the real project: unauthenticated reads and writes refused; a signed-in account cannot read, write, delete or list another user's data, or write outside `users/`. **But** any account (free to create) could store arbitrary data under its own uid: a 200 KB junk document with a non-numeric amount was accepted. On the Blaze plan that's a billing-abuse risk. | ✅ Rules rewritten, **publish needed** (step 1) |
| **Access control** | New rules: deny by default; owner-only; only the 4 synced collections; every write must match Spendly's schema exactly (field names, types, enums, text lengths, sane amounts). 29/29 emulator tests pass: every real record shape the app writes is accepted (including tombstones and rows from old versions), every attack above is refused. | ✅ |
| **Authentication** | The app signs in only with Google (OAuth with PKCE). The project also has **Anonymous, Email/Password and Phone** sign-in enabled, unused by the app. Anyone can mint accounts through them, and Phone auth on a paid plan is an SMS-fraud target. | ⚠️ Console step 2 |
| **Admin routes** | None exist: no server, no admin API, no admin collection. Rules deny everything outside `users/{uid}/…`. | ✅ N/A |
| **Passwords** | Spendly never sees or stores a password (Google sign-in; the app lock uses the phone's biometrics). | ✅ N/A |
| **Rate limiting** | Firebase Auth rate-limits itself. Firestore has no per-user rate limit; abuse is now capped by the schema rules. Next level: App Check (step 5) and a billing budget alert (step 4). | ⚠️ Steps 4–5 |
| **Forms / XSS** | React Native renders text, never HTML, so in-app XSS isn't possible. The only HTML is the PDF export; every user-supplied value in it (notes, names, email) is escaped. The Excel export writes text cells, never formulas. | ✅ Verified |
| **CORS / security headers** | No API server, so no CORS surface. The `docs/` pages load nothing and run no script; added a strict Content-Security-Policy and a referrer policy. (GitHub Pages doesn't allow custom response headers; HTTPS is enforced by Pages.) | ✅ Added |
| **Debug mode** | CI builds `assembleRelease` (Hermes, `__DEV__` off, dev menu absent). No `console.*` logging anywhere in the app code. Code is shrunk with R8. | ✅ |
| **Android hardening** | `allowBackup` was on: the expense database and sign-in token could be pulled off an unlocked phone over USB or from a backup. Now off. Removed unused permissions: microphone, draw-over-apps, write-storage. | ✅ Fixed |
| **App signing** | **Release APKs are signed with React Native's public debug key.** Anyone can sign an "update" with it that installs over Spendly and inherits its data. The workflow now signs with a private key once one is stored in Actions secrets (see below). | ❗ Action needed |
| **Dependencies** | Forced patched versions of `@grpc/grpc-js` (inside Firebase) and `uuid` (inside an iOS build tool) via `overrides`. Other packages stay on the versions the app is tested with; blanket `npm update` was tried and rolled back after it broke the web build (react/react-dom mismatch) for no security gain. The `xlsx` library was later replaced by a small built-in writer (`src/utils/xlsx.ts`). `npm audit` (production): **34 → 20 advisories, 0 critical, 0 moderate**. The rest trace to 2 build-time packages with no fixed release, neither in the APK: `braces` (bundler file matching) and `node-forge` (Expo update code-signing, unused). | ✅ / accepted |
| **Unused packages** | Removed `uuid`. Others flagged by depcheck are needed indirectly (config plugin, peer deps of navigation/gestures/Google sign-in). | ✅ |
| **Build pipeline** | GitHub Actions pinned to commit SHAs; dependencies installed with `npm ci` (exact lockfile, checksums verified). Signing key decoded only for the build and deleted after. | ✅ |
| **Exposed files** | Repo is public. Everything in it is safe to be public: no secrets, no data. GitHub Pages serves only `docs/` (homepage, privacy policy, app-ads.txt). | ✅ |
| **Local data** | SQLite database and auth token live in app-private storage (sandboxed from other apps). With backups off and a private signing key, nothing else can read them on a non-rooted phone. | ✅ after signing fix |

## Console steps (only the project owner can do these)

1. **Publish the new Firestore rules.** Firebase Console → Firestore Database → Rules → replace with the contents of `firestore.rules` → Publish.
2. **Turn off unused sign-in methods.** Firebase Console → Authentication → Sign-in method → disable **Anonymous**, **Email/Password** and **Phone**. Keep **Google** only.
3. **Restrict the API key.** Google Cloud Console → APIs & Services → Credentials → the key named "Browser key (auto created by Firebase)" → API restrictions → *Restrict key* → allow only: Identity Toolkit API, Token Service API, Cloud Firestore API, Firebase Installations API. Save.
4. **Budget alert.** Google Cloud Console → Billing → Budgets & alerts → create a budget (e.g. ₹200/month) with email alerts at 50/90/100%.
5. **App Check (later, when on Play Store).** Firebase Console → App Check → register the Android app with Play Integrity, then enforce for Firestore. Only genuine copies of Spendly can then reach the database.

## Moving to a private signing key

Do this once, deliberately — it has two side effects:

- **Phones with the current app must uninstall it once** (Android refuses an update signed with a different key). Signed-in users get their data back by signing in again; **guest data on the phone is lost**, so export it first.
- **Google sign-in must learn the new key**: add the new key's SHA-1 to the Android OAuth client in Google Cloud Console (APIs & Services → Credentials → the Android client), and in Firebase project settings.

Steps:

1. Create the key (on a computer with Java):
   `keytool -genkeypair -v -storetype PKCS12 -keystore spendly-release.keystore -alias spendly -keyalg RSA -keysize 4096 -validity 10000`
2. Back up `spendly-release.keystore` and its passwords somewhere safe and private. **If this key is lost, the app can never be updated again.** Never commit it (it's in `.gitignore`).
3. In GitHub → repository → Settings → Secrets and variables → Actions, add:
   - `ANDROID_KEYSTORE_BASE64` — output of `base64 -w0 spendly-release.keystore`
   - `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`spendly`), `ANDROID_KEY_PASSWORD`
4. The next build signs with it automatically. Get the SHA-1 with
   `keytool -list -v -keystore spendly-release.keystore -alias spendly` and add it as described above.

## Reporting a problem

Email the developer (see the privacy policy) rather than opening a public issue.
