# Punch Attendance — Android

Native Android app (Android 8.0+) for the location-checked punch in / punch out app.
The screens are the web app in [`../attendance-app`](../attendance-app), packaged inside the APK
and served from a secure in-app address so GPS works offline.

Android-only extras (through the `AndroidDevice` bridge in `MainActivity.kt`):

- Full battery details: %, charging / full, power source, time to full, health, temperature,
  voltage, battery type; plus phone maker and model, Android version and network type.
- Fake-GPS check: punching is refused when the location comes from a mock-location app.
- Reminders as real Android notifications.
- CSV / JSON exports saved to the phone's **Downloads** folder.

## Get the APK

Every push that changes `attendance-app/` or `attendance-android/` runs the
**Attendance Android app** workflow, which builds `PunchAttendance.apk` and publishes it under
**Releases** (tag `attendance-v1.0.<build>`). Open it on the phone, allow installing from that
source, then allow Location when asked.

The release APK is signed with a debug key: fine for installing directly, not for the Play Store.

## Build locally

Android Studio (or JDK 17 + Android SDK 35): open `attendance-android/` and run, or
`./gradlew assembleDebug`.
