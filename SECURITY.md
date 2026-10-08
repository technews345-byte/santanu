# Spendly security audit — 7 October 2026

## Scope and outcome

Reviewed Spendly at `d7dfbbccb248ed1b86a8874b835f1b20d7df6b5d` on
`claude/expense-budget-app-vdww3s`. This is an Expo/React Native app using SQLite,
Google/Firebase Authentication, and Firestore. `docs/` contains static pages.
There is no custom API server or admin application in the Spendly source.

This review replaces the earlier report. Earlier claims about live Firebase probes
and deployed settings were not independently verified in this review. These changes
are source changes, not proof that production Firebase rules or an installed APK
have been updated. No application can be certified hack-proof by a code audit.

## Changes made

| Finding | Severity | Fix |
| --- | --- | --- |
| Signing out removed the local owner marker, allowing the next account to treat previous records as guest data | High | Preserve ownership on sign-out; clear records atomically on account switch; block the navigator during ownership transition |
| A previous account's in-flight sync could apply after authentication changed | High | Track session generations, cancel stale work, serialize account transitions, and wait for active sync on sign-out |
| App lock authenticated only once per process | High | Re-lock on background, authenticate on return, suppress ads during lock/authentication, retain the mounted form behind the lock |
| Native Firebase session persisted unencrypted in AsyncStorage | Medium | Migrate to Keychain/Keystore using Expo SecureStore; chunk large Unicode payloads; publish new sessions atomically; remove legacy plaintext |
| Release builds fell back to the public Android debug key | High | Use the private key whenever valid secrets exist; until then the build falls back to the debug key with a visible warning (owner's choice, 8 Oct 2026). **Still open until the key secrets are fixed.** |
| Account deletion removed Firebase Auth identity but left Firestore records behind | Medium | Require recent authentication, stop concurrent local sync, delete the four cloud collections in batches before deleting the identity |
| Invalid numbers and malformed remote records could enter the local database | Medium | Validate records at repository write and cloud-read boundaries; reject nonfinite/nonpositive amounts, malformed attachments, invalid dates/types, and overlong input |
| Firestore accepted negative transaction amounts, arbitrary account types and invalid budget months | Medium | Tighten rules while preserving owner-only, deny-by-default access and valid tombstones |
| Critical shell-quote dependency advisory | Critical dependency finding | Update lockfile from 1.10.0 to patched 1.12.0 |
| Sync cleared pending flags on records edited during upload | Medium | Acknowledge the uploaded snapshot only, including same-millisecond edits and tombstones |
| Remote application could overwrite edits made after merge planning | Medium | Conditional snapshot comparison before applying remote changes |
| Restore stopped at 2,000 records; timestamp cursors missed late uploads | Medium | Page all records by document ID; do not use client clocks as incremental watermarks |
| Deleted budget recreation returned an ID different from SQLite's persisted ID | Medium | Return and retain the persisted budget ID |
| Repeating transactions were never generated | Functional | Idempotent catch-up on launch/resume, deterministic occurrence IDs, calendar month-end handling |
| Invalid calculator expressions could save incorrect amounts | Functional | Reject malformed decimals/division by zero; support negative intermediate results; prevent duplicate transaction saves |
| Deleted account filter and backdated transaction order were stale | Functional | Validate/reset active selection and sort added transactions by date |
| OAuth prompt exceptions left the sign-in button busy | Functional | Catch prompt errors and guard repeated launches |

## Requested security checklist

- **API keys and environment variables:** Firebase client configuration, OAuth client
  IDs and AdMob identifiers are public identifiers and necessarily ship in the app.
  Moving them into `EXPO_PUBLIC_*` does not hide them. No privileged server API
  credential is required by Spendly. Signing credentials are read only from GitHub
  Actions secrets. `.env`, service-account files and private keystores are ignored.
  Keep future privileged APIs on a server; never include their secrets in Expo
  config or public environment variables. Cloud API restrictions were not verified.
- **Authentication and access control:** Google/Firebase handles credentials and token
  verification. Firestore rules are the server-side authorization boundary; mobile
  navigation is not an authorization boundary. Rules deny other users and unlisted
  collections. Account transitions and native token persistence were hardened.
- **Admin routes:** None exist in Spendly. Emulator tests deny writes to admin paths.
- **Forms and sanitization:** Validate type, length, range and enum values at write
  boundaries. SQL values use bound parameters. Preserve ordinary text rather than
  destructively stripping punctuation; escape it when producing HTML/XML.
- **XSS:** Native text components do not interpret HTML. PDF exports escape user text
  and now include a restrictive CSP and no-referrer policy. XLSX notes use inline
  strings, not formulas. Tests cover hostile text and formula-looking input.
- **Rate limiting:** There is no custom server on which to install a rate limiter.
  Debouncing and single-flight sync reduce accidental traffic but are NOT security
  rate limits. Schema limits restrict payload sizes, not request counts. Firebase
  App Check, provider quotas/abuse controls and billing monitoring remain production
  configuration tasks. Strict per-user rate limiting requires a trusted server.
- **API endpoints/CORS/headers:** The app calls Firebase SDK services; it defines no
  custom API endpoints or CORS middleware. Existing static pages have CSP/referrer
  meta policies. GitHub Pages response headers are hosting-controlled; HSTS,
  X-Content-Type-Options, frame-ancestors and other HTTP response headers were not
  verified or changed. Meta CSP cannot substitute for all HTTP security headers.
- **Debug mode:** APK workflow uses `assembleRelease`; release minification is enabled.
  No app-source `console.*` logging was found. A final signed APK was not built or
  installed in this review; native device verification remains required.
- **Dependencies/unused packages:** Updated the confirmed fixable critical dependency.
  Kept Expo/React Native compatible versions. No additional production dependency
  was proven safe to remove: config plugins and peer dependencies are required even
  without a direct import. SecureStore is added for encrypted session persistence;
  test-only packages are dev dependencies.
- **Database security:** Firestore rules tested locally; deployment remains required.
  SQLite is app-private, parameterized, and excluded from Android backup. It is NOT
  encrypted with SQLCipher. The biometric lock is a UI lock, not database encryption,
  and cannot protect against a compromised/rooted device. Adding database encryption
  safely requires a tested migration/key recovery design for existing installations.
- **Password hashing:** Spendly has no password database or password login implementation.
  Google/Firebase manages credentials. Adding a local password hash would not improve
  this authentication flow.

## Git-history secret scan

Enumerated all four branch histories and verified all 14 advertised tag heads are
contained in those histories: **126 unique reachable commits, 121 unique trees**.
Scanned **854 unique text blobs**, including historical configuration and workflow
files, for private keys, service-account JSON, GitHub/AWS/Stripe/Slack tokens, JWTs,
OAuth client secrets and common quoted secret assignments. No matching secret token
was found. Public Firebase API-key patterns occurred in 20 historical blobs.

Binary assets were not content-scanned. Six additional non-text objects included
media, a Gradle wrapper JAR and a **public test signing keystore** at
`prabhat-app/signing/prabhat-test.keystore` (blob
`50b0bd9de289ed4300a787d1f098e9868625bfac`) for another app in this repository.
Treat that key as public. If it was used for production, plan a signing-key migration;
deleting it from the current tree does not revoke it. History was not rewritten.
Unreachable/deleted Git objects, forks, external logs, release APK contents and GitHub
secret settings were outside the scan. Pattern scanning cannot prove absence of secrets.

## Dependency audit

`npm audit` before: **1 critical, 19 high**. After the shell-quote update:
**0 critical, 19 high**. The remaining dependency paths trace to two advisories:

- `braces <=3.0.3`: GHSA-vfj7-8cjw-p6xm, stack exhaustion with nested patterns.
- `node-forge <=1.4.0`: GHSA-86w9-cpqp-85rv, RSA signature verification issue.

The registry advisory data offered no patched release for these roots at review time.
They are reached through Expo/Metro/build tooling. This is reduced exposure, not a
claim of harmlessness. Do not run builds on untrusted source/patterns or treat affected
certificate-verification code as a security boundary. Recheck upstream fixes. The
suggested automated fix downgrades Expo to 44 and was not applied.

## Validation

- TypeScript: `npm run typecheck` passed.
- Android production JavaScript/Hermes bundle: `expo export --platform android` passed. This is not a signed native APK build.
- 15 local regression/security tests: `npm test` (Node 24; uses node:sqlite).
- 16 Firestore emulator tests: owner CRUD, anonymous/cross-user denial, admin-path
  denial, spoofed IDs, invalid amounts, oversized notes, unknown fields, invalid
  transfers/months/colors, and valid tombstones.
- Emulator command (Java 21):
  `npx --yes firebase-tools@15.32.1 emulators:exec --only firestore --project demo-spendly-security "npm run test:rules"`
- SecureStore and biometric lifecycle tests use mocked native APIs. They do not
  replace testing on Android/iOS hardware.

## Production actions still required

1. Deploy reviewed `firestore.rules` to the intended Firebase project. This review
   used only the isolated `demo-spendly-security` emulator, not production writes.
2. Verify enabled Firebase Auth providers, authorized domains and Google OAuth
   redirect/package/signing-certificate settings. Disable unused providers.
3. Restrict the Firebase API key to required APIs using Firebase's guidance; verify
   restrictions on a real build. Configure App Check with a supported native provider,
   monitor before enforcement, and set quotas and billing alerts. Alerts are not caps.
4. Configure `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD` in GitHub Actions secrets. The
   workflow signs with them when they are valid, and otherwise warns and falls back to the debug key. Do not create/rotate keys casually:
   changing the installed app's signer can require uninstalling it and losing guest
   data. Export/verify recovery first and register the new certificate for Google login.
5. Build and test a newly signed APK (SecureStore adds a native module), including
   Google login, logout, account switching offline, camera-return relock, recurrence,
   sync and account deletion. No APK was published by this audit.
6. For deletion across multiple devices, a trusted backend deletion job with a
   deletion marker/token revocation is still recommended: the client cleanup stops
   this device's sync, but cannot prevent another already signed-in device writing
   during deletion or provide atomic deletion across Auth and Firestore.

## Creating the release signing key

Create the key on your own device, never in a shared or cloud session, and
never paste it into a chat, issue or commit.

1. Get `keytool`:
   - **Computer:** install Java (any JDK 17+); `keytool` comes with it.
   - **Android phone only:** install **Termux** from F-Droid, then run
     `pkg install openjdk-17` and `termux-setup-storage`.
2. Create the key (it asks for a password; use a long one and write it down):
   `keytool -genkeypair -v -storetype PKCS12 -keystore spendly-release.keystore -alias spendly -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=Spendly"`
3. Turn it into text for GitHub:
   - Computer (Linux/Termux): `base64 -w0 spendly-release.keystore > keystore.txt`
   - macOS: `base64 -i spendly-release.keystore -o keystore.txt`
   - Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("spendly-release.keystore")) > keystore.txt`
   - Termux: `cp keystore.txt ~/storage/downloads/` to open it from Files.
4. GitHub → repository → **Settings → Secrets and variables → Actions → New
   repository secret**, add four secrets:
   - `ANDROID_KEYSTORE_BASE64` — the whole contents of `keystore.txt`
   - `ANDROID_KEYSTORE_PASSWORD` — the password from step 2
   - `ANDROID_KEY_ALIAS` — `spendly`
   - `ANDROID_KEY_PASSWORD` — the same password (PKCS12 uses one password)
5. **Back up** `spendly-release.keystore` and the password somewhere private
   (e.g. a password manager). If it is lost, the app can never be updated
   again. Then delete `keystore.txt`.
6. Re-run the **Build Android APK** workflow. Its run summary shows the
   certificate's **SHA-1**. Add it to:
   - Google Cloud Console → APIs & Services → Credentials → the **Android**
     OAuth client for `com.santanu.spendly` (create one with this SHA-1 if needed);
   - Firebase Console → Project settings → your Android app → **Add fingerprint**.
7. On the phone: export anything saved without signing in, uninstall the old
   app (different signer), install the new APK, and sign in again.

## References

- https://firebase.google.com/support/guides/security-checklist
- https://firebase.google.com/docs/projects/api-keys
- https://docs.expo.dev/guides/environment-variables/
- https://docs.expo.dev/versions/latest/sdk/securestore/
- https://github.com/advisories/GHSA-pqg4-j6r4-53mv
- https://github.com/advisories/GHSA-vfj7-8cjw-p6xm
- https://github.com/advisories/GHSA-86w9-cpqp-85rv
