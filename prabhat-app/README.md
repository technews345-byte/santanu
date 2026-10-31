# Prabhat (Android)

**Wake up → mantra starts automatically → peaceful morning.**

Developed by Santanu Bordoloi.

Prabhat plays your mantra every morning at the time you choose, with the screen locked and the app closed.
It comes with three mantras built in, each with its picture: the *Mahalakshmi Mantra* (listen three
times every morning), *Shri Hanuman Chalisa* (Shankar Mahadevan) and *Krishnaya Vasudevaya*. The Mahalakshmi Mantra plays at **6:30 AM**
every day by default. Change the time from Home (✎ on the *Next Morning Session* card), the Schedule tab,
Settings, or during first-launch setup.

## Features

- **Home dashboard**: greeting with today's sunrise and sunset (Jorhat, Assam), what is playing or a one-tap start,
  the next session, and today's routine with each session marked done, missed (with Play) or upcoming.
- **Immersive player**: the mantra's picture inside a slowly turning, glowing mandala (moving only while it plays),
  a japa progress ring, synced words with transliteration and meaning, and the full controls.
- **Smart scheduler**: any number of sessions on chosen days, each at a clock time or at **sunrise / sunset**
  (up to 30 minutes before or after), with its own mantra and japa count. Sun times are computed on the phone.
- **Japa counter**: 1, 3, 5, 11, 21, 54, 108 or continuous, looping seamlessly, with an optional vibration as each
  repetition completes.
- **Gentle wake**: fade-in up to 2 minutes (to the volume you set), optionally opening with temple bells or morning
  birds before the mantra.
- **Reliable**: Android alarm clock (works locked, closed and in Doze; restored after reboot, updates and time changes),
  a foreground media service with wake lock, lock-screen/Bluetooth/headphone controls and audio focus. A session
  missed while the phone was off offers Play Now instead of surprise audio.
- **Library**: built-in Mahalakshmi Mantra (6:30 AM, 3 times), Shri Hanuman Chalisa (7:00 AM, once) and
  Krishnaya Vasudevaya; add your own MP3 / M4A / WAV with a cover, name and words.
- **Design**: saffron and marigold on warm ivory by day, deep indigo and muted gold from sunset (or a fixed light,
  dark or system theme); Plus Jakarta Sans for the interface and Tiro Bangla for mantra words.
- Fully offline, no account; everything stays on the phone.

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
