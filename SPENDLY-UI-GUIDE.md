> **Historical:** This page describes Spendly 1.0.1. Spendly is now Raahi; see the [current Raahi overview](RAAHI.md) for the new logo, features and updates.

# Spendly: features, screens and UI

This guide describes Spendly 1.0.1, merged into the Spendly app branch and published as a GitHub prerelease. It covers the user experience and the code that supports it. Build and service configuration still determine which native/cloud capabilities are available.

[App overview](SPENDLY.md) · [Detailed latest updates](SPENDLY-UPDATES.md) · [Published APK and source](https://github.com/technews345-byte/santanu/releases/tag/spendly-ui-v1.0.1)

## Navigation and screen map

| Main tab | What the user sees | Main actions |
| --- | --- | --- |
| Home | Greeting/profile access, account selector, balance card, period summaries, spending cards, Smart Tip and recent activity | Hide balance, change account/period, add income or expense, scan a receipt, open budgets or analytics |
| Activity | Transaction history, search field, interval choices, filters, sorting and result count | Search, edit, delete, select several entries or change their category |
| Budgets | Month navigation, planned/spent/daily allowance summary and expense-category budget rows | Add or edit a category budget; inspect remaining or overspent amounts |
| Analytics | Period/type selectors, category donut, six-month comparison chart and ranked breakdown | Compare periods, change expense/income/investment view, open category history |
| Settings | Account/cloud status, appearance, security, notifications, manual accounts, category management, exports, support and app information | Customize the app, manage records/accounts/categories, export and access account controls |

Supporting routes include Transaction Entry, Scan Receipt, Category Detail, Categories, Account Form, Category Form, Budget Form, Login/Welcome and Account. Forms use a modal stack; category history and account details have separate stack routes. The floating quick-action control opens income, expense and receipt-scanning actions.

## Everyday workflows

### Record a transaction

1. Open a new entry from Home or the floating add control.
2. Select Expense, Income, Invest or Transfer as appropriate.
3. Enter an amount using the arithmetic keypad. The calculation engine supports addition, subtraction, multiplication and division and rejects malformed calculations/division by zero.
4. Select a category and account. Transfers use a destination account as well.
5. Set date/time, add a note or receipt images, and choose recurrence if needed.
6. Save. While persistence is running, the save button shows progress and disables further submissions. Successful/error outcomes use the existing messages and supported native haptics.

Transaction amounts, category/account references and the transaction type drive the summaries. A transfer is an internal movement between ledgers. Investment entries are recorded cash allocations; the app does not fetch security prices or calculate live investment returns.

### Find and maintain history

Activity searches transaction notes and category names. Interval, account, category and type filters can be combined. Ordering supports newest/oldest date, high/low amount and category A–Z.

Search input updates immediately while expensive filtering uses the deferred value. The screen reports that results are updating until the deferred search catches up. Category/account lookup maps are reused between renders rather than scanning those arrays for every matching or sorted row.

Swipe exposes edit/delete actions. Long-press enables multiple selection for bulk deletion or recategorization. The delete flow asks for confirmation; bulk changes are applied to the selected records.

### Plan monthly budgets

A budget belongs to an expense category and can recur each month or apply to one month. A month-specific budget takes precedence when the finance helpers choose an effective budget. The screen shows categories with budgets first, followed by other expense categories, and includes a direct path to create a missing budget.

Planned and spent totals cover **budgeted categories only**. This distinction matters: unbudgeted spending remains part of expense reporting but is not subtracted from a plan that was never assigned to it. Safe/Day is an allowance derived from the remaining planned amount and the relevant remaining days; it is not a prediction of future income.

The progress bar fills up to its track limit. Its semantic treatment changes at 85% and 100%, while adjacent text gives the actual amount remaining or overspent so the user does not have to interpret color alone.

### Understand spending

Home's spending comparison uses cumulative expense totals for this month and last month. Smaller cards summarize today and the current week. The remaining-budget card links to budgeting, including a create-budget prompt when no plan exists.

Smart Tip compares category spending this month with the previous month. It needs a nonzero comparison baseline and a change of at least 15%; it selects a category with a sufficiently large change. The user can dismiss the tip or open Analytics. This is a local calculation, not a generative AI advisory service.

Analytics uses the selected account scope and period. Expense, income and investment breakdowns each rank categorized records by amount and compute percentage shares within that view. Its income-versus-expense chart uses six month keys around the selected anchor. Category Detail opens the chosen category's ledger.

### Scan a receipt

The camera/gallery flow requests the relevant permission. The picker can crop the photo; a rotate action can correct orientation. Receipt preparation reduces large images to a suitable size before OCR.

The local parser looks for paid-total labels such as grand total/net payable, avoids common identifiers and cash/change lines, and attempts to read dates, merchant text and spending-category keywords. It can fall back to a likely amount when labels are incomplete. These are heuristics and can be wrong.

Continuing from the scan screen pre-fills an editable expense entry with the parsed fields and photo attachment. The user reviews and saves the final record. OCR image bytes are not sent to a remote OCR service by this implementation. Attachments are local URIs; transaction synchronization is not an image-file backup system.

### Continue offline or sync an account

Guest use keeps financial records on the device. A configured build offers Google sign-in through Firebase Authentication and a per-user Firestore record store. The Account screen presents pending changes, synchronization state, last sync time and retry, together with export/sign-out/deletion controls.

The sync layer uses timestamps, dirty records and deletion markers. Its merge planning and acknowledgement logic protect edits that occur while a sync is in progress. Initial guest records can be adopted on first sign-in; switching identity is handled separately so one account's local data is not silently treated as another account's data. See the implementation and tests for exact conflict behavior rather than assuming a collaborative merge model.

Financial changes save locally first; synchronization needs connectivity and correct service configuration. Signing out retains local records and their owner marker. Review/export data before account or installation changes.

### Reminders and confirmations

Native reminders are scheduled locally over a rolling 14-day horizon. The default time is 20:30 in the device's local timezone; the user can change it. Today's reminder is omitted when any transaction has already been recorded, and reopening/saving refreshes the schedule. Tapping a reminder opens a new expense form, with navigation readiness handled when the app is starting.

The message selector supports English, Hinglish and mixed choices. A test notification helps verify permission/delivery, and Android battery-settings guidance is available. Notification scheduling and delivery are controlled by the operating system, so actual delivery needs device testing. Save confirmations can be enabled or disabled separately.

### Reports and sharing

Excel export writes typed transaction rows into an `.xlsx` workbook, retaining notes as text even if they begin with formula-like characters. PDF export escapes user text, includes formatted summaries/category information and limits the detailed transaction table to the 500 most recent entries. Excel is the path for the complete exported transaction set.

The export context includes category and account names, source/destination accounts, date/time, amount, currency and note. Report identity can include the signed-in user. Report generation uses the platform's file, print and sharing capabilities; browser behavior must be checked independently.

## Visual system

### Layers, surfaces and depth

The background uses existing light/dark spatial artwork and aurora/backdrop components. Rounded surfaces sit above it with tinted fills, subtle borders, gradients and edge highlights. The surface system distinguishes raised, panel, row and control levels.

- **Raised:** leading content such as the balance hero and important chart/work surfaces.
- **Panel:** grouped sections and content cards.
- **Row:** repeated ledger/category/budget surfaces, with restrained decoration.
- **Control:** buttons, capsules, tabs and compact interactive controls.

The 1.0.1 row treatment removes live row blur and shadows, and avoids row reflection sweeps and touch-following glow work. Important cards and navigation retain their depth. iOS and supported Android surfaces choose appropriate blur behavior; older/unsupported cases use tinted or opaque fills. The tab bar also uses a blurred copy of existing background imagery aligned with the screen.

This hierarchy is intended to make the balance/navigation feel prominent while keeping dense records readable. It does not imply measured GPU or battery savings.

### Typography, spacing and color

The shared text components choose Manrope for display-sized text and large financial figures. Normal interface text uses native iOS styling and Inter on Android/web. Font weights are imported from individual font entry points rather than importing every available weight.

| Token family | Current scale |
| --- | --- |
| Spacing | 4, 8, 12, 16, 20, 24, 32 and 40 logical pixels |
| Standard corner radii | 12, 16, 22 and 28; pills use fully rounded ends |
| Type sizes | 12, 13, 15, 17, 20, 24, 30, 36 and 48 |
| Tab labels | 12 logical pixels in the updated bar |
| Press scale | 0.97 for the shared press treatment |
| Lift scale | 1.02 for the shared lifted treatment |

| Meaning | Dark-theme color | Light-theme color |
| --- | --- | --- |
| Income / success | `#22A99A` | `#0C796D` |
| Expense | `#E36B4A` | `#C04125` |
| Transfer | `#5EA2F2` | `#1D6EBE` |
| Investment | `#A68CF5` | `#7650D6` |
| Warning | `#E8A93B` | `#975F0B` |
| Danger | `#E5534B` | `#C63831` |

Categories also have customizable palette colors. Labels, amounts and state indicators complement color; color should not be the only way a financial state is understood. Full accessibility/contrast certification has not been established by the current automated tests.

### Navigation, motion and feedback

The floating capsule presents five illustrated tab icons with text labels, a selected highlight and an indicator. The visible Activity label retains Transactions as its accessibility name. Tab press/long-press events are forwarded to navigation, including prevented tab presses.

Shared motion tokens coordinate press, glide and entry effects. The updated tab bar, segmented controls, quick actions and pressables consult Reduce Motion, and the main stack transition is adjusted accordingly. Some components have their own animations, so app-wide motion coverage and modal behavior still need device review.

Hidden quick actions are excluded from touch handling and screen-reader focus until opened. The add control exposes its expanded state. Picker sheets constrain their height to the window, allow long lists to scroll, keep Done outside the scrolling body, and stop stale closing animations when reopened.

Save buttons expose loading/busy/disabled states, selected categories have a clearer visual state, and native save outcomes can trigger haptics. No physical-device timing or haptic behavior is certified by the component tests alone.

## Storage, privacy and platform boundaries

The main financial entities are accounts, categories, transactions and budgets, with metadata supporting preferences/migrations/sync. SQLite uses a local database and WAL configuration. Preferences are separate from financial records; native authentication sessions use SecureStore.

Biometric locking is an app-access control, not database encryption. This project does not configure SQLCipher or claim end-to-end encrypted cloud storage. Cloud access depends on the deployed Firestore rules and Firebase configuration. Local receipt files do not become portable cross-device attachments merely because their URI metadata is synchronized.

Web uses the Expo SQLite WASM path and needs cross-origin isolation; native OCR, notifications and ads are not web features. Native builds, OAuth client IDs, OS permissions, signing certificates and hardware capabilities determine the behavior of the corresponding phone features.

See [SECURITY.md](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/SECURITY.md), [the README platform table](SPENDLY.md#platform-and-data-considerations) and [build notes](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/docs/UI-UPDATE-1.0.1.md) for setup and verification limits.

## Feature-to-source map

| Area | Main implementation |
| --- | --- |
| Startup, hydration and app re-lock | [`App.tsx`](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/App.tsx) |
| Routes and tab configuration | [`src/navigation/`](https://github.com/technews345-byte/santanu/tree/claude/expense-budget-app-vdww3s/src/navigation) |
| Home and Smart Tip | [`DashboardScreen.tsx`](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/src/screens/DashboardScreen.tsx), [`insights.ts`](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/src/utils/insights.ts) |
| Ledger search/filter/bulk actions | [`TransactionsScreen.tsx`](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/src/screens/TransactionsScreen.tsx) |
| Entry, arithmetic and repeat settings | [`TransactionEntryScreen.tsx`](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/src/screens/TransactionEntryScreen.tsx), [`calculator.ts`](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/src/utils/calculator.ts), [`recurrence.ts`](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/src/utils/recurrence.ts) |
| Receipt camera/OCR/parsing | [`ScanReceiptScreen.tsx`](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/src/screens/ScanReceiptScreen.tsx), [`ocr.ts`](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/src/services/ocr.ts), [`receipt.ts`](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/src/utils/receipt.ts) |
| Budgets and charts | [`BudgetsScreen.tsx`](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/src/screens/BudgetsScreen.tsx), [`AnalyticsScreen.tsx`](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/src/screens/AnalyticsScreen.tsx), [`finance.ts`](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/src/utils/finance.ts) |
| Themes, fonts and tokens | [`src/theme/`](https://github.com/technews345-byte/santanu/tree/claude/expense-budget-app-vdww3s/src/theme) |
| Glass UI and tab bar | [`src/components/glass/`](https://github.com/technews345-byte/santanu/tree/claude/expense-budget-app-vdww3s/src/components/glass) |
| Picker sheets | [`BottomSheetModal.tsx`](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/src/components/BottomSheetModal.tsx) |
| Quick actions | [`QuickAddFab.tsx`](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/src/components/QuickAddFab.tsx) |
| Local persistence and recurring materialization | [`src/db/`](https://github.com/technews345-byte/santanu/tree/claude/expense-budget-app-vdww3s/src/db), [`useStore.ts`](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/src/store/useStore.ts) |
| Sign-in, session storage and cloud settings | [`src/services/`](https://github.com/technews345-byte/santanu/tree/claude/expense-budget-app-vdww3s/src/services), [`useAuthStore.ts`](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/src/store/useAuthStore.ts) |
| Sync engine and record validation | [`src/sync/`](https://github.com/technews345-byte/santanu/tree/claude/expense-budget-app-vdww3s/src/sync), [`src/security/validation.ts`](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/src/security/validation.ts), [`firestore.rules`](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/firestore.rules) |
| Reminders | [`ReminderSettings.tsx`](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/src/components/ReminderSettings.tsx), [`reminders.ts`](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/src/services/reminders.ts), [`messages.ts`](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/src/utils/messages.ts) |
| Excel/PDF export | [`export.ts`](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/src/utils/export.ts), [`xlsx.ts`](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/src/utils/xlsx.ts) |
| Advertising | [`ads.ts`](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/src/services/ads.ts), [`SettingsScreen.tsx`](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/src/screens/SettingsScreen.tsx), [`App.tsx`](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/App.tsx) |
| Automated verification | [`tests/`](https://github.com/technews345-byte/santanu/tree/claude/expense-budget-app-vdww3s/tests), [`package.json`](https://github.com/technews345-byte/santanu/blob/claude/expense-budget-app-vdww3s/package.json) |

For the difference between established app features and the changes introduced in 1.0.1, read [CHANGELOG.md](SPENDLY-UPDATES.md).
