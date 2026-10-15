import { useMutation } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, SectionTitle } from '../src/components/ui';
import { api } from '../src/lib/api';
import { useAuth } from '../src/lib/auth';
import { API_URL } from '../src/lib/config';
import { useEmails, useMe, usePermission, usePushStatus, useReminderCount } from '../src/lib/hooks';
import { requestPermission, sendTestReminder, storedPushToken } from '../src/lib/notifications';
import { queryClient } from '../src/lib/queryClient';
import { ago } from '../src/lib/time';
import { useColors } from '../src/theme';

const PERMISSION_TEXT = {
  granted: 'On',
  undetermined: 'Not asked yet',
  denied: 'Off (change in system Settings)',
  unsupported: 'Not available on web',
};

const EMAIL_COLORS = { parsed: '#16A34A', no_match: '#6B7285', error: '#DC2626' };

export default function Settings() {
  const c = useColors();
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

  const Row = ({ label, value }: { label: string; value: string }) => (
    <View style={styles.row}>
      <Text style={[styles.k, { color: c.muted }]}>{label}</Text>
      <Text style={[styles.v, { color: c.text }]}>{value}</Text>
    </View>
  );

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.content}>
      {message ? (
        <Card style={{ backgroundColor: c.accentSoft, borderColor: 'transparent' }}>
          <Text style={{ color: c.accent, fontWeight: '600' }}>{message}</Text>
        </Card>
      ) : null}

      <SectionTitle>Account</SectionTitle>
      <Card>
        <Row label="Email" value={me.data?.email ?? '…'} />
        <Row label="Gmail" value={me.data?.is_demo ? 'Demo data' : me.data?.gmail_connected ? 'Connected (read-only)' : 'Not connected'} />
        {!me.data?.is_demo ? <Row label="Last checked" value={ago(me.data?.last_synced_at ?? null)} /> : null}
        {me.data?.gmail_error ? <Text style={styles.error}>{me.data.gmail_error}</Text> : null}
        <Button title="Check email now" variant="secondary" onPress={() => sync.mutate()} loading={sync.isPending} disabled={me.data?.is_demo} />
      </Card>

      <SectionTitle>Reminders (on this phone)</SectionTitle>
      <Card>
        <Row label="Permission" value={permission.data ? PERMISSION_TEXT[permission.data] : '…'} />
        <Row label="Scheduled" value={`${reminders.data ?? 0} reminders`} />
        {permission.data === 'undetermined' ? (
          <Button title="Allow notifications" onPress={async () => { await requestPermission(); permission.refetch(); }} />
        ) : permission.data === 'denied' ? (
          <Button title="Open system Settings" variant="secondary" onPress={() => Linking.openSettings()} />
        ) : permission.data === 'granted' ? (
          <Button
            title="Send a test reminder in 5s"
            variant="secondary"
            onPress={async () => { await sendTestReminder(5); setMessage('Test reminder scheduled. Lock your phone to see it.'); }}
          />
        ) : null}
      </Card>

      <SectionTitle>Push from server</SectionTitle>
      <Card>
        <Text style={[styles.body, { color: c.text }]}>
          {push.isLoading ? 'Registering…' : push.data?.ok ? 'This phone is registered for new-flight and schedule-change alerts.' : push.data?.reason ?? 'Not registered'}
        </Text>
        {push.data?.ok ? (
          <>
            <Text style={[styles.token, { color: c.faint }]} selectable>{push.data.token}</Text>
            <Button title="Send a test push" variant="secondary" onPress={() => testPush.mutate()} loading={testPush.isPending} />
          </>
        ) : null}
      </Card>

      <SectionTitle>Emails read</SectionTitle>
      <Card>
        {emails.data?.length ? (
          emails.data.map((e) => (
            <View key={e.id} style={styles.email}>
              <View style={[styles.chip, { backgroundColor: EMAIL_COLORS[e.status] + '1F' }]}>
                <Text style={[styles.chipText, { color: EMAIL_COLORS[e.status] }]}>{e.status.replace('_', ' ')}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.subject, { color: c.text }]} numberOfLines={1}>{e.subject ?? '(no subject)'}</Text>
                <Text style={[styles.detail, { color: c.muted }]} numberOfLines={2}>
                  {e.parser ? `${e.parser} · ` : ''}{e.detail}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={{ color: c.muted }}>No emails processed yet.</Text>
        )}
      </Card>

      <SectionTitle>App</SectionTitle>
      <Card>
        <Row label="Server" value={API_URL} />
        {__DEV__ ? <Button title="Design system (dev)" variant="secondary" onPress={() => router.push('/design')} /> : null}
        <Button
          title="Sign out"
          variant="danger"
          onPress={async () => {
            await signOut(await storedPushToken());
            queryClient.clear();
            router.replace('/login');
          }}
        />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 60, maxWidth: 560, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  k: { fontSize: 14 },
  v: { fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  body: { fontSize: 14, lineHeight: 20 },
  token: { fontSize: 11 },
  error: { color: '#DC2626', fontSize: 13 },
  email: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, minWidth: 74, alignItems: 'center' },
  chipText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  subject: { fontSize: 14, fontWeight: '600' },
  detail: { fontSize: 12, marginTop: 2 },
});
