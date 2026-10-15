import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Icon, type IconName } from './icons';
import { PressScale } from './PressScale';
import { Text } from './Text';
import { radius, shadow, space, useTheme } from './tokens';

export function Card({ children, style, flat }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; flat?: boolean }) {
  const { c, dark } = useTheme();
  return <View style={[styles.card, { backgroundColor: c.surface }, !flat && shadow('card', dark), style]}>{children}</View>;
}

/** Section label above a group, e.g. "Upcoming". Optional value on the right. */
export function Label({ children, right }: { children: string; right?: string }) {
  return (
    <View style={styles.label}>
      <Text v="label" color="muted">{children}</Text>
      {right ? <Text v="label" color="muted">{right}</Text> : null}
    </View>
  );
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'ink' | 'quiet' | 'danger';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, onPress, variant = 'ink', icon, loading, disabled, style }: ButtonProps) {
  const { c } = useTheme();
  const bg = variant === 'ink' ? c.ink : variant === 'danger' ? c.alertSoft : c.surface;
  const fg = variant === 'ink' ? c.ground : variant === 'danger' ? c.alert : c.ink;
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={[styles.button, { backgroundColor: bg, opacity: disabled ? 0.45 : 1 },
        variant === 'quiet' && { borderWidth: StyleSheet.hairlineWidth, borderColor: c.line }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon ? <Icon name={icon} size={18} color={fg} /> : null}
          <Text v="title" style={{ color: fg }}>{title}</Text>
        </>
      )}
    </PressScale>
  );
}

/** The single yellow "do this now" bar (DESIGN.md §2). At most one per screen. */
export function ActBar({ icon = 'clock', title, detail, onPress }: { icon?: IconName; title: string; detail?: string; onPress?: () => void }) {
  const { c } = useTheme();
  return (
    <PressScale onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : 'text'} style={[styles.act, { backgroundColor: c.act }]}>
      <Icon name={icon} size={18} color={c.onAct} />
      <View style={{ flex: 1 }}>
        <Text v="bodyStrong" style={{ color: c.onAct }}>{title}</Text>
        {detail ? <Text v="caption" style={{ color: c.onAct, opacity: 0.75 }}>{detail}</Text> : null}
      </View>
      {onPress ? <Icon name="arrow" size={18} color={c.onAct} /> : null}
    </PressScale>
  );
}

/** A soft, tinted notice (Gmail needs reconnecting, notifications are off). */
export function Banner({ tone = 'muted', icon, children, action }: {
  tone?: 'muted' | 'changed' | 'alert'; icon: IconName; children: string; action?: React.ReactNode;
}) {
  const { c } = useTheme();
  const bg = tone === 'changed' ? c.changedSoft : tone === 'alert' ? c.alertSoft : c.surface;
  const fg = tone === 'muted' ? c.ink : c[tone];
  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <View style={styles.bannerRow}>
        <Icon name={icon} size={20} color={fg} />
        <Text v="body" style={{ color: fg, flex: 1 }}>{children}</Text>
      </View>
      {action}
    </View>
  );
}

/** A label/value row in a details list. */
export function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text v="body" color="muted">{label}</Text>
      <Text v={mono ? 'numM' : 'bodyStrong'} style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export function Hairline({ inset = 0 }: { inset?: number }) {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginHorizontal: inset }} />;
}

/** The pass's tear line, with notches cut into both edges. `notch` is the colour behind the card. */
export function Perforation({ notch }: { notch: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.perf}>
      <View style={[styles.notch, { left: -11, backgroundColor: notch }]} />
      <View style={[styles.dashes]}>
        {Array.from({ length: 34 }, (_, i) => <View key={i} style={[styles.dash, { backgroundColor: c.line }]} />)}
      </View>
      <View style={[styles.notch, { right: -11, backgroundColor: notch }]} />
    </View>
  );
}

/** Loading placeholder: breathes between 50% and 80% opacity (no shimmer). */
export function Placeholder({ height, style }: { height: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const o = useSharedValue(0.8);
  useEffect(() => {
    if (!reduced) o.value = withRepeat(withTiming(0.5, { duration: 600 }), -1, true);
  }, [reduced, o]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ height, borderRadius: radius.l, backgroundColor: c.surface }, a, style]} />;
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.l, padding: space.l },
  label: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: space.xs, marginBottom: space.s },
  button: { minHeight: 48, borderRadius: radius.m, paddingHorizontal: space.l, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s },
  act: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m, paddingHorizontal: space.m + 2, borderRadius: radius.m },
  banner: { borderRadius: radius.l, padding: space.l, gap: space.m },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.l, paddingVertical: space.s },
  rowValue: { flexShrink: 1, textAlign: 'right' },
  perf: { height: 22, justifyContent: 'center', marginHorizontal: 0 },
  notch: { position: 'absolute', top: 0, width: 22, height: 22, borderRadius: 11 },
  dashes: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: space.l + 2, overflow: 'hidden' },
  dash: { width: 5, height: 1 },
});
