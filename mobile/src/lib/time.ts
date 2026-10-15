// Flight times are shown in the airport's own time zone (as printed on the ticket), never the
// phone's. So we read the wall-clock digits straight from the ISO string instead of `new Date()`,
// which would convert them to wherever the phone is.

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(iso: string) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) throw new Error(`Bad time ${iso}`);
  const [, y, mo, d, h, mi] = m;
  return { y: +y, mo: +mo, d: +d, h, mi };
}

export function wallTime(iso: string | null): string {
  if (!iso) return '--:--';
  const p = parts(iso);
  return `${p.h}:${p.mi}`;
}

export function wallDate(iso: string | null): string {
  if (!iso) return '';
  const p = parts(iso);
  const weekday = new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay();
  return `${DAYS[weekday]} ${p.d} ${MONTHS[p.mo - 1]}`;
}

function offsetMinutes(iso: string): number {
  const m = iso.match(/([+-])(\d{2}):(\d{2})$/);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]);
}

/** A UTC instant shown on the same clock as `reference` (e.g. boarding time at the departure airport). */
export function clockAt(utcIso: string, referenceLocalIso: string | null): string {
  const shifted = new Date(Date.parse(utcIso) + offsetMinutes(referenceLocalIso ?? 'Z') * 60_000);
  return `${String(shifted.getUTCHours()).padStart(2, '0')}:${String(shifted.getUTCMinutes()).padStart(2, '0')}`;
}

/** "+1" when arrival is on a later calendar day than departure, in local terms. */
export function dayShift(depLocal: string | null, arrLocal: string | null): string {
  if (!depLocal || !arrLocal) return '';
  const a = parts(depLocal);
  const b = parts(arrLocal);
  const diff = Math.round((Date.UTC(b.y, b.mo - 1, b.d) - Date.UTC(a.y, a.mo - 1, a.d)) / 86_400_000);
  return diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : '';
}

export function duration(minutes: number | null): string {
  if (minutes == null) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

export function countdown(ms: number): string {
  if (ms <= 0) return 'now';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d >= 1) return `${d}d ${h}h ${m}m`;
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
}

export function ago(iso: string | null): string {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

/** Calendar date of a UTC instant on the same clock as `reference`. */
export function dateAt(utcIso: string, referenceLocalIso: string | null): string {
  const s = new Date(Date.parse(utcIso) + offsetMinutes(referenceLocalIso ?? 'Z') * 60_000);
  return `${DAYS[s.getUTCDay()]} ${s.getUTCDate()} ${MONTHS[s.getUTCMonth()]}`;
}

/** How far along a flight is, 0 before departure to 1 after arrival, from its scheduled UTC times. */
export function flightProgress(depUtc: string | null, arrUtc: string | null, now = Date.now()): number {
  if (!depUtc || !arrUtc) return 0;
  const dep = Date.parse(depUtc);
  const arr = Date.parse(arrUtc);
  if (!(arr > dep)) return now >= arr ? 1 : 0;
  return Math.min(1, Math.max(0, (now - dep) / (arr - dep)));
}

function dayParts(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  return { y, m, d };
}

/** "16 – 21 Oct", "30 Oct – 2 Nov", or "28 Oct" for a single day. Dates are airport-local. */
export function dateRange(start: string | null, end: string | null): string {
  if (!start) return '';
  const a = dayParts(start);
  if (!end || end === start) return `${a.d} ${MONTHS[a.m - 1]}`;
  const b = dayParts(end);
  if (a.y === b.y && a.m === b.m) return `${a.d} – ${b.d} ${MONTHS[b.m - 1]}`;
  return `${a.d} ${MONTHS[a.m - 1]} – ${b.d} ${MONTHS[b.m - 1]}`;
}

/** "Today", "Tomorrow", "Fri 16 Oct": the flight's local date compared with today at that same airport. */
export function dayLabel(localIso: string | null, now = Date.now()): string {
  if (!localIso) return '';
  const today = new Date(now + offsetMinutes(localIso) * 60_000);
  const p = parts(localIso);
  const diff = Math.round((Date.UTC(p.y, p.mo - 1, p.d) - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return wallDate(localIso);
}

/** "2h 10m" for layovers and other spans. */
export function span(minutes: number): string {
  return duration(minutes).replace(' 0', ' ');
}
