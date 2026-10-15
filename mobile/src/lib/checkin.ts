import type { Flight } from './api';
import { countdown } from './time';

export type CheckinState =
  | { kind: 'checked_in' }
  | { kind: 'upcoming'; opensIn: string }
  | { kind: 'open'; closesIn: string }
  | { kind: 'closed' }
  | { kind: 'none' };

/** Where this flight is in its web check-in window, as of `now`. */
export function checkinState(f: Flight, now: number): CheckinState {
  if (['departed', 'landed', 'cancelled'].includes(f.status.code)) return { kind: 'none' };
  if (f.boarding_pass) return { kind: 'checked_in' };
  const opens = Date.parse(f.checkin.opens_utc);
  const closes = Date.parse(f.checkin.closes_utc);
  if (now < opens) return { kind: 'upcoming', opensIn: countdown(opens - now) };
  if (now < closes) return { kind: 'open', closesIn: countdown(closes - now) };
  return { kind: 'closed' };
}
