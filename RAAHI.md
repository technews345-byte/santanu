<p align="center">
  <img src="https://raw.githubusercontent.com/technews345-byte/santanu/f1f4f4b9849a564c98a5b585921d42df43b8fe8a/assets/raahi-icon.png" width="150" alt="Raahi R app logo">
</p>

<h1 align="center">Raahi</h1>
<p align="center"><strong>Track. Plan. Save. Live Better.</strong><br>
A personal expense and budget manager by Santanu Bordoloi.</p>

Raahi, formerly called **Spendly**, helps you record your money, plan category budgets and understand spending from one place. It uses a dark blue glass-inspired interface and stores the financial ledger on the device first. An optional Google account and configured cloud sync can keep supported records connected across devices.

| At a glance | Details |
| --- | --- |
| Current version | Raahi **1.0.4**, Android version code **5** |
| Download | [Raahi-1.0.4.apk](https://github.com/technews345-byte/santanu/releases/download/raahi-v1.0.4/Raahi-1.0.4.apk) · [release notes](https://github.com/technews345-byte/santanu/releases/tag/raahi-v1.0.4) |
| Currency | Indian Rupees (₹), with Indian number formatting |
| Platforms | React Native / Expo source for Android, iOS and web; native capabilities vary |
| Primary data | Accounts, transactions, categories and budgets in local SQLite |
| Optional account | Google sign-in and Firestore sync in a correctly configured build |
| App developer | Santanu Bordoloi |
| App source | [Raahi app branch](https://github.com/technews345-byte/santanu/tree/claude/expense-budget-app-vdww3s) |

## Download

**[Download Raahi 1.0.4 for Android](https://github.com/technews345-byte/santanu/releases/download/raahi-v1.0.4/Raahi-1.0.4.apk)** — open it on your phone and allow installation from unknown sources when asked. The [release page](https://github.com/technews345-byte/santanu/releases/tag/raahi-v1.0.4) also has the APK together with the full source, and a SHA-256 checksum. Installing over Spendly or an earlier Raahi keeps your data, provided both builds are signed with the same key.

## The Raahi name and logo

The mark is a sculpted **R** with a bright silver-white finish and cyan/violet highlights over a rich blue-purple background. The name **Raahi** appears with the line **“Track. Plan. Save. Live Better.”** The launcher icon is sized to keep the R visible inside Android's rounded icon masks. The opening screen uses the matching blue artwork with the logo and name centered, a gentle entrance and animated loading dots. Reduce Motion is respected.

## Explore the app

| Tab | What you can do |
| --- | --- |
| **Home** | See your balance and summaries, choose an account and time period, review spending, and open quick actions. |
| **Activity** | Find transactions, filter or sort them, and edit or delete records. |
| **Budgets** | Plan monthly category budgets and follow spending against each plan. |
| **Analytics** | Explore spending and income trends, category shares and comparisons. |
| **Settings** | Manage security, notifications, accounts, categories, exports and account information. |

### Home and money overview

- View the total across all accounts or focus on one account; hide or reveal the balance when needed.
- Switch the summary between day, week, month and year to see income, expenses, investments and net.
- Open expense, income, budget and receipt-scan actions from the home screen.
- Review monthly, today and this-week spending, remaining budget, recent transactions and available spending tips.
- Expand key cards to see a detailed overview.

### Transactions and accounts

Record **expenses, income, investments and transfers** with an arithmetic keypad, category, account, date/time, note, optional receipt image and repeat schedule. Edit existing entries, or delete them after confirmation. Transfers move money between your own accounts; investment entries record cash allocated to investments and do not provide live market valuations.

The Activity screen supports search by note or category, period choices, type/category/account filters, and sorting. Swipe a transaction to reveal edit or delete actions. Long-press for multi-selection, bulk deletion or recategorization. The colored swipe actions stay hidden while a card is at rest.

Create manual accounts such as cash, bank, savings, checking, wallets and credit cards with an opening balance, color and icon. Customize categories and archive older ones while retaining their historical references. Repeating entries can be scheduled daily, weekly, monthly or yearly.

### Budgets and insights

Create monthly expense limits for categories, recurring or specific to a month. See planned, spent and remaining amounts, category progress, and a daily allowance derived from your remaining plan. Budget progress changes its warning treatment at 85% and 100%.

Analytics offers week, month and year views, a category donut, ranked category breakdowns, category history and an income-versus-expense comparison. These are calculations from recorded transactions, not bank feeds or investment advice.

### Scan receipts

Use the camera or choose a photo, crop or rotate it, and extract text on supported native builds. Raahi attempts to identify the total, date, merchant and category, then opens an editable expense form. **Review the result before saving:** receipt parsing can be inaccurate. OCR runs locally on supported Android/iOS devices; it is unavailable on web. Receipt image files are local and are not backed up by the current transaction-sync implementation.

### Notifications, reports and security

- **Notifications:** a single on/off switch in Settings controls supported local reminders. The default reminder time is 8:30 p.m. in device-local time; existing saved reminder preferences are retained. Delivery depends on phone permission and operating-system scheduling.
- **Excel:** export transaction rows to `.xlsx`, including amounts, dates, categories, accounts and notes.
- **PDF:** create a formatted report with summaries and up to the 500 most recent transaction rows; use Excel for the full exported row set.
- **Biometric lock:** use supported device authentication and re-lock the app when it goes to the background. When authentication is required, the real lock appears after the opening screen.
- **Cloud:** guest use remains available. Optional Google sign-in and sync depend on Firebase/OAuth setup and connectivity. Sign-out keeps local records.
- **Advertising:** app-open ads are implemented in native builds. The former ad-support section is no longer shown in Settings.

The ledger is local-first, but biometric locking is an app-access control: the database is not configured with SQLCipher and the project does not claim end-to-end encryption. Review [security guidance](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/SECURITY.md) before distributing or changing authentication and sync behavior.

## Look and interaction

Raahi uses a **dark-only** blue gradient with cyan and violet glows, rounded frosted-style cards, soft borders and a floating five-tab dock. Category symbols share one clean outline style across Budgets, entry forms, Activity and Analytics. The balance card and primary controls carry the strongest glass treatment; activity rows are simpler for readability. SF/system fonts are used on iOS, with Inter on Android and web. Native-driven springs, press feedback and supported haptics provide a responsive feel. Reduce Motion is supported by the updated navigation and loading screen. Actual appearance, performance and haptics depend on the device.

## Latest updates

### 1.0.4 — Consistent category icons

- The Budgets tab's clean outline category symbols now appear across category lists, entry forms, Activity and Analytics.
- Budget progress rings and colors are unchanged; categories without a budget show a neutral circle.
- Saved categories, icons, colors, transactions and budgets are kept as they are.

### 1.0.3 — Logo and opening screen

- Made the Android launcher R smaller within the adaptive-icon safe area so its edges are not clipped.
- Sized the opening artwork to the screen, keeping the Raahi logo, name and tagline centered.
- Added a gentle entrance and animated loading dots, with reduced-motion support.
- Kept the lock screen out of the splash transition; biometric authentication remains available when enabled.
- Allowed a local-data loading error to reach its retry screen.

### 1.0.2 — Spendly becomes Raahi

- Applied the Raahi name, R mark and branded opening artwork while retaining the existing Android application ID and data keys.
- Extended the blue background past screen edges and refined expanded-card backgrounds and touch feedback.
- Hid transaction edit/delete colors until a swipe reveals them.
- Removed the appearance and ad-support sections from Settings and simplified notifications to one switch.

### 1.0.1 — UI and responsiveness

- Reduced unnecessary store-driven redraws and reused transaction category/account lookups.
- Improved transaction search, navigation labels, picker sheets, reduced-motion behavior and save feedback.
- Retained the rounded glass-inspired visual system and local-first financial behavior.

For the source history, see the [app changelog](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/CHANGELOG.md). A source update, a completed build and a published release are separate things; check [Actions](https://github.com/technews345-byte/santanu/actions) and [Releases](https://github.com/technews345-byte/santanu/releases) for actual availability. Actions artifacts can require GitHub sign-in and can expire.

## Build and test

```bash
git clone --branch claude/expense-budget-app-vdww3s https://github.com/technews345-byte/santanu.git
cd santanu
npm ci --legacy-peer-deps
npm run typecheck
npm test
npm run test:ui
npx expo prebuild --platform android --no-install
cd android
./gradlew assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a
```

The workflow uses Node 24 and Java 17. A native build also needs the required Android SDK/NDK. Cloud features require Firebase and OAuth configuration; native OCR, notifications, biometrics and ads require compatible hardware/build configuration. Web SQLite requires cross-origin isolation.

Android updates must use the same signing certificate as the installed app. Preview builds currently use a **public debug key**, which is suitable for compatibility testing but not secure production distribution. Use a private signing key for production and preserve it for future updates. Do not uninstall an existing app before protecting or exporting its local data.

See the [app README](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/README.md) for setup, platform differences and project layout.
