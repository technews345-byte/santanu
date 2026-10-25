> **Spendly — Expense & Budget Manager:** [App details and features](SPENDLY.md) · [Complete UI guide](SPENDLY-UI-GUIDE.md) · [Detailed latest updates](SPENDLY-UPDATES.md) · [APK and source release](https://github.com/technews345-byte/santanu/releases/tag/spendly-ui-v1.0.1)

# Prabhat — Your Morning Mantra

**Begin your day with devotional listening, at a time you choose.**

Developed by **Santanu Bordoloi**.

Prabhat is an offline Android app for listening to mantras and scheduling a daily devotional routine. Choose a mantra, set a morning time, and decide how many times it should play. With Android's required permissions and background settings enabled, Prabhat can start your session while the screen is locked and continue playing in the background.

It includes **Mahalakshmi Mantra**, **Shri Hanuman Chalisa**, and **Krishnaya Vasudevaya**. You can also add your own recordings, choose cover pictures, and create separate schedules for different mantras.

**Android 8.0 or later · Offline listening · No account required**

## Download Prabhat

### [Download the published Prabhat APK — build 25](https://github.com/technews345-byte/santanu/releases/download/prabhat-v1.0.25/Prabhat.apk)

[View the Prabhat release page](https://github.com/technews345-byte/santanu/releases/tag/prabhat-v1.0.25) · [Browse all releases](https://github.com/technews345-byte/santanu/releases)

This repository also contains Bowl Mania software. For this app, choose a release named **Prabhat** and download **Prabhat.apk**.

### Install on your phone

1. Open the download link on your Android phone and download **Prabhat.apk**.
2. Open the downloaded file. If Android asks, allow your browser or file manager to **install unknown apps** for this installation.
3. Tap **Install**, then open **Prabhat**.
4. Choose your mantra, morning time, and repeat count during setup.
5. Review **Notifications**, **Alarms & reminders**, and **Battery optimization** in the app's background-playback checklist.
6. Try a manual session first, then test a scheduled session with the screen locked.

The APK is distributed through GitHub. The download above is the published build 25; changes to the source code are included in an installed app only after a new APK is built and installed.

## The included mantras

| Recording | Approximate length of one play | Default scheduled session | Written words in the app |
|---|---|---|---|
| **Mahalakshmi Mantra** | 15 seconds | 6:30 AM daily; 3 plays using the default settings | Assamese script |
| **Shri Hanuman Chalisa** | 2 minutes 58 seconds | 7:00 AM daily; 1 play | Full written text is not bundled |
| **Krishnaya Vasudevaya** | 16 seconds | No separate default schedule; add one if wanted | Devanagari and Assamese scripts |

These are the lengths of the recordings currently bundled with Prabhat, not the lengths of every version of these devotional works. Repeating a short recording plays that same recording again. Each included mantra has its own devotional artwork, displayed without cropping.

### Mahalakshmi Mantra

A short devotional recording dedicated to Mahalakshmi. It is the initial default mantra, with the in-app instruction to listen three times in the morning.

- **Default time:** 6:30 AM every day.
- **Default repeat count:** 3, taking approximately 45 seconds in total.
- **Audio:** a short recording of about 15 seconds per play.
- **Artwork:** Lakshmi.
- **Written words:** displayed in Assamese script on Home and the mantra page.

The words provided in the app are:

> ওম মহালক্ষ্মী নম নমঃ<br>
> ওম বিষ্ণুপ্রিয়ায় নম নমঃ<br>
> ওম ধনপ্রদায়ে নম নমঃ<br>
> ওম বিশ্বজনমে নম নমঃ

The morning schedule initially follows the app's default mantra and repeat setting. If you change the default mantra or repeat count, review the schedule to make sure it still matches your preference.

### Shri Hanuman Chalisa

A devotional listening option dedicated to Hanuman. The app identifies the included recording as **Shankar Mahadevan**.

- **Default time:** 7:00 AM every day.
- **Default repeat count:** 1 for this schedule, independently of the general repeat setting.
- **Audio:** approximately 2 minutes 58 seconds.
- **Artwork:** Hanuman.
- **Written words:** the full Chalisa text is not included in the app's current library entry.

You can change its time, days, and repeat count, or turn this schedule off. Attribution here follows the app's library description; it does not imply artist endorsement or ownership of the recording.

### Krishnaya Vasudevaya

A short Krishna mantra recording for devotional listening. Its library description presents it as a mantra for peace, freedom from troubles, and devotion.

- **Default schedule:** none specifically for this mantra; create one from its detail page or the Schedule tab.
- **Audio:** approximately 16 seconds per play.
- **Artwork:** Krishna.
- **Written words:** supplied in both Devanagari and Assamese scripts.

Devanagari:

> कृष्णाय वासुदेवाय हरये परमात्मने ।<br>
> प्रणतक्लेशनाशाय गोविन्दाय नमो नमः ॥

Assamese:

> কৃষ্ণায় বাসুদেৱায় হৰয়ে পৰমাত্মনে ।<br>
> প্ৰণতক্লেশনাশায় গোবিন্দায় নমো নমঃ ॥

## What you can do with Prabhat

### Listen whenever you want

Play or pause from the app, move through the recording with the progress bar, and use Previous or Next to change mantras. Playback controls are also available through the media notification, lock screen, and supported Bluetooth or headphone controls.

Prabhat saves a recent playback position so you can continue an interrupted session. It pauses when headphones are unplugged and uses Android audio-focus handling for calls and other audio apps. Automatic resumption depends on the type of interruption.

### Choose how often a mantra repeats

Available choices are **once, 3, 5, 11, 108 times, or continuous**. Continuous playback keeps going until you stop it or a sleep timer pauses it.

A schedule can use its own repeat count or follow the general setting. A schedule's own count takes priority for that session. Previous and Next change the selected mantra; they do not mean that the entire library will automatically play as a playlist after a completed session.

### Create your morning routine

Create one or several playback times and choose the days for each: every day, weekdays, weekends, or individual days. Each schedule can use a particular mantra or the default mantra.

- See the next scheduled session and a countdown.
- Turn individual schedules on or off.
- Pause all automatic sessions with the main schedule switch.
- Change the time, mantra, repeat count, or days whenever needed.
- Delete a schedule without deleting its mantra.

Times follow the phone's local clock and time zone. Prabhat restores scheduling after a restart, app update, or relevant clock and time-zone changes. It avoids starting a scheduled session while Prabhat is already playing. A scheduled session more than 30 minutes late is offered as a missed-session notification rather than starting unexpectedly.

The phone must be powered on. Android permissions, battery restrictions, and manufacturer background settings affect automatic playback. A force-stopped app may need to be opened again before its background work can resume.

### Set volume and a gentle start

Choose your preferred volume and a fade-in of **off, 5, 10, 20, 30, or 60 seconds**. The initial fade-in setting is 20 seconds. A longer fade-in can extend across the first play of a short recording.

### Use a sleep timer

Start a mantra, then choose **5, 10, 15, 30, 45, or 60 minutes**, or **End of current mantra**. Timed sessions fade out before pausing; the end-of-mantra option waits for the current recording to finish. You can cancel the timer from the same menu.

### Add and personalize your own recordings

Use the **Mantras** library to import supported MP3, M4A, or WAV audio. Prabhat copies imported recordings into its own storage so moving the original file later does not break the imported copy.

You can rename a mantra, edit its description, add or change its cover image, set it as the default, create a schedule for it, or delete it. Removing a mantra also removes its app-stored audio and cover files where applicable. Schedules that used a deleted mantra fall back to the remaining default mantra. A built-in mantra you delete is remembered and is not automatically added again during normal library seeding.

### Customize notifications and appearance

Choose optional session reminders **5, 10, 15, or 30 minutes** before playback. Starting and completion notices have separate switches. Home also shows morning-session status.

Choose **Light**, **Dark**, or **System** appearance. Light mode uses ivory and sunrise colors; dark mode uses midnight tones and gold accents. Script support in mantra words does not mean every app screen is translated; most controls are in English.

## Understand the four main areas

| Area | What it helps you do |
|---|---|
| **Home** | Start listening, control playback, see progress and session information, read available mantra words, and check the next morning session |
| **Mantras** | Browse included recordings, import your own audio, and edit a mantra's details and artwork |
| **Schedule** | Add or edit times, choose days and mantras, set session repeat counts, and enable or pause automatic playback |
| **Settings** | Change the default mantra, repeat count, volume, fade-in, reminders, theme, and background-playback settings |

## Permissions and background playback

| Access | Why Prabhat uses it |
|---|---|
| **Notifications** | Show session reminders, status messages, and playback controls |
| **Alarms & reminders** | Schedule playback at the selected time while the phone sleeps |
| **Foreground media playback** | Keep an active listening session running with a visible playback notification |
| **Wake lock** | Help keep local audio playing when the screen is off |
| **Run after restart** | Restore the morning schedule when the phone restarts |
| **Selected files and pictures** | Import the audio or cover image you choose through Android's picker |

For reliable scheduling, open **Settings → Background playback** and review the checklist. If your phone restricts background activity, select **Unrestricted** or **Don't optimize** for Prabhat. Some phones also have an **Autostart**, **Sleeping apps**, or **Background activity** setting that needs adjustment.

## Offline use and privacy

The included recordings play without an internet connection. Prabhat does not require an account. The current app stores its library, imported recordings, cover images, preferences, schedules, and resume position locally on the phone. Its manifest does not request internet, microphone, camera, contacts, or location access.

Downloading an APK through GitHub requires internet access. Prabhat does not provide account-based cloud synchronization, and Android backup is disabled in this app. Keep your original recordings if you want to import them again after uninstalling or clearing app storage.

## Common questions

**Why does Mahalakshmi stop after about 15 seconds?**<br>
That is approximately the length of one bundled recording. With Repeat set to 3, it should play that recording three times. Select Continuous for ongoing repetition, or import a longer recording if that is what you want to hear.

**Why did playback pause before the session finished?**<br>
Check the sleep timer, calls or other audio interruptions, headphone connection, and phone background restrictions. The repeat count and a schedule's own repeat setting can also differ. If you report a problem, include the mantra name, approximate stopping point, app version, phone model, and whether the screen was locked.

**Can I change the 6:30 AM and 7:00 AM sessions?**<br>
Yes. Both are editable schedules. You can change their days, times, recordings, repeat counts, or switch them off.

**Does Prabhat work when the phone is switched off?**<br>
No. Automatic playback needs the phone to be powered on, the app's required access enabled, and background activity allowed.

**Does it keep playing after I leave the app?**<br>
It supports background playback through an Android media service. Phone restrictions or interruptions can affect it; use the background-playback checklist and test your setup.

**Will an update keep my settings?**<br>
An APK with the same app identity and signing certificate and an acceptable version number can normally update the existing installation. Keep the existing app installed when updating. A signing mismatch can prevent an update; debug and release builds are separate apps.

**Where do I report an issue or request a feature?**<br>
Use [GitHub Issues](https://github.com/technews345-byte/santanu/issues) and put **Prabhat** in the title so it can be distinguished from the other projects in this repository.

## For developers

Prabhat is a native Android app written in Kotlin with Jetpack Compose. It uses Media3/ExoPlayer for local audio, Android alarms for scheduling, and a local JSON store for app state.

Open the `prabhat-app` folder in Android Studio with JDK 17 and an Android SDK capable of building SDK 35. From that folder:

```sh
./gradlew testDebugUnitTest assembleDebug assembleRelease
```

On Windows, use `gradlew.bat`. The minimum supported Android version is 8.0 (API 26).

| Folder | Purpose |
|---|---|
| `app/src/main/java/com/prabhat/app/data/` | Library, settings, imported files, and stored state |
| `app/src/main/java/com/prabhat/app/domain/` | Repeat counting, time formatting, and schedule calculations |
| `app/src/main/java/com/prabhat/app/playback/` | Background playback service and UI connection |
| `app/src/main/java/com/prabhat/app/schedule/` | Scheduled alarms and system-event receivers |
| `app/src/main/java/com/prabhat/app/notify/` | Playback and session notifications |
| `app/src/main/java/com/prabhat/app/ui/` | Screens, controls, themes, and permission guidance |
| `app/src/main/res/raw/` | Bundled audio recordings |
| `app/src/main/res/drawable-nodpi/` | Devotional artwork |
| `app/src/test/` | Automated tests |

The GitHub Actions workflow builds and tests the app and saves APK artifacts. Publishing a release is configured for pushes to `main` and manual workflow runs. APK signing uses the project's fixed test key unless a release signing key is supplied through the supported repository secrets. Maintainers should use their own signing configuration for a production store release.

## Credits and licensing

**App developer:** Santanu Bordoloi.<br>
**Source-code license:** [MIT](../LICENSE).

Devotional text, recordings, and artwork may have rights separate from the software license. The Hanuman recording's artist credit is retained from the library metadata. The software license should not be treated as permission to redistribute third-party recordings or artwork.
