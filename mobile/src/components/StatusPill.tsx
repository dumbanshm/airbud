import { StyleSheet, Text, View } from 'react-native';

import type { Flight } from '../lib/api';
import { STATUS_COLORS } from '../theme';

export function StatusPill({ status }: { status: Flight['status'] }) {
  const color = STATUS_COLORS[status.code];
  return (
    <View style={[styles.pill, { backgroundColor: color + '1F' }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]}>{status.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: { fontSize: 12, fontWeight: '700' },
});
