import type { Flight } from './api';
import type { TrackMode } from '../design/FlightTrack';
import { countdown, flightProgress } from './time';

export type Phase = 'before' | 'boarding' | 'air' | 'landed' | 'cancelled';

export type Moment = {
  phase: Phase;
  /** "Boards in", "Departs in", "Lands in"; null once there's nothing to count down to. */
  label: string | null;
  value: string;
  track: TrackMode;
  progress: number;
};

/**
 * Where a flight is right now, from its scheduled times (status from the server is simulated, so
 * time decides; a cancellation from the airline's email always wins).
 */
export function momentOf(f: Flight, now: number, { preview = false } = {}): Moment {
  const dep = Date.parse(f.departure.utc ?? f.boarding_utc);
  const arr = f.arrival.utc ? Date.parse(f.arrival.utc) : dep;
  const boarding = Date.parse(f.boarding_utc);
  const progress = flightProgress(f.departure.utc, f.arrival.utc, now);
  if (f.status.code === 'cancelled') return { phase: 'cancelled', label: null, value: 'Cancelled', track: 'parked', progress: 0 };
  if (now >= arr) return { phase: 'landed', label: null, value: 'Landed', track: 'live', progress: 1 };
  if (now >= dep) return { phase: 'air', label: 'Lands in', value: countdown(arr - now), track: 'live', progress };
  if (now >= boarding) return { phase: 'boarding', label: 'Departs in', value: countdown(dep - now), track: 'boarding', progress: 0 };
  return { phase: 'before', label: 'Boards in', value: countdown(boarding - now), track: preview ? 'preview' : 'parked', progress: 0 };
}

/** The flight to feature for a trip: the first one that hasn't landed (or the last one). */
export function currentFlight(flights: Flight[], now: number): Flight {
  return flights.find((f) => f.status.code !== 'cancelled' && Date.parse(f.arrival.utc ?? f.departure.utc ?? f.boarding_utc) > now)
    ?? flights.find((f) => Date.parse(f.arrival.utc ?? f.boarding_utc) > now)
    ?? flights[flights.length - 1];
}
