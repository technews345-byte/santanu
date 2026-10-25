<p align="center"><img src="https://raw.githubusercontent.com/technews345-byte/santanu/claude/expense-budget-app-vdww3s/assets/brand-mark.webp" width="96" alt="Spendly app mark"></p>

# Spendly

**Track. Plan. Save. Live Better.**

Spendly is a personal expense and budget manager developed by **Santanu Bordoloi**. It brings a local-first financial ledger, monthly budgeting, spending analytics and receipt capture into a rounded, iOS-inspired glass interface.

Records are saved in local SQLite. Optional Google sign-in and Cloud Firestore synchronization can connect a configured build to the user's cloud account. The current user-facing currency is **Indian Rupees (INR / ₹)**.

| Project detail | Value |
| --- | --- |
| Version | 1.0.1; Android version code 2 |
| Android application ID | `com.santanu.spendly` |
| Source platforms | Android, iOS and web, with different native capabilities |
| Application stack | Expo SDK 57, React Native 0.86.3, React 19.2.3, TypeScript and Zustand |
| Local data | SQLite financial records; AsyncStorage preferences |
| Optional cloud | Firebase Authentication and Cloud Firestore |
| License | [MIT](https://github.com/technews345-byte/santanu/tree/claude/expense-budget-app-vdww3s/LICENSE) |

Read the [complete feature and UI guide](SPENDLY-UI-GUIDE.md), [detailed latest updates](SPENDLY-UPDATES.md), [1.0.1 build notes](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/docs/UI-UPDATE-1.0.1.md) and [security guidance](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/SECURITY.md).

## Latest published update — 1.0.1

**Published 25 October 2026 · GitHub prerelease · Fresh native Android build completed successfully.**

The UI improvements and documentation were merged through [pull request #10](https://github.com/technews345-byte/santanu/pull/10) into the Spendly app branch, `claude/expense-budget-app-vdww3s`. This page makes the app documentation accessible from the repository's default branch.

- [Download Spendly 1.0.1 APK](https://github.com/technews345-byte/santanu/releases/download/spendly-ui-v1.0.1/Spendly-1.0.1.apk).
- [Download the matching APK and source ZIP](https://github.com/technews345-byte/santanu/releases/download/spendly-ui-v1.0.1/Spendly-1.0.1-APK-and-Source.zip).
- [Read the detailed latest changes](SPENDLY-UPDATES.md) or [browse every feature and UI detail](SPENDLY-UI-GUIDE.md).
- [View the successful Android build](https://github.com/technews345-byte/santanu/actions/runs/40174629148) and [release assets](https://github.com/technews345-byte/santanu/releases/tag/spendly-ui-v1.0.1).

Type checking, 15 regression tests and 5 UI interaction tests passed. The published GitHub APK is a fresh native build; physical-device installation, visual layout, notification delivery, OCR accuracy, haptics and scrolling measurements remain to be checked. Android version code is **2**, and the build targets **ARM64**.

## Main features

### Home and spending overview

- Switch between All Accounts and a selected account.
- View total balance and hide monetary figures with the visibility control.
- Select day, week, month or year for income, expense, investment and net summaries.
- Open Add Expense, Add Income, Budgets or Scan Receipt from compact quick-action cards.
- Compare cumulative monthly spending with last month and inspect today's / this week's totals.
- See remaining planned budget, recent transactions grouped by date, and a dismissible Smart Tip when a category's spending changes sufficiently from last month.

### Transactions and activity history

Record **expenses, income, investments and transfers**. The entry form includes an arithmetic keypad, category, source account, destination account for transfers, date/time, notes, receipt images and repeat settings. Saved transactions can be edited or deleted.

The Activity ledger provides All / Daily / Weekly / Monthly / Yearly intervals, search across notes and category names, combined type/category/account filters, date and amount ordering, and category-name sorting. Swipe to edit/delete; long-press to select multiple entries for deletion or recategorization. Search has a result count and updating feedback, and saving has an in-progress state and submission guard.

Balances are derived from opening balances and transactions. A transfer moves money between accounts without changing their combined total. Investments are separate from expenses but reduce the source account's balance. Period net is **income − expenses − investments**. Investment entries track recorded cash movements, not live market valuations.

### Budgets and analytics

Set per-category monthly expense caps, either recurring or for a particular month. Browse months and compare planned, spent and remaining figures, including a daily allowance derived from remaining budget. Progress changes to a warning treatment at 85% and an exhausted/over-budget treatment at 100%. Unbudgeted categories are not charged against the planned-budget total.

Analytics has week, month and year views, previous/next navigation, separate expense/income/investment breakdowns, a donut chart, ranked categories with percentages, category histories, and a six-month income-versus-expense chart.

### On-device receipt scanning

Take a receipt photo or select one from the gallery, crop or rotate it, and extract text locally. The parser attempts to find the paid total, date, merchant and a suitable expense category. It opens an editable expense form with the image attached. Review the values before saving.

Native OCR uses ML Kit on Android and Vision on iOS through `expo-text-extractor`. Web OCR is unavailable. Receipt image files remain local; the project does not implement cross-device image-file uploads. OCR interpretation can be inaccurate.

### Accounts, categories and repeats

Create manual ledgers for Cash, Checking, Savings, Credit Card, Wallet or Bank, with an opening balance, color and icon. Customize expense, income and investment categories; archive a category while retaining historical references.

Repeat transactions daily, weekly, monthly or yearly. Due entries are generated during store hydration, with catch-up processing and month-end handling. Account types and repeat settings do not connect to banks, initiate payments or execute investments.

### Reminders, exports and settings

| Feature | Behavior |
| --- | --- |
| Daily reminder | Native local notification at a chosen time; default 20:30 device-local time; today's reminder is omitted after an entry has been recorded |
| Reminder messages | English, Hinglish or mixed choices, plus a test-reminder control |
| Save confirmations | Optional short messages after saving |
| Excel export | `.xlsx` transaction rows: date, type, category, source account, destination account, amount, currency and note |
| PDF report | Formatted summaries and a detailed table capped at the 500 most recent entries; Excel exports the complete row set |
| Appearance | Light, dark or system preference |
| Biometric lock | Supported device authentication, with re-locking when the app backgrounds |
| Google account | Optional sign-in, sync status, pending changes, last sync time, retry, export, sign out and account deletion |
| Support | Optional rewarded Support Spendly ads; native app-open ads are also implemented |

Notifications need permission and depend on OS scheduling. Cloud, ads and native features depend on build configuration, network or hardware as appropriate. See the [feature guide](SPENDLY-UI-GUIDE.md) for detailed workflows and limits.

## UI and visual design

Spendly uses rounded glass cards, a floating navigation capsule, pill controls, edge lighting, layered backgrounds and semantic financial colors. The strongest depth is reserved for important surfaces such as the balance card and navigation. Transaction rows use simpler surfaces with no live row blur or decorative reflection sweep.

| Element | Design |
| --- | --- |
| Five tabs | Home, Activity, Budgets, Analytics and Settings |
| Typography | Manrope for large figures/headings; native interface styling on iOS and Inter on Android/web |
| Radius tokens | 12, 16, 22 and 28 logical pixels, plus fully rounded pills |
| Spacing tokens | Shared 4–40 logical-pixel scale |
| Color roles | Distinct income, expense, transfer, investment, warning and danger colors |
| Picker sheets | Height-limited scrolling body and a Done control outside the scrolling content |
| Feedback | Press states, selected categories/tabs, saving spinner and busy/disabled semantics, result counts, alerts and native haptics where supported |
| Motion | Shared spring/press behavior and Reduce Motion handling in the updated navigation and controls |

Blur is platform-aware: important surfaces use supported native blur where available, with tinted/opaque treatments elsewhere. The glass navigation effect also reuses background imagery. The appearance is iOS-inspired and implemented with React Native components; it is not an Apple-provided Liquid Glass component set.

The 1.0.1 update reduces unnecessary store-driven redraws, caches lookups and defers search filtering. It adds no runtime dependency. Physical-device frame-rate gains have not been measured. The [UI guide](SPENDLY-UI-GUIDE.md#visual-system) describes the design in more detail.

## Platform and data considerations

| Capability | Android / iOS native builds | Web |
| --- | --- | --- |
| Ledger, budgets, charts | Implemented | Source available; verify browser storage support |
| SQLite | Native Expo SQLite | WASM, requiring cross-origin isolation and SharedArrayBuffer |
| Receipt OCR | Compatible native module required | Unavailable |
| Daily reminders | Notification permission and OS scheduling required | Unavailable in this implementation |
| Biometric lock | Supported, enrolled device authentication required | No equivalent native biometric flow |
| AdMob | Compatible configured native module required | Disabled |
| Cloud | Firebase and platform OAuth setup required | Firebase, authorized domains and web OAuth setup required |
| Export/share | Platform APIs | Verify in the intended browser; native parity is not claimed |

Biometric locking protects access to the app. Native authentication sessions use SecureStore. The ledger database is **not configured with SQLCipher encryption**, and these protections do not imply end-to-end encryption of cloud data. Firestore rules restrict records by user. Read [SECURITY.md](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/SECURITY.md) before distributing or changing authentication/sync behavior.

## Get started

The Spendly source is on its app branches in this repository. Check out this update:

```bash
git clone --branch claude/expense-budget-app-vdww3s https://github.com/technews345-byte/santanu.git
cd santanu
npm ci --legacy-peer-deps
```

The workflow uses **Node 24** and **Java 17**. Native Android builds also require the Android SDK and the SDK/NDK versions selected by Expo prebuild.

```bash
npm start
npm run web
npm run android
```

`npm run android` builds the native application through Expo. Use a native build for complete feature verification: this dependency set includes custom native capabilities, particularly OCR and AdMob, so Expo Go is not a complete compatibility target.

For web, the development middleware supplies COOP/COEP headers. A production host must also provide the cross-origin-isolation headers required by the SQLite WASM implementation.

### Optional cloud configuration

`app.config.js` reads `FIREBASE_API_KEY` from the build environment. Firebase project values and Google OAuth client IDs are read from `app.json`. Configure Firebase Authentication, Firestore/rules, platform OAuth clients, Android signing-certificate fingerprints and web authorized domains as appropriate. Supply the iOS OAuth client ID to enable iOS Google sign-in.

Without a complete cloud configuration, users can continue as guests and save records on the device. Keep private signing material and account credentials out of source control. Deployment of `firestore.rules` and emulator-based rules tests are separate setup work.

### Android APK

```bash
npm run typecheck
npm test
npm run test:ui
npx expo prebuild --platform android --no-install
cd android
./gradlew assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a
```

The APK normally appears in `android/app/build/outputs/apk/release/`. The supplied workflow targets ARM64; other architectures require an appropriate build.

The [Android workflow](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/.github/workflows/build-apk.yml) validates the source, builds an APK, and packages it with matching source code and a checksum. It runs on the Spendly release branch and `codex/spendly-ui-20261025`, and supports manual dispatch. This update uses the separate `spendly-ui-v1.0.1` prerelease tag. Check [Actions](https://github.com/technews345-byte/santanu/actions) and [Releases](https://github.com/technews345-byte/santanu/releases) for actual run/output availability.

| GitHub Actions secret | Purpose |
| --- | --- |
| `FIREBASE_API_KEY` | Firebase connection in the generated app config |
| `ANDROID_KEYSTORE_BASE64` | Encoded private signing keystore |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Signing-key alias |
| `ANDROID_KEY_PASSWORD` | Signing-key password |

The existing workflow falls back to the public debug key, with a warning, if private signing is absent or invalid. Check the signing result before distribution. An installed Android app requires a matching signing certificate for an in-place update; preserve the signing key across releases. Protect or export records before making installation changes.

`eas.json` also defines development, preview APK and production build profiles for an appropriately configured Expo/EAS account. These are alternative build configurations, not proof of a successful build.

## Tests

| Command | Coverage |
| --- | --- |
| `npm run typecheck` | TypeScript checks |
| `npm test` | 15 regression tests: calculations, persistence, recurrence, sync races, session storage, exports and re-locking |
| `npm run test:ui` | 5 interaction tests: ledger behavior, store subscriptions, tab events, reduced motion, sheets, hidden actions and save feedback |
| `npm run test:rules` | Firestore rules suite; requires the appropriate emulator setup |

Type checking and the 20 standard regression/UI tests passed locally and in the initial 1.0.1 GitHub build's validation step. Native installation, visual layout, larger font sizes, scrolling frame rates, notifications, OCR accuracy and haptics need separate device testing.

## Project layout

| Path | Responsibility |
| --- | --- |
| `App.tsx` | Startup, fonts, hydration, lock lifecycle, notifications and ads |
| `src/screens/` | Main screens and forms |
| `src/components/` | Charts, keypad, sheets, pickers and reusable controls |
| `src/components/glass/` | Glass surfaces, feedback, navigation and backgrounds |
| `src/theme/` | Themes, type, colors, spacing and motion |
| `src/store/` | Financial, authentication/sync and reminder state |
| `src/db/` | SQLite schema/repositories, recurring records and sync metadata |
| `src/sync/` | Merge planning, scheduling, remote adapter and sync engine |
| `src/services/` | Auth, OAuth, OCR, notifications, cloud config and ads |
| `src/utils/` | Finance/date math, receipt parsing, insights and exports |
| `src/security/` | Record-validation boundaries |
| `tests/` | Regression, UI and Firestore rules tests |
| `plugins/` | Expo native configuration plugins |
| `docs/` | Feature/UI guide, update/build notes and project web files |

For a screen-by-screen explanation, interaction details and source references, read [Features and UI](SPENDLY-UI-GUIDE.md). For the current update, read [CHANGELOG.md](SPENDLY-UPDATES.md).
