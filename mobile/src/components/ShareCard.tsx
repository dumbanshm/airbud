import { forwardRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { FlightTrack } from '../design/FlightTrack';
import { Icon } from '../design/icons';
import { Text } from '../design/Text';
import { radius, space, useTheme } from '../design/tokens';
import type { Trip } from '../lib/api';
import { journeyOf } from './TripCard';
import { dateRange, dayShift, duration, span, wallDate, wallTime } from '../lib/time';

/**
 * The image you share when you share a trip. Deliberately leaves out the barcode, booking reference
 * and passenger names: a screenshot of those is enough to manage someone's booking.
 */
export const ShareCard = forwardRef<View, { trip: Trip }>(function ShareCard({ trip }, ref) {
  const { c } = useTheme();
  return (
    <View ref={ref} collapsable={false} style={[styles.frame, { backgroundColor: c.ground }]}>
      <View style={[styles.card, { backgroundColor: c.surface }]}>
        <Text v="displayL">{trip.title}</Text>
        <Text v="numS" color="muted">
          {dateRange(trip.start_date, trip.end_date)} · {trip.kind === 'round_trip' ? 'Round trip' : 'One way'}
        </Text>
        {trip.journeys.map((j, ji) => {
          const legs = j.flight_ids.map((id) => trip.flights.find((f) => f.id === id)!);
          const first = legs[0];
          const last = legs[legs.length - 1];
          const shift = dayShift(first.departure.local_time, last.arrival.local_time);
          return (
            <View key={ji} style={[styles.leg, { borderTopColor: c.line }]}>
              <Text v="label" color="muted">
                {wallDate(first.departure.local_time)} · {legs.map((f) => f.flight_number).join(' + ')}
              </Text>
              <View style={styles.route}>
                <View>
                  <Text v="codeL">{first.departure.airport}</Text>
                  <Text v="numS">{wallTime(first.departure.local_time)}</Text>
                </View>
                <View style={{ flex: 1, paddingBottom: 16 }}>
                  <FlightTrack mode="parked" stops={journeyOf(trip, first).stops} />
                  <Text v="caption" color="muted" style={styles.center}>
                    {j.layovers.length ? j.layovers.map((l) => `${span(l.minutes)} in ${l.city}`).join(' · ') : duration(first.duration_minutes)}
                  </Text>
                </View>
                <View style={styles.end}>
                  <Text v="codeL">{last.arrival.airport}</Text>
                  <Text v="numS">{wallTime(last.arrival.local_time)}{shift ? ` ${shift}` : ''}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.mark}>
        <Icon name="plane" size={14} color={c.muted} rotate={45} />
        <Text v="label" color="muted">Airbud · times are local to each airport</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  frame: { width: 380, padding: space.xl, gap: space.m },
  card: { borderRadius: radius.xl, padding: space.xl, gap: space.xs },
  leg: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: space.l, paddingTop: space.m, gap: space.s },
  route: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  end: { alignItems: 'flex-end' },
  center: { textAlign: 'center', position: 'absolute', left: 0, right: 0, top: 24 },
  mark: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
});
