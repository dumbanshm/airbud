import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useColors } from '../theme';

export function Button({
  title, onPress, variant = 'primary', loading, disabled, style,
}: {
  title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean; disabled?: boolean; style?: ViewStyle;
}) {
  const c = useColors();
  const bg = variant === 'primary' ? c.accent : variant === 'danger' ? '#DC262614' : c.accentSoft;
  const fg = variant === 'primary' ? '#FFFFFF' : variant === 'danger' ? '#DC2626' : c.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.btn, { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.btnText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function SectionTitle({ children }: { children: string }) {
  const c = useColors();
  return <Text style={[styles.section, { color: c.muted }]}>{children.toUpperCase()}</Text>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const c = useColors();
  return <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  btn: { height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  btnText: { fontSize: 16, fontWeight: '700' },
  section: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginTop: 26, marginBottom: 10, marginLeft: 4 },
  card: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 12 },
});
