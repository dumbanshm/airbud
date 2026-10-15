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
   Under *Authorized redirect URIs* add:
   - `http://localhost:8000/auth/google/callback`
   - `https://YOUR-TUNNEL-DOMAIN/auth/google/callback` (from step 2 below)
6. Copy `backend/.env.example` to `backend/.env` and paste in the client ID and secret.

Only the **Web application** client is needed. No iOS/Android client IDs, no SHA-1 fingerprints.

### 2. An HTTPS address for your backend (needed for sign-in on a phone)

Google only redirects to `localhost` or `https://`. Your phone isn't localhost, so give the backend
an HTTPS URL. The simplest free option is an ngrok static domain:

```bash
ngrok http --url=your-name.ngrok-free.app 8000
```

Then in `backend/.env` set `PUBLIC_URL=https://your-name.ngrok-free.app` and restart the backend.
(Cloudflare Tunnel or Tailscale Funnel work too. Later, a $5 VPS with Caddy does the same job.)

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
app ◀── airbud://auth?code=ONE_TIME ── backend /auth/google/callback
app ── POST /auth/exchange {code} ──▶ session token (saved in Keychain / Keystore)
```

- The system auth browser (`ASWebAuthenticationSession` / Chrome Custom Tabs) catches the redirect
  back to the app. It works the same in Expo Go (`exp://…`) and in a real build (`airbud://`).
- The redirect carries a 2-minute, single-use code, never the real token.
- The backend only redirects to allow-listed app URLs (`APP_REDIRECT_PREFIXES`).
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

Each email goes through these in order. The first one that finds a valid flight wins:

1. **schema.org markup**: the structured flight data many airlines hide in the email HTML (`app/parsing/schema_org.py`)
2. **Calendar attachments** (`.ics`) (`app/parsing/ics.py`)
3. **Airline-specific parsers** you add (`app/parsing/airlines/`, see `_template.py`)
4. **Generic text parser**: flight number + route + date + times near each other (`app/parsing/generic_text.py`)

Every flight is checked before it's saved: real airports, arrival after departure, plausible duration.
Times are stored as the airport's local time plus its timezone, looked up from the airport code,
never guessed from the email.

Settings → **Emails read** lists every email the app looked at and what happened to it. When one of
your real emails comes back as "no match", fetch it with `GET /emails` (the raw body is kept
for failures), drop it in `backend/tests/`, and write a parser for that airline.

## Not done yet

- Real flight status. It's simulated now; swap `app/flight_status.py` for an API (AeroDataBox has a free tier).
- Real boarding passes. Parsing `.pkpass` / barcode PDFs would replace the placeholder QR code.
- Outlook support (same flow via Microsoft Graph).
