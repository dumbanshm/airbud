# Airbud design language: “Pass”

Clean, minimal and calm. Every trip is a stack of boarding passes. The flight's own data (codes,
times, the barcode) is the decoration, and nothing else is. Tokens live in `src/design/tokens.ts`,
and everything in the app takes its values from there. If you need a value that isn't a token, add
the token first.

Sources and what we took from each: **Apple Wallet** (the pass, field grid, perforation, stacks),
**split-flap boards** (codes flap only when they appear or change), **Flighty** (countdown as the
hero, the day as a timeline), **airport wayfinding** (yellow means “do this now”, one pictogram
stroke), **Linear and Things** (short springy motion, 1px precision), and **Dieter Rams** (one accent
with one job, and honesty: a placeholder looks like a placeholder, and simulated status says so).

---

## 1. Principles

1. **One job per color.** Green means done or good. Amber means changed. Red means cancelled.
   Yellow means do this now. Everything else is grey.
2. **Airport-local time, always.** Show times exactly as printed on the ticket, never converted to
   the phone's zone. When two clocks could be confused, name the airport (“BLR time”).
3. **Motion explains a change.** Things move because something appeared, changed or is in progress.
   Nothing loops unless it represents something live, like the plane, a boarding pulse or a
   reminder that's due.
4. **The barcode is sacred.** The airline's barcode image is shown unaltered on pure `#FFFFFF`:
   no tint, blur, rounding or overlay on the code. Only the placeholder before check-in is blurred.
5. **Quiet in dark mode, too.** Dark mode isn't inverted light mode. Surfaces step up in lightness,
   shadows go away, and accents lift so they keep the same contrast.

## 2. Color

| Token | Light | Dark | Use |
|---|---|---|---|
| `ground` | `#F1F2F2` | `#0E0F10` | Screen background |
| `surface` | `#FFFFFF` | `#1A1B1D` | Cards, passes |
| `sunk` | `#F1F2F2` | `#131415` | Strips inside a card |
| `ink` | `#16181A` | `#EDEEEF` | Primary text, plane, trail |
| `muted` | `#6C7176` | `#8D9297` | Secondary text (≥ 4.5:1 on surface) |
| `faint` | `#A2A7AB` | `#5C6166` | Decorative only, never text |
| `line` | `#E2E4E5` | `#2A2C2F` | Hairlines, perforation |
| `track` | `#C5C9CC` | `#3A3D41` | Dotted route track |
| `stack1` / `stack2` | `#E6E8E9` / `#DCDFE0` | `#151617` / `#121314` | Pass-stack edges |
| `good` / `goodSoft` | `#4C7A26` / `#EAF1E2` | `#9CC46B` / `#1F2A15` | On time, checked in, done |
| `changed` / `changedSoft` | `#B86E00` / `#FBF0DF` | `#F0A63A` / `#2E2210` | Delays, schedule changes |
| `alert` / `alertSoft` | `#C2362B` / `#FBE7E5` | `#FF7A6B` / `#3A1A17` | Cancelled, errors |
| `act` / `onAct` | `#FFC400` / `#111111` | same | The one “do this now” bar |
| `barcode` | `#FFFFFF` | `#FFFFFF` | Behind any barcode, never themed |

Status to color: on time → `good`; boarding → `good` with a pulsing dot; delayed → `changed`;
in the air → `ink`; landed → `muted`; cancelled → `alert`. Status from the backend is simulated
until a real status API is connected, and the detail screen says so.

## 3. Type

Three families, all from `@expo-google-fonts`, so they work in Expo Go.

- **Instrument Serif** (display): city names, airport codes, screen titles. Regular weight only.
  It's the voice of the app, so use it sparingly and large.
- **Instrument Sans** (UI): everything you read. 400, 500 and 600.
- **DM Mono** (numerals): times, countdowns, seats, PNRs, dates. 400 and 500, with tabular figures.

Each weight is its own font family in React Native. Never set `fontWeight` on these fonts, because
Android then falls back to the system font. Use the `Text` variants instead.

| Variant | Family | Size / line height | Tracking | Use |
|---|---|---|---|---|
| `codeXL` | Serif | 64 / 64 | 0 | Codes on the pass |
| `codeL` | Serif | 34 / 36 | 0 | Codes on trip cards |
| `codeS` | Serif | 18 / 22 | 0 | Codes in strips |
| `displayL` | Serif | 38 / 40 | −0.2 | Screen title (“Trips”) |
| `displayM` | Serif | 30 / 34 | −0.2 | Trip city on cards |
| `displayS` | Serif | 21 / 26 | 0 | Nav titles, past trips |
| `numXL` | Mono 400 | 34 / 38 | −1 | Hero countdown |
| `numL` | Mono 400 | 21 / 26 | −0.5 | Times on the pass |
| `numM` | Mono 500 | 15 / 20 | −0.2 | Field values |
| `numS` | Mono 400 | 13 / 18 | 0 | Small times and dates |
| `title` | Sans 600 | 16 / 22 | −0.1 | Card titles, buttons |
| `body` | Sans 400 | 15 / 21 | 0 | Running text |
| `bodyStrong` | Sans 500 | 15 / 21 | 0 | Emphasis |
| `label` | Sans 500 | 12 / 16 | 0.1 | Field labels, section labels |
| `caption` | Sans 400 | 12 / 16 | 0 | Hints, footnotes |

Sentence case everywhere. Uppercase only for airline names on the pass header.

## 4. Space, radii, elevation

- **Spacing** uses a 4pt grid: `xxs 2`, `xs 4`, `s 8`, `m 12`, `l 16`, `xl 20`, `xxl 24`,
  `xxxl 32`, `huge 48`. The screen gutter is 16, card padding is 16, the pass's inner padding is 18,
  and the gap between sections is 24.
- **Radii:** `xs 6` (chips), `s 10` (barcode box), `m 12` (strips, buttons), `l 18` (cards),
  `xl 22` (the pass), `pill 999`. The barcode box is rounded, but the barcode image inside it never
  is, because white padding keeps the code's own edges square.
- **Elevation:** in light mode cards use `shadow.card` (y 6, blur 18, 18% black, spread −10) with a
  1px top hairline. The pass uses `shadow.pass`. In dark mode there are no shadows; the surface
  lightness does that job.
- **Hit targets** are at least 44 × 44.

## 5. Icons and symbols

A small custom set in `src/design/icons.tsx`: 24px grid, 1.6 stroke, round caps and joins, outline
only. The plane is the one filled glyph (Material “flight” path, Apache 2.0). The set is: plane,
back, chevron, share, clock, check, bell, face (DigiYatra), doc, gear, calendar, arrow, close, mail.

Symbols in text: `→` between codes, `·` as a separator, `+1` after a time that lands the next day
(muted, smaller), `–` (en dash) in date ranges (“16 – 21 Oct”).

## 6. Motion

All motion runs on the UI thread with Reanimated 4. When the system's reduce-motion setting is on,
every animation below shows its final state immediately and every loop is off. Each primitive does
this itself with `useReducedMotion()`, and layout animations use `ReduceMotion.System`.

**Timing tokens:** `instant 120`, `quick 200`, `standard 320`, `slow 560` ms. The standard easing
is `bezier(0.2, 0.8, 0.2, 1)`, a fast start with a long soft settle. Springs: `press` (stiff,
for touch), `settle` (cards and knobs), `gentle` (large surfaces).

| Pattern | Behaviour |
|---|---|
| **Enter** | Fade in and rise 14px over `slow`, staggered 50ms per item, at most 8 items. Only on first load, not on every refetch. |
| **Press** | Scale to 0.98 with the `press` spring and a light haptic on press-in. Release springs back. |
| **Expand** | A trip's stack fans open: content height springs open, the stack edges fade, and the chevron turns 180°. |
| **Flap** (codes) | Each letter flips through the 7–12 letters before it, 58ms per step, starting 90ms after the letter before it. Plays when a code first appears or changes, never on scroll. |
| **Roll** (digits) | Countdown and time digits roll vertically like an odometer, `standard` timing per changed digit. Unchanged digits don't move. |
| **Plane** | See below. |
| **Status change** | The dot crossfades to its new color over 400ms and the label slides up 4px. |
| **Time change** | The old time shrinks and is struck through in `muted`, and the new time slides up into place over 420ms. |
| **Icon micro-loops** | The check draws itself once when first shown. The bell swings once every 6s, only while a reminder is under 1 hour away. The status dot pulses only while boarding. |
| **Loading** | Placeholder cards breathe between 50% and 80% opacity on a 1.2s cycle. No shimmer. |
| **Screens** | Native stack transitions: the list pushes to the detail, and Settings opens as a modal. The leg switcher's knob slides with the `settle` spring. |

### The plane

A dotted `track` connects the airport nodes, a solid `ink` trail covers the distance flown, and the
plane sits at the front of the trail on a small `surface` disc so it masks the track behind it.

- **Before departure:** the next trip's card runs a preview flight every 10 seconds. The plane eases
  across the route (pausing at each stop on connections), fades out at the destination and reappears
  at the origin. Other cards stay parked at the origin.
- **Boarding:** the plane taxis about 5px forward and back on a 1.8s cycle, and the dot pulses.
- **In the air:** position = (now − departure) ÷ (arrival − departure), using the flight's real UTC
  times and updated every second. On first show the plane flies in from the origin to its current
  position over 1.3s.
- **Landed:** the trail is complete and the destination node fills in.

## 7. Components

In `src/design/`: `Text` (variants above), `Enter` (the enter pattern, done with shared values
because Reanimated's layout animations misplace elements on web), `PressScale`, `FlapCode`,
`RollingNumber`, `StatusDot`, `FlightTrack` and `Icon`. In `ui.tsx`: `Card`, `Label`, `Button`
(ink, quiet, danger), `ActBar` (yellow, one per screen at most), `Banner`, `Row`, `Hairline`,
`Perforation` and `Placeholder`.

In `src/components/`: `TripCard` and `PastTrip` (the trips list), `FlightPass`, `LegSwitcher` and
`DayTimeline` (the flight screen), `Barcode` (the airline's pass, unaltered), `CheckinPanel`,
`DigiYatraButton` and `ShareCard`.

You can see all of them live at the dev-only `/design` route (Settings → Design system).

## 8. Widgets, Live Activities, exports

See `WIDGETS.md`. Exports (a share image, `.ics` and a PDF itinerary) are built. Widgets and Live
Activities are designed (previews on `/design`) and need a development build.
