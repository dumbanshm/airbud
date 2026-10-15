import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BoardingPass } from '../../src/components/BoardingPass';
import { FlightCard } from '../../src/components/FlightCard';
import { Card, SectionTitle } from '../../src/components/ui';
import { api, type Flight } from '../../src/lib/api';
import { remindersFor } from '../../src/lib/notifications';
import { queryClient } from '../../src/lib/queryClient';
import { clockAt, dateAt } from '../../src/lib/time';
import { useColors } from '../../src/theme';

export default function FlightDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const flight = useQuery({
    queryKey: ['flight', id],
    queryFn: () => api<Flight>(`/flights/${id}`),
    initialData: () => queryClient.getQueryData<Flight[]>(['flights'])?.find((f) => String(f.id) === id),
  });
  const f = flight.data;
  if (!f) return <ActivityIndicator style={{ marginTop: 80 }} />;

  const reminders = remindersFor(f);
  const rows: [string, string][] = [
    ['Passengers', f.passengers.join(', ') || '—'],
    ['Booking reference', f.pnr],
    ['Airline', f.airline_name ?? '—'],
    ['From', f.departure.name ?? f.departure.airport],
    ['To', f.arrival.name ?? f.arrival.airport],
  ];

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: `${f.flight_number} · ${f.departure.airport} → ${f.arrival.airport}` }} />
      <FlightCard flight={f} hero />

      <SectionTitle>Boarding pass</SectionTitle>
      <BoardingPass flight={f} />

      {reminders.length ? (
        <>
          <SectionTitle>Reminders on this phone</SectionTitle>
          <Card>
            {reminders.map((r) => {
              const done = r.at.getTime() < Date.now();
              return (
                <View key={r.id} style={styles.reminder}>
                  <View style={[styles.dot, { backgroundColor: done ? c.faint : c.accent }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rTitle, { color: done ? c.muted : c.text }]}>{r.title}</Text>
                    <Text style={[styles.rTime, { color: c.muted }]}>
                      {done ? 'Already passed' : `${dateAt(r.at.toISOString(), f.departure.local_time)} · ${clockAt(r.at.toISOString(), f.departure.local_time)} ${f.departure.airport} time`}
                    </Text>
                  </View>
                </View>
              );
            })}
          </Card>
        </>
      ) : null}

      <SectionTitle>Details</SectionTitle>
      <Card>
        {rows.map(([k, v]) => (
          <View key={k} style={styles.row}>
            <Text style={[styles.k, { color: c.muted }]}>{k}</Text>
            <Text style={[styles.v, { color: c.text }]}>{v}</Text>
          </View>
        ))}
      </Card>
      <Text style={[styles.foot, { color: c.faint }]}>
        Times are local to each airport. Boarding time is an estimate (35 min before departure).
        {f.status.source === 'mock' ? ' Flight status is simulated until a status API is connected.' : ''}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 60, maxWidth: 560, width: '100%', alignSelf: 'center' },
  reminder: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rTitle: { fontSize: 15, fontWeight: '600' },
  rTime: { fontSize: 13, marginTop: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  k: { fontSize: 14 },
  v: { fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  foot: { fontSize: 12, textAlign: 'center', marginTop: 20, lineHeight: 18 },
});
