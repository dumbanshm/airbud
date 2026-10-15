import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../src/components/ui';
import { api } from '../src/lib/api';
import { useAuth } from '../src/lib/auth';
import { API_URL } from '../src/lib/config';
import { useColors } from '../src/theme';

export default function Login() {
  const c = useColors();
  const { status, signInWithGoogle, signInDemo } = useAuth();
  const [busy, setBusy] = useState<'google' | 'demo' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const config = useQuery({
    queryKey: ['auth-config'],
    queryFn: () => api<{ google: boolean; demo: boolean }>('/auth/config'),
  });

  if (status === 'signedIn') return <Redirect href="/" />;

  const run = (which: 'google' | 'demo', fn: () => Promise<void>) => async () => {
    setBusy(which);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const googleReady = config.data?.google && Platform.OS !== 'web';
  let googleHint: string | null = null;
  if (config.data && !config.data.google) googleHint = 'Google isn’t set up on the server yet (README → Google setup).';
  else if (Platform.OS === 'web') googleHint = 'Google sign-in runs on the phone app. Use the demo here.';

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: c.bg }]}>
      <View style={styles.top}>
        <View style={[styles.logo, { backgroundColor: c.accent }]}>
          <Ionicons name="airplane" size={34} color="#fff" style={{ transform: [{ rotate: '-45deg' }] }} />
        </View>
        <Text style={[styles.title, { color: c.text }]}>Airbud</Text>
        <Text style={[styles.subtitle, { color: c.muted }]}>
          Your flights, pulled from your inbox automatically. Countdown, reminders and boarding pass in one place.
        </Text>
      </View>

      <View style={styles.bottom}>
        <Button
          title="Continue with Google"
          onPress={run('google', signInWithGoogle)}
          loading={busy === 'google'}
          disabled={!googleReady}
        />
        {googleHint ? <Text style={[styles.hint, { color: c.muted }]}>{googleHint}</Text> : null}
        {config.data?.demo !== false ? (
          <Button title="Try the demo" variant="secondary" onPress={run('demo', signInDemo)} loading={busy === 'demo'} />
        ) : null}
        {error || config.error ? (
          <Text style={styles.error}>{error ?? (config.error as Error).message}</Text>
        ) : null}
        <Text style={[styles.fine, { color: c.faint }]}>
          Read-only Gmail access. Only booking emails are processed.{'\n'}Server: {API_URL}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 24, justifyContent: 'space-between' },
  top: { marginTop: 80, gap: 14 },
  logo: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  title: { fontSize: 38, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 17, lineHeight: 24 },
  bottom: { gap: 12, marginBottom: 24 },
  hint: { fontSize: 13, textAlign: 'center' },
  error: { color: '#DC2626', fontSize: 14, textAlign: 'center' },
  fine: { fontSize: 12, textAlign: 'center', marginTop: 8, lineHeight: 18 },
});
