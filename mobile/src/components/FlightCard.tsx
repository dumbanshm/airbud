import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Flight } from '../lib/api';
import { countdown, dayShift, duration, wallDate, wallTime } from '../lib/time';
import { useNow } from '../lib/useNow';
import { mono, useColors } from '../theme';
import { CheckinPanel } from './CheckinPanel';
import { StatusPill } from './StatusPill';

type Props = { flight: Flight; hero?: boolean; onPress?: () => void };

export function FlightCard({ flight: f, hero, onPress }: Props) {
  const c = useColors();
  const now = useNow(hero ? 1000 : 30_000);
  const boardsIn = Date.parse(f.boarding_utc) - now;
  const departsIn = Date.parse(f.departure.utc ?? f.boarding_utc) - now;
  const past = ['landed', 'cancelled'].includes(f.status.code);
  const shift = dayShift(f.departure.local_time, f.arrival.local_time);

  let countdownLabel = 'Boards in';
  let countdownValue = countdown(boardsIn);
  if (f.status.code === 'boarding') [countdownLabel, countdownValue] = ['Departs in', countdown(departsIn)];
  if (f.status.code === 'departed') [countdownLabel, countdownValue] = ['Status', 'In the air'];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: c.card, borderColor: c.border, opacity: past ? 0.75 : 1 },
        pressed && { transform: [{ scale: 0.99 }] },
      ]}
    >
      <View style={styles.row}>
        <View style={styles.row}>
          <View style={[styles.badge, { backgroundColor: c.accentSoft }]}>
            <Text style={[styles.badgeText, { color: c.accent }]}>{f.airline_code ?? '✈'}</Text>
          </View>
          <View>
            <Text style={[styles.flightNo, { color: c.text }]}>{f.flight_number}</Text>
            <Text style={[styles.small, { color: c.muted }]}>
              {f.airline_name ?? 'Flight'} · {wallDate(f.departure.local_time)}
            </Text>
          </View>
        </View>
        <StatusPill status={f.status} />
      </View>

      <View style={[styles.route, hero && { marginVertical: 22 }]}>
        <View style={styles.end}>
          <Text style={[styles.code, hero && styles.codeHero, { color: c.text }]}>{f.departure.airport}</Text>
          <Text style={[styles.time, mono, { color: c.text }]}>{wallTime(f.departure.local_time)}</Text>
          <Text style={[styles.small, { color: c.muted }]} numberOfLines={1}>
            {f.departure.city}{f.departure.terminal ? ` · T${f.departure.terminal}` : ''}
          </Text>
        </View>

        <View style={styles.middle}>
          <Text style={[styles.small, { color: c.muted }]}>{duration(f.duration_minutes)}</Text>
          <View style={styles.line}>
            <View style={[styles.rule, { backgroundColor: c.border }]} />
            <Ionicons name="airplane" size={16} color={c.accent} />
            <View style={[styles.rule, { backgroundColor: c.border }]} />
          </View>
        </View>

        <View style={[styles.end, { alignItems: 'flex-end' }]}>
          <Text style={[styles.code, hero && styles.codeHero, { color: c.text }]}>{f.arrival.airport}</Text>
          <Text style={[styles.time, mono, { color: c.text }]}>
            {wallTime(f.arrival.local_time)}
            {shift ? <Text style={[styles.shift, { color: c.accent }]}> {shift}</Text> : null}
          </Text>
          <Text style={[styles.small, { color: c.muted }]} numberOfLines={1}>
            {f.arrival.city}{f.arrival.terminal ? ` · T${f.arrival.terminal}` : ''}
          </Text>
        </View>
      </View>

      {f.change_note && !past ? (
        <View style={[styles.note, { backgroundColor: c.warnSoft }]}>
          <Ionicons name="time-outline" size={14} color={c.warnText} />
          <Text style={[styles.noteText, { color: c.warnText }]}>{f.change_note}</Text>
        </View>
      ) : null}

      {!past ? <CheckinPanel flight={f} compact /> : null}

      {!past ? (
        <View style={[styles.footer, { borderTopColor: c.border }]}>
          <View>
            <Text style={[styles.label, { color: c.muted }]}>{countdownLabel.toUpperCase()}</Text>
            <Text style={[hero ? styles.countHero : styles.count, mono, { color: c.text }]}>{countdownValue}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.label, { color: c.muted }]}>{f.seats.length ? 'SEAT' : 'PNR'}</Text>
            <Text style={[styles.count, { color: c.text }]}>{f.seats.length ? f.seats.join(', ') : f.pnr}</Text>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 18, borderWidth: StyleSheet.hairlineWidth, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  badge: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontWeight: '800', fontSize: 13 },
  flightNo: { fontSize: 16, fontWeight: '700' },
  small: { fontSize: 12 },
  route: { flexDirection: 'row', alignItems: 'center' },
  end: { width: 100, gap: 2 },
  code: { fontSize: 28, fontWeight: '800', letterSpacing: 0.5 },
  codeHero: { fontSize: 36 },
  time: { fontSize: 15, fontWeight: '600' },
  shift: { fontSize: 11, fontWeight: '700' },
  middle: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 6 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'stretch' },
  rule: { flex: 1, height: 1.5, borderRadius: 1 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 10 },
  noteText: { fontSize: 12, fontWeight: '600', flex: 1 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  count: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  countHero: { fontSize: 30, fontWeight: '800', marginTop: 2 },
});
