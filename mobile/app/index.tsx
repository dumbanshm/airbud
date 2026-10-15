import { useMutation } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useEffect } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PastTrip, TripCard } from '../src/components/TripCard';
import { Enter } from '../src/design/Enter';
import { Icon } from '../src/design/icons';
import { PressScale } from '../src/design/PressScale';
import { Text } from '../src/design/Text';
import { space, useTheme } from '../src/design/tokens';
import { Banner, Button, Label, Placeholder } from '../src/design/ui';
import { api } from '../src/lib/api';
import { useAuth } from '../src/lib/auth';
import { useMe, usePermission, usePushStatus, useTrips } from '../src/lib/hooks';
import { requestPermission, syncReminders } from '../src/lib/notifications';
import { queryClient } from '../src/lib/queryClient';
import { ago } from '../src/lib/time';
import { useNow } from '../src/lib/useNow';

export default function Trips() {
  const { c } = useTheme();
  const { status, signInWithGoogle } = useAuth();
  const trips = useTrips();
  const me = useMe();
  const permission = usePermission();
  const now = useNow(1000);
  usePushStatus();

  // Keep the phone's local reminders in step with whatever the server says.
  useEffect(() => {
    if (trips.data && permission.data === 'granted') {
      syncReminders(trips.data.flatMap((t) => t.flights)).then((n) => queryClient.setQueryData(['reminder-count'], n));
    }
  }, [trips.data, permission.data]);

  const sync = useMutation({
    mutationFn: () => api('/sync', { method: 'POST' }),
    onSettled: () => queryClient.invalidateQueries(),
  });

  if (status === 'loading') return <View style={{ flex: 1, backgroundColor: c.ground }} />;
  if (status === 'signedOut') return <Redirect href="/login" />;

  const all = trips.data ?? [];
  const upcoming = all.filter((t) => !t.past);
  const past = all.filter((t) => t.past).reverse();
  const open = (id: number) => router.push(`/flight/${id}`);
  let i = 0;

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: c.ground }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={sync.isPending} onRefresh={() => sync.mutate()} tintColor={c.muted} colors={[c.ink]} />}
      >
        <Enter index={i++} style={styles.header}>
          <View>
            <Text v="displayL">Trips</Text>
            <Text v="caption" color="muted">
              {me.data?.is_demo ? 'Demo account' : me.data?.email ?? ' '}
              {me.data && !me.data.is_demo ? ` · synced ${ago(me.data.last_synced_at)}` : ''}
            </Text>
          </View>
          <PressScale
            onPress={() => router.push('/settings')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            style={[styles.iconBtn, { backgroundColor: c.surface, borderColor: c.line }]}
          >
            <Icon name="gear" size={19} color={c.ink} />
          </PressScale>
        </Enter>

        {me.data?.gmail_error ? (
          <Enter index={i++} style={styles.banner}>
            <Banner tone="changed" icon="mail"
              action={
                // While the Google app is in "Testing", Gmail access expires every 7 days. One tap renews it.
                <Button title="Reconnect Gmail" onPress={() => signInWithGoogle().then(() => queryClient.invalidateQueries()).catch(() => {})} />
              }>
              {me.data.gmail_error}
            </Banner>
          </Enter>
        ) : null}

        {permission.data === 'undetermined' ? (
          <Enter index={i++} style={styles.banner}>
            <Banner icon="bell" action={<Button title="Turn on reminders" onPress={async () => { await requestPermission(); permission.refetch(); }} />}>
              Get reminders when check-in opens, when to leave, and before boarding.
            </Banner>
          </Enter>
        ) : permission.data === 'denied' ? (
          <Enter index={i++} style={styles.banner}>
            <Banner icon="bell" action={<Button title="Open Settings" variant="quiet" onPress={() => Linking.openSettings()} />}>
              Notifications are off, so you won’t get boarding reminders.
            </Banner>
          </Enter>
        ) : null}

        {trips.isLoading ? (
          <View style={{ gap: space.xxl }}>
            <Placeholder height={300} />
            <Placeholder height={150} />
          </View>
        ) : null}
        {trips.error ? (
          <Banner tone="alert" icon="close" action={<Button title="Try again" variant="quiet" onPress={() => trips.refetch()} />}>
            {(trips.error as Error).message}
          </Banner>
        ) : null}

        {trips.isSuccess && all.length === 0 ? (
          <Enter index={i++} style={styles.empty}>
            <Icon name="mail" size={34} color={c.faint} />
            <Text v="displayS">No trips yet</Text>
            <Text v="body" color="muted" style={{ textAlign: 'center' }}>
              Booking emails in your Gmail show up here as trips automatically. Pull down to check now.
            </Text>
          </Enter>
        ) : null}

        {upcoming.length ? (
          <Enter index={i++}><Label right={`${upcoming.length} trip${upcoming.length > 1 ? 's' : ''}`}>Upcoming</Label></Enter>
        ) : null}
        {upcoming.map((t, n) => (
          <Enter key={t.id} index={i++}>
            <TripCard trip={t} now={now} featured={n === 0} onOpen={open} />
          </Enter>
        ))}

        {past.length ? <Enter index={i++}><Label>Earlier</Label></Enter> : null}
        {past.map((t) => (
          <Enter key={t.id} index={i++}>
            <PastTrip trip={t} onOpen={open} />
          </Enter>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: space.gutter, paddingBottom: space.huge, maxWidth: 560, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.s, marginBottom: space.xxl },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  banner: { marginBottom: space.l },
  empty: { alignItems: 'center', marginTop: 80, gap: space.s, paddingHorizontal: space.xxxl },
});
