# Spendly: video-reference glass UI

Spendly now uses a dark navy glass skin inspired by the supplied motion reference: softly lit blue and violet surfaces, slender type, a floating capsule dock and cards that expand from their measured location. This change retains the existing React Native/Expo app, SQLite records, calculations, account selection, transaction editing, receipt flow, budgets, exports and sync.

Home shows the user's actual account balances and transactions. The greeting uses the signed-in name when available and the device's time of day; guests receive a time-based greeting. No weather readings, bills or assistant answers are fabricated.

## Implemented interactions

- Shared dark-only tokens, frosted cards and pill controls throughout the existing screens. Old saved light/system preferences cannot switch this skin to light mode.
- SF Pro through the iOS system font; Inter Light and regular/medium weights on Android and web. Home typography is smaller and quieter than the first mockups.
- Five existing navigation destinations in a slimmer floating dock, with outline icons and a spring selection indicator.
- A spring logo entrance, 24-point card rise with 60 ms stagger, a balance counter, 0.96 press scaling and haptics on supported native devices.
- Home's balance expand control, monthly spending card and remaining-budget card open into dedicated full-screen details. The source bounds are measured at the time of the tap. The surrounding Home content scales to 0.94 and dims to 60%.
- The detail header supports dragging down; the left edge supports swiping right. A partial drag can reverse or spring back. The close button and Android system Back use the same closing path. Content scrolling stays independent of the dismissal handles.
- Budget rings read the existing budget totals, including warning/exhausted states. No demo records are added by the implementation.
- The greeting scrolls at 0.6 of the content speed. Background glows drift using native-driven transforms; this decoration stops in low power mode, when the app backgrounds or when its screen loses focus.
- Reduce Motion uses a 200 ms opacity transition for expanded cards, sheets and navigation; parallax, decorative drift, counting and gesture-driven travel stand down.

## Main source files

| File | Responsibility |
| --- | --- |
| `src/theme/skin.ts` | Palette, geometry and spring settings |
| `src/theme/tokens.ts` | Shared semantic and glass tokens |
| `src/theme/ThemeContext.tsx` | Dark-only theme selection |
| `src/theme/useAmbientMotion.ts` | Focus, background and power-aware decoration |
| `src/components/glass/Aurora.tsx` | Layered blue/violet backdrop |
| `src/components/glass/GlassSurface.tsx` | Platform-aware frosted material and edge lighting |
| `src/components/glass/GlassPressable.tsx` | Shared spring touch feedback |
| `src/components/glass/GlassTabBar.tsx` | Five-tab floating dock |
| `src/components/glass/HeroTransitionContainer.tsx` | Measured expansion, interruptible gestures and close lifecycle |
| `src/components/glass/ProgressRing.tsx` | Animated budget arcs |
| `src/screens/DashboardScreen.tsx` | Home layout and details backed by the existing scoped data |

`expo-battery` is the only added runtime dependency, pinned through the lockfile to the SDK 57 compatible version. It requires a new native build. Unused display font files are no longer imported into the bundle.

## Validation

TypeScript, 15 financial/persistence regression tests and 6 UI interaction tests pass. The new interaction test covers measurement, detail identity and reversal of an interrupted dismissal. The Expo production web export succeeds.

The exported app was opened in Chromium at 393 × 852. In an isolated guest browser session, an income of ₹65,000, an expense of ₹16,750 and a ₹30,000 category budget were saved using the existing forms. The resulting balance was ₹48,250, remaining budget ₹13,250 and daily allowance ₹2,650. Tests also exercised opening/closing a detail, reversal of a partial drag, account picker, Activity/Budgets tabs, a 320 px viewport without horizontal overflow, and Reduce Motion. No browser runtime errors occurred.

Native Android/iOS builds, device haptics, platform blur and physical refresh rates remain unverified. The browser recording does not establish 60/120 fps native performance. Progress-ring SVG arcs and the text counter use a short JS-driven value update; card motion and gestures use native/UI-thread transforms, with a small corner-radius interpolation during expansion. Native stack transitions remain platform-managed. This update does not implement an AI chat service, spoken briefing, weather integration or new bill-tracking logic.

To validate from this branch:

```sh
npm ci --legacy-peer-deps
npm run typecheck
npm test
npm run test:ui
npx expo export --platform web
```

For Android, use the existing Expo prebuild and Gradle release workflow with the same signing key as the installed app. This branch changes no application ID, database schema or release identity and does not publish an APK automatically.
