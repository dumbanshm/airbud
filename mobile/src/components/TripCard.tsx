import { useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import Animated, { LinearTransition, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { Enter } from '../design/Enter';
import { FlapCode } from '../design/FlapCode';
import { FlightTrack } from '../design/FlightTrack';
import { Icon } from '../design/icons';
import { PressScale } from '../design/PressScale';
import { RollingNumber } from '../design/RollingNumber';
import { StatusDot } from '../design/StatusDot';
import { Text } from '../design/Text';
import { motion, radius, shadow, space, useTheme } from '../design/tokens';
import { ActBar } from '../design/ui';
import type { Flight, Trip } from '../lib/api';
import { checkinState } from '../lib/checkin';
import { currentFlight, momentOf } from '../lib/moment';
import { dateRange, dayLabel, dayShift, span, wallDate, wallTime } from '../lib/time';

const ms = (iso: string | null | undefined, fallback: string) => Date.parse(iso ?? fallback);
const depMs = (f: Flight) => ms(f.departure.utc, f.boarding_utc);
const arrMs = (f: Flight) => ms(f.arrival.utc, f.departure.utc ?? f.boarding_utc);

/** The journey (connected flights) a flight belongs to, with where its stops sit along the route. */
export function journeyOf(trip: Trip, flight: Flight) {
  const ids = trip.journeys.find((j) => j.flight_ids.includes(flight.id))?.flight_ids ?? [flight.id];
  const flights = ids.map((id) => trip.flights.find((f) => f.id === id)!).filter(Boolean);
  const layovers = trip.journeys.find((j) => j.flight_ids.includes(flight.id))?.layovers ?? [];
  const start = depMs(flights[0]);
  const total = Math.max(1, arrMs(flights[flights.length - 1]) - start);
  const stops = flights.slice(0, -1).map((f) => (arrMs(f) - start) / total);
  /** Along the whole journey: moves only while flying, waits at each stop during the layover. */
  const progress = (now: number) => {
    for (let i = 0; i < flights.length; i++) {
      const a = depMs(flights[i]);
      const b = arrMs(flights[i]);
      const from = i ? stops[i - 1] : 0;
      const to = i < stops.length ? stops[i] : 1;
      if (now < a) return from;
      if (now < b) return from + ((now - a) / (b - a)) * (to - from);
    }
    return 1;
  };
  return { flights, layovers, stops, progress, started: (now: number) => now >= start };
}

function kindLine(trip: Trip) {
  const stops = trip.journeys.reduce((n, j) => n + j.layovers.length, 0);
  const kind = trip.kind === 'round_trip' ? 'Round trip' : stops ? `One way · ${stops} stop${stops > 1 ? 's' : ''}` : 'One way';
  const count = trip.flights.length > 1 ? ` · ${trip.flights.length} flights` : ` · ${trip.flights[0].flight_number}`;
  return `${kind}${count} · ${trip.pnrs.join(', ')}`;
}

function CheckinNote({ f, now }: { f: Flight; now: number }) {
  const { c } = useTheme();
  const s = checkinState(f, now);
  if (s.kind === 'checked_in') {
    return (
      <View style={styles.inline}>
        <Icon name="check" size={15} color={c.good} />
        <Text v="label" color="good">Checked in</Text>
      </View>
    );
  }
  if (s.kind === 'upcoming') return <Text v="label" color="muted">Check-in opens in {s.opensIn.replace(/ \d+m$/, '')}</Text>;
  if (s.kind === 'closed') return <Text v="label" color="muted">Check in at the airport</Text>;
  return null;
}

type Props = { trip: Trip; now: number; featured?: boolean; onOpen: (flightId: number) => void };

/** A trip as a stack of passes. The top pass is the current journey; the rest fan out on tap. */
export function TripCard({ trip, now, featured, onOpen }: Props) {
  const { c, dark } = useTheme();
  const [open, setOpen] = useState(false);
  const current = currentFlight(trip.flights, now);
  const j = journeyOf(trip, current);
  const first = j.flights[0];
  const last = j.flights[j.flights.length - 1];
  const m = momentOf(current, now, { preview: featured });
  const started = j.started(now);
  const mode = started && m.phase !== 'boarding' ? 'live' : m.track;
  const rest = trip.flights.filter((f) => !j.flights.includes(f));
  const checkin = checkinState(current, now);
  const shift = dayShift(first.departure.local_time, last.arrival.local_time);
  const layout = LinearTransition.springify().damping(motion.spring.settle.damping).stiffness(motion.spring.settle.stiffness).reduceMotion(ReduceMotion.System);

  return (
    <Animated.View layout={layout} style={styles.wrap}>
      {rest.length ? (
        <>
          <View style={[styles.edge, styles.edge2, { backgroundColor: c.stack2, opacity: open ? 0 : 1 }]} />
          <View style={[styles.edge, { backgroundColor: c.stack1, opacity: open ? 0 : 1 }]} />
        </>
      ) : null}
      <PressScale
        onPress={() => onOpen(current.id)}
        // Web renders roles as <button>, and buttons can't nest; on phones the card is the button.
        accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
        accessibilityLabel={`${trip.title}, ${dateRange(trip.start_date, trip.end_date)}. Open ${current.flight_number}`}
        style={[styles.card, { backgroundColor: c.surface }, shadow('card', dark)]}
      >
        <View style={styles.head}>
          <Text v="displayM" numberOfLines={1} style={{ flexShrink: 1 }}>{trip.title}</Text>
          <Text v="numS" color="muted">{dateRange(trip.start_date, trip.end_date)}</Text>
        </View>
        <Text v="caption" color="muted" numberOfLines={1}>{kindLine(trip)}</Text>

        <View style={[styles.hero, { borderTopColor: c.line }]}>
          <View style={styles.meta}>
            <Text v="label" color="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
              <Text v="label">{dayLabel(first.departure.local_time, now)}</Text>
              {' · '}{j.flights.map((f) => f.flight_number).join(' + ')}
            </Text>
            <StatusDot code={current.status.code} label={current.status.label} />
          </View>
          <View style={styles.route}>
            <View>
              <FlapCode code={first.departure.airport} v="codeL" delay={featured ? 150 : 0} />
              <Text v="numS">{wallTime(first.departure.local_time)}</Text>
            </View>
            <View style={styles.track}>
              <FlightTrack mode={mode} progress={started ? j.progress(now) : m.progress} stops={j.stops} />
              {j.layovers.length ? (
                <Text v="caption" color="muted" style={styles.center} numberOfLines={1}>
                  {j.layovers.map((l) => `${span(l.minutes)} in ${l.city}`).join(' · ')}
                </Text>
              ) : null}
            </View>
            <View style={styles.end}>
              <FlapCode code={last.arrival.airport} v="codeL" delay={featured ? 330 : 0} />
              <Text v="numS">
                {wallTime(last.arrival.local_time)}
                {shift ? <Text v="caption" color="muted"> {shift}</Text> : null}
              </Text>
            </View>
          </View>

          {current.change_note && m.phase === 'before' ? (
            <View style={[styles.inline, styles.note]}>
              <Icon name="clock" size={15} color={c.changed} />
              <Text v="label" color="changed" style={{ flex: 1 }}>{current.change_note}</Text>
            </View>
          ) : null}

          <View style={styles.count}>
            <View>
              {m.label ? <Text v="label" color="muted">{m.label}</Text> : null}
              {m.label ? <RollingNumber value={m.value} v={featured ? 'numXL' : 'numL'} /> : <Text v="numL" color="muted">{m.value}</Text>}
            </View>
            <View style={styles.countSide}>
              {current.seats.length ? <Text v="numS" color="muted">Seat {current.seats.join(', ')}</Text> : null}
              <CheckinNote f={current} now={now} />
            </View>
          </View>

          {checkin.kind === 'open' ? (
            <View style={{ marginTop: space.m }}>
              <ActBar
                icon="check"
                title="Web check-in is open"
                detail={`Closes in ${checkin.closesIn}`}
                onPress={current.checkin.url ? () => Linking.openURL(current.checkin.url!) : undefined}
              />
            </View>
          ) : null}
        </View>

        {open ? (
          <Enter rise={8} style={styles.strips}>
            {rest.map((f) => (
              <PressScale key={f.id} onPress={() => onOpen(f.id)} accessibilityRole="button" style={[styles.strip, { backgroundColor: c.sunk }]}>
                <View style={styles.stripRow}>
                  <Text v="numM">{f.departure.airport} → {f.arrival.airport} · {wallTime(f.departure.local_time)}</Text>
                  <Text v="numS" color="muted">{f.flight_number}</Text>
                </View>
                <Text v="caption" color="muted">{wallDate(f.departure.local_time)}{f.status.code === 'cancelled' ? ' · Cancelled' : ''}</Text>
                {f.change_note ? (
                  <View style={styles.inline}>
                    <Icon name="clock" size={14} color={c.changed} />
                    <Text v="caption" color="changed">{f.change_note}</Text>
                  </View>
                ) : null}
              </PressScale>
            ))}
          </Enter>
        ) : null}

        {rest.length ? (
          <PressScale onPress={() => setOpen((o) => !o)} haptic={false} hitSlop={8} accessibilityRole="button" style={styles.more}>
            <Text v="label" color="muted">{open ? 'Show less' : `${rest.length} more flight${rest.length > 1 ? 's' : ''}`}</Text>
            <Chevron open={open} />
          </PressScale>
        ) : null}
      </PressScale>
    </Animated.View>
  );
}

function Chevron({ open }: { open: boolean }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const r = useSharedValue(0);
  useEffect(() => {
    r.value = reduced ? (open ? 180 : 0) : withSpring(open ? 180 : 0, motion.spring.settle);
  }, [open, reduced, r]);
  const a = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return <Animated.View style={a}><Icon name="chevron" size={14} color={c.muted} /></Animated.View>;
}

/** A finished trip: one quiet line. */
export function PastTrip({ trip, onOpen }: { trip: Trip; onOpen: (flightId: number) => void }) {
  const { c } = useTheme();
  const f = trip.flights[trip.flights.length - 1];
  const route = [trip.flights[0].departure.airport, ...trip.flights.map((x) => x.arrival.airport)].join(' → ');
  return (
    <PressScale onPress={() => onOpen(f.id)} accessibilityRole="button" style={[styles.past, { borderColor: c.line }]}>
      <View style={{ flexShrink: 1 }}>
        <Text v="displayS" numberOfLines={1}>{trip.title}</Text>
        <Text v="numS" color="muted">{route} · {dateRange(trip.start_date, trip.end_date)}</Text>
      </View>
      <StatusDot code={f.status.code} label={f.status.label} />
    </PressScale>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space.xxl },
  edge: { position: 'absolute', left: 10, right: 10, bottom: -6, height: 24, borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  edge2: { left: 20, right: 20, bottom: -11 },
  card: { borderRadius: radius.l, padding: space.l, paddingBottom: space.m },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.s },
  hero: { marginTop: space.m + 2, paddingTop: space.m, borderTopWidth: StyleSheet.hairlineWidth },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.s, marginBottom: space.s },
  route: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  track: { flex: 1, gap: 2, paddingBottom: 18 },
  end: { alignItems: 'flex-end' },
  center: { textAlign: 'center', position: 'absolute', left: 0, right: 0, top: 26 },
  note: { marginTop: space.m },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  count: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: space.l },
  countSide: { alignItems: 'flex-end', gap: 4, paddingBottom: 4 },
  strips: { gap: space.s, marginTop: space.m },
  strip: { borderRadius: radius.m, padding: space.m, gap: 3 },
  stripRow: { flexDirection: 'row', justifyContent: 'space-between' },
  more: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: 4, paddingTop: space.m, paddingHorizontal: space.l },
  past: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.m, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.l, paddingHorizontal: space.l, paddingVertical: space.m + 2, marginBottom: space.s },
});
