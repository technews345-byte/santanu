# Bowl Mania Rider (Android)

The delivery partner app for Bowl Mania staff. It talks to the Bowl Mania server's `/api/rider` API
(default: `https://santanu-production.up.railway.app`). The server is always the source of truth.

## What riders can do

- **Home**: go online/offline, see today's deliveries, completed, pending and distance, accept or reject new deliveries, jump to the active one.
- **Orders**: active, new, completed and cancelled deliveries; full history with filters.
- **Order screen**: map (with a Maps key), next stop with distance and time, turn-by-turn navigation, call restaurant/customer (opens the dialer), items, cash to collect, and the step-by-step flow:
  Accepted → Going to restaurant → Arrived → **pickup code** → Picked up → Out for delivery → Arrived at customer → **customer's delivery code** → **cash confirmation** (COD) → **proof** (photo, signature, note) → Delivered.
- **Notifications**: new deliveries (with Accept / Reject from the notification), ready/cancelled orders, shift, leave and support updates.
- **Attendance**: check in with a front-camera selfie and location, breaks, check out, shifts, history and leave requests.
- **Profile**: details, performance (deliveries, on-time rate, average time, distance, rating), support tickets, safety & emergency (press-and-hold buttons, never auto-dials), settings (light/dark theme, permissions).

There is no earnings, pay or incentive feature: the only amount shown is the cash a customer must pay on cash-on-delivery orders. CI fails if pay-related wording appears in the app source.

Location is shared through a visible foreground service only while the rider is online or on a delivery, and stops when they go offline. Points recorded without signal are queued on the phone and uploaded later. If the network drops, screens show the last saved data; actions (steps, codes, proof, cash, attendance) always need the server and are safe to retry.

## Getting the APK

Every push that changes `rider-app/` runs **Actions → Rider app**, which runs the unit tests and builds:

- `BowlManiaRider-N.apk` (release, production server)
- `BowlManiaRider-N-debug.apk` (debug build, installs alongside the release one)

Download them from the run's **Artifacts** section and install on the phone (allow "Install unknown apps").
Riders sign in with the email and password of their *Delivery Staff* account from the admin panel.

## Configuration (never committed)

Set these as GitHub repository **secrets** (or in `rider-app/local.properties` for local builds). All are optional.

| Name | Purpose |
|---|---|
| `MAPS_API_KEY` | Google Maps SDK for Android + Routes API: in-app map and road distance/time. Restrict it to the app's package and signing SHA-1. Without it the app shows approximate distances and still opens Google Maps for navigation. |
| `FIREBASE_APP_ID`, `FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_SENDER_ID` | Push notifications (Firebase console → Project settings → Android app). The server also needs `FIREBASE_SERVICE_ACCOUNT`. Without push, the app checks for deliveries every 30 s while online and every 15 min otherwise. |
| `RIDER_KEYSTORE_BASE64`, `RIDER_KEYSTORE_PASSWORD`, `RIDER_KEY_ALIAS`, `RIDER_KEY_PASSWORD` | Release signing. Create once with `keytool -genkeypair -v -keystore rider.jks -alias rider -keyalg RSA -keysize 2048 -validity 10000`, then `base64 -w0 rider.jks`. Keep the keystore safe: updates must be signed with the same key. |

Repository **variable** `RIDER_API_URL` changes the server address for release builds; `RIDER_DEV_API_URL` does the same for debug builds (local builds only). The app only talks to HTTPS servers (debug builds also allow `localhost` / `10.0.2.2` for the emulator).

## Building locally

Android Studio (Ladybug or newer) with JDK 17: open `rider-app/` and run. Or:

```sh
cd rider-app
./gradlew testDebugUnitTest assembleDebug
```

## Code layout

```
app/src/main/java/com/bowlmania/rider/
  data/        API client (Retrofit), encrypted session, Room cache + location queue, repository
  domain/      delivery flow, distance/time estimates, time formatting
  location/    foreground tracking service, current location, routes
  notify/      notification channels, Accept/Reject actions, Firebase push
  work/        background upload and sync (WorkManager)
  ui/          Compose screens, components, theme, navigation
```
