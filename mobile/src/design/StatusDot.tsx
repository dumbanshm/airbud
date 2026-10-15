import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation, interpolateColor, useAnimatedStyle, useDerivedValue, useReducedMotion, useSharedValue,
  withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';

import type { StatusCode } from '../lib/api';
import { Text } from './Text';
import { motion, type Palette, useTheme } from './tokens';

export const STATUS_TONE: Record<StatusCode, keyof Palette> = {
  on_time: 'good', boarding: 'good', delayed: 'changed', departed: 'ink', landed: 'muted', cancelled: 'alert',
};

/** Status as a dot + label. The color crossfades on change; the dot pulses while boarding. */
export function StatusDot({ code, label }: { code: StatusCode; label: string }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const tone = STATUS_TONE[code];
  const target = c[tone];
  const soft = tone === 'good' ? c.goodSoft : tone === 'changed' ? c.changedSoft : tone === 'alert' ? c.alertSoft : c.line;

  const from = useSharedValue(target);
  const to = useSharedValue(target);
  const mix = useSharedValue(1);
  useEffect(() => {
    from.value = to.value;
    to.value = target;
    mix.value = 0;
    mix.value = reduced ? 1 : withTiming(1, { duration: 400 });
  }, [target, reduced, from, to, mix]);
  const color = useDerivedValue(() => interpolateColor(mix.value, [0, 1], [from.value, to.value]));

  const pulse = useSharedValue(0);
  useEffect(() => {
    if (code === 'boarding' && !reduced) {
      pulse.value = withRepeat(withSequence(withTiming(1, { duration: 800 }), withTiming(0, { duration: 800 })), -1);
    } else {
      cancelAnimation(pulse);
      pulse.value = 0;
    }
  }, [code, reduced, pulse]);

  // The label slides up 4px into place whenever it changes.
  const lift = useSharedValue(0);
  useEffect(() => {
    lift.value = 1;
    lift.value = reduced ? 0 : withTiming(0, { duration: motion.standard, easing: motion.ease });
  }, [label, reduced, lift]);
  const text = useAnimatedStyle(() => ({ opacity: 1 - lift.value, transform: [{ translateY: lift.value * 4 }] }));

  const dot = useAnimatedStyle(() => ({ backgroundColor: color.value }));
  const halo = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pulse.value * 0.6 }] }));

  return (
    <View style={styles.row}>
      <View style={styles.dotBox}>
        <Animated.View style={[styles.halo, { backgroundColor: soft }, halo]} />
        <Animated.View style={[styles.dot, dot]} />
      </View>
      <Animated.View style={text}>
        <Text v="label" color={tone === 'ink' ? 'ink' : tone}>{label}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dotBox: { width: 13, height: 13, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 13, height: 13, borderRadius: 7 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
