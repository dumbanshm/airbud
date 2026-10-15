/**
 * What the home-screen widget, lock-screen widget and Live Activity show, as one plain object.
 * Pure on purpose: the app computes it and hands it to the native side (expo-widgets) as props,
 * so the widget never needs its own networking or time-zone logic. See WIDGETS.md.
 */
import type { Trip } from './api';
import { currentFlight } from './moment';
import { clockAt, dateRange, dayLabel, wallTime } from './time';

export type WidgetSnapshot = {
  tripTitle: string;
  dates: string;
  flightNumbers: string;
  from: string;
  to: string;
  /** Airport-local clock times, already formatted ("04:25"). */
  departs: string;
  arrives: string;
  boards: string;
  /** "Today", "Tomorrow", "Fri 16 Oct", at the departure airport. */
  day: string;
  seat: string | null;
  terminal: string | null;
  statusLabel: string;
  statusTone: 'good' | 'changed' | 'alert' | 'ink' | 'muted';
  /** Instants (UTC ISO) the native timers count against, so the widget ticks without updates. */
  boardingAt: string;
  departAt: string;
  arriveAt: string;
  /** Deep link the widget opens. */
  url: string;
};

const TONE = { on_time: 'good', boarding: 'good', delayed: 'changed', departed: 'ink', landed: 'muted', cancelled: 'alert' } as const;

/** The next flight worth showing, or null when there's nothing upcoming. */
export function widgetSnapshot(trips: Trip[], now = Date.now()): WidgetSnapshot | null {
  const trip = trips.find((t) => !t.past);
  if (!trip) return null;
  const f = currentFlight(trip.flights, now);
  if (!f.departure.utc || !f.arrival.utc) return null;
  return {
    tripTitle: trip.title,
    dates: dateRange(trip.start_date, trip.end_date),
    flightNumbers: f.flight_number,
    from: f.departure.airport,
    to: f.arrival.airport,
    departs: wallTime(f.departure.local_time),
    arrives: wallTime(f.arrival.local_time),
    boards: clockAt(f.boarding_utc, f.departure.local_time),
    day: dayLabel(f.departure.local_time, now),
    seat: f.seats[0] ?? null,
    terminal: f.departure.terminal,
    statusLabel: f.status.label,
    statusTone: TONE[f.status.code],
    boardingAt: f.boarding_utc,
    departAt: f.departure.utc,
    arriveAt: f.arrival.utc,
    url: `airbud://flight/${f.id}`,
  };
}
