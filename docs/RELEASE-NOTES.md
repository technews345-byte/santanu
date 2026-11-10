# Raahi 1.0.4 — formerly Spendly

**Track. Plan. Save. Live Better.** A personal expense and budget manager by Santanu Bordoloi.

### Download

- **Raahi-1.0.4.apk** — install on Android (allow installation from unknown sources when prompted). Installing over Spendly keeps your data, as long as both are signed with the same key.
- **Raahi-1.0.4-APK-and-Source.zip** — the APK together with the full source.
- **SHA256SUMS.txt** — checksum to verify the APK.

### What's fixed — 10 November 2026

A full review of security, code and UI. Details: [SECURITY.md](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/SECURITY.md).

**Security**
- **App lock can't be switched off freely.** Turning the biometric lock off in Settings now needs your fingerprint, face or passcode.
- **Nothing shows past the lock.** While the lock is on, Raahi is blank in Android's recent-apps preview and can't be screenshotted or screen-recorded. Before, the preview showed your balance.
- **No accidental account switch.** "Link another method" is removed. Google is the only sign-in method, and choosing a second Google account there replaced the data on the phone.
- **Sign-out warning.** If some changes are not backed up yet, the sign-out prompt says how many.
- **Safer build tools.** Known advisories in build-time dependencies dropped from 12 (4 high) to 4 moderate. None are in code that ships in the app.

**Bugs**
- **Receipt photos are kept.** They are copied into the app's own storage when an entry is saved, up to 10 per entry. They used to sit in the cache folder, which Android can empty.
- **Budgets.** Switching a budget between "every month" and "this month only" replaces the old budget instead of leaving it active.
- **Daily reminders arrive on time,** with the new R logo as the notification icon.
- **Activity.** An empty ledger says "No transactions yet" instead of "No matching transactions".
- **Entry form.** The "Date" label fits on one line, "Today" keeps the time you chose, and an invalid sum no longer shows "= NaN".
- **Accessibility.** The sign-in animation respects Reduce Motion, and icon-only buttons (close, delete, month arrows, photo buttons) have screen-reader names.
- **Cleanup.** Removed unused code left from rewarded ads and earlier sign-in methods.

**Still open:** release builds are signed with the public debug key until a valid signing key is added to the repository secrets, and `firestore.rules` must be published in the Firebase Console.

### What's new

**1.0.4 — Consistent category icons**
- The Budgets tab's clean outline category symbols now appear across category lists, entry forms, activity and analytics.
- Budget progress rings and colours are unchanged; categories without a budget show a neutral circle.
- Saved categories, icons, colours, transactions and budgets are kept as they are.
- Ads: a banner at the end of Home, and an interstitial after saving a transaction (at most once every 3 minutes). No more ads when opening the app.

**1.0.3 — Launcher icon and startup**
- The R logo fits fully inside rounded Android launcher icons.
- A centred opening screen with a gentle loading animation (respects Reduce Motion).
- The lock screen stays hidden until loading finishes; fingerprint/face unlock works as before.

**1.0.2 — Spendly is now Raahi**
- New name, R logo and splash artwork; app identity and local data are unchanged, so updates keep your records.
- Full-edge blue background, simpler touch feedback with a light haptic, cleaner Activity cards.
- A single Notifications switch; reminder time and language are kept.

### The UI

- **Rounded glass:** an iOS-inspired interface of frosted glass panels over a deep blue background.
- **Floating tab bar:** Home, Activity, Budgets, Analytics and Settings in a floating glass capsule with a soft spring on every tap.
- **One icon family:** clean outline category symbols across budgets, entries, activity and charts.
- **Calm motion:** native-driven springs that stay smooth, and switch off when Reduce Motion is on.

### Features

Expenses, income, transfers and investments · accounts and categories · monthly budgets · spending charts · receipt scanning on the phone · PDF and Excel export · fingerprint/face lock · optional Google sign-in with cloud sync · data stored on your phone first.

Full history: [CHANGELOG.md](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/CHANGELOG.md) · Website: [docs/index.html](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/docs/index.html)
