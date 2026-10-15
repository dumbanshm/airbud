import { useMutation } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '../src/design/Text';
import { type Palette, space, useTheme } from '../src/design/tokens';
import { Banner, Button, Card, Hairline, Label, Row } from '../src/design/ui';
import { api } from '../src/lib/api';
import { useAuth } from '../src/lib/auth';
import { API_URL } from '../src/lib/config';
import { useEmails, useMe, usePermission, usePushStatus, useReminderCount } from '../src/lib/hooks';
import { requestPermission, sendTestReminder, storedPushToken } from '../src/lib/notifications';
import { queryClient } from '../src/lib/queryClient';
import { ago } from '../src/lib/time';

const PERMISSION_TEXT = {
  granted: 'On',
  undetermined: 'Not asked yet',
  denied: 'Off (change in system Settings)',
  unsupported: 'Not available on web',
};

const EMAIL_TONE: Record<string, keyof Palette> = { parsed: 'good', no_match: 'muted', error: 'alert' };

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Label>{title}</Label>
      <Card style={styles.card}>{children}</Card>
    </View>
  );
}

export default function Settings() {
  const { c } = useTheme();
  const { status, signOut } = useAuth();
  const me = useMe();
  const permission = usePermission();
  const push = usePushStatus();
  const reminders = useReminderCount();
  const emails = useEmails();
  const [message, setMessage] = useState<string | null>(null);

  const sync = useMutation({
    mutationFn: () => api<{ checked: number; parsed: number; changes: number }>('/sync', { method: 'POST' }),
    onSuccess: (r) => setMessage(`Checked ${r.checked} new emails, ${r.parsed} had flights.`),
    onError: (e) => setMessage(e.message),
    onSettled: () => queryClient.invalidateQueries(),
  });
  const testPush = useMutation({
    mutationFn: () => api<{ sent: number; errors: string[] }>('/push/test', { method: 'POST' }),
    onSuccess: (r) => setMessage(r.sent ? 'Push sent. It should arrive in a few seconds.' : `Push failed: ${r.errors.join(', ')}`),
    onError: (e) => setMessage(e.message),
  });

  if (status === 'signedOut') return <Redirect href="/login" />;

  return (
    <ScrollView style={{ backgroundColor: c.ground }} contentContainerStyle={styles.content}>
      {message ? <Banner icon="check">{message}</Banner> : null}

      <Group title="Account">
        <Row label="Email" value={me.data?.email ?? '…'} />
        <Row label="Gmail" value={me.data?.is_demo ? 'Demo data' : me.data?.gmail_connected ? 'Connected (read-only)' : 'Not connected'} />
        {!me.data?.is_demo ? <Row label="Last checked" value={ago(me.data?.last_synced_at ?? null)} /> : null}
        {me.data?.gmail_error ? <Text v="caption" color="alert">{me.data.gmail_error}</Text> : null}
        <Button title="Check email now" variant="quiet" icon="mail" onPress={() => sync.mutate()} loading={sync.isPending} disabled={me.data?.is_demo} style={styles.action} />
      </Group>

      <Group title="Reminders on this phone">
        <Row label="Permission" value={permission.data ? PERMISSION_TEXT[permission.data] : '…'} />
        <Row label="Scheduled" value={`${reminders.data ?? 0} reminders`} />
        {permission.data === 'undetermined' ? (
          <Button title="Allow notifications" icon="bell" onPress={async () => { await requestPermission(); permission.refetch(); }} style={styles.action} />
        ) : permission.data === 'denied' ? (
          <Button title="Open system Settings" variant="quiet" onPress={() => Linking.openSettings()} style={styles.action} />
        ) : permission.data === 'granted' ? (
          <Button
            title="Send a test reminder in 5s"
            variant="quiet"
            icon="bell"
            onPress={async () => { await sendTestReminder(5); setMessage('Test reminder scheduled. Lock your phone to see it.'); }}
            style={styles.action}
          />
        ) : null}
      </Group>

      <Group title="Push from server">
        <Text v="body">
          {push.isLoading ? 'Registering…' : push.data?.ok ? 'This phone is registered for new-flight and schedule-change alerts.' : push.data?.reason ?? 'Not registered'}
        </Text>
        {push.data?.ok ? (
          <>
            <Text v="numS" color="muted" selectable>{push.data.token}</Text>
            <Button title="Send a test push" variant="quiet" onPress={() => testPush.mutate()} loading={testPush.isPending} style={styles.action} />
          </>
        ) : null}
      </Group>

      <Group title="Emails read">
        {emails.data?.length ? (
          emails.data.map((e, i) => (
            <View key={e.id}>
              {i ? <Hairline /> : null}
              <View style={styles.email}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text v="bodyStrong" numberOfLines={1}>{e.subject ?? '(no subject)'}</Text>
                  <Text v="caption" color="muted" numberOfLines={2}>{e.parser ? `${e.parser} · ` : ''}{e.detail}</Text>
                </View>
                <Text v="label" color={EMAIL_TONE[e.status]}>{e.status.replace('_', ' ')}</Text>
              </View>
            </View>
          ))
        ) : (
          <Text v="body" color="muted">No emails processed yet.</Text>
        )}
      </Group>

      <Group title="App">
        <Row label="Server" value={API_URL} mono />
        {__DEV__ ? <Button title="Design system (dev)" variant="quiet" onPress={() => router.push('/design')} style={styles.action} /> : null}
        <Button
          title="Sign out"
          variant="danger"
          onPress={async () => {
            await signOut(await storedPushToken());
            queryClient.clear();
            router.replace('/login');
          }}
          style={styles.action}
        />
      </Group>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.gutter, paddingBottom: space.huge, gap: space.xxl, maxWidth: 560, width: '100%', alignSelf: 'center' },
  group: {},
  card: { paddingVertical: space.m, gap: space.xs },
  action: { marginTop: space.s },
  email: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.s + 2 },
});
