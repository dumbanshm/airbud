import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../src/lib/auth';
import { useColors } from '../src/theme';

/**
 * Lands here when the OS opens airbud://auth?code=… as a deep link (mainly Android).
 * Usually the auth session already handled the code; exchangeCode dedupes so that's safe.
 */
export default function AuthCallback() {
  const c = useColors();
  const { status, exchangeCode } = useAuth();
  const { code, error } = useLocalSearchParams<{ code?: string; error?: string }>();
  const [failed, setFailed] = useState<string | null>(error ?? null);

  useEffect(() => {
    if (code && status === 'signedOut') exchangeCode(code).catch((e) => setFailed(e.message));
  }, [code, status, exchangeCode]);

  if (status === 'signedIn') return <Redirect href="/" />;
  if (failed || (!code && status === 'signedOut')) return <Redirect href="/login" />;
  return (
    <View style={[styles.center, { backgroundColor: c.bg }]}>
      <ActivityIndicator />
      <Text style={{ color: c.muted }}>Signing you in…</Text>
    </View>
  );
}

const styles = StyleSheet.create({ center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 } });
