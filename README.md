# Spendly — Personal Expense & Budget Manager

A cross-platform (iOS / Android / web) personal finance app built with Expo + React Native + TypeScript.
Local-first: every interaction reads and writes a local SQLite database, so the app is fully usable offline.

All amounts are in Indian Rupees (₹).

## Features

**Dashboard**
- Account switcher (All Accounts aggregate, or a single ledger such as Cash / Bank)
- Total balance with a visibility toggle
- Day / Week / Month / Year period selector with Income, Expenses and Net summary chips
- Quick actions: Add Income, Add Expense, Transfer, Export
- Recent activity grouped by Today / Yesterday / date

**Transaction entry**
- Expense / Income / Transfer toggle
- Custom numeric keypad with a built-in arithmetic engine (`+`, `−`, `×`, `÷`), evaluated live
- Category grid, source and destination accounts, date & time picker with quick shortcuts
- Notes, multi-image receipt attachments (camera or gallery)
- Recurrence: daily, weekly, monthly, yearly

**Ledger**
- Interval tabs: All / Daily / Weekly / Monthly / Yearly
- Search, multi-select filters (type, category, account) and sort orders
- Swipe to edit or delete, long-press for multi-select bulk delete / bulk re-categorize

**Analytics**
- Donut chart of category breakdown with the period total in the center
- Six-month Income vs. Expense bar chart
- Ranked category list with amounts and percentage share; tap through to that category's history

**Budgets**
- Per-category monthly caps, either recurring or for a single month
- Progress bars: green normally, amber past 85%, red with an overspent amount past 100%
- Header totals: planned vs. spent vs. safe-to-spend per day

**Accounts, categories & data**
- Custom accounts with type, colour, icon and opening balance
- Category studio for expense and income categories with colour and icon pickers
- Export to Excel (`.xlsx`) and to a formatted PDF report
- Light / dark / system theme, optional biometric app lock

## Getting started

```bash
npm install
npm start          # then press i / a, or scan the QR code with Expo Go
npm run web        # runs in a browser
```

## Testing on an Android phone

**1. Fastest — Expo Go (no build, ~2 minutes)**

Install "Expo Go" from the Play Store, then on your computer:

```bash
npm install
npx expo start
```

Scan the QR code with Expo Go. Phone and computer must be on the same Wi-Fi; add `--tunnel` if they
aren't. Everything works except receipt capture and biometric unlock, which need one of the builds below.

**2. Downloadable APK — EAS cloud build (no Android SDK needed)**

Requires a free Expo account. The `preview` profile in `eas.json` is already set to emit an APK
rather than an AAB, so the result installs directly on a phone:

```bash
npm install -g eas-cli
eas login
eas build --platform android --profile preview
```

The build runs on Expo's servers and prints a download link when it finishes (~10–15 min). Open that
link on the phone, install the APK, and allow "install from unknown sources" when prompted.

Use `--profile development` instead if you want a build that also connects to the Metro dev server
for live reloading.

**3. Local APK build (needs Android Studio / SDK installed)**

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```

The APK lands in `android/app/build/outputs/apk/release/`.

## Project layout

```
src/
  components/   reusable UI (charts, keypad, pickers, sheets)
  db/           SQLite schema, seeding and repositories
  navigation/   bottom tabs + modal stack
  screens/      dashboard, transactions, budgets, analytics, settings, forms
  store/        zustand store backed by SQLite
  theme/        design tokens and light/dark theme provider
  utils/        arithmetic engine, money/date math, export
```

Data lives in four tables — `accounts`, `categories`, `transactions`, `budgets`. Balances are derived from
transactions rather than stored, so a transfer never changes total net worth.
