# Widgets, Live Activities and exports

What's built, what's designed, and exactly what it takes to ship the rest. The visual designs live in
the app at **Settings → Design system (dev)** (the `/design` route), drawn with the same tokens as
the app and fed with your real next flight.

## Built (works in Expo Go today)

| Export | Where | How |
|---|---|---|
| **Share trip card** | Flight screen, share button or “Take it with you” | Snapshot of `ShareCard` (react-native-view-shot) → share sheet. Leaves out the barcode, booking reference and names. |
| **Add to calendar** | “Take it with you” | `.ics` with one event per flight in UTC (calendars show it in the phone's zone), the airport-local times in the notes, and an alert 3 hours before. |
| **PDF itinerary** | “Take it with you” | `expo-print` renders an A4 itinerary in the app's typefaces → share sheet. |

## Designed (needs a development build)

All surfaces read one object, `WidgetSnapshot` (`src/lib/widgetData.ts`), which the app computes
from `/trips`. The widget never does its own networking or time-zone maths. Countdowns use the
platform's own timers (`Text` with `timerInterval`, `ProgressView` with `timerInterval` in
`@expo/ui`), so they tick every second without the app waking up.

| Surface | Shows | Updates |
|---|---|---|
| **Home widget, small** (iOS small, Android 2×2) | Day, `BLR → DEL`, live “Boards in” countdown, status dot | Timeline entries at boarding, departure and arrival switch the label (“Boards in” → “Departs in” → “Lands in”). |
| **Home widget, medium** (iOS medium, Android 4×2) | Trip name and dates, codes and times, the track, flight and seat, countdown | Same timeline; the trail fills during the flight. |
| **Lock screen** (accessory rectangular) | Flight and route, countdown, boarding time and terminal | Same timeline. |
| **Live Activity** (lock screen + Dynamic Island) | Status, codes, a progress bar that fills during the flight, countdown, boarding time, terminal, seat | Starts when you open the app within 4 hours of departure; ends 30 min after landing. Progress and countdown run on system timers. |

States: before boarding (“Boards in”), boarding (“Departs in”, pulsing dot), in the air (“Lands in”,
filling bar), landed (the destination fills in, then the widget moves on to the next flight), cancelled
(red dot, “Cancelled”), and nothing upcoming (“No trips coming up”, which opens the app).

Tapping any of them opens `airbud://flight/<id>`, the same route notification taps already use.

### Android caveats

`expo-widgets` draws Android widgets with Jetpack Glance, behind the plugin's `enableAndroid`
flag (marked experimental in SDK 57). Android limits widget refreshes to about every 30 minutes and
has no system countdown text, so the Android widgets lead with absolute times (“Boards 04:50”) and
show the countdown in minutes, refreshed whenever the app syncs. Live Activities are iOS only.

## What it takes to ship

1. **Agree to leave Expo Go for a development build.** It's your own Airbud app on your phone,
   built once in the cloud. You run `npx expo start --dev-client` instead of opening Expo Go. JS
   changes still hot-reload; only native changes need a rebuild. The app keeps working in Expo Go
   too, because the widget code checks whether the module is present before using it.
2. **Install:** `npx expo install expo-dev-client expo-widgets` (SDK 57 pins `~57.0.20` and
   `~57.0.26`; `expo-widgets` brings `@expo/ui`).
3. **Config** in `app.json` plugins:
   ```json
   ["expo-widgets", {
     "groupIdentifier": "group.com.dumbanshm.airbud",
     "enableAndroid": true,
     "widgets": [{
       "name": "NextFlight",
       "displayName": "Next flight",
       "description": "Countdown to your next flight.",
       "supportedFamilies": ["systemSmall", "systemMedium", "accessoryRectangular"],
       "contentMarginsDisabled": false,
       "android": { "targetCellWidth": 4, "targetCellHeight": 2, "resizeMode": "both" }
     }]
   }]
   ```
4. **Code** (about a day): `src/widgets/NextFlight.tsx` and `src/widgets/FlightActivity.tsx` with
   `@expo/ui/swift-ui` views laid out to the designs. Register them with
   `new Widget('NextFlight', layout)` and `new LiveActivityFactory('Flight', layout)`. After each
   `/trips` fetch, call `updateTimeline(...)` with `widgetSnapshot()` entries. Start, update and end
   the Live Activity from the flight's times.
5. **Builds** (needs a free Expo account): `npx eas-cli init`, then add an `eas.json` with a
   `development` profile (`"developmentClient": true, "distribution": "internal"`).
   - **Android (your phone):** `npx eas-cli build -p android --profile development` gives you an
     APK link; install it. Free.
   - **iPhone:** needs an **Apple Developer Program** membership ($99/year) for App Groups and
     installing on a device: `npx eas-cli device:create`, then
     `npx eas-cli build -p ios --profile development`.
6. **Live updates for real delays (later):** with a real status API, the backend can push Live
   Activity updates through APNs. That needs `enablePushNotifications: true`, an APNs key (.p8)
   on the server, and the activity's push token sent to `/push/register`. Not needed while
   status is simulated, because the timers already keep the activity correct.

A development build also unlocks remote push on Android (README → Remote push), so both can ship
together.
