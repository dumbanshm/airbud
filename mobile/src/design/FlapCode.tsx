import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { Text } from './Text';
import { motion, type Palette, type TypeVariant } from './tokens';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function FlapChar({ target, delay, v, color }: { target: string; delay: number; v: TypeVariant; color: keyof Palette }) {
  const reduced = useReducedMotion();
  const idx = CHARS.indexOf(target);
  const [ch, setCh] = useState(reduced || idx < 0 ? target : CHARS[(idx - 9 + CHARS.length) % CHARS.length]);
  const sy = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: sy.value }], opacity: 0.55 + 0.45 * sy.value }));

  useEffect(() => {
    if (reduced || idx < 0) { setCh(target); return; }
    // Start 7–12 letters before the target, like a split-flap drum, and step forward to it.
    const back = 7 + ((Math.round(delay / motion.flapStagger) * 5) % 6);
    let k = (idx - back + CHARS.length * 2) % CHARS.length;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      setCh(CHARS[k]);
      sy.value = withSequence(withTiming(0.15, { duration: 0 }), withTiming(1, { duration: 70 }));
      if (k === idx) return;
      k = (k + 1) % CHARS.length;
      timer = setTimeout(step, motion.flapStep);
    };
    timer = setTimeout(step, delay);
    return () => clearTimeout(timer);
  }, [target, delay, reduced, idx, sy]);

  return (
    <View>
      {/* The target letter sets the width, so cycling letters never shift the layout. */}
      <Text v={v} style={styles.ghost}>{target}</Text>
      <Animated.View style={[StyleSheet.absoluteFill, style]}>
        <Text v={v} color={color} style={styles.center}>{ch}</Text>
      </Animated.View>
    </View>
  );
}

/** An airport code (or any short text) that flaps into place on mount and whenever it changes. */
export function FlapCode({ code, v = 'codeL', color = 'ink', delay = 0 }: { code: string; v?: TypeVariant; color?: keyof Palette; delay?: number }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={code.split('').join(' ')}>
      {[...code].map((c, i) => <FlapChar key={`${i}-${code}`} target={c} delay={delay + i * motion.flapStagger} v={v} color={color} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  ghost: { opacity: 0 },
  center: { textAlign: 'center' },
});
