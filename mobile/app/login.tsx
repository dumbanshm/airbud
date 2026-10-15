import { useQuery } from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Enter } from '../src/design/Enter';
import { FlapCode } from '../src/design/FlapCode';
import { FlightTrack } from '../src/design/FlightTrack';
import { Text } from '../src/design/Text';
import { space, useTheme } from '../src/design/tokens';
import { Button } from '../src/design/ui';
import { api } from '../src/lib/api';
import { useAuth } from '../src/lib/auth';
import { API_URL } from '../src/lib/config';

export default function Login() {
  const { c } = useTheme();
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
    <SafeAreaView style={[styles.screen, { backgroundColor: c.ground }]}>
      <View style={styles.top}>
        <Enter index={0}>
          <FlapCode code="AIRBUD" v="codeXL" delay={200} />
        </Enter>
        <Enter index={2} style={styles.track}>
          <FlightTrack mode="preview" height={30} />
        </Enter>
        <Enter index={3}>
          <Text v="displayS" color="muted" style={styles.subtitle}>
            Your flights, pulled from your inbox. Trips, countdowns, reminders and the boarding pass, in one calm place.
          </Text>
        </Enter>
      </View>

      <Enter index={5} style={styles.bottom}>
        <Button
          title="Continue with Google"
          icon="mail"
          onPress={run('google', signInWithGoogle)}
          loading={busy === 'google'}
          disabled={!googleReady}
        />
        {googleHint ? <Text v="caption" color="muted" style={styles.center}>{googleHint}</Text> : null}
        {config.data?.demo !== false ? (
          <Button title="Try the demo" variant="quiet" onPress={run('demo', signInDemo)} loading={busy === 'demo'} />
        ) : null}
        {error || config.error ? (
          <Text v="body" color="alert" style={styles.center}>{error ?? (config.error as Error).message}</Text>
        ) : null}
        <Text v="caption" color="muted" style={[styles.center, styles.fine]}>
          Read-only Gmail access. Only booking emails are processed.{'\n'}Server: {API_URL}
        </Text>
      </Enter>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: space.xxl, justifyContent: 'space-between', maxWidth: 560, width: '100%', alignSelf: 'center' },
  top: { marginTop: 96, gap: space.l },
  track: { marginTop: space.xs, marginBottom: space.s },
  subtitle: { maxWidth: 340 },
  bottom: { gap: space.m, marginBottom: space.xxl },
  center: { textAlign: 'center' },
  fine: { marginTop: space.s },
});
