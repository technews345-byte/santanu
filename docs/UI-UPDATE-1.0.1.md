# Spendly 1.0.1 — UI and responsiveness update

Based on the Spendly release branch claude/expense-budget-app-vdww3s, commit bbc74133cad3a200e000f5dc8e1ebb2754565735.

## Changes

- Keep rounded glass depth on the balance card and navigation; use simpler transaction-row surfaces.
- Subscribe screens only to the store data they need.
- Cache category/account lookups and defer search filtering while typing.
- Add readable navigation labels and accessible selected states.
- Keep long category/account sheets scrollable, with Done outside the scrolling content.
- Respect Reduce Motion and keep hidden quick actions out of touch and screen-reader navigation.
- Show save progress and success/error feedback.
- Set Android version 1.0.1, version code 2. No new runtime dependency.

## Validation

TypeScript, 15 regression tests and 5 UI tests passed locally. The dependency lock changes only the app version. Physical-device appearance, scrolling performance, font scaling, installation and haptics remain to be checked.

The APK previously supplied in chat uses a fresh production Hermes bundle with the published 14 October APK's native runtime, matching signing certificate and Firebase configuration. All 33 exported assets and 1,243 unchanged native/resource entries were verified. A full local native build failed during minifyReleaseWithR8 provider configuration; the local APK is therefore not a fresh native compilation.

## GitHub build

The included workflow validates the source, generates the native Android project and builds a fresh ARM64 APK. It packages the APK and matching source ZIP under the separate spendly-ui-v1.0.1 prerelease tag. A completed workflow is required before those outputs are available.

The workflow runs for codex/spendly-ui-20261025 and the Spendly release branch, and can also run manually. It uses the existing FIREBASE_API_KEY and Android signing secrets. The log reports whether signing used the configured private key or the existing public debug key. Source archives do not contain these secret values.

## Build locally

Use Node 24, Java 17 and the Android SDK. Set FIREBASE_API_KEY for cloud features before building, then run:

    npm ci --legacy-peer-deps
    npm run typecheck
    npm test
    npm run test:ui
    npx expo prebuild --platform android --no-install
    cd android
    ./gradlew assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a

Follow SECURITY.md and the workflow for release signing. Android requires a matching signing certificate to update an installed app; preserve your signing key for future releases.
