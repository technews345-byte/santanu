# Prabhat (Android)

**Wake up → mantra starts automatically → peaceful morning.**

Developed by Santanu Bordoloi.

Prabhat plays your mantra every morning at the time you choose, with the screen locked and the app closed.
It comes with three mantras built in, each with its picture: the *Mahalakshmi Mantra* (listen three
times every morning), *Shri Hanuman Chalisa* (Shankar Mahadevan) and *Krishnaya Vasudevaya*. The Mahalakshmi Mantra plays at **6:30 AM**
every day by default. Change the time from Home (✎ on the *Next Morning Session* card), the Schedule tab,
Settings, or during first-launch setup.

## Features

- **Morning schedule**: one or more times, each on chosen days (every day, Mon–Fri, weekends, or any days),
  each with its own mantra or the default. Large on/off switch, "Starts in 8h 42m" countdown.
- **Automatic playback** through Android's alarm system (`setAlarmClock`): works when the app is closed, in Doze and
  on the lock screen; re-armed after a reboot, an app update, and time, time-zone or daylight-saving changes.
  Duplicate alarm deliveries are ignored, and it never interrupts something you are already playing.
  If the phone was off at the time, you get "Your mantra was scheduled for 6:30 AM" with **Play Now** instead
  of surprise audio. A completed session is never replayed unless you press Play.
- **Background audio** (Media3 / ExoPlayer): lock-screen and notification controls, Bluetooth and headphone buttons,
  audio focus (pauses for calls and other apps, resumes after short interruptions), pauses on headphone unplug.
- **Repeat**: once, 3, 5, 11, 108 times or continuous (default 3). Previous / Next move between mantras.
- **Gentle fade-in** (off, 5–60 s, default 20 s) and a **sleep timer** (5–60 min or end of mantra, fades out).
- **Resume** from where you paused.
- **Library**: add MP3 / M4A / WAV (copied into the app, so moving or deleting the original never breaks it),
  rename, description, cover image, default mantra, delete, preview. Missing files are flagged, never crash.
- **Mantra words**: shown on Home and the mantra page.
- **Notifications** (each optional): reminder 5–30 min before, session starting, session completed.
- **Onboarding**: mantra → time → repeat → permissions → "You're all set 🌅".
- Light (ivory, sunrise, gold), dark (midnight navy, golden glow) or follow the system.
- Fully offline, no account; everything is stored on the phone.

## Permissions

| Permission | Why |
|---|---|
| Notifications | Reminders and the playback controls notification |
| Alarms & reminders (`USE_EXACT_ALARM` / `SCHEDULE_EXACT_ALARM`) | Start the mantra exactly on time while the phone sleeps |
| Foreground service (media playback), wake lock | Keep playing with the screen off |
| Run at startup | Restore the schedule after a reboot |

**Battery optimization**: for the most reliable mornings, set Prabhat to *Unrestricted* / *Don't optimize*
(Settings → Background playback has a button). On Xiaomi, Oppo, Vivo, Realme, OnePlus and Samsung phones,
also allow Prabhat under *Autostart* / *Sleeping apps* / *Background activity*.

## Getting the APK

Every push that changes `prabhat-app/` runs **Actions → Prabhat app**: unit tests, then
`Prabhat-N.apk` (release) and `Prabhat-N-debug.apk` in the run's **Artifacts**. Pushes to `main`
(and manual runs) also publish a GitHub Release (`prabhat-v1.0.N`) with `Prabhat.apk` on the Releases page.

Builds are signed with a fixed test key (`signing/prabhat-test.keystore`), so each new APK installs as an update over the last. For the Play Store, use your own key via the optional secrets: `PRABHAT_KEYSTORE_BASE64`, `PRABHAT_KEYSTORE_PASSWORD`, `PRABHAT_KEY_ALIAS`,
`PRABHAT_KEY_PASSWORD`. Create once with
`keytool -genkeypair -v -keystore prabhat.jks -alias prabhat -keyalg RSA -keysize 2048 -validity 10000`, then
`base64 -w0 prabhat.jks`. Keep it safe: updates must be signed with the same key.

## Built-in mantras

Listed in `BUILT_INS` in `data/Library.kt`: audio in `res/raw/` (MP3/M4A/WAV), one picture (shown whole) in
`res/drawable-nodpi/`, plus name, description and words. Adding an entry with a new id also adds it on phones
that already have the app (a built-in the user deleted is not brought back). The app icon is
`res/mipmap-*/ic_launcher_art.webp`.

## Building locally

Android Studio (Ladybug or newer) with JDK 17: open `prabhat-app/` and run, or:

```sh
cd prabhat-app
./gradlew testDebugUnitTest assembleDebug
```

## Code layout

```
app/src/main/java/com/prabhat/app/
  data/       app state (JSON file), audio library and import, the bundled mantra
  domain/     schedule arithmetic (DST-safe), repeat counting, formatting
  schedule/   alarms, alarm / boot / time-change receivers
  playback/   Media3 playback service, UI connection
  notify/     notification channels and messages
  ui/         Compose screens, components, theme, navigation, permissions
```
