> **Historical:** This page describes Spendly 1.0.1. Spendly is now Raahi; see the [current Raahi overview](RAAHI.md) for the new logo, features and updates.

# Spendly updates

This changelog separates the current UI/responsiveness update from capabilities already present in the release baseline. A source version, successful test run and published APK are different states; check [Actions](https://github.com/technews345-byte/santanu/actions) and [Releases](https://github.com/technews345-byte/santanu/releases) for build availability.

## Published release and merge status

**Version 1.0.1 was published on 25 October 2026 as a GitHub prerelease.** [PR #10](https://github.com/technews345-byte/santanu/pull/10) is merged into `claude/expense-budget-app-vdww3s`. The successful native Android build used app commit `a2db18f3d452c82786e14642b54ea4bee528e910`; the merged documentation also includes the subsequent documentation-only changes.

| Published file | Purpose | Size in bytes |
| --- | --- | --- |
| [SHA256SUMS.txt](https://github.com/technews345-byte/santanu/releases/download/spendly-ui-v1.0.1/SHA256SUMS.txt) | APK SHA-256 checksum | 84 |
| [Spendly-1.0.1-APK-and-Source.zip](https://github.com/technews345-byte/santanu/releases/download/spendly-ui-v1.0.1/Spendly-1.0.1-APK-and-Source.zip) | APK together with the source used for that build | 23,009,297 |
| [Spendly-1.0.1.apk](https://github.com/technews345-byte/santanu/releases/download/spendly-ui-v1.0.1/Spendly-1.0.1.apk) | Installable ARM64 Android application | 24,973,235 |

APK SHA-256:

```text
10357baf7fb2c59445bf04bfbf796124ae4a7f919671a518fdaef3134695981e
```

[Build and test evidence](https://github.com/technews345-byte/santanu/actions/runs/40174629148) · [Release page](https://github.com/technews345-byte/santanu/releases/tag/spendly-ui-v1.0.1) · [Current Spendly source](https://github.com/technews345-byte/santanu/tree/claude/expense-budget-app-vdww3s)

The release ZIP contains the source at its build commit. The current feature guide and this update history include documentation added afterward; that documentation-only difference does not change the published app's runtime behavior.

## 1.0.1 — 25 October 2026

**Focus:** retain Spendly's rounded iOS-inspired glass design while reducing unnecessary redraws, making dense activity lists calmer, improving navigation/pickers, and giving clearer interaction feedback.

Android app version is **1.0.1**, version code **2**. The update is based on the Spendly release branch at `bbc74133cad3a200e000f5dc8e1ebb2754565735`. The application ID remains `com.santanu.spendly`. No runtime dependency was added.

### Store subscriptions and repeated calculations

- The app shell and affected screens select the store values/actions they need using shallow comparisons instead of subscribing to the entire financial store.
- Unrelated changes such as a preference update no longer need to invalidate every subscribed screen through a whole-store subscription.
- Dashboard category/account lookup maps are reused for recent activity.
- Dashboard summary calculations and period boundaries are memoized around their actual inputs. Budgets and analytics reuse stable period intervals in the updated paths.
- Existing inactive-tab freezing is retained; it is not a new 1.0.1 feature.

These changes target redundant work. They do not establish a measured frame-rate, battery or startup-time improvement.

### Transaction search and activity feedback

- Search/filter work uses a deferred query so typing can update before the result pass finishes.
- Category/account maps support repeated lookup, category search, category-name sorting and row labels.
- Results show a count and an updating state while the deferred search catches up.
- Existing note/category matching, account scope, combined filters and sort choices are retained.
- Sorting works on a copied array; the source transaction order is not mutated by the display sort.

### Cleaner row surfaces and compact actions

- Repeated row surfaces no longer request live blur.
- Row shadows and decorative reflection/touch-following glow work are reduced or omitted.
- Transaction rows use a simpler press treatment.
- The balance hero and navigation retain the stronger glass/depth treatment.
- Dashboard quick-action cards are more compact, with their minimum content height reduced from 100 to 88 logical pixels.

The change simplifies the dense list experience while preserving the app's rounded visual identity.

### Navigation labels and accessibility

- The illustrated glass tab bar displays readable 12-pixel labels.
- Main visible labels are Home, Activity, Budgets, Analytics and Settings.
- Activity retains Transactions as its accessibility name.
- Tab controls expose a selected accessibility state.
- Long-press navigation events are preserved; a prevented tab press does not navigate.
- Updated controls provide additional meaningful labels and state information.

### Scrollable picker sheets

- Picker content is scrollable within a height constrained by the current window and safe-area inset.
- Done is kept outside the scrolling body so the close action remains reachable with long lists.
- The sheet's content padding accounts for the bottom safe area.
- Closing animations are stopped when the sheet reopens, preventing a stale close callback from hiding the reopened sheet.
- Sheet/close controls expose additional accessibility semantics.

### Motion and hidden quick actions

- The updated tab bar, segmented controls, quick actions and glass pressables consult the shared Reduce Motion preference.
- Main stack/tab transition settings adjust to reduced motion.
- Hidden quick actions do not receive touches and are hidden from screen-reader navigation.
- The add control reports its expanded/collapsed state.
- Animation cleanup prevents obsolete animations from continuing in updated components.

Modal presentations and components with independent animation logic still require an app-wide device accessibility audit. This update does not claim complete Reduce Motion coverage everywhere.

### Save feedback

- The transaction form displays Saving… and a spinner during persistence.
- The shared button/pressable can expose busy and disabled semantics.
- The existing rapid-submit guard is retained.
- Native success/error haptics complement the existing confirmation/error behavior.
- Selected categories are highlighted more clearly.

### Android packaging and build workflow

- Version values are synchronized in `app.json`, `package.json` and the lockfile's app metadata.
- The dedicated update branch is `codex/spendly-ui-20261025`.
- GitHub Actions runs type checking and both standard test suites before native generation/build.
- The workflow produces an ARM64 APK, matching source ZIP and checksum.
- A separate `spendly-ui-v1.0.1` prerelease tag is used for these outputs.
- Existing Firebase and signing-secret configuration is reused; missing/invalid signing material follows the existing debug-key fallback with a warning.

The local APK supplied before GitHub access was restored contains a fresh Hermes bundle and retains the published APK's native runtime. Its certificate, app ID, version, alignment, Firebase config and Hermes compatibility were checked; 33 exported assets and 1,243 unchanged native/resource entries were compared. The fresh native GitHub build completed successfully; the APK and matching source ZIP are published under the 1.0.1 prerelease. See [build notes](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/docs/UI-UPDATE-1.0.1.md).

### Documentation

- Expanded the README with the app overview, existing features, five-tab screen map, visual design, platform differences, cloud setup, signing, build instructions, tests and source layout.
- Added [Features and UI](SPENDLY-UI-GUIDE.md) for detailed workflows, design tokens, data behavior and feature-to-source links.
- Added this detailed changelog and retained the 1.0.1 technical/build notes.
- Corrected the previous blanket Expo Go compatibility guidance and documented native-build requirements.
- Clarified that receipt files remain local, investment entries are recorded cash movements, budget totals cover planned categories, and biometric locking is separate from database encryption.

### Validation and remaining checks

| Check | Recorded result |
| --- | --- |
| TypeScript | Passed locally and in the initial GitHub build's validation step |
| Regression tests | 15 passed |
| UI interaction tests | 5 passed |
| Runtime dependency additions | None |
| Local manual-update patch | Applied cleanly to the verified baseline |
| Local APK signature/version/alignment | Verified |
| Full local native Gradle build | Failed during `minifyReleaseWithR8` provider configuration |
| Fresh GitHub native build | Passed — [run 40174629148](https://github.com/technews345-byte/santanu/actions/runs/40174629148) |
| Physical-device UI/install/performance | Not performed during this update |

The standard tests do not replace Firestore emulator tests, native installation testing, visual review, larger-font/Reduce Motion review, notification delivery testing or real receipt/haptic checks. These are separate validation tasks.

## Capabilities already present before 1.0.1

The baseline already included the offline SQLite ledger, expense/income/investment/transfer records, custom accounts/categories, recurring transactions, monthly budgets, charts and spending comparisons, Smart Tip, receipt OCR, Excel/PDF export, optional Google/Firebase sync, biometric locking, local reminders, light/dark themes and advertising integration. They are documented here as existing features rather than presented as newly added in this update.

The UI pass does not introduce a new database schema, authentication mechanism, sync protocol or financial calculation model. Read [README.md](SPENDLY.md) for the complete app overview and [SECURITY.md](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/SECURITY.md) for the existing security configuration and distribution considerations.
