import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useHasPass } from '../../src/components/BoardingPass';
import { CheckinPanel } from '../../src/components/CheckinPanel';
import { DigiYatraButton } from '../../src/components/DigiYatraButton';
import { DayTimeline, FlightPass, LegSwitcher } from '../../src/components/FlightPass';
import { ShareCard } from '../../src/components/ShareCard';
import { Enter } from '../../src/design/Enter';
import { Icon } from '../../src/design/icons';
import { PressScale } from '../../src/design/PressScale';
import { Text } from '../../src/design/Text';
import { space, useTheme } from '../../src/design/tokens';
import { ActBar, Button, Card, Label, Row } from '../../src/design/ui';
import { api, type Flight } from '../../src/lib/api';
import { checkinState } from '../../src/lib/checkin';
import { shareCalendar, shareCardImage, shareItinerary } from '../../src/lib/exports';
import { useTrips } from '../../src/lib/hooks';
import { openOriginal } from '../../src/lib/originalPass';
import { queryClient } from '../../src/lib/queryClient';
import { clockAt } from '../../src/lib/time';
import { useNow } from '../../src/lib/useNow';

/** One yellow bar at most: leaving for the airport wins over an open check-in when both apply. */
function actFor(f: Flight, now: number): { title: string; detail?: string; url?: string | null } | null {
  if (!f.departure.utc || f.status.code === 'cancelled') return null;
  const dep = Date.parse(f.departure.utc);
  const leave = dep - 3 * 3600_000;
  if (now >= leave - 3600_000 && now < Date.parse(f.boarding_utc)) {
    const terminal = f.departure.terminal ? `Terminal ${f.departure.terminal} · ` : '';
    return { title: `Leave for ${f.departure.airport} by ${clockAt(new Date(leave).toISOString(), f.departure.local_time)}`, detail: `${terminal}${f.departure.airport} time` };
  }
  const ci = checkinState(f, now);
  if (ci.kind === 'open') return { title: 'Web check-in is open', detail: `Closes in ${ci.closesIn}`, url: f.checkin.url };
  return null;
}

export default function FlightScreen() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const now = useNow(1000);
  const trips = useTrips();
  const flight = useQuery({
    queryKey: ['flight', id],
    queryFn: () => api<Flight>(`/flights/${id}`),
    initialData: () => queryClient.getQueryData<Flight[]>(['flights'])?.find((f) => String(f.id) === id),
  });
  const passRef = useRef<View>(null);
  const cardRef = useRef<View>(null);
  const [exporting, setExporting] = useState<'card' | 'ics' | 'pdf' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const f = flight.data;
  const hasPass = useHasPass(f ?? ({ boarding_pass: null } as Flight));
  if (!f) {
    return (
      <View style={[styles.screen, { backgroundColor: c.ground }]}>
        {flight.error ? <Text v="body" color="alert" style={{ marginTop: 120, textAlign: 'center' }}>{(flight.error as Error).message}</Text> : <ActivityIndicator style={{ marginTop: 120 }} />}
      </View>
    );
  }

  const trip = trips.data?.find((t) => t.flights.some((x) => x.id === f.id));
  const act = actFor(f, now);
  const upcoming = !['landed', 'cancelled', 'departed'].includes(f.status.code);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const run = (kind: 'card' | 'ics' | 'pdf') => async () => {
    if (!trip) return;
    setExporting(kind);
    setExportError(null);
    try {
      if (kind === 'card') await shareCardImage(cardRef, trip);
      if (kind === 'ics') await shareCalendar(trip);
      if (kind === 'pdf') await shareItinerary(trip);
    } catch (e) {
      setExportError((e as Error).message);
    } finally {
      setExporting(null);
    }
  };
  let i = 0;

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: c.ground }]}>
      <View style={styles.nav}>
        <PressScale onPress={back} hitSlop={12} haptic={false} accessibilityRole="button" accessibilityLabel="Back to trips" style={styles.back}>
          <Icon name="back" size={22} color={c.ink} />
          <Text v="displayS" numberOfLines={1}>{trip?.title ?? f.arrival.city}</Text>
        </PressScale>
        {trip ? (
          <PressScale onPress={run('card')} accessibilityRole="button" accessibilityLabel="Share trip" style={[styles.circle, { backgroundColor: c.surface }]}>
            {exporting === 'card' ? <ActivityIndicator color={c.ink} /> : <Icon name="share" size={18} color={c.ink} />}
          </PressScale>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {trip && trip.flights.length > 1 ? (
          <Enter index={i++} style={styles.gap}>
            <LegSwitcher flights={trip.flights} current={f.id} onChange={(x) => router.setParams({ id: String(x.id) })} />
          </Enter>
        ) : null}

        <Enter index={i++}>
          <FlightPass ref={passRef} flight={f} now={now} notch={c.ground} />
        </Enter>

        {act ? (
          <Enter index={i++} style={styles.after}>
            <ActBar icon={act.url !== undefined ? 'check' : 'clock'} title={act.title} detail={act.detail}
              onPress={act.url ? () => Linking.openURL(act.url!) : undefined} />
          </Enter>
        ) : null}

        {f.boarding_pass?.original_file || (hasPass && f.digiyatra) ? (
          <Enter index={i++} style={[styles.after, styles.actions]}>
            {hasPass && f.digiyatra ? <DigiYatraButton passRef={passRef} flight={f} /> : null}
            {f.boarding_pass?.original_file ? (
              <Button
                variant="quiet"
                icon="doc"
                title={f.boarding_pass.original_file.content_type.includes('pkpass') ? 'Open original pass (Apple Wallet)' : 'Open original boarding pass (PDF)'}
                onPress={() => openOriginal(f).catch((e) => setOpenError((e as Error).message))}
              />
            ) : null}
            {openError ? <Text v="caption" color="alert" style={styles.centerText}>{openError}</Text> : null}
          </Enter>
        ) : null}

        {upcoming && checkinState(f, now).kind !== 'checked_in' ? (
          <Enter index={i++} style={styles.section}>
            <Label>Web check-in</Label>
            <CheckinPanel flight={f} />
          </Enter>
        ) : null}

        {f.status.code !== 'cancelled' ? (
          <Enter index={i++} style={styles.section}>
            <Label right={`${f.departure.airport} time`}>Your day</Label>
            <DayTimeline flight={f} now={now} />
          </Enter>
        ) : null}

        <Enter index={i++} style={styles.section}>
          <Label>Details</Label>
          <Card style={{ paddingVertical: space.s }}>
            <Row label="Passengers" value={f.passengers.join(', ') || '—'} />
            <Row label="Booking reference" value={f.pnr} mono />
            <Row label="Airline" value={f.airline_name ?? '—'} />
            <Row label="From" value={f.departure.name ?? f.departure.airport} />
            <Row label="To" value={f.arrival.name ?? f.arrival.airport} />
          </Card>
        </Enter>

        {trip ? (
          <Enter index={i++} style={styles.section}>
            <Label>Take it with you</Label>
            <View style={styles.exports}>
              <Button variant="quiet" icon="share" title="Share trip card" loading={exporting === 'card'} onPress={run('card')} />
              <Button variant="quiet" icon="calendar" title="Add to calendar" loading={exporting === 'ics'} onPress={run('ics')} />
              <Button variant="quiet" icon="doc" title="PDF itinerary" loading={exporting === 'pdf'} onPress={run('pdf')} />
            </View>
            {exportError ? <Text v="caption" color="alert" style={styles.centerText}>{exportError}</Text> : null}
          </Enter>
        ) : null}

        <Text v="caption" color="muted" style={styles.foot}>
          Times are local to each airport. Boarding time is an estimate (35 min before departure).
          {f.status.source === 'mock' ? ' Flight status is simulated until a status API is connected.' : ''}
        </Text>
      </ScrollView>

      {/* Rendered off-screen so it can be snapshotted for "Share trip card". */}
      {trip ? <View style={styles.offscreen} pointerEvents="none"><ShareCard ref={cardRef} trip={trip} /></View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.gutter, paddingTop: space.s, paddingBottom: space.m, maxWidth: 560, width: '100%', alignSelf: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 1, marginLeft: -6 },
  circle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: space.gutter, paddingBottom: space.huge, maxWidth: 560, width: '100%', alignSelf: 'center' },
  gap: { marginBottom: space.m + 2 },
  after: { marginTop: space.m },
  actions: { gap: space.s + 2 },
  section: { marginTop: space.xxl },
  exports: { gap: space.s },
  centerText: { textAlign: 'center', marginTop: space.s },
  foot: { textAlign: 'center', marginTop: space.xxl, paddingHorizontal: space.l },
  offscreen: { position: 'absolute', left: -10000, top: 0 },
});
