import { forwardRef, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { FlapCode } from '../design/FlapCode';
import { FlightTrack } from '../design/FlightTrack';
import { Icon } from '../design/icons';
import { PressScale } from '../design/PressScale';
import { RollingNumber } from '../design/RollingNumber';
import { StatusDot } from '../design/StatusDot';
import { Text } from '../design/Text';
import { motion, radius, shadow, space, useTheme } from '../design/tokens';
import { Perforation } from '../design/ui';
import type { Flight } from '../lib/api';
import { checkinState } from '../lib/checkin';
import { momentOf } from '../lib/moment';
import { clockAt, dayShift, duration, wallDate, wallTime } from '../lib/time';
import { Barcode } from './BoardingPass';

/** Segmented switch between the flights of a trip. The knob slides with the settle spring. */
export function LegSwitcher({ flights, current, onChange }: { flights: Flight[]; current: number; onChange: (f: Flight) => void }) {
  const { c, dark } = useTheme();
  const reduced = useReducedMotion();
  const [w, setW] = useState(0);
  const index = Math.max(0, flights.findIndex((f) => f.id === current));
  const seg = flights.length ? (w - 6) / flights.length : 0;
  const x = useSharedValue(index * seg);
  useEffect(() => {
    x.value = reduced || !seg ? index * seg : withSpring(index * seg, motion.spring.settle);
  }, [index, seg, reduced, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const short = flights.length > 2;

  return (
    <View style={[styles.segs, { backgroundColor: c.line }]} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {seg ? <Animated.View style={[styles.knob, { width: seg, backgroundColor: c.surface }, shadow('card', dark), knob]} /> : null}
      {flights.map((f) => (
        <PressScale key={f.id} haptic onPress={() => onChange(f)} accessibilityRole="tab" accessibilityState={{ selected: f.id === current }} style={styles.seg}>
          <Text v="label" color={f.id === current ? 'ink' : 'muted'} numberOfLines={1}>
            {f.flight_number}{short ? '' : ` · ${wallDate(f.departure.local_time).split(' ').slice(0, 2).join(' ')}`}
          </Text>
        </PressScale>
      ))}
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text v="caption" color="muted">{label}</Text>
      {children}
    </View>
  );
}

/**
 * The boarding pass, top to bottom: route, live track, fields, tear line, barcode. `notch` is the
 * colour behind the pass (so the tear-line notches look cut out). The whole view is what DigiYatra
 * gets when there's no airline PDF, so it's not collapsable.
 */
export const FlightPass = forwardRef<View, { flight: Flight; now: number; notch: string }>(function FlightPass({ flight: f, now, notch }, ref) {
  const { c, dark } = useTheme();
  const m = momentOf(f, now);
  const shift = dayShift(f.departure.local_time, f.arrival.local_time);
  const done = m.phase === 'landed' || m.phase === 'cancelled';

  return (
    <View ref={ref} collapsable={false} style={[styles.pass, { backgroundColor: c.surface }, shadow('pass', dark)]}>
      <View style={styles.top}>
        <View style={styles.air}>
          <Text v="label" style={{ letterSpacing: 0.6 }}>{(f.airline_name ?? 'Flight').toUpperCase()} · {f.flight_number}</Text>
          <StatusDot code={f.status.code} label={f.status.label} />
        </View>

        <View style={styles.codes}>
          <View style={{ flex: 1 }}>
            <FlapCode key={`d${f.id}`} code={f.departure.airport} v="codeXL" />
            <Text v="caption" color="muted" numberOfLines={1}>{f.departure.city}{f.departure.terminal ? ` · T${f.departure.terminal}` : ''}</Text>
          </View>
          <View style={[styles.end, { flex: 1 }]}>
            <FlapCode key={`a${f.id}`} code={f.arrival.airport} v="codeXL" delay={180} />
            <Text v="caption" color="muted" numberOfLines={1}>{f.arrival.city}{f.arrival.terminal ? ` · T${f.arrival.terminal}` : ''}</Text>
          </View>
        </View>

        <View style={styles.trackBox}>
          <FlightTrack key={f.id} mode={m.track === 'preview' ? 'parked' : m.track} progress={m.progress} height={32} />
          <Text v="caption" color="muted" style={styles.center}>{duration(f.duration_minutes)}{m.phase === 'air' ? ' · in the air' : ''}</Text>
        </View>

        <View style={styles.times}>
          <Text v="numL">{wallTime(f.departure.local_time)}</Text>
          <Text v="numL">
            {wallTime(f.arrival.local_time)}
            {shift ? <Text v="numS" color="muted"> {shift}</Text> : null}
          </Text>
        </View>
      </View>

      <View style={styles.fields}>
        <Field label={m.label ?? 'Status'}>
          {m.label ? <RollingNumber value={m.value} v="numM" /> : <Text v="numM">{m.value}</Text>}
        </Field>
        <Field label={f.boarding_is_estimate ? 'Boarding (est.)' : 'Boarding'}><Text v="numM">{clockAt(f.boarding_utc, f.departure.local_time)}</Text></Field>
        <Field label="Seat"><Text v="numM">{f.seats.join(', ') || '—'}</Text></Field>
        <Field label="Passenger"><Text v="bodyStrong" numberOfLines={1}>{f.passengers[0] ?? '—'}{f.passengers.length > 1 ? ` +${f.passengers.length - 1}` : ''}</Text></Field>
        <Field label="Date"><Text v="numM">{wallDate(f.departure.local_time)}</Text></Field>
        <Field label="Booking"><Text v="numM">{f.pnr}</Text></Field>
      </View>

      {f.change_note && !done ? (
        <View style={[styles.note, { backgroundColor: c.changedSoft }]}>
          <Icon name="clock" size={15} color={c.changed} />
          <Text v="label" color="changed" style={{ flex: 1 }}>{f.change_note}</Text>
        </View>
      ) : null}

      <Perforation notch={notch} />
      <View style={styles.barcode}>
        <Barcode flight={f} />
      </View>
    </View>
  );
});

type Step = { title: string; time: string | null; at: number | null; reminder?: boolean; note?: string };

/** "Your day": check-in, leave, board, depart, land, on the departure airport's clock. */
export function DayTimeline({ flight: f, now }: { flight: Flight; now: number }) {
  const { c } = useTheme();
  if (!f.departure.utc) return null;
  const dep = Date.parse(f.departure.utc);
  const leave = dep - 3 * 3600_000;
  const boarding = Date.parse(f.boarding_utc);
  const local = (ms: number) => clockAt(new Date(ms).toISOString(), f.departure.local_time);
  const ci = checkinState(f, now);
  const steps: Step[] = [
    ci.kind === 'checked_in'
      ? { title: 'Web check-in', time: 'done', at: 0 }
      : { title: 'Web check-in opens', time: local(Date.parse(f.checkin.opens_utc)), at: Date.parse(f.checkin.opens_utc), reminder: true },
    { title: 'Leave for the airport', time: local(leave), at: leave, reminder: true },
    { title: 'Boarding', time: local(boarding), at: boarding, reminder: true, note: 'est.' },
    { title: 'Departs', time: wallTime(f.departure.local_time), at: dep },
    { title: `Lands in ${f.arrival.city}`, time: wallTime(f.arrival.local_time), at: f.arrival.utc ? Date.parse(f.arrival.utc) : null, note: f.arrival.airport },
  ];
  const next = steps.findIndex((s) => s.at != null && s.at > now);

  return (
    <View style={[styles.timeline, { backgroundColor: c.surface }]}>
      {steps.map((s, i) => {
        const isDone = s.at != null && s.at <= now;
        const isNext = i === next;
        return (
          <View key={s.title} style={[styles.step, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
            <View style={[styles.dot, {
              borderColor: isDone || isNext ? c.good : c.muted,
              backgroundColor: isDone ? c.good : 'transparent',
            }]}>
              {isNext ? <View style={[styles.halo, { backgroundColor: c.goodSoft }]} /> : null}
            </View>
            <View style={styles.stepTitle}>
              <Text v={isNext ? 'bodyStrong' : 'body'} color={isDone ? 'muted' : 'ink'}>{s.title}</Text>
              {s.reminder && !isDone ? <Icon name="bell" size={13} color={c.faint} /> : null}
            </View>
            <Text v="numS" color="muted">{s.time}{s.note ? ` ${s.note}` : ''}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segs: { flexDirection: 'row', borderRadius: radius.m, padding: 3 },
  knob: { position: 'absolute', top: 3, bottom: 3, left: 3, borderRadius: radius.s - 1 },
  seg: { flex: 1, alignItems: 'center', paddingVertical: space.s, paddingHorizontal: space.xs },
  pass: { borderRadius: radius.xl },
  top: { padding: space.l + 2, paddingBottom: space.s },
  air: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.s },
  codes: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.l },
  end: { alignItems: 'flex-end' },
  trackBox: { marginTop: space.m, paddingBottom: space.l },
  center: { position: 'absolute', left: 0, right: 0, bottom: 0, textAlign: 'center' },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xs },
  fields: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.m, paddingHorizontal: space.l + 2, paddingTop: space.m, paddingBottom: space.l },
  field: { width: '33.33%', paddingRight: space.s, gap: 2 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: space.l + 2, marginBottom: space.m, padding: space.s + 2, borderRadius: radius.s },
  barcode: { paddingHorizontal: space.l + 2, paddingTop: space.s, paddingBottom: space.l + 2 },
  timeline: { borderRadius: radius.l, paddingHorizontal: space.l },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 18, height: 18, borderRadius: 9, zIndex: -1 },
  stepTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
});
