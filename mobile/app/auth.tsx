import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../src/lib/auth';
import { useColors } from '../src/theme';

/**
 * Lands here when the OS opens airbud://auth?… as a deep link (mainly Android).
 * Usually the auth session already handled it; both calls dedupe by code, so that's safe.
 */
export default function AuthCallback() {
  const c = useColors();
  const { status, exchangeCode, finishGoogle } = useAuth();
  const { code, google_code, state, error } = useLocalSearchParams<{ code?: string; google_code?: string; state?: string; error?: string }>();
  const [failed, setFailed] = useState<string | null>(error ?? null);

  useEffect(() => {
    if (status !== 'signedOut') return;
    const done = google_code ? finishGoogle(google_code, state ?? '') : code ? exchangeCode(code) : null;
    done?.catch((e) => setFailed(e.message));
  }, [code, google_code, state, status, exchangeCode, finishGoogle]);

  if (status === 'signedIn') return <Redirect href="/" />;
  if (failed || (!code && !google_code && status === 'signedOut')) return <Redirect href="/login" />;
  return (
    <View style={[styles.center, { backgroundColor: c.bg }]}>
      <ActivityIndicator />
      <Text style={{ color: c.muted }}>Signing you in…</Text>
    </View>
  );
}

const styles = StyleSheet.create({ center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 } });
