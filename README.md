# Airbud

Your flights, pulled from Gmail automatically. Countdown, reminders and a boarding pass, in one app.
Self-hosted, for you and a few friends. No LLM; plain parsing.

```
backend/   FastAPI + SQLite. Reads Gmail (read-only), parses bookings, serves the app.
mobile/    Expo (React Native + TypeScript) app.
```

## Run it

```bash
cd backend && uv sync && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

```bash
cd mobile && npm install && npx expo start
```

Scan the QR code with **Expo Go** on your phone (same Wi-Fi as your computer). Tap **Try the demo**
to see sample flights without setting anything up. The app finds the backend automatically on your
computer's IP. To point it elsewhere, set `EXPO_PUBLIC_API_URL`.

Tests: `cd backend && uv run pytest`

---

## What you need to do

### 1. Google sign-in + Gmail (about 10 minutes, free)

1. Go to <https://console.cloud.google.com>, create a project.
2. **APIs & Services → Library** → enable **Gmail API**.
3. **OAuth consent screen** → User type **External**. Fill in the app name and your email.
   Add the scope `https://www.googleapis.com/auth/gmail.readonly`.
4. **Audience → Test users → Add users**: add your Gmail and each friend's (up to 100).
   - Leave the app in **Testing**. Publishing needs a home page, privacy policy and authorized domain.
   - Catch: in Testing, Google's Gmail access expires every 7 days. The app then shows a
     **Reconnect Gmail** button; one tap renews it. Your flights and app login aren't affected.
5. **Credentials → Create credentials → OAuth client ID** → type **Web application**.
   Under *Authorized redirect URIs* add `https://YOUR-GITHUB-USER.github.io/airbud/oauth.html`.
6. Copy `backend/.env.example` to `backend/.env`, paste in the client ID and secret, and set
   `GOOGLE_REDIRECT_URI` to that same URL.

Only the **Web application** client is needed. No iOS/Android client IDs, no SHA-1 fingerprints.

### 2. Host the sign-in relay page (free, once)

In your fork: **Settings → Pages → Deploy from a branch → `main` / `/docs`**. That publishes
`docs/oauth.html`, a static page that passes Google's one-time code back to the app. The app then
sends it to your backend over Wi-Fi, so **the backend never needs to be on the internet**: no tunnel,
no domain.

### 3. Remote push (optional)

Reminders (check-in open, leave for the airport, boarding in 15 min) are **local notifications**.
They already work in Expo Go with no setup. Remote push is only for "new flight found" and
"schedule changed" alerts. To turn it on:

```bash
cd mobile && npx eas-cli init
```

That needs a free Expo account and writes a project ID into `app.json`.

- **iPhone:** should then work in Expo Go.
- **Android:** Expo Go can't receive remote push. You need a development build
  (`npx eas-cli build --profile development --platform android`) plus Firebase credentials. Expo walks you through it.

The **Settings** screen in the app shows exactly why push isn't working, if it isn't, and has
buttons to send a test reminder and a test push.

---

## How the two hard parts work

### Sign-in on a native app

The app never touches Google directly. The backend runs the whole OAuth flow:

```
app ── opens system auth browser ──▶ backend /auth/google/start ──▶ Google consent
Google ──▶ docs/oauth.html on GitHub Pages ──▶ airbud://auth?google_code=…&state=…
app ── POST /auth/google/finish {code, state} ──▶ session token (saved in Keychain / Keystore)
```

- The system auth browser (`ASWebAuthenticationSession` / Chrome Custom Tabs) catches the redirect
  back to the app. It works the same in Expo Go (`exp://…`) and in a real build (`airbud://`).
- Google's code is useless without the client secret, which only the backend has.
- `state` is single-use and expires in 10 minutes. The relay page and backend only redirect to
  allow-listed app URLs (`airbud://`, `exp://`).
- Why not let Google call the backend directly? Then the backend needs a public HTTPS address,
  and free tunnels (ngrok) put a warning page in front of it that breaks the redirect.
- The Gmail refresh token stays on the server, encrypted.

### Notifications

| | Local reminders | Remote push |
|---|---|---|
| For | check-in, leave, boarding | new booking, schedule change, cancellation |
| Scheduled by | the phone | the backend, through Expo's push service |
| Setup | none | `eas init` (+ dev build on Android) |
| Works offline | yes | no |

Every time the flight list loads, the app cancels its reminders and schedules them again.
So a schedule change moves the reminders automatically, and nothing gets duplicated.

---

## How parsing works

No LLM, and no per-airline setup needed for most emails. Each email goes through these in order;
the first that finds a valid flight wins:

1. **schema.org markup**: structured flight data some airlines embed in the HTML (`schema_org.py`).
2. **Calendar attachments** (`.ics`) (`ics.py`).
3. **Airline/agency parsers** for layouts the universal one can't read alone: IndiGo, Alliance Air,
   MakeMyTrip/Amazon Pay, Cleartrip, Away (`airlines/`, copy `_template.py` to add one).
4. **Universal extractor** (`universal.py`) for everything else, including PDF e-ticket attachments.
   For each flight number (`LH 401`, `BA0981`, `6E-556`, or `British Airways 178`), it collects
   nearby airports (IATA codes or city/airport names), dates (`12 MAR`, `03 Jul 26`,
   `Thu, Nov 19`, `2026-12-01`, `23. Nov. 2026`, with or without a year) and times (`06:00`,
   `7:05 p.m.`, `0705 hours`, `14h30`, `+1`). It then picks the departure/arrival times **whose
   duration fits the distance between the airports**. That's how it ignores boarding, bag-drop and
   duration times without knowing the layout. It reads each email both ways (details after the
   flight number, or before it) and keeps the reading that explains more distinct flights.

On top of that, **boarding passes** are read from Apple Wallet attachments (`.pkpass`) and from
IATA BCBP barcode text (`boarding_pass.py`). The barcode is the same on every airline's pass:
it adds seats and passengers to a known flight, and never invents a time.

Updates are merged rather than duplicated. Emails are processed oldest first, and an alert without
a booking reference ("9I-507 … is rescheduled to 08:05") attaches to the flight you already have.
Invoices and receipts are ignored; money like `Amount 10.40` is never read as a time.

Every flight is checked before it's saved: real airports, arrival after departure, plausible duration.
Times are stored as the airport's local time plus its timezone, looked up from the airport code.

`backend/tests/test_corpus.py` holds ~20 layouts modelled on real airline and agency emails
(Amadeus/GDS, British Airways, Ryanair, United, Expedia, Lufthansa in German, AirAsia, Qatar, …)
plus non-flight emails that must not match. Every name and code in them is made up. If one of your
emails comes back "no match" in Settings → **Emails read**, add a made-up copy of its layout
there. Airlines missing from `airline_codes.py` still work when the email says "Flight XY 123".

Layout research: [KDE Itinerary's supported providers](https://community.kde.org/KDE_PIM/KItinerary/Supported_Providers)
and [extractor scripts](https://github.com/KDE/kitinerary/tree/master/src/lib/scripts); BCBP field widths from
[georgesmith46/bcbp](https://github.com/georgesmith46/bcbp).

## Not done yet

- Real flight status. It's simulated now; swap `app/flight_status.py` for an API (AeroDataBox has a free tier).
- Show the real boarding pass in the app. `.pkpass` and barcode text are read now, but barcode *images* inside PDFs aren't decoded yet, and the app still shows a placeholder QR code.
- Outlook support (same flow via Microsoft Graph).
