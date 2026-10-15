/**
 * Take a trip out of the app: a calendar file (.ics), a PDF itinerary, and a share card image.
 * All three work in Expo Go (expo-print, expo-sharing, react-native-view-shot are bundled).
 */
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import { Platform, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import type { Flight, Trip } from './api';
import { checkinState } from './checkin';
import { clockAt, dateAt, dateRange, duration, wallDate, wallTime } from './time';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'trip';

function saveOnWeb(name: string, type: string, body: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([body], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

async function shareFile(name: string, body: string, mimeType: string, UTI: string, dialogTitle: string) {
  if (Platform.OS === 'web') return saveOnWeb(name, mimeType, body);
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(body);
  await Sharing.shareAsync(file.uri, { mimeType, UTI, dialogTitle });
}

// ---------- calendar ----------

const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const icsTime = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Fold lines at 75 octets (bytes, not characters: ✈ and → are 3 each), as RFC 5545 asks. */
function fold(line: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = ch.codePointAt(0)! < 0x80 ? 1 : ch.codePointAt(0)! < 0x800 ? 2 : ch.codePointAt(0)! < 0x10000 ? 3 : 4;
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch;
    bytes += n;
  }
  return [...out, cur].join('\r\n ');
}

export function tripIcs(trip: Trip, now = Date.now()): string {
  const events = trip.flights.filter((f) => f.departure.utc && f.status.code !== 'cancelled').flatMap((f) => {
    const end = f.arrival.utc ?? new Date(Date.parse(f.departure.utc!) + (f.duration_minutes ?? 60) * 60_000).toISOString();
    const where = [f.departure.name ?? f.departure.airport, f.departure.terminal ? `Terminal ${f.departure.terminal}` : null].filter(Boolean).join(', ');
    const desc = [
      `${f.flight_number}${f.airline_name ? ` · ${f.airline_name}` : ''}`,
      `Departs ${wallTime(f.departure.local_time)} ${f.departure.airport} time, arrives ${wallTime(f.arrival.local_time)} ${f.arrival.airport} time.`,
      `Boarding (est.) ${clockAt(f.boarding_utc, f.departure.local_time)}.`,
      `Booking ${f.pnr}${f.seats.length ? ` · Seat ${f.seats.join(', ')}` : ''}`,
      f.checkin.url ? `Check in: ${f.checkin.url}` : '',
    ].filter(Boolean).join('\n');
    return [
      'BEGIN:VEVENT',
      `UID:airbud-flight-${f.id}@airbud`,
      `DTSTAMP:${icsTime(new Date(now).toISOString())}`,
      `DTSTART:${icsTime(f.departure.utc!)}`,
      `DTEND:${icsTime(end)}`,
      `SUMMARY:${icsText(`✈ ${f.flight_number} ${f.departure.airport} → ${f.arrival.airport}`)}`,
      `LOCATION:${icsText(where)}`,
      `DESCRIPTION:${icsText(desc)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT3H', `DESCRIPTION:${icsText(`Leave for ${f.departure.airport}`)}`, 'END:VALARM',
      'END:VEVENT',
    ];
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Airbud//Trips//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...events, 'END:VCALENDAR']
    .map(fold).join('\r\n') + '\r\n';
}

export function shareCalendar(trip: Trip) {
  return shareFile(`${slug(trip.title)}.ics`, tripIcs(trip), 'text/calendar', 'public.calendar-event', `Add ${trip.title} to your calendar`);
}

// ---------- PDF itinerary ----------

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

function legHtml(f: Flight, now: number) {
  const ci = checkinState(f, now);
  const checkin = ci.kind === 'checked_in' ? 'Checked in' : ci.kind === 'upcoming'
    ? `Opens ${dateAt(f.checkin.opens_utc, f.departure.local_time)}, ${clockAt(f.checkin.opens_utc, f.departure.local_time)} ${f.departure.airport} time`
    : ci.kind === 'open' ? 'Open now' : ci.kind === 'closed' ? 'Closed, check in at the airport' : '—';
  const cell = (k: string, v: string) => `<div class="f"><span>${k}</span><b>${esc(v)}</b></div>`;
  return `<section class="leg">
    <div class="lh"><span>${esc(f.airline_name ?? '')} · ${esc(f.flight_number)}</span><span>${esc(wallDate(f.departure.local_time))}</span></div>
    <div class="rt">
      <div><div class="code">${f.departure.airport}</div><div class="t">${wallTime(f.departure.local_time)}</div><div class="c">${esc(f.departure.city)}${f.departure.terminal ? ` · T${esc(f.departure.terminal)}` : ''}</div></div>
      <div class="mid">${esc(duration(f.duration_minutes))}<i></i></div>
      <div class="e"><div class="code">${f.arrival.airport}</div><div class="t">${wallTime(f.arrival.local_time)}</div><div class="c">${esc(f.arrival.city)}${f.arrival.terminal ? ` · T${esc(f.arrival.terminal)}` : ''}</div></div>
    </div>
    <div class="grid">
      ${cell('Boarding (est.)', clockAt(f.boarding_utc, f.departure.local_time))}
      ${cell('Seat', f.seats.join(', ') || '—')}
      ${cell('Booking', f.pnr)}
      ${cell('Passengers', f.passengers.join(', ') || '—')}
      ${cell('Web check-in', checkin)}
      ${cell('Status', f.status.code === 'cancelled' ? 'Cancelled' : f.change_note ?? 'As booked')}
    </div>
  </section>`;
}

export function itineraryHtml(trip: Trip, now = Date.now()): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Instrument+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  @page { margin: 18mm 16mm }
  body { font: 11pt/1.45 "Instrument Sans", -apple-system, "Helvetica Neue", Arial, sans-serif; color: #16181A; margin: 0 }
  h1 { font: 34pt/1 "Instrument Serif", Georgia, serif; margin: 0 0 4pt }
  .sub { color: #6C7176; font-size: 10pt; margin-bottom: 18pt }
  .mono, .t, .f b, .lh span:last-child { font-family: "DM Mono", Menlo, monospace }
  .leg { border: 0.75pt solid #E2E4E5; border-radius: 10pt; padding: 12pt 14pt; margin-bottom: 12pt; page-break-inside: avoid }
  .lh { display: flex; justify-content: space-between; font-size: 9pt; color: #6C7176; letter-spacing: .02em }
  .rt { display: flex; align-items: flex-end; gap: 12pt; margin: 8pt 0 10pt }
  .rt > div:first-child, .rt .e { width: 34% } .rt .e { text-align: right }
  .code { font: 30pt/1 "Instrument Serif", Georgia, serif }
  .t { font-size: 13pt; margin-top: 3pt } .c { font-size: 9pt; color: #6C7176 }
  .mid { flex: 1; text-align: center; font-size: 9pt; color: #6C7176; padding-bottom: 22pt }
  .mid i { display: block; border-top: 1pt dotted #A2A7AB; margin-top: 4pt }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8pt 12pt; border-top: 0.75pt dashed #E2E4E5; padding-top: 9pt }
  .f span { display: block; font-size: 8pt; color: #6C7176 } .f b { font-weight: 500; font-size: 10pt }
  .lay { text-align: center; font-size: 9pt; color: #6C7176; margin: -4pt 0 8pt }
  footer { margin-top: 14pt; font-size: 8.5pt; color: #6C7176 }
</style></head><body>
<h1>${esc(trip.title)}</h1>
<div class="sub">${esc(dateRange(trip.start_date, trip.end_date))} · ${trip.kind === 'round_trip' ? 'Round trip' : 'One way'} · ${trip.flights.length} flight${trip.flights.length > 1 ? 's' : ''} · <span class="mono">${esc(trip.pnrs.join(', '))}</span></div>
${trip.journeys.map((j) => j.flight_ids.map((id, i) => {
    const f = trip.flights.find((x) => x.id === id)!;
    const lay = j.layovers[i];
    return legHtml(f, now) + (lay ? `<div class="lay">${esc(duration(lay.minutes))} in ${esc(lay.city)}</div>` : '');
  }).join('')).join('')}
<footer>All times are local to each airport, as printed on your ticket. Boarding times are estimates. Check-in windows are the airline's usual ones; its site has the final word. Made with Airbud.</footer>
</body></html>`;
}

export async function shareItinerary(trip: Trip) {
  const html = itineraryHtml(trip);
  if (Platform.OS === 'web') return Print.printAsync({ html });
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  // Give it a readable name instead of the random one expo-print picks.
  const named = new File(Paths.cache, `${slug(trip.title)}-itinerary.pdf`);
  if (named.exists) named.delete();
  await new File(uri).move(named);
  await Sharing.shareAsync(named.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `${trip.title} itinerary` });
}

// ---------- share card ----------

/** Snapshot a rendered <ShareCard> and open the share sheet. */
export async function shareCardImage(ref: RefObject<View | null>, trip: Trip) {
  if (Platform.OS === 'web') {
    const dataUri = await captureRef(ref, { format: 'png', quality: 1, result: 'data-uri' });
    const a = document.createElement('a');
    a.href = dataUri;
    a.download = `${slug(trip.title)}.png`;
    a.click();
    return;
  }
  const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
  await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: `Share ${trip.title}` });
}
