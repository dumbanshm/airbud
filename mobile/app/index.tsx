import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FlightCard } from '../src/components/FlightCard';
import { Button, Card, SectionTitle } from '../src/components/ui';
import { api } from '../src/lib/api';
import { useAuth } from '../src/lib/auth';
import { useFlights, useMe, usePermission, usePushStatus } from '../src/lib/hooks';
import { requestPermission, syncReminders } from '../src/lib/notifications';
import { queryClient } from '../src/lib/queryClient';
import { ago } from '../src/lib/time';
import { useColors } from '../src/theme';

const DONE = ['landed', 'cancelled'];

export default function Home() {
  const c = useColors();
  const { status } = useAuth();
  const flights = useFlights();
  const me = useMe();
  const permission = usePermission();
  usePushStatus();

  // Keep the phone's local reminders in step with whatever the server says.
  useEffect(() => {
    if (flights.data && permission.data === 'granted') {
      syncReminders(flights.data).then((n) => queryClient.setQueryData(['reminder-count'], n));
    }
  }, [flights.data, permission.data]);

  const sync = useMutation({
    mutationFn: () => api('/sync', { method: 'POST' }),
    onSettled: () => queryClient.invalidateQueries(),
  });

  if (status === 'loading') return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  if (status === 'signedOut') return <Redirect href="/login" />;

  const all = flights.data ?? [];
  const upcoming = all.filter((f) => !DONE.includes(f.status.code));
  const past = all.filter((f) => DONE.includes(f.status.code)).reverse();
  const [next, ...later] = upcoming;

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: c.bg }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={sync.isPending} onRefresh={() => sync.mutate()} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: c.text }]}>Trips</Text>
            <Text style={[styles.subtitle, { color: c.muted }]}>
              {me.data?.is_demo ? 'Demo account' : me.data?.email ?? ' '}
              {me.data && !me.data.is_demo ? ` · synced ${ago(me.data.last_synced_at)}` : ''}
            </Text>
          </View>
          <Pressable onPress={() => router.push('/settings')} hitSlop={12} style={[styles.iconBtn, { backgroundColor: c.card, borderColor: c.border }]}>
            <Ionicons name="settings-outline" size={20} color={c.text} />
          </Pressable>
        </View>

        {me.data?.gmail_error ? (
          <Card style={{ backgroundColor: c.warnSoft, borderColor: 'transparent' }}>
            <Text style={{ color: c.warnText, fontWeight: '600' }}>{me.data.gmail_error}</Text>
          </Card>
        ) : null}

        {permission.data === 'undetermined' ? (
          <Card style={{ marginBottom: 6 }}>
            <View style={styles.bannerRow}>
              <Ionicons name="notifications" size={22} color={c.accent} />
              <Text style={[styles.bannerText, { color: c.text }]}>Get reminders when check-in opens, when to leave, and before boarding.</Text>
            </View>
            <Button title="Turn on reminders" onPress={async () => { await requestPermission(); permission.refetch(); }} />
          </Card>
        ) : permission.data === 'denied' ? (
          <Card style={{ marginBottom: 6 }}>
            <View style={styles.bannerRow}>
              <Ionicons name="notifications-off" size={22} color={c.muted} />
              <Text style={[styles.bannerText, { color: c.text }]}>Notifications are off, so you won’t get boarding reminders.</Text>
            </View>
            <Button title="Open Settings" variant="secondary" onPress={() => Linking.openSettings()} />
          </Card>
        ) : null}

        {flights.isLoading ? <ActivityIndicator style={{ marginTop: 60 }} /> : null}
        {flights.error ? <Text style={styles.error}>{(flights.error as Error).message}</Text> : null}

        {flights.isSuccess && all.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="mail-open-outline" size={40} color={c.faint} />
            <Text style={[styles.emptyTitle, { color: c.text }]}>No flights yet</Text>
            <Text style={[styles.emptyText, { color: c.muted }]}>
              Booking emails in your Gmail show up here automatically. Pull down to check now.
            </Text>
          </View>
        ) : null}

        {next ? (
          <>
            <SectionTitle>Next flight</SectionTitle>
            <FlightCard flight={next} hero onPress={() => router.push(`/flight/${next.id}`)} />
          </>
        ) : null}

        {later.length ? <SectionTitle>Later</SectionTitle> : null}
        <View style={styles.list}>
          {later.map((f) => (
            <FlightCard key={f.id} flight={f} onPress={() => router.push(`/flight/${f.id}`)} />
          ))}
        </View>

        {past.length ? <SectionTitle>Past</SectionTitle> : null}
        <View style={styles.list}>
          {past.map((f) => (
            <FlightCard key={f.id} flight={f} onPress={() => router.push(`/flight/${f.id}`)} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 60, maxWidth: 560, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 12 },
  title: { fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, marginTop: 2 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  bannerRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  bannerText: { flex: 1, fontSize: 15, lineHeight: 21 },
  list: { gap: 12 },
  error: { color: '#DC2626', textAlign: 'center', marginTop: 40 },
  empty: { alignItems: 'center', marginTop: 80, gap: 10, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
});
